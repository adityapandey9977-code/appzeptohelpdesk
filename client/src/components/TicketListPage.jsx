import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

function TicketListPage() {
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({ byStatus: {}, byPriority: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter States
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [searchVal, setSearchVal] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortFilter, setSortFilter] = useState('newest');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState(null);

  // Ref to hold current tickets for comparison in polling
  const ticketsRef = useRef(tickets);
  ticketsRef.current = tickets;

  // Search Debounce logic
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchVal);
      setPage(1); // Reset page on search
    }, 400);
    return () => clearTimeout(timer);
  }, [searchVal]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, priorityFilter, sortFilter]);

  // Fetch Tickets Function
  const fetchTicketsData = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      
      const queryParams = new URLSearchParams({
        status: statusFilter,
        priority: priorityFilter,
        search: debouncedSearch,
        sort: sortFilter,
        page: page,
        limit: 6
      });

      const response = await fetch(`http://localhost:5000/api/tickets?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch tickets');
      }
      
      const data = await response.json();

      if (isSilent) {
        // Comparison logic for background polling
        const oldTickets = ticketsRef.current;
        const oldMap = new Map(oldTickets.map(t => [t._id, t.version]));
        let changedCount = 0;

        data.tickets.forEach(newT => {
          const oldVersion = oldMap.get(newT._id);
          if (oldVersion === undefined || oldVersion !== newT.version) {
            changedCount++;
          }
        });

        // Check for deleted tickets
        const newIds = new Set(data.tickets.map(t => t._id));
        oldTickets.forEach(oldT => {
          if (!newIds.has(oldT._id)) {
            changedCount++;
          }
        });

        if (changedCount > 0) {
          setTickets(data.tickets);
          setTotalPages(data.totalPages);
          showToast(`${changedCount} ticket(s) updated in background`);
          fetchStats(); // Update stats too
        }
      } else {
        setTickets(data.tickets);
        setTotalPages(data.totalPages);
      }
      setError(null);
    } catch (err) {
      if (!isSilent) setError(err.message);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  // Fetch Stats Function
  const fetchStats = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/tickets/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  // Initial fetch and fetch on filter/page changes
  useEffect(() => {
    fetchTicketsData(false);
    fetchStats();
  }, [statusFilter, priorityFilter, debouncedSearch, sortFilter, page]);

  // Setup 5-second polling
  useEffect(() => {
    const pollInterval = setInterval(() => {
      fetchTicketsData(true);
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [statusFilter, priorityFilter, debouncedSearch, sortFilter, page]);

  // Utility to show toast message
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Helper for priority badges
  const getPriorityBadgeClass = (priority) => {
    switch (priority) {
      case 'Critical': return 'bg-danger text-light';
      case 'High': return 'bg-warning text-dark';
      case 'Medium': return 'bg-info text-dark';
      case 'Low': return 'bg-secondary text-light';
      default: return 'bg-light text-dark';
    }
  };

  // Helper for status badges
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'Queued': return 'bg-secondary text-light';
      case 'Open': return 'bg-primary text-light';
      case 'In Progress': return 'bg-warning text-dark';
      case 'Resolved': return 'bg-success text-light';
      case 'Closed': return 'bg-dark text-light';
      default: return 'bg-light text-dark';
    }
  };

  // Helper for SLA badge and color coding
  const getSLABadgeClass = (state) => {
    switch (state) {
      case 'breached': return 'border-danger text-danger bg-danger bg-opacity-10';
      case 'at_risk': return 'border-warning text-warning bg-warning bg-opacity-10';
      default: return 'border-success text-success bg-success bg-opacity-10';
    }
  };

  // Format relative time helper (simple version for interview explanation)
  const formatRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-container-custom">
          <div className="toast show align-items-center text-white bg-info border-0 shadow-lg" role="alert" aria-live="assertive" aria-atomic="true">
            <div className="d-flex">
              <div className="toast-body fw-bold">
                ℹ️ {toastMessage}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div className="row mb-4 g-3">
        {['Queued', 'Open', 'In Progress', 'Resolved', 'Closed'].map(statusName => (
          <div className="col" key={statusName}>
            <div className="card text-center p-3 border-secondary">
              <div className="text-muted small text-uppercase fw-bold">{statusName}</div>
              <div className="fs-3 fw-bold text-info">
                {stats.byStatus[statusName] || 0}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="card p-3 mb-4 border-secondary">
        <div className="row g-3">
          <div className="col-md-4">
            <input
              type="text"
              className="form-control bg-dark text-light border-secondary"
              placeholder="Search title/description..."
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
            />
          </div>
          <div className="col-md-2">
            <select
              className="form-select bg-dark text-light border-secondary"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="Queued">Queued</option>
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
          <div className="col-md-2">
            <select
              className="form-select bg-dark text-light border-secondary"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="">All Priorities</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
          <div className="col-md-2">
            <select
              className="form-select bg-dark text-light border-secondary"
              value={sortFilter}
              onChange={(e) => setSortFilter(e.target.value)}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="priority">Priority</option>
            </select>
          </div>
          <div className="col-md-2 d-grid">
            <button
              className="btn btn-outline-secondary"
              onClick={() => {
                setStatusFilter('');
                setPriorityFilter('');
                setSearchVal('');
                setSortFilter('newest');
                setPage(1);
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Tickets List */}
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-info" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : error ? (
        <div className="alert alert-danger border-danger bg-danger bg-opacity-10 text-center py-4">
          ⚠️ {error}
        </div>
      ) : tickets.length === 0 ? (
        <div className="card text-center py-5 border-secondary bg-transparent">
          <h4 className="text-muted">No tickets found match filters</h4>
          <p className="text-muted small">Try creating a new ticket or clearing criteria</p>
        </div>
      ) : (
        <>
          <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4">
            {tickets.map(ticket => (
              <div className="col" key={ticket._id}>
                <div className="card h-100 border-secondary">
                  <div className="card-header bg-dark border-secondary d-flex justify-content-between align-items-center">
                    <span className="badge bg-secondary text-uppercase">{ticket.category}</span>
                    <span className={`badge ${getStatusBadgeClass(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  </div>
                  <div className="card-body">
                    <h5 className="card-title fw-bold text-truncate">{ticket.title}</h5>
                    <p className="card-text text-muted text-truncate" style={{ maxHeight: '3.6em', overflow: 'hidden' }}>
                      {ticket.description}
                    </p>
                    <div className="d-flex justify-content-between align-items-center mt-3 pt-2 border-top border-secondary">
                      <div>
                        <span className={`badge ${getPriorityBadgeClass(ticket.priority)} me-2`}>
                          {ticket.priority}
                        </span>
                        {ticket.assignedAgent ? (
                          <span className="small text-muted">👤 {ticket.assignedAgent}</span>
                        ) : (
                          <span className="small text-warning">⏳ Unassigned</span>
                        )}
                      </div>
                      <span className="small text-muted">{formatRelativeTime(ticket.createdAt)}</span>
                    </div>
                  </div>
                  <div className="card-footer bg-dark border-secondary d-flex justify-content-between align-items-center">
                    <span className={`badge border rounded-pill py-2 px-3 ${getSLABadgeClass(ticket.slaState)} ${ticket.slaState === 'breached' ? 'sla-breached-indicator' : ''}`}>
                      SLA: {ticket.slaState.toUpperCase()}
                    </span>
                    <Link to={`/tickets/${ticket._id}`} className="btn btn-sm btn-outline-info">
                      Details &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          <div className="d-flex justify-content-between align-items-center mt-4">
            <span className="text-muted small">
              Page <strong>{page}</strong> of <strong>{totalPages || 1}</strong>
            </span>
            <div className="btn-group">
              <button
                className="btn btn-outline-secondary px-3"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                &larr; Prev
              </button>
              <button
                className="btn btn-outline-secondary px-3"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next &rarr;
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default TicketListPage;
