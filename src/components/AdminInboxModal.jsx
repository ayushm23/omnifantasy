import React, { useCallback, useEffect, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { getIssueReports, updateIssueReportStatus } from '../supabaseClient';

const STATUS_OPTIONS = ['new', 'triage', 'in_progress', 'resolved', 'closed'];
const COMPLETED_STATUSES = new Set(['resolved', 'closed']);

const AdminInboxModal = ({ open, onClose, isAdmin }) => {
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('open'); // open | completed

  const loadReports = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError('');
    const { data, error: loadError } = await getIssueReports();
    if (loadError) {
      setError(loadError.message || 'Failed to load reports.');
      setReports([]);
      setLoading(false);
      return;
    }
    setReports(data || []);
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    if (open) {
      loadReports();
    }
  }, [open, loadReports]);

  const handleStatusChange = async (id, status) => {
    const prev = reports;
    setReports((items) => items.map((r) => (r.id === id ? { ...r, status } : r)));
    const { error: updateError } = await updateIssueReportStatus(id, status);
    if (updateError) {
      setError(updateError.message || 'Failed to update status.');
      setReports(prev);
    }
  };

  const filteredReports = reports.filter((report) => {
    const isCompleted = COMPLETED_STATUSES.has(report.status);
    return tab === 'completed' ? isCompleted : !isCompleted;
  });

  if (!open || !isAdmin) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-3xl border border-slate-700 shadow-2xl">
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Admin Inbox</h2>
              <div className="text-xs text-slate-400">Bug + feature submissions</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadReports}
                className="p-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-700/50"
                title="Refresh"
              >
                <RefreshCw size={16} />
              </button>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm mb-4">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setTab('open')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === 'open' ? 'bg-blue-600 text-white' : 'bg-slate-700/60 text-slate-300 hover:text-white'}`}
            >
              Open ({reports.filter(r => !COMPLETED_STATUSES.has(r.status)).length})
            </button>
            <button
              onClick={() => setTab('completed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === 'completed' ? 'bg-blue-600 text-white' : 'bg-slate-700/60 text-slate-300 hover:text-white'}`}
            >
              Completed ({reports.filter(r => COMPLETED_STATUSES.has(r.status)).length})
            </button>
          </div>

          {loading ? (
            <div className="text-sm text-slate-400">Loading reports…</div>
          ) : filteredReports.length === 0 ? (
            <div className="text-sm text-slate-400">No submissions yet.</div>
          ) : (
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              {filteredReports.map((report) => (
                <div key={report.id} className="rounded-lg border border-slate-700/70 bg-slate-900/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        {report.type} • {report.severity || 'medium'} • {report.area || 'Uncategorized'}
                      </div>
                      <div className="text-sm font-semibold text-white mt-1">{report.title}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {report.created_at ? new Date(report.created_at).toLocaleString() : ''}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Reporter: {report.reporter_name || report.reporter_email || 'Unknown'} • View: {report.view || 'N/A'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-400">Status</label>
                      <select
                        value={report.status}
                        onChange={(e) => handleStatusChange(report.id, e.target.value)}
                        className="px-2 py-1 rounded-md bg-slate-900/80 border border-slate-700 text-xs text-white"
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="text-sm text-slate-200 mt-3 whitespace-pre-wrap">{report.description}</div>
                  {(report.steps_to_reproduce || report.expected_behavior || report.actual_behavior) && (
                    <details className="mt-3">
                      <summary className="text-xs text-slate-400 cursor-pointer">Details</summary>
                      <div className="mt-2 text-xs text-slate-300 space-y-2">
                        {report.steps_to_reproduce && (
                          <div>
                            <div className="text-slate-400 uppercase tracking-wide mb-1">Steps</div>
                            <div className="whitespace-pre-wrap">{report.steps_to_reproduce}</div>
                          </div>
                        )}
                        {report.expected_behavior && (
                          <div>
                            <div className="text-slate-400 uppercase tracking-wide mb-1">Expected</div>
                            <div className="whitespace-pre-wrap">{report.expected_behavior}</div>
                          </div>
                        )}
                        {report.actual_behavior && (
                          <div>
                            <div className="text-slate-400 uppercase tracking-wide mb-1">Actual</div>
                            <div className="whitespace-pre-wrap">{report.actual_behavior}</div>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminInboxModal;
