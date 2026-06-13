import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import TicketListPage from './components/TicketListPage';
import CreateTicketPage from './components/CreateTicketPage';
import TicketDetailPage from './components/TicketDetailPage';

function App() {
  return (
    <Router>
      <div className="min-vh-100 d-flex flex-column" style={{ backgroundColor: '#0f172a' }}>
        <nav className="navbar navbar-expand navbar-dark bg-dark border-bottom border-secondary py-3">
          <div className="container">
            <Link to="/" className="navbar-brand d-flex align-items-center fw-bold text-info fs-4">
              <span className="me-2">⚡</span> Appzeto Helpdesk
            </Link>
            <div className="navbar-nav ms-auto">
              <Link to="/" className="nav-link px-3 text-light">Tickets</Link>
              <Link to="/new" className="btn btn-info text-dark fw-bold btn-sm px-3 ms-2">
                + Create Ticket
              </Link>
            </div>
          </div>
        </nav>
        
        <main className="container py-4 flex-grow-1">
          <Routes>
            <Route path="/" element={<TicketListPage />} />
            <Route path="/new" element={<CreateTicketPage />} />
            <Route path="/tickets/:id" element={<TicketDetailPage />} />
          </Routes>
        </main>

        <footer className="bg-dark border-top border-secondary text-muted text-center py-3">
          <div className="container">
            <small>&copy; {new Date().getFullYear()} Appzeto Helpdesk System</small>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;
