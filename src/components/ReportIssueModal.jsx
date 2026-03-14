import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { createIssueReport } from '../supabaseClient';
import { getUserDisplayName } from '../utils/userDisplay';

const AREA_OPTIONS = [
  'Draft',
  'League',
  'Scoring',
  'Expected Points (EP)',
  'Auth',
  'Notifications',
  'Results',
  'Other',
];

const DEFAULT_STATE = {
  type: 'bug',
  title: '',
  description: '',
  steps: '',
  expected: '',
  actual: '',
  severity: 'medium',
  area: 'Draft',
};

const ReportIssueModal = ({
  open,
  onClose,
  currentUser,
  selectedLeague,
  currentView,
}) => {
  const [form, setForm] = useState(DEFAULT_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successId, setSuccessId] = useState('');

  useEffect(() => {
    if (!open) {
      setForm(DEFAULT_STATE);
      setSubmitting(false);
      setError('');
      setSuccessId('');
    }
  }, [open]);

  const contextLabel = useMemo(() => {
    if (selectedLeague?.name) return `${selectedLeague.name} (${currentView})`;
    return currentView || 'home';
  }, [selectedLeague?.name, currentView]);

  const handleChange = (key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const title = form.title.trim();
    const description = form.description.trim();
    if (!title || !description) {
      setError('Please add a title and description.');
      return;
    }

    setSubmitting(true);
    setError('');
    const payload = {
      type: form.type,
      title,
      description,
      steps_to_reproduce: form.type === 'bug' ? (form.steps.trim() || null) : null,
      expected_behavior: form.type === 'bug' ? (form.expected.trim() || null) : null,
      actual_behavior: form.type === 'bug' ? (form.actual.trim() || null) : null,
      severity: form.type === 'bug' ? form.severity : 'medium',
      area: form.area || null,
      reporter_email: currentUser?.email || null,
      reporter_name: currentUser ? getUserDisplayName(currentUser) : null,
      league_id: selectedLeague?.id || null,
      view: currentView || null,
      user_agent: (typeof navigator !== 'undefined' ? navigator.userAgent : null),
      app_version: import.meta.env.VITE_APP_VERSION || null,
    };

    const { data, error: submitError } = await createIssueReport(payload);
    if (submitError) {
      setError(submitError.message || 'Failed to submit. Please try again.');
      setSubmitting(false);
      return;
    }

    setSuccessId(data?.id || '');
    setSubmitting(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-xl border border-slate-700 shadow-2xl">
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Report an Issue</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {successId ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-200 text-sm">
                Thanks — your report was submitted successfully.
              </div>
              <div className="text-xs text-slate-400">
                Tracking ID: <span className="text-slate-200">{successId}</span>
              </div>
              <button
                onClick={onClose}
                className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm">
                  {error}
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-sm text-slate-300">
                  Type
                  <select
                    value={form.type}
                    onChange={handleChange('type')}
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-700 text-white"
                  >
                    <option value="bug">Bug</option>
                    <option value="feature">Feature</option>
                  </select>
                </label>
                <label className="text-sm text-slate-300">
                  Area
                  <select
                    value={form.area}
                    onChange={handleChange('area')}
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-700 text-white"
                  >
                    {AREA_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </label>
              </div>

              {form.type === 'bug' && (
                <label className="text-sm text-slate-300">
                  Severity
                  <select
                    value={form.severity}
                    onChange={handleChange('severity')}
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-700 text-white"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
              )}

              <label className="text-sm text-slate-300">
                Title
                <input
                  type="text"
                  value={form.title}
                  onChange={handleChange('title')}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-700 text-white"
                  placeholder="Short summary"
                  maxLength={120}
                />
              </label>

              <label className="text-sm text-slate-300">
                Description
                <textarea
                  value={form.description}
                  onChange={handleChange('description')}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-700 text-white min-h-[110px]"
                  placeholder="What happened or what you'd like to see"
                  maxLength={2000}
                />
              </label>

              {form.type === 'bug' && (
                <>
                  <label className="text-sm text-slate-300">
                    Steps to reproduce (optional)
                    <textarea
                      value={form.steps}
                      onChange={handleChange('steps')}
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-700 text-white min-h-[80px]"
                      placeholder="1. … 2. … 3. …"
                      maxLength={2000}
                    />
                  </label>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="text-sm text-slate-300">
                      Expected (optional)
                      <textarea
                        value={form.expected}
                        onChange={handleChange('expected')}
                        className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-700 text-white min-h-[60px]"
                        maxLength={1000}
                      />
                    </label>
                    <label className="text-sm text-slate-300">
                      Actual (optional)
                      <textarea
                        value={form.actual}
                        onChange={handleChange('actual')}
                        className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-700 text-white min-h-[60px]"
                        maxLength={1000}
                      />
                    </label>
                  </div>
                </>
              )}

              <div className="text-xs text-slate-500">
                Context: {contextLabel}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg font-semibold"
                >
                  {submitting ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportIssueModal;
