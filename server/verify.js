const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');

// Import models & utilities to run in the same process
const Agent = require('./models/Agent');
const Ticket = require('./models/Ticket');
const { processSLA } = require('./utils/sla');

// Set up a mock server instance in-process for API routing tests
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/tickets', require('./routes/tickets'));

let server;
const PORT = 5001; // Use a distinct port to avoid collision with running dev servers
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/appzeto-helpdesk-test';

async function runTests() {
  console.log('🚀 Starting integration tests...');
  
  // 1. Establish database connection
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to Test MongoDB');
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);
  }
  
  // Clean out collections to ensure fresh runs
  await Ticket.deleteMany({});
  await Agent.deleteMany({});
  
  // Seed the database with the testing agents
  await Agent.insertMany([
    { name: 'Riya', maxLoad: 3 },
    { name: 'Karan', maxLoad: 4 },
    { name: 'Dev', maxLoad: 5 }
  ]);
  console.log('✅ Seeded Agents: Riya (3), Karan (4), Dev (5)');

  server = app.listen(PORT);
  console.log(`✅ Test server running on port ${PORT}`);

  const baseUrl = `http://127.0.0.1:${PORT}/api/tickets`;

  const apiFetch = async (url, options = {}) => {
    const res = await fetch(url, options);
    const text = await res.text();
    let body = {};
    try {
      body = JSON.parse(text);
    } catch (e) {}
    return { status: res.status, body };
  };

  try {
    // -------------------------------------------------------------
    // Test 1: Ticket Creation and Load Balancing
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Ticket Creation and Load Balancing ---');
    // Capacities: Riya (3), Karan (4), Dev (5). Load% = active/maxLoad
    // Ticket 1: Initial loads are 0/3, 0/4, 0/5. All are 0%.
    // Tie-breaker order: Load% (equal) -> absolute active count (0 for all) -> alphabetical (Dev first)
    // Expect: Assigned to Dev, Status: Open
    const t1 = await apiFetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Issue 1 with dev system',
        description: 'This is a description that is more than 20 characters long.',
        category: 'Bug',
        priority: 'Low'
      })
    });
    console.log(`Ticket 1: HTTP ${t1.status}, Agent: ${t1.body.assignedAgent}, Status: ${t1.body.status}`);
    if (t1.status !== 201 || t1.body.assignedAgent !== 'Dev' || t1.body.status !== 'Open') {
      throw new Error('Test 1 failed: Ticket 1 assignment mismatch.');
    }

    // Active counts: Dev=1 (20% load), Karan=0 (0% load), Riya=0 (0% load)
    // Ticket 2: Tie between Karan and Riya (both 0%).
    // Tie-breaker order: Load% (0%) -> absolute (0) -> alphabetical (Karan < Riya)
    // Expect: Assigned to Karan
    const t2 = await apiFetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Issue 2 with database connectivity',
        description: 'This is a description that is more than 20 characters long.',
        category: 'Bug',
        priority: 'Medium'
      })
    });
    console.log(`Ticket 2: HTTP ${t2.status}, Agent: ${t2.body.assignedAgent}`);
    if (t2.status !== 201 || t2.body.assignedAgent !== 'Karan') {
      throw new Error('Test 1 failed: Ticket 2 assignment mismatch.');
    }

    // Active counts: Dev=1 (20%), Karan=1 (25%), Riya=0 (0%)
    // Ticket 3: Riya has 0% load
    // Expect: Assigned to Riya
    const t3 = await apiFetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Issue 3 with deployment build',
        description: 'This is a description that is more than 20 characters long.',
        category: 'Feature',
        priority: 'High'
      })
    });
    console.log(`Ticket 3: HTTP ${t3.status}, Agent: ${t3.body.assignedAgent}`);
    if (t3.status !== 201 || t3.body.assignedAgent !== 'Riya') {
      throw new Error('Test 1 failed: Ticket 3 assignment mismatch.');
    }

    // Active counts: Dev=1 (20% load), Karan=1 (25% load), Riya=1 (33.3% load)
    // Ticket 4: Dev has lowest load percentage (20% < 25%)
    // Expect: Assigned to Dev
    const t4 = await apiFetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Issue 4 with authentication service',
        description: 'This is a description that is more than 20 characters long.',
        category: 'Billing',
        priority: 'Critical'
      })
    });
    console.log(`Ticket 4: HTTP ${t4.status}, Agent: ${t4.body.assignedAgent}`);
    if (t4.status !== 201 || t4.body.assignedAgent !== 'Dev') {
      throw new Error('Test 1 failed: Ticket 4 assignment mismatch.');
    }

    console.log('✅ Ticket creation & load balancing verified.');

    // -------------------------------------------------------------
    // Test 2: Queue Overflow
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Queue Overflow ---');
    // Total active capacities: Riya (3) + Karan (4) + Dev (5) = 12 tickets.
    // Active currently: Dev (2), Karan (1), Riya (1) -> 4 active tickets.
    // Create 8 more tickets to fill all agent capacities.
    for (let i = 5; i <= 12; i++) {
      await apiFetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Issue ${i} filling capacities`,
          description: 'This is a description that is more than 20 characters long.',
          category: 'Other',
          priority: 'Low'
        })
      });
    }

    // Agent slots are now fully saturated. Next ticket should overflow.
    // Expect: assignedAgent: null, status: 'Queued'
    const queuedTicket = await apiFetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'This issue should overflow to queue',
        description: 'This is a description that is more than 20 characters long.',
        category: 'Bug',
        priority: 'Low'
      })
    });

    console.log(`Queued Ticket: HTTP ${queuedTicket.status}, Agent: ${queuedTicket.body.assignedAgent}, Status: ${queuedTicket.body.status}`);
    if (queuedTicket.body.status !== 'Queued' || queuedTicket.body.assignedAgent !== null) {
      throw new Error('Test 2 failed: Ticket did not overflow to Queue.');
    }
    console.log('✅ Queue overflow verified.');

    // -------------------------------------------------------------
    // Test 3: Status Transitions Validation
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Status transitions validation ---');
    // Ticket 1 (assigned to Dev) is currently "Open".
    // Attempt illegal transition "Open" -> "Resolved"
    const badTransition = await apiFetch(`${baseUrl}/${t1.body._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'Resolved',
        version: t1.body.version
      })
    });
    console.log(`Illegal transition response status: HTTP ${badTransition.status}, Error: ${badTransition.body.error}`);
    if (badTransition.status !== 400) {
      throw new Error('Test 3 failed: Illegal transition was not rejected.');
    }

    // Perform legal transition "Open" -> "In Progress"
    const goodTransition = await apiFetch(`${baseUrl}/${t1.body._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'In Progress',
        version: t1.body.version
      })
    });
    console.log(`Legal transition response status: HTTP ${goodTransition.status}, Status: ${goodTransition.body.status}, Version: ${goodTransition.body.version}`);
    if (goodTransition.status !== 200 || goodTransition.body.status !== 'In Progress' || goodTransition.body.version !== 2) {
      throw new Error('Test 3 failed: Legal transition Open -> In Progress failed.');
    }
    console.log('✅ Legal and illegal status transitions verified.');

    // -------------------------------------------------------------
    // Test 4: Optimistic Concurrency Locking (409)
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Optimistic Concurrency Locking ---');
    // Ticket 1 is currently at version 2. Attempt patch using version 1
    const conflictRes = await apiFetch(`${baseUrl}/${t1.body._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'Resolved',
        version: 1
      })
    });
    console.log(`Lock mismatch response status: HTTP ${conflictRes.status}, Current Server Version: ${conflictRes.body.version}`);
    if (conflictRes.status !== 409 || conflictRes.body.version !== 2) {
      throw new Error('Test 4 failed: Optimistic locking did not return 409 or correct version.');
    }
    console.log('✅ Optimistic locking (409) verified.');

    // -------------------------------------------------------------
    // Test 5: Reassignment on Resolution
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Reassignment on Resolution ---');
    // Resolve Ticket 1 (currently assigned to Dev, version 2)
    // Since Dev was at maximum load, resolving this ticket reduces Dev's load, freeing them up.
    // The oldest queued ticket (queuedTicket) should automatically be reassigned to Dev.
    const resolveRes = await apiFetch(`${baseUrl}/${t1.body._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'Resolved',
        version: 2
      })
    });
    console.log(`Resolved ticket: HTTP ${resolveRes.status}, Ticket status: ${resolveRes.body.status}`);
    if (resolveRes.status !== 200 || resolveRes.body.status !== 'Resolved') {
      throw new Error('Test 5 failed: Could not resolve ticket.');
    }

    // Verify queued ticket is reassigned to Dev
    const queuedCheck = await apiFetch(`${baseUrl}/${queuedTicket.body._id}`);
    console.log(`Queued ticket assignment: ${queuedCheck.body.assignedAgent}, Status: ${queuedCheck.body.status}`);
    if (queuedCheck.body.assignedAgent !== 'Dev' || queuedCheck.body.status !== 'Open') {
      throw new Error('Test 5 failed: Queued ticket was not reassigned to freed agent Dev.');
    }
    console.log('✅ Reassignment of queued tickets on resolution verified.');

    // -------------------------------------------------------------
    // Test 6: SLA Breached Priority Auto-Bump
    // -------------------------------------------------------------
    console.log('\n--- Test 6: SLA Breached Priority Auto-Bump ---');
    // Create a mock ticket that is already breached in the past, save it, and then query it.
    const tempTicket = new Ticket({
      title: 'SLA Breach test ticket',
      description: 'This is a description that is more than 20 characters long.',
      category: 'Billing',
      priority: 'Low',
      slaDeadline: new Date(Date.now() - 5000), // Deadline breached
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // Created 4 days ago
      history: [{ message: 'Ticket created.' }]
    });
    await tempTicket.save();

    // Read the ticket to trigger the SLA process on read
    const fetchSla = await apiFetch(`${baseUrl}/${tempTicket._id}`);
    console.log(`Original Priority: Low, Read Priority: ${fetchSla.body.priority}, Version: ${fetchSla.body.version}, Bumped: ${fetchSla.body.bumped}`);
    if (fetchSla.body.priority !== 'Medium' || fetchSla.body.version !== 2 || fetchSla.body.bumped !== true) {
      throw new Error('Test 6 failed: Priority was not bumped on read for breached ticket.');
    }
    
    const bumpHistory = fetchSla.body.history.find(h => h.message.includes('auto-bumped'));
    console.log(`Bump History entry found: ${!!bumpHistory}`);
    if (!bumpHistory) {
      throw new Error('Test 6 failed: Bump history message not found.');
    }
    console.log('✅ SLA Breach priority auto-bumping verified.');

    console.log('\n🌟 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! 🌟');
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  } finally {
    // Shutdown server and close connections
    if (server) server.close();
    await mongoose.disconnect();
    console.log('🔌 Test server shut down.');
  }
}

runTests();
