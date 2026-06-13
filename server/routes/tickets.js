const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const { assignTicket, assignOldestQueued } = require('../utils/assign');
const { SLA_HOURS, processSLA } = require('../utils/sla');

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

// PATCH /api/tickets/:id - Update ticket with optimistic locking and status transitions
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

    // Validate status transitions if status is changing
    if (newStatus && newStatus !== oldStatus) {
      const ALLOWED_TRANSITIONS = {
        'Queued': [], // Cannot manually move out of Queued
        'Open': ['In Progress'],
        'In Progress': ['Resolved'],
        'Resolved': ['In Progress', 'Closed'],
        'Closed': [] // Nothing can leave Closed
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

    // Update other fields
    if (title) ticket.title = title;
    if (description) ticket.description = description;
    if (category) ticket.category = category;
    if (priority && priority !== oldPriority) {
      ticket.priority = priority;
      ticket.history.push({ message: `Priority changed from ${oldPriority} to ${priority}` });
    }

    // Increment version on update
    ticket.version += 1;

    const savedTicket = await ticket.save();

    // Reassignment check: if it was active and now inactive (Resolved or Closed), assign oldest queued ticket
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

module.exports = router;
