import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';

function TicketDetailPage() {
  const { id } = useParams();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Comments state
  const [commentText, setCommentText] = useState('');
  const [commentError, setCommentError] = useState(null);
  const [isAddingComment, setIsAddingComment] = useState(false);

  // SLA Live Countdown States
  const [timeLeftStr, setTimeLeftStr] = useState('');
  const [slaColor, setSlaColor] = useState('text-success');

  // Conflict Modal States
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [serverState, setServerState] = useState(null);
  const [attemptedChange, setAttemptedChange] = useState(null);

  // Toast notifications
  const [toastMessage, setToastMessage] = useState(null);
  const [toastType, setToastType] = useState('info');

  const showToast = (msg, type = 'info') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Fetch Ticket Data
  const fetchTicket = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:5000/api/tickets/${id}`);
      if (!response.ok) {
        throw new Error('Ticket not found');
      }
      const data = await response.json();
      setTicket(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTicket();
  }, [id]);

  // SLA Live Timer Effect
  useEffect(() => {
    if (!ticket) return;

    const updateTimer = () => {
      const createdAt = new Date(ticket.createdAt).getTime();
      const slaDeadline = new Date(ticket.slaDeadline).getTime();
      const totalSla = slaDeadline - createdAt;
      const now = Date.now();

      // Check if ticket is resolved/closed. If so, we freeze based on its updatedAt.
      const evaluationTime = ['Resolved', 'Closed'].includes(ticket.status)
        ? new Date(ticket.updatedAt).getTime()
        : now;

      const diffMs = slaDeadline - evaluationTime;
      const elapsed = evaluationTime - createdAt;

      // Color coding
      if (evaluationTime > slaDeadline) {
        setSlaColor('text-danger');
      } else if (elapsed / totalSla >= 0.75) {
        setSlaColor('text-warning');
      } else {
        setSlaColor('text-success');
      }

      // Format string
      const absoluteDiff = Math.abs(diffMs);
      const secs = Math.floor((absoluteDiff / 1000) % 60);
      const mins = Math.floor((absoluteDiff / (1000 * 60)) % 60);
      const hours = Math.floor((absoluteDiff / (1000 * 60 * 60)) % 24);
      const days = Math.floor(absoluteDiff / (1000 * 60 * 60 * 24));

      let timeString = '';
      if (days > 0) timeString += `${days}d `;
      if (hours > 0 || days > 0) timeString += `${hours}h `;
      timeString += `${mins}m ${secs}s`;

      if (diffMs < 0) {
        setTimeLeftStr(`Breached by ${timeString}`);
      } else {
        if (['Resolved', 'Closed'].includes(ticket.status)) {
          setTimeLeftStr(`Resolved with ${timeString} remaining`);
        } else {
          setTimeLeftStr(`${timeString} remaining`);
        }
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [ticket]);

  // Handle Status Update with Optimistic UI Update and Rollback
  const handleStatusChange = async (newStatus) => {
    if (!ticket) return;
    const oldStatus = ticket.status;

    // Optimistic Update
    const originalTicket = { ...ticket };
    setTicket({ ...ticket, status: newStatus });

    const changeData = { status: newStatus, version: ticket.version };
    setAttemptedChange(changeData);

    try {
      const response = await fetch(`http://localhost:5000/api/tickets/${ticket._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(changeData)
      });

      const data = await response.json();

      if (response.ok) {
        setTicket(data);
        showToast(`Status updated to ${newStatus}`, 'success');
      } else if (response.status === 409) {
        // Optimistic update failed due to Conflict (409)
        setServerState(data); // Save the database current state
        setTicket(originalTicket); // Rollback optimistic update
        setShowConflictModal(true);
      } else {
        // Rollback on 400 or other errors
        setTicket(originalTicket);
        showToast(data.error || 'Failed to update status', 'danger');
      }
    } catch (err) {
      setTicket(originalTicket);
      showToast(err.message, 'danger');
    }
  };

  // Conflict Modal Resolution: Take Server Version
  const handleTakeTheirs = () => {
    if (serverState) {
      setTicket(serverState);
    }
    setShowConflictModal(false);
    showToast('Applied server changes successfully.', 'info');
  };

  // Conflict Modal Resolution: Force Mine on Top using latest Server Version
  const handleRetryMineOnTop = async () => {
    if (!serverState || !attemptedChange) return;
    
    setShowConflictModal(false);
    setLoading(true);

    try {
      const response = await fetch(`http://localhost:5000/api/tickets/${ticket._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...attemptedChange,
          version: serverState.version // Use server's newer version to bypass lock
        })
      });

      const data = await response.json();

      if (response.ok) {
        setTicket(data);
        showToast('Successfully forced status update on top of changes!', 'success');
      } else if (response.status === 409) {
        // If it conflicts again, show modal again with newer version
        setServerState(data);
        setTicket(data);
        setShowConflictModal(true);
      } else {
        setTicket(serverState); // Fallback to server state
        showToast(data.error || 'Failed to force status update', 'danger');
      }
    } catch (err) {
      setTicket(serverState);
      showToast(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  // Add Comment
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText || commentText.trim().length < 3) {
      setCommentError('Comment must be at least 3 characters.');
      return;
    }

    setIsAddingComment(true);
    setCommentError(null);

    try {
      const response = await fetch(`http://localhost:5000/api/tickets/${ticket._id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: commentText })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add comment');
      }

      setTicket(data);
      setCommentText('');
      showToast('Comment added successfully!', 'success');
    } catch (err) {
      setCommentError(err.message);
    } finally {
      setIsAddingComment(false);
    }
  };

  if (loading && !ticket) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-info" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger border-danger bg-danger bg-opacity-10 text-center py-4">
        <h4>⚠️ Error Loading Ticket</h4>
        <p>{error}</p>
        <Link to="/" className="btn btn-outline-light btn-sm mt-2">&larr; Back to List</Link>
      </div>
    );
  }

  if (!ticket) return null;

  // Filter legal transitions for the status dropdown
  const ALLOWED_TRANSITIONS = {
    'Queued': [],
    'Open': ['In Progress'],
    'In Progress': ['Resolved'],
    'Resolved': ['In Progress', 'Closed'],
    'Closed': []
  };

  const legalNextOptions = ALLOWED_TRANSITIONS[ticket.status] || [];
  const isClosed = ticket.status === 'Closed';
  const isQueued = ticket.status === 'Queued';

  return (
    <div className="position-relative">
      {/* Toast */}
      {toastMessage && (
        <div className="toast-container-custom">
          <div className={`toast show align-items-center text-white bg-${toastType} border-0 shadow-lg`} role="alert">
            <div className="d-flex">
              <div className="toast-body fw-bold">
                {toastType === 'danger' ? '⚠️' : 'ℹ️'} {toastMessage}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb / Back Button */}
      <div className="mb-4">
        <Link to="/" className="btn btn-outline-secondary btn-sm">&larr; Back to Ticket List</Link>
      </div>

      <div className="row g-4">
        {/* Left Side: Ticket Details */}
        <div className="col-lg-8">
          <div className="card border-secondary mb-4 shadow-lg">
            <div className="card-header bg-dark border-secondary d-flex justify-content-between align-items-center py-3">
              <div>
                <span className="badge bg-secondary text-uppercase me-2">{ticket.category}</span>
                <span className={`badge ${ticket.status === 'Closed' ? 'bg-dark' : ticket.status === 'Resolved' ? 'bg-success' : 'bg-primary'}`}>
                  {ticket.status}
                </span>
              </div>
              <span className="text-muted small">Version: {ticket.version}</span>
            </div>
            
            <div className="card-body p-4">
              <h2 className="fw-bold mb-3 text-info">{ticket.title}</h2>
              <hr className="border-secondary my-3" />
              
              <div className="mb-4">
                <h5 className="fw-bold mb-2">Description</h5>
                <p className="text-light lead" style={{ whiteSpace: 'pre-wrap' }}>
                  {ticket.description}
                </p>
              </div>

              <div className="row g-3 bg-dark bg-opacity-40 p-3 rounded border border-secondary">
                <div className="col-sm-6">
                  <div className="small text-muted text-uppercase">Assigned Agent</div>
                  <div className="fw-bold fs-5 text-light mt-1">
                    {ticket.assignedAgent ? `👤 ${ticket.assignedAgent}` : '⏳ Unassigned'}
                  </div>
                </div>
                <div className="col-sm-6">
                  <div className="small text-muted text-uppercase">Priority</div>
                  <div className="fw-bold fs-5 text-light mt-1">
                    {ticket.priority}
                  </div>
                </div>
              </div>
            </div>

            {/* SLA countdown bar */}
            <div className="card-footer bg-dark border-secondary p-3 d-flex flex-sm-row flex-column justify-content-between align-items-sm-center">
              <div>
                <span className="small text-muted text-uppercase d-block">SLA Status: <strong>{ticket.slaState.toUpperCase()}</strong></span>
                <span className={`fw-bold fs-5 ${slaColor}`}>
                  ⏱️ {timeLeftStr}
                </span>
              </div>
              <div className="mt-sm-0 mt-3">
                <span className="small text-muted d-block text-sm-end mb-1">Update Status</span>
                <select
                  className="form-select bg-dark text-light border-secondary form-select-sm px-3 py-2"
                  value={ticket.status}
                  disabled={isClosed || isQueued}
                  onChange={(e) => handleStatusChange(e.target.value)}
                >
                  {/* Current Status */}
                  <option value={ticket.status}>{ticket.status} (Current)</option>
                  {/* Legal Options */}
                  {legalNextOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                {isClosed && (
                  <span className="small text-danger d-block mt-1">Closed tickets cannot be changed.</span>
                )}
                {isQueued && (
                  <span className="small text-warning d-block mt-1">Queued tickets are auto-assigned.</span>
                )}
              </div>
            </div>
          </div>

          {/* Comments Section */}
          <div className="card border-secondary shadow-lg">
            <div className="card-header bg-dark border-secondary py-3">
              <h4 className="card-title mb-0 fw-bold text-info">💬 Comments ({ticket.comments.length})</h4>
            </div>
            
            <div className="card-body p-4">
              {ticket.comments.length === 0 ? (
                <p className="text-muted text-center py-3">No comments yet. Be the first to reply.</p>
              ) : (
                <div className="mb-4">
                  {ticket.comments.map((comment, index) => (
                    <div key={comment._id || index} className="mb-3 p-3 bg-dark bg-opacity-35 rounded border border-secondary">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="fw-bold text-info">Support Agent</span>
                        <span className="small text-muted">
                          {new Date(comment.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mb-0 text-light">{comment.text}</p>
                    </div>
                  ))}
                </div>
              )}

              <hr className="border-secondary my-4" />

              {/* Add Comment Form */}
              <form onSubmit={handleAddComment}>
                {commentError && (
                  <div className="alert alert-danger border-danger bg-danger bg-opacity-10 py-2">
                    ⚠️ {commentError}
                  </div>
                )}
                <div className="mb-3">
                  <label htmlFor="commentText" className="form-label fw-bold">Add Comment</label>
                  <textarea
                    id="commentText"
                    rows="3"
                    className="form-control bg-dark text-light border-secondary"
                    placeholder="Enter your update message (min 3 characters)"
                    value={commentText}
                    disabled={isClosed}
                    onChange={(e) => {
                      setCommentText(e.target.value);
                      if (commentError) setCommentError(null);
                    }}
                  />
                  {isClosed && (
                    <div className="form-text text-danger">
                      This ticket is Closed. No further updates or comments can be added.
                    </div>
                  )}
                </div>
                <div className="d-flex justify-content-end">
                  <button
                    type="submit"
                    className="btn btn-info text-dark fw-bold px-4"
                    disabled={isClosed || isAddingComment}
                  >
                    {isAddingComment ? 'Posting...' : 'Post Comment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Right Side: History Log */}
        <div className="col-lg-4">
          <div className="card border-secondary shadow-lg">
            <div className="card-header bg-dark border-secondary py-3">
              <h4 className="card-title mb-0 fw-bold text-info">📜 Activity Timeline</h4>
            </div>
            <div className="card-body p-4">
              {ticket.history.length === 0 ? (
                <p className="text-muted small">No history logged.</p>
              ) : (
                <div className="position-relative border-start border-secondary ps-3 ms-2">
                  {ticket.history.slice().reverse().map((log, index) => (
                    <div key={log._id || index} className="mb-4 position-relative">
                      {/* Timeline dot */}
                      <div className="position-absolute bg-info rounded-circle" style={{
                        width: '10px',
                        height: '10px',
                        left: '-21px',
                        top: '6px'
                      }}></div>
                      
                      <div className="small text-muted">
                        {new Date(log.createdAt).toLocaleString()}
                      </div>
                      <div className="text-light fw-bold mt-1">
                        {log.message}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 409 Conflict Modal */}
      {showConflictModal && serverState && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }} tabIndex="-1" role="dialog">
          <div className="modal-dialog modal-lg modal-dialog-centered" role="document">
            <div className="modal-content bg-dark border-danger text-light">
              <div className="modal-header border-secondary bg-danger bg-opacity-10 py-3">
                <h5 className="modal-title text-danger fw-bold">⚠️ Concurrency Conflict (409)</h5>
              </div>
              <div className="modal-body p-4">
                <p className="lead">
                  This ticket was changed by someone else since you loaded it. Please resolve the differences:
                </p>
                
                <div className="row g-3 mb-4">
                  {/* Attempted (Local) State */}
                  <div className="col-md-6">
                    <div className="p-3 bg-secondary bg-opacity-15 border border-secondary rounded">
                      <h5 className="text-info fw-bold mb-3">Your Attempted Change</h5>
                      <div className="mb-2">
                        <strong className="text-muted">Status:</strong>{' '}
                        <span className="badge bg-primary">{attemptedChange?.status}</span>
                      </div>
                      <div className="mb-2">
                        <strong className="text-muted">Target Version:</strong>{' '}
                        <span>{attemptedChange?.version}</span>
                      </div>
                    </div>
                  </div>

                  {/* Server (Current) State */}
                  <div className="col-md-6">
                    <div className="p-3 bg-danger bg-opacity-10 border border-danger rounded">
                      <h5 className="text-danger fw-bold mb-3">Server Current State</h5>
                      <div className="mb-2">
                        <strong className="text-muted">Status:</strong>{' '}
                        <span className="badge bg-success">{serverState.status}</span>
                      </div>
                      <div className="mb-2">
                        <strong className="text-muted">Server Version:</strong>{' '}
                        <span>{serverState.version}</span>
                      </div>
                      <div className="mb-2">
                        <strong className="text-muted">Last Updated Agent:</strong>{' '}
                        <span>👤 {serverState.assignedAgent || 'Unassigned'}</span>
                      </div>
                      <div className="mb-2">
                        <strong className="text-muted">Last Activity:</strong>{' '}
                        <span className="small d-block text-truncate text-warning">
                          {serverState.history[serverState.history.length - 1]?.message}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="alert alert-warning border-warning bg-warning bg-opacity-10 text-dark small py-2 mb-0">
                  <strong>Take theirs:</strong> Discards your change and loads the server status.<br />
                  <strong>Retry mine on top:</strong> Re-applies your status update on top of their latest version.
                </div>
              </div>
              <div className="modal-footer border-secondary">
                <button type="button" className="btn btn-outline-secondary px-4" onClick={handleTakeTheirs}>
                  Take Theirs
                </button>
                <button type="button" className="btn btn-danger px-4" onClick={handleRetryMineOnTop}>
                  Retry Mine on Top
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TicketDetailPage;
