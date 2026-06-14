# Appzeto Helpdesk

Appzeto Helpdesk is a real-time support ticket system built using the **MERN** stack (Node.js, Express, MongoDB, and React with Vite). It includes features like load-balanced auto-assignment, SLA tracking, optimistic concurrency locking, status state transition validations, and background polling.

The frontend is styled using **Bootstrap CSS** with custom dark theme overlays for a professional look.

---

## Folder Structure
- `/server`: Node.js + Express backend with Mongoose models, controllers, and utility helpers.
- `/client`: React frontend bootstrapped with Vite, utilizing React Router v6 and Bootstrap CSS.

---

## Key Features

### 1. Auto-Assignment & Load Balancing (`/server/utils/assign.js`)
* **Logic**: When a ticket is created, it is allocated to the agent with the lowest active load percentage (`active tickets / maxLoad`).
* **Tie-Breaker**: Ties are broken by fewest absolute active tickets, then alphabetical order (`Dev` -> `Karan` -> `Riya` based on their capacity).
* **Seed Capacity**:
  - `Riya`: maxLoad 3
  - `Karan`: maxLoad 4
  - `Dev`: maxLoad 5
* **Queue System**: If all agents are fully loaded (load % >= 1.0), the ticket receives `assignedAgent: null` and `status: "Queued"`.
* **Reassignment**: When an agent resolves or closes an active ticket, their load decreases. The system immediately finds the oldest `"Queued"` ticket (sorted by `createdAt` ascending), assigns it to that agent, updates its status to `"Open"`, increments its version, logs a history entry, and saves it.

### 2. SLA & Priority Auto-Bumping (`/server/utils/sla.js`)
* **Deadline Definition**: SLA deadlines are calculated at ticket creation:
  - `Critical`: 2 hours
  - `High`: 8 hours
  - `Medium`: 24 hours
  - `Low`: 72 hours
* **SLA States**: `ok`, `at_risk` (elapsed time >= 75%), or `breached` (current time > deadline).
* **Auto-Priority Bump**: On every read operation (listing, fetch by ID), active tickets (`Open` or `In Progress`) that are `breached` are automatically bumped up one priority level (`Low -> Medium -> High -> Critical`). This occurs **only once** (tracked via a `bumped: true` flag in the DB), adds a history log entry, and increments the ticket version.
* **Frozen SLA**: If a ticket is `Resolved` or `Closed`, the SLA calculations are frozen based on the time it was resolved (`updatedAt`) to prevent historical tickets from showing false breaches.

### 3. Optimistic Locking & Status Machine (`/server/routes/tickets.js`)
* **Optimistic Locking**: Every edit request (`PATCH`) must include the current `version` the client last fetched. If the client version doesn't match the database version, the server returns a `409 Conflict` status containing the latest server version in the body.
* **Status Transitions**: The state machine allows only:
  - `Open -> In Progress`
  - `In Progress -> Resolved`
  - `Resolved -> In Progress` (Re-open)
  - `Resolved -> Closed`
  *Nothing can leave the Closed status or transition from Queued manually.* Any illegal status modification yields a `400 Bad Request`.

### 4. Conflict Resolution Modal (`/client/src/components/TicketDetailPage.jsx`)
* When a `409 Conflict` is encountered, the UI shows a modal with a side-by-side comparison of the local change vs the server's current state.
* **[Take Theirs]**: Reverts the local state to match the server's version.
* **[Retry Mine on Top]**: Re-patches the server with your attempted update, but uses the newer server version as the base version. This bypasses the lock and forces your status change.

### 5. Silent Polling (`/client/src/components/TicketListPage.jsx`)
* The ticket list polls the server every 5 seconds. It silently evaluates if the IDs or versions of the fetched tickets differ from the local state.
* If updates are detected, it updates the list and displays a non-intrusive Bootstrap toast notification saying `"N ticket(s) updated in background"` without disturbing scroll position, active page, or filter dropdowns.

---

## Setup & Running Guide

### 1. MongoDB Setup
Make sure MongoDB is running locally. By default, the server connects to:
`mongodb://127.0.0.1:27017/appzeto-helpdesk`
If your MongoDB URI is different, create a file named `.env` in the `/server` folder and specify your connection string:
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/my-database-name
```

### 2. Run Backend Server
```bash
cd server
npm install
npm run dev
```
The server will run on `http://localhost:5000`. On first boot, it automatically seeds the agents (`Riya`, `Karan`, `Dev`) into the database.

### 3. Run Frontend Client
```bash
cd client
npm install
npm run dev
```
The frontend will run on `http://localhost:5173`. Open two browser windows side by side to demo optimistic locking and silent polling synchronization.
