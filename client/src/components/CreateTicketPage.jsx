import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function CreateTicketPage() {
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Bug');
  const [priority, setPriority] = useState('Low');

  // Error states
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validate function
  const validateForm = () => {
    const newErrors = {};
    if (!title || title.length < 5 || title.length > 100) {
      newErrors.title = 'Title must be between 5 and 100 characters.';
    }
    if (!description || description.length < 20) {
      newErrors.description = 'Description must be at least 20 characters.';
    }
    if (!['Bug', 'Feature', 'Billing', 'Other'].includes(category)) {
      newErrors.category = 'Please select a valid category.';
    }
    if (!['Low', 'Medium', 'High', 'Critical'].includes(priority)) {
      newErrors.priority = 'Please select a valid priority.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch('http://localhost:5000/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title, description, category, priority })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create ticket');
      }

      navigate('/'); // Redirect to list page on success
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="row justify-content-center">
      <div className="col-md-8">
        <div className="card border-secondary shadow-lg">
          <div className="card-header bg-dark border-secondary py-3">
            <h3 className="card-title mb-0 fw-bold text-info">📝 Create Support Ticket</h3>
          </div>
          <div className="card-body p-4">
            {submitError && (
              <div className="alert alert-danger border-danger bg-danger bg-opacity-10" role="alert">
                ⚠️ {submitError}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Title */}
              <div className="mb-3">
                <label htmlFor="title" className="form-label fw-bold">Title</label>
                <input
                  type="text"
                  id="title"
                  className={`form-control bg-dark text-light border-secondary ${errors.title ? 'is-invalid' : ''}`}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (errors.title) setErrors({ ...errors, title: null });
                  }}
                  placeholder="Summarize the issue (5 - 100 characters)"
                />
                {errors.title && (
                  <div className="invalid-feedback">{errors.title}</div>
                )}
              </div>

              {/* Description */}
              <div className="mb-3">
                <label htmlFor="description" className="form-label fw-bold">Description</label>
                <textarea
                  id="description"
                  rows="4"
                  className={`form-control bg-dark text-light border-secondary ${errors.description ? 'is-invalid' : ''}`}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    if (errors.description) setErrors({ ...errors, description: null });
                  }}
                  placeholder="Provide details about the issue (minimum 20 characters)"
                />
                {errors.description && (
                  <div className="invalid-feedback">{errors.description}</div>
                )}
              </div>

              <div className="row">
                {/* Category */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="category" className="form-label fw-bold">Category</label>
                  <select
                    id="category"
                    className="form-select bg-dark text-light border-secondary"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="Bug">Bug</option>
                    <option value="Feature">Feature</option>
                    <option value="Billing">Billing</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Priority */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="priority" className="form-label fw-bold">Priority</label>
                  <select
                    id="priority"
                    className="form-select bg-dark text-light border-secondary"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="Low">Low (72h SLA)</option>
                    <option value="Medium">Medium (24h SLA)</option>
                    <option value="High">High (8h SLA)</option>
                    <option value="Critical">Critical (2h SLA)</option>
                  </select>
                </div>
              </div>

              <div className="d-flex justify-content-end gap-2 mt-4">
                <button
                  type="button"
                  className="btn btn-outline-secondary px-4"
                  disabled={isSubmitting}
                  onClick={() => navigate('/')}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-info text-dark fw-bold px-4 d-flex align-items-center"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Submitting...
                    </>
                  ) : (
                    'Submit Ticket'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreateTicketPage;
