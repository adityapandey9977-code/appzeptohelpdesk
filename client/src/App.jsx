import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import TicketListPage from './components/TicketListPage';
import CreateTicketPage from './components/CreateTicketPage';
import TicketDetailPage from './components/TicketDetailPage';

function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <Router>
      <div className="min-vh-100 d-flex flex-column" style={{ transition: 'background-color 0.3s ease' }}>
        <nav className={`navbar navbar-expand border-bottom py-3 ${
          theme === 'dark' 
            ? 'navbar-dark bg-dark border-secondary' 
            : 'navbar-light bg-light border-light-subtle'
        }`}>
          <div className="container">
            <Link to="/" className="navbar-brand d-flex align-items-center fw-bold text-info fs-4">
              <span className="me-2">⚡</span> Appzeto Helpdesk
            </Link>
            <div className="navbar-nav ms-auto align-items-center">
              <Link to="/" className={`nav-link px-3 ${theme === 'dark' ? 'text-light' : 'text-dark'}`}>
                Tickets
              </Link>
              <Link to="/new" className="btn btn-info text-dark fw-bold btn-sm px-3 ms-2">
                + Create Ticket
              </Link>
              <button
                onClick={toggleTheme}
                className={`btn btn-sm ms-3 d-flex align-items-center ${
                  theme === 'dark' ? 'btn-outline-light' : 'btn-outline-dark'
                }`}
                title="Toggle Light/Dark Theme"
                style={{ fontSize: '0.85rem', fontWeight: 'bold' }}
              >
                {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
              </button>
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

        <footer className={`border-top text-muted text-center py-3 ${
          theme === 'dark' 
            ? 'bg-dark border-secondary' 
            : 'bg-light border-light-subtle'
        }`}>
          <div className="container">
            <small>&copy; {new Date().getFullYear()} Appzeto Helpdesk System</small>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;
