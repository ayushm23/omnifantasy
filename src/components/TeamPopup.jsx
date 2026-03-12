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
import { useTeamPerformance } from '../useTeamPerformance';
import { useTeamRecord, SPORT_SEASONS } from '../useTeamRecord';
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
const POPUP_TABS = [
  { id: 'ep', label: 'EP Trend' },
  { id: 'performance', label: 'Performance' },
  { id: 'news', label: 'News' },
];

// Generic result styling (colors/bg used across all sports)
const RESULT_STYLE = {
  champion:       { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30',   icon: '🏆' },
  runner_up:      { color: 'text-slate-200', bg: 'bg-slate-700/40 border-slate-600/40',   icon: '🥈' },
  semifinalist:   { color: 'text-blue-300',  bg: 'bg-blue-500/10 border-blue-500/30',     icon: '4️⃣' },
  quarterfinalist:{ color: 'text-slate-300', bg: 'bg-slate-700/30 border-slate-600/30',   icon: '8️⃣' },
  t9_t16:         { color: 'text-slate-400', bg: 'bg-slate-700/20 border-slate-600/20',   icon: '📍' },
  r16:            { color: 'text-slate-400', bg: 'bg-slate-700/20 border-slate-600/20',   icon: '📍' },
  none:           { color: 'text-slate-500', bg: 'bg-slate-800/40 border-slate-700/20',   icon: '—'  },
};

// Sport-specific playoff round labels for completed seasons
const SPORT_RESULT_LABELS = {
  NFL: {
    champion:        'Won the Super Bowl',
    runner_up:       'Lost in the Super Bowl',
    semifinalist:    'Lost in the Conference Championship',
    quarterfinalist: 'Lost in the Divisional Round',
    none:            'Missed Playoffs / Lost in Wild Card Round',
  },
  NBA: {
    champion:        'Won the NBA Finals',
    runner_up:       'Lost in the NBA Finals',
    semifinalist:    'Lost in the Conference Finals',
    quarterfinalist: 'Lost in the Conference Semifinals',
    none:            'Missed Playoffs / Lost in First Round',
  },
  MLB: {
    champion:        'Won the World Series',
    runner_up:       'Lost in the World Series',
    semifinalist:    'Lost in the Championship Series',
    quarterfinalist: 'Lost in the Division Series',
    none:            'Missed Playoffs / Lost in Wild Card Round',
  },
  NHL: {
    champion:        'Won the Stanley Cup',
    runner_up:       'Lost in the Stanley Cup Finals',
    semifinalist:    'Lost in the Conference Finals',
    quarterfinalist: 'Lost in the Conference Semifinals',
    none:            'Missed Playoffs / Lost in First Round',
  },
  NCAAF: {
    champion:        'Won the National Championship',
    runner_up:       'Lost in the Championship Game',
    semifinalist:    'Lost in the CFP Semifinal',
    quarterfinalist: 'Lost in the CFP Quarterfinal',
    none:            'Did Not Qualify / Eliminated Early',
  },
  NCAAMB: {
    champion:        'Won the National Championship',
    runner_up:       'Lost in the Championship Game',
    semifinalist:    'Lost in the Final Four',
    quarterfinalist: 'Lost in the Elite Eight',
    none:            'Eliminated in Round of 64 / 32',
  },
  UCL: {
    champion:        'Won the Champions League',
    runner_up:       'Lost in the Final',
    semifinalist:    'Lost in the Semifinals',
    quarterfinalist: 'Lost in the Quarterfinals',
    none:            'Eliminated in Group Stage / Round of 16',
  },
  Euro: {
    champion:        'Won the Euros',
    runner_up:       'Lost in the Final',
    semifinalist:    'Lost in the Semifinals',
    quarterfinalist: 'Lost in the Quarterfinals',
    none:            'Eliminated Early',
  },
  WorldCup: {
    champion:        'Won the World Cup',
    runner_up:       'Lost in the Final',
    semifinalist:    'Lost in the Semifinals',
    quarterfinalist: 'Lost in the Quarterfinals',
    none:            'Eliminated Early',
  },
};

// Resolve human-readable result label for a sport + result key
function getResultLabel(sport, resultKey) {
  return SPORT_RESULT_LABELS[sport]?.[resultKey] ?? resultKey;
}

// For Golf/Tennis multi-event per-event results (generic labels are fine here)
const EVENT_RESULT_META = {
  champion:       { label: 'Champion',       color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30',   icon: '🏆' },
  runner_up:      { label: 'Runner-up',      color: 'text-slate-200',   bg: 'bg-slate-700/40 border-slate-600/40',   icon: '🥈' },
  semifinalist:   { label: 'Semifinalist',   color: 'text-blue-300',    bg: 'bg-blue-500/10 border-blue-500/30',     icon: '4️⃣' },
  quarterfinalist:{ label: 'Quarterfinalist',color: 'text-slate-300',   bg: 'bg-slate-700/30 border-slate-600/30',   icon: '8️⃣' },
  t9_t16:         { label: 'T9–T16',         color: 'text-slate-400',   bg: 'bg-slate-700/20 border-slate-600/20',   icon: '📍' },
  r16:            { label: 'Round of 16',    color: 'text-slate-400',   bg: 'bg-slate-700/20 border-slate-600/20',   icon: '📍' },
  none:           { label: 'Did not place',  color: 'text-slate-500',   bg: 'bg-slate-800/40 border-slate-700/20',   icon: '—'  },
};

export default function TeamPopup({ sport, team, currentEP, onClose }) {
  const [activeTab, setActiveTab] = useState('ep');
  const [activeFrame, setActiveFrame] = useState('1W');
  const seasons = SPORT_SEASONS[sport];
  // Default to current season if it has started, otherwise default to previous
  const [selectedSeason, setSelectedSeason] = useState(
    () => (seasons?.seasonStarted ? seasons.current : seasons?.previous) ?? null
  );
  const { history, loading: epLoading } = useEPHistory(sport, team);
  const { news, hasTeamNews, loading: newsLoading, newsError } = useTeamNews(sport, team);
  const { performance, loading: perfLoading } = useTeamPerformance(sport, team);
  const { record, loading: recordLoading } = useTeamRecord(sport, team, selectedSeason);

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
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white truncate">{team}</h2>
              {currentEP !== null && currentEP !== undefined ? (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-bold text-amber-400">~{currentEP} EP</span>
                  <span className="text-slate-500 text-xs">current</span>
                </div>
              ) : (
                <span className="text-slate-500 text-xs">No EP data</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 ml-3 text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-700/50 rounded"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-700/60 shrink-0 px-5">
          {POPUP_TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                activeTab === id
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="p-5 space-y-4 overflow-y-auto">

          {/* EP Trend tab */}
          {activeTab === 'ep' && (
            <>
              {/* Time frame selector */}
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
              <div className="h-52">
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
            </>
          )}

          {/* Performance tab */}
          {activeTab === 'performance' && (
            <div className="space-y-4">

              {/* Season selector */}
              {seasons && (
                <div className="flex gap-2">
                  {seasons.seasonStarted && (
                    <button
                      onClick={() => setSelectedSeason(seasons.current)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        selectedSeason === seasons.current
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                          : 'bg-slate-700/40 border-slate-600/40 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {seasons.currentLabel}
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedSeason(seasons.previous)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      selectedSeason === seasons.previous
                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                        : 'bg-slate-700/40 border-slate-600/40 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {seasons.previousLabel}
                  </button>
                </div>
              )}

              {/* Live record / standings — team sports + F1 */}
              {recordLoading && (
                <div className="h-16 rounded-lg bg-slate-700/30 animate-pulse" />
              )}
              {!recordLoading && record?.type === 'team' && (
                <div className="bg-slate-700/30 border border-slate-600/30 rounded-xl px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      {record.division || 'Season Record'}
                    </div>
                    {selectedSeason === seasons?.current && !performance?.isComplete && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                        Live
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    {record.wins !== null && record.losses !== null && (
                      <div>
                        <span className="text-xl font-bold text-white">
                          {record.wins}–{record.losses}
                          {record.otLosses !== null ? `–${record.otLosses}` : ''}
                          {record.ties !== null && record.ties > 0 ? `–${record.ties}` : ''}
                        </span>
                        <span className="text-xs text-slate-500 ml-1.5">W-L{record.otLosses !== null ? '-OTL' : ''}</span>
                      </div>
                    )}
                    {record.playoffSeed !== null && (
                      <div className="text-sm text-slate-300">
                        Seed <span className="font-bold text-white">#{record.playoffSeed}</span>
                      </div>
                    )}
                    {record.points !== null && record.wins === null && (
                      <div className="text-sm text-slate-300">
                        <span className="font-bold text-white">{record.points}</span> pts
                      </div>
                    )}
                  </div>
                </div>
              )}
              {!recordLoading && record?.type === 'f1' && (
                <div className="bg-slate-700/30 border border-slate-600/30 rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Championship Standings</div>
                    {selectedSeason === seasons?.current && !performance?.isComplete && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                        Live
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div>
                      <span className="text-xl font-bold text-white">P{record.position}</span>
                      <span className="text-xs text-slate-500 ml-1.5">of {record.total}</span>
                    </div>
                    <div className="text-sm text-slate-300">
                      <span className="font-bold text-white">{record.points}</span> pts
                    </div>
                    {record.wins > 0 && (
                      <div className="text-sm text-slate-300">
                        <span className="font-bold text-white">{record.wins}</span> win{record.wins !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {!recordLoading && !record && seasons && !['Golf','MensTennis','WomensTennis','Euro','WorldCup'].includes(sport) && (
                <p className="text-slate-500 text-xs text-center py-1">No standings data for this season.</p>
              )}

              {/* Divider before final result */}
              {(record || ['Golf','MensTennis','WomensTennis'].includes(sport)) &&
               performance && (performance.type === 'multi' || performance.isComplete) && (
                <div className="border-t border-slate-700/50" />
              )}

              {/* Final tournament/playoff result from sport_results.
                  Shows the most recently completed season result.
                  Both season tabs show this — the label clarifies which season it refers to. */}
              {(() => {
                // For single-event sports: show when complete
                if (performance?.type === 'single' && performance.isComplete) {
                  const resultKey = performance.result ?? 'none';
                  const style = RESULT_STYLE[resultKey] || RESULT_STYLE.none;
                  const label = getResultLabel(sport, resultKey);
                  return (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        {performance.season} Season Result
                      </div>
                      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${style.bg}`}>
                        <span className="text-2xl">{style.icon}</span>
                        <span className={`text-base font-bold ${style.color}`}>{label}</span>
                      </div>
                    </div>
                  );
                }

                // For F1: show final championship result when complete
                if (performance?.type === 'f1' && performance.isComplete) {
                  const pos = performance.position;
                  const style = pos === 1 ? RESULT_STYLE.champion :
                                pos === 2 ? RESULT_STYLE.runner_up :
                                pos <= 4  ? RESULT_STYLE.semifinalist :
                                            RESULT_STYLE.quarterfinalist;
                  return (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        {performance.season} Championship Result
                      </div>
                      {pos === null ? (
                        <p className="text-slate-400 text-sm">Driver not found in standings.</p>
                      ) : (
                        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${style.bg}`}>
                          <span className="text-2xl">
                            {pos === 1 ? '🏆' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '🏎️'}
                          </span>
                          <div>
                            <div className={`text-base font-bold ${style.color}`}>P{pos}</div>
                            <div className="text-xs text-slate-500">of {performance.total} drivers</div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                // For Golf/Tennis multi-event: always show events for the current data
                if (performance?.type === 'multi') {
                  return (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        {performance.season} {performance.sport === 'Golf' ? 'Majors' : 'Grand Slams'}
                        {!performance.isComplete && <span className="text-slate-500 normal-case font-normal ml-1">(in progress)</span>}
                      </div>
                      <div className="space-y-2">
                        {performance.events.map((ev) => {
                          const meta = ev.result ? (EVENT_RESULT_META[ev.result] || EVENT_RESULT_META.none) : null;
                          return (
                            <div
                              key={ev.name}
                              className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${
                                meta ? meta.bg : 'bg-slate-800/40 border-slate-700/20'
                              }`}
                            >
                              <span className="text-sm font-medium text-slate-200 truncate mr-3">{ev.name}</span>
                              {ev.result === null ? (
                                <span className="text-xs text-slate-500 shrink-0">Upcoming</span>
                              ) : (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-base leading-none">{meta.icon}</span>
                                  <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                if (perfLoading) {
                  return (
                    <div className="space-y-2">
                      {[1, 2].map(i => (
                        <div key={i} className="h-12 rounded-lg bg-slate-700/30 animate-pulse" />
                      ))}
                    </div>
                  );
                }

                return null;
              })()}
            </div>
          )}

          {/* News tab */}
          {activeTab === 'news' && (
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
          )}

        </div>
      </div>
    </div>
  );
}
