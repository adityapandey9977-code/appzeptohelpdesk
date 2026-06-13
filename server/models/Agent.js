const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  maxLoad: {
    type: Number,
    required: true
  }
});

module.exports = mongoose.model('Agent', agentSchema);
