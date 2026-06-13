const SLA_HOURS = {
  Critical: 2 * 60 * 60 * 1000,   // 2 hours
  High: 8 * 60 * 60 * 1000,       // 8 hours
  Medium: 24 * 60 * 60 * 1000,    // 24 hours
  Low: 72 * 60 * 60 * 1000       // 72 hours
};

const PRIORITY_ORDER = ['Low', 'Medium', 'High', 'Critical'];

/**
 * Computes the SLA deadline and state.
 * If breached and ticket is Open/In Progress (and not yet bumped),
 * bumps priority by one level and saves the changes.
 */
async function processSLA(ticket) {
  const createdAtTime = ticket.createdAt.getTime();
  const slaDuration = SLA_HOURS[ticket.priority] || SLA_HOURS.Low;
  const slaDeadline = new Date(createdAtTime + slaDuration);
  const now = Date.now();

  // If resolved or closed, evaluate based on updatedAt as the resolution timestamp
  const evaluationTime = ['Resolved', 'Closed'].includes(ticket.status)
    ? ticket.updatedAt.getTime()
    : now;

  let slaState = 'ok';
  const elapsed = evaluationTime - createdAtTime;

  if (evaluationTime > slaDeadline.getTime()) {
    slaState = 'breached';
  } else if (elapsed / slaDuration >= 0.75) {
    slaState = 'at_risk';
  }

  // Bump priority if breached, Open/In Progress, and not already bumped
  if (
    slaState === 'breached' &&
    ['Open', 'In Progress'].includes(ticket.status) &&
    !ticket.bumped
  ) {
    const currentIdx = PRIORITY_ORDER.indexOf(ticket.priority);
    if (currentIdx < 3) {
      const newPriority = PRIORITY_ORDER[currentIdx + 1];
      ticket.priority = newPriority;
      ticket.bumped = true;
      ticket.version += 1;
      ticket.history.push({
        message: `Priority auto-bumped to ${newPriority} due to SLA breach`
      });
      // Save changes immediately on read
      await ticket.save();
    }
  }

  // Return a clean object with virtual fields
  const ticketObj = ticket.toObject ? ticket.toObject() : ticket;
  
  // Recalculate deadline using current priority (after potential bump)
  const finalDuration = SLA_HOURS[ticket.priority] || SLA_HOURS.Low;
  ticketObj.slaDeadline = new Date(createdAtTime + finalDuration);
  ticketObj.slaState = slaState;

  return ticketObj;
}

module.exports = {
  processSLA,
  SLA_HOURS
};
