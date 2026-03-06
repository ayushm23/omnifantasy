// TeamPopup.jsx
// Centered modal popup showing EP trend chart and recent news for a team/player.
// Opens when any team name is clicked across DraftView and LeagueView.

import React, { useState, useMemo } from 'react';
import { X, ExternalLink } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useEPHistory } from '../useEPHistory';
import { useTeamNews } from '../useTeamNews';
import SportBadge from './SportBadge';

// Time frame options: label shown in UI, and approximate number of days to display.
// Filtering is done client-side by slicing the already-fetched 180-day array.
const TIME_FRAMES = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: 'All', days: Infinity },
];

/** Format a published timestamp as a human-readable age string. */
function formatAge(published) {
  if (!published) return '';
  const diffMs = Date.now() - new Date(published).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Props:
 *   sport     {string}       - sport code, e.g. 'NFL'
 *   team      {string}       - team/player name (exact match for EP lookup)
 *   currentEP {number|null}  - current EP value from parent's expectedPoints state
 *   onClose   {function}     - called when X button is clicked
 */
export default function TeamPopup({ sport, team, currentEP, onClose }) {
  const [activeFrame, setActiveFrame] = useState('1W');
  const { history, loading: epLoading } = useEPHistory(sport, team);
  const { news, hasTeamNews, loading: newsLoading, newsError } = useTeamNews(sport, team);

  // Filter history to the selected time frame.
  // Snapshots arrive roughly every 2 days, so days/2 approximates the count needed.
  const filteredHistory = useMemo(() => {
    if (!history.length) return [];
    const frameDays = TIME_FRAMES.find(f => f.label === activeFrame)?.days ?? Infinity;
    if (frameDays === Infinity) return history;
    const approxCount = Math.max(1, Math.ceil(frameDays / 2));
    return history.slice(-approxCount);
  }, [history, activeFrame]);

  // Y-axis domain with a bit of padding so the line isn't flush with edges.
  const epValues = filteredHistory.map(d => d.ep);
  const minEP = epValues.length ? Math.max(0, Math.floor(Math.min(...epValues) - 2)) : 0;
  const maxEP = epValues.length ? Math.ceil(Math.max(...epValues) + 2) : 10;

  const chartEmpty = !epLoading && filteredHistory.length === 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-lg border border-slate-700 shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <SportBadge sport={sport} size="md" className="shrink-0" />
            <h2 className="text-lg font-bold text-white truncate">{team}</h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 ml-3 text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-700/50 rounded"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="p-5 space-y-4 overflow-y-auto">

          {/* Current EP */}
          <div className="flex items-baseline gap-2">
            {currentEP !== null && currentEP !== undefined ? (
              <>
                <span className="text-2xl font-bold text-amber-400">~{currentEP} EP</span>
                <span className="text-slate-400 text-xs">current expected points</span>
              </>
            ) : (
              <span className="text-slate-500 text-sm">No EP data available</span>
            )}
          </div>

          {/* Section label + time frame selector */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">EP Trend</span>
            <div className="flex gap-1">
              {TIME_FRAMES.map(({ label }) => (
                <button
                  key={label}
                  onClick={() => setActiveFrame(label)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                    activeFrame === label
                      ? 'bg-amber-500/20 border border-amber-500/50 text-amber-400'
                      : 'bg-slate-700/40 border border-slate-600/40 text-slate-400 hover:text-slate-200 hover:border-slate-500/60'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Chart area */}
          <div className="h-44">
            {epLoading ? (
              <div className="flex items-center justify-center h-full gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            ) : chartEmpty ? (
              <div className="flex items-center justify-center h-full px-4 text-center">
                <p className="text-slate-500 text-sm leading-relaxed">
                  EP trend data is being collected.
                  <br />
                  Check back after the next odds refresh (~2 days).
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={filteredHistory} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={{ stroke: '#475569' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[minEP, maxEP]}
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #475569',
                      borderRadius: '8px',
                      color: '#f1f5f9',
                      fontSize: 12,
                    }}
                    formatter={(value) => [`~${value} EP`, 'Expected Points']}
                    labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="ep"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ fill: '#f59e0b', r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#fbbf24', strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-slate-700/60" />

          {/* News section */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              {hasTeamNews ? 'Recent Headlines' : 'Sport News'}
            </span>

            {newsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="p-3 rounded-lg bg-slate-700/30 animate-pulse space-y-2">
                    <div className="h-3 bg-slate-600/60 rounded w-full" />
                    <div className="h-3 bg-slate-600/40 rounded w-3/4" />
                  </div>
                ))}
              </div>
            ) : newsError ? (
              <p className="text-slate-500 text-sm">Unable to load news.</p>
            ) : news.length === 0 ? (
              <p className="text-slate-500 text-sm">No news available.</p>
            ) : (
              <div className="space-y-2">
                {news.map((article, i) => (
                  <a
                    key={i}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start justify-between gap-3 p-3 rounded-lg bg-slate-700/30 hover:bg-slate-700/60 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200 group-hover:text-white leading-snug">
                        {article.headline}
                      </p>
                      {article.description && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                          {article.description}
                        </p>
                      )}
                      {article.published && (
                        <p className="text-xs text-slate-500 mt-1">{formatAge(article.published)}</p>
                      )}
                    </div>
                    <ExternalLink size={13} className="shrink-0 mt-0.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
                  </a>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
