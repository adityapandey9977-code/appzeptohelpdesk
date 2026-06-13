const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const { assignTicket } = require('../utils/assign');
const { SLA_HOURS } = require('../utils/sla');

// POST /api/tickets - Create ticket with validation and auto-assignment
router.post('/', async (req, res) => {
  try {
    const { title, description, category, priority } = req.body;

    // Validate inputs
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

    // Calculate initial SLA deadline
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

    // Run auto-assignment load balancing
    await assignTicket(ticket);

    const savedTicket = await ticket.save();
    res.status(201).json(savedTicket);
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

module.exports = router;
