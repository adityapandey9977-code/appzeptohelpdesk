const Agent = require('../models/Agent');
const Ticket = require('../models/Ticket');

/**
 * Calculates agent loads and assigns the ticket to the best agent.
 * Mutates ticket in place (caller must save).
 */
async function assignTicket(ticket) {
  const agents = await Agent.find({});
  if (!agents || agents.length === 0) {
    ticket.assignedAgent = null;
    ticket.status = 'Queued';
    ticket.history.push({ message: 'No agents configured. Ticket queued.' });
    return ticket;
  }

  const agentLoads = [];
  for (const agent of agents) {
    const activeCount = await Ticket.countDocuments({
      assignedAgent: agent.name,
      status: { $in: ['Open', 'In Progress'] }
    });
    const loadPercent = activeCount / agent.maxLoad;
    agentLoads.push({
      name: agent.name,
      maxLoad: agent.maxLoad,
      activeCount,
      loadPercent
    });
  }

  // Sort by load % (asc), then absolute active count (asc), then name alphabetically
  agentLoads.sort((a, b) => {
    if (a.loadPercent !== b.loadPercent) {
      return a.loadPercent - b.loadPercent;
    }
    if (a.activeCount !== b.activeCount) {
      return a.activeCount - b.activeCount;
    }
    return a.name.localeCompare(b.name);
  });

  const bestAgent = agentLoads[0];

  // If best agent load % >= 1 (100%), all agents are full
  if (bestAgent.loadPercent >= 1.0) {
    ticket.assignedAgent = null;
    ticket.status = 'Queued';
    ticket.history.push({ message: 'All agents full. Ticket placed in queue.' });
  } else {
    ticket.assignedAgent = bestAgent.name;
    // Set status to Open (unless it was already something else, but new tickets start as Open)
    ticket.status = 'Open';
    ticket.history.push({ message: `Ticket assigned to ${bestAgent.name} (Load: ${bestAgent.activeCount}/${bestAgent.maxLoad})` });
  }

  return ticket;
}

/**
 * Assigns the oldest queued ticket to the freed agent.
 */
async function assignOldestQueued(agentName) {
  if (!agentName) return;

  const oldestQueued = await Ticket.findOne({ status: 'Queued' }).sort({ createdAt: 1 });
  if (oldestQueued) {
    oldestQueued.assignedAgent = agentName;
    oldestQueued.status = 'Open';
    oldestQueued.version += 1;
    oldestQueued.history.push({ message: `Ticket assigned to ${agentName} from queue` });
    await oldestQueued.save();
    console.log(`Assigned queued ticket ${oldestQueued.title} to ${agentName}`);
  }
}

module.exports = {
  assignTicket,
  assignOldestQueued
};
