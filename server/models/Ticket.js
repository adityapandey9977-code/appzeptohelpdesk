const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    minlength: 5,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    minlength: 20
  },
  category: {
    type: String,
    required: true,
    enum: ['Bug', 'Feature', 'Billing', 'Other']
  },
  priority: {
    type: String,
    required: true,
    enum: ['Low', 'Medium', 'High', 'Critical']
  },
  status: {
    type: String,
    required: true,
    enum: ['Queued', 'Open', 'In Progress', 'Resolved', 'Closed'],
    default: 'Open'
  },
  version: {
    type: Number,
    required: true,
    default: 1
  },
  assignedAgent: {
    type: String,
    default: null
  },
  slaDeadline: {
    type: Date,
    required: true
  },
  bumped: {
    type: Boolean,
    default: false
  },
  comments: [{
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  history: [{
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Ticket', ticketSchema);
