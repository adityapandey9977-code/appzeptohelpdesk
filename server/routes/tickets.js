const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const { assignTicket, assignOldestQueued } = require('../utils/assign');
const { SLA_HOURS, processSLA } = require('../utils/sla');

// GET /api/tickets/stats - Counts grouped by status and priority (single aggregation pipeline)
router.get('/stats', async (req, res) => {
  try {
    const stats = await Ticket.aggregate([
      {
        $facet: {
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ],
          byPriority: [
            { $group: { _id: '$priority', count: { $sum: 1 } } }
          ]
        }
      }
    ]);

    const facetResult = stats[0] || { byStatus: [], byPriority: [] };
    const byStatus = { Queued: 0, Open: 0, 'In Progress': 0, Resolved: 0, Closed: 0 };
    const byPriority = { Low: 0, Medium: 0, High: 0, Critical: 0 };

    facetResult.byStatus.forEach(item => {
      if (item._id) byStatus[item._id] = item.count;
    });
    facetResult.byPriority.forEach(item => {
      if (item._id) byPriority[item._id] = item.count;
    });

    res.json({ byStatus, byPriority });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// POST /api/tickets - Create ticket
router.post('/', async (req, res) => {
  try {
    const { title, description, category, priority } = req.body;

    if (!title || title.length < 5 || title.length > 100) {
      return res.status(400).json({ error: 'Title must be between 5 and 100 characters.' });
    }
    if (!description || description.length < 20) {
      return res.status(400).json({ error: 'Description must be at least 20 characters.' });
    }
    if (!['Bug', 'Feature', 'Billing', 'Other'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category.' });
    }
    if (!['Low', 'Medium', 'High', 'Critical'].includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority.' });
    }

    const slaDuration = SLA_HOURS[priority] || SLA_HOURS.Low;
    const slaDeadline = new Date(Date.now() + slaDuration);

    const ticket = new Ticket({
      title,
      description,
      category,
      priority,
      slaDeadline,
      history: [{ message: 'Ticket created.' }]
    });

    await assignTicket(ticket);

    const savedTicket = await ticket.save();
    res.status(201).json(savedTicket);
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// GET /api/tickets - List tickets with query filters, sorting, pagination, and SLA processing
router.get('/', async (req, res) => {
  try {
    const { status, priority, search, sort, page = 1, limit = 6 } = req.query;

    const match = {};
    if (status) match.status = status;
    if (priority) match.priority = priority;
    if (search) {
      match.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // 1. Fetch matching tickets
    const tickets = await Ticket.find(match);

    // 2. Compute SLA & priority auto-bump for each ticket
    const processedTickets = [];
    for (let ticket of tickets) {
      processedTickets.push(await processSLA(ticket));
    }

    // 3. In-memory sorting (easy to implement and explain for custom priority)
    if (sort === 'priority') {
      const weights = { Critical: 4, High: 3, Medium: 2, Low: 1 };
      processedTickets.sort((a, b) => {
        if (weights[a.priority] !== weights[b.priority]) {
          return weights[b.priority] - weights[a.priority];
        }
        return b.createdAt - a.createdAt;
      });
    } else if (sort === 'oldest') {
      processedTickets.sort((a, b) => a.createdAt - b.createdAt);
    } else {
      // default: newest
      processedTickets.sort((a, b) => b.createdAt - a.createdAt);
    }

    // 4. Paginate in-memory
    const totalCount = processedTickets.length;
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);
    const totalPages = Math.ceil(totalCount / parsedLimit);
    const startIndex = (parsedPage - 1) * parsedLimit;
    const paginatedTickets = processedTickets.slice(startIndex, startIndex + parsedLimit);

    res.json({
      tickets: paginatedTickets,
      totalPages,
      currentPage: parsedPage
    });
  } catch (error) {
    console.error('Error listing tickets:', error);
    res.status(500).json({ error: 'Failed to list tickets' });
  }
});

// GET /api/tickets/:id - Fetch single ticket
router.get('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }
    const processed = await processSLA(ticket);
    res.json(processed);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

// PATCH /api/tickets/:id - Update ticket
router.patch('/:id', async (req, res) => {
  try {
    const { status: newStatus, priority, title, description, category, version } = req.body;

    if (version === undefined) {
      return res.status(400).json({ error: 'Version is required for optimistic locking.' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    // Optimistic locking check
    if (ticket.version !== Number(version)) {
      const currentTicket = await processSLA(ticket);
      return res.status(409).json(currentTicket);
    }

    const oldStatus = ticket.status;
    const oldPriority = ticket.priority;

    // Validate status transition
    if (newStatus && newStatus !== oldStatus) {
      const ALLOWED_TRANSITIONS = {
        'Queued': [],
        'Open': ['In Progress'],
        'In Progress': ['Resolved'],
        'Resolved': ['In Progress', 'Closed'],
        'Closed': []
      };

      const allowed = ALLOWED_TRANSITIONS[oldStatus] || [];
      if (!allowed.includes(newStatus)) {
        return res.status(400).json({
          error: `Invalid status transition from '${oldStatus}' to '${newStatus}'`
        });
      }

      ticket.status = newStatus;
      ticket.history.push({ message: `Status changed from ${oldStatus} to ${newStatus}` });
    }

    if (title) ticket.title = title;
    if (description) ticket.description = description;
    if (category) ticket.category = category;
    if (priority && priority !== oldPriority) {
      ticket.priority = priority;
      ticket.history.push({ message: `Priority changed from ${oldPriority} to ${priority}` });
    }

    ticket.version += 1;
    const savedTicket = await ticket.save();

    const wasActive = ['Open', 'In Progress'].includes(oldStatus);
    const isNowActive = ['Open', 'In Progress'].includes(savedTicket.status);

    if (wasActive && !isNowActive) {
      await assignOldestQueued(savedTicket.assignedAgent);
    }

    const processed = await processSLA(savedTicket);
    res.json(processed);
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// POST /api/tickets/:id/comments - Add a comment
router.post('/:id/comments', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length < 3) {
      return res.status(400).json({ error: 'Comment must be at least 3 characters.' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    if (ticket.status === 'Closed') {
      return res.status(400).json({ error: 'Comments are not allowed on closed tickets.' });
    }

    ticket.comments.push({ text: text.trim() });
    ticket.version += 1;
    const savedTicket = await ticket.save();

    const processed = await processSLA(savedTicket);
    res.json(processed);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

module.exports = router;
