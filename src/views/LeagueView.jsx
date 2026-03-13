import React, { useMemo, useRef, useState } from 'react';
import { Plus, X, ArrowLeft, ArrowRight, Trash2, Settings, UserPlus, UserMinus, Users } from 'lucide-react';
import { addLeagueMember, removeLeagueMember, sendLeagueInvite } from '../supabaseClient';
import { getCurrentPickerFromState, picksUntilTurn } from '../utils/draft';
import { calculatePickPoints, getPartialMultiEventPoints } from '../utils/points';
import { getSportDisplayCode, getSportNameByCode } from '../config/sports';
import { getUserInitials, getUserDisplayName } from '../utils/userDisplay';
import { formatHourLabel } from '../utils/format';
import TeamPopup from '../components/TeamPopup';
import SportBadge from '../components/SportBadge';
import EmptyState from '../components/EmptyState';
import TabButton from '../components/TabButton';
import ConfirmModal from '../components/ConfirmModal';
import RulesModal from '../components/RulesModal';
import TimerDisplay from '../components/TimerDisplay';
import { useAppContext } from '../context/AppContext';

const LeagueView = (props) => {
  const {
    deleteLeague, setDraftOrderSettings, draftOrderSettings,
    setShowDraftSettingsModal, setShowStartDraftConfirmation,
    leagueTab, setLeagueTab, standings, getRankChange, draftBoard,
    updateLeague, reloadLeagues,
    showDraftSettingsModal, showStartDraftConfirmation, startDraft,
    resultsError, retryResults, setShowUserSettings, showUserSettings,
  } = props;

  const {
    selectedLeague, currentUser, setShowRulesModal, handleLogout, backToHome,
    getSportColor, formatPick, getExpectedPoints, hasNoEPData, myRoster,
    selectedLeagueId, showRulesModal, supabasePicks, supabaseDraftState, setCurrentView,
    sportResults, resultsLoading, refreshExpectedPoints,
    receiveOtcEmails, setReceiveOtcEmails, draftSettings, onUpdateDraftSettings,
    timeRemaining, isTimerPaused,
    getDraftPoolForSport, allSportCodes, epLoading,
  } = useAppContext();
  const isCommissioner = selectedLeague?.commissionerEmail === currentUser?.email;
  const [showSportsModal, setShowSportsModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [completeError, setCompleteError] = useState('');
  const [sportsSearch, setSportsSearch] = useState('');
  const [sportsFilter, setSportsFilter] = useState('ALL');
  const [sportsSortBy, setSportsSortBy] = useState('ep');
  const [sportsSortDir, setSportsSortDir] = useState('desc');
  const [selectedTeamInfo, setSelectedTeamInfo] = useState(null); // { sport, team, currentEP } | null
  const teamInfoFromSportsRef = useRef(false); // true when popup was opened from the sports catalog modal
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [expandedStandingsEmail, setExpandedStandingsEmail] = useState(null);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [addMemberError, setAddMemberError] = useState('');
  const [removingMemberId, setRemovingMemberId] = useState(null);
  const [showRemoveMemberConfirm, setShowRemoveMemberConfirm] = useState(null); // member object to remove

  const handleAddMember = async () => {
    const email = newMemberEmail.trim().toLowerCase();
    if (!email) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { setAddMemberError('Enter a valid email address.'); return; }
    const already = selectedLeague?.membersList?.some(m => m.email.toLowerCase() === email);
    if (already) { setAddMemberError('This person is already in the league.'); return; }
    if ((selectedLeague?.membersList?.length || 0) >= 20) { setAddMemberError('League is full (20 members max).'); return; }
    setAddMemberLoading(true);
    setAddMemberError('');
    const { error } = await addLeagueMember(selectedLeagueId, email);
    if (error) { setAddMemberError(error.message || 'Failed to add member.'); setAddMemberLoading(false); return; }
    const commName = getUserDisplayName(currentUser);
    sendLeagueInvite(email, selectedLeague?.name || '', commName);
    setNewMemberEmail('');
    await reloadLeagues();
    setAddMemberLoading(false);
  };

  const handleRemoveMember = async (member) => {
    if (!member?.id) return;
    setRemovingMemberId(member.id);
    await removeLeagueMember(member.id);
    setShowRemoveMemberConfirm(null);
    await reloadLeagues();
    setRemovingMemberId(null);
  };
  const leagueSportsRows = useMemo(() => {
    const search = sportsSearch.trim().toLowerCase();
    const rows = (allSportCodes || []).flatMap((sport) => {
      const teams = getDraftPoolForSport(sport);
      return teams.map((team) => ({
        sport,
        team,
        ep: getExpectedPoints(sport, team),
      }));
    });

    const filtered = rows.filter((row) => {
      if (sportsFilter !== 'ALL' && row.sport !== sportsFilter) return false;
      if (search && !`${row.team}`.toLowerCase().includes(search)) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sportsSortBy === 'ep') {
        const aEP = a.ep ?? Number.NEGATIVE_INFINITY;
        const bEP = b.ep ?? Number.NEGATIVE_INFINITY;
        cmp = aEP === bEP ? a.team.localeCompare(b.team) : aEP - bEP;
      } else {
        cmp = a.team.localeCompare(b.team);
      }
      return sportsSortDir === 'asc' ? cmp : -cmp;
    });
  }, [allSportCodes, getDraftPoolForSport, getExpectedPoints, sportsSearch, sportsFilter, sportsSortBy, sportsSortDir]);
  const totalExpectedPicks = (selectedLeague?.members || 0) * (selectedLeague?.draftRounds || 0);
  const isDraftComplete = totalExpectedPicks > 0 && (supabasePicks?.length || 0) >= totalExpectedPicks;
  const allSportsAssigned = !resultsLoading &&
    Array.isArray(selectedLeague?.sports) &&
    selectedLeague.sports.length > 0 &&
    selectedLeague.sports.every((sportCode) => sportResults?.[sportCode]?.is_complete === true);
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="bg-slate-800/60 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 md:px-6 py-4">
          {/* Top row - Branding and User */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Omnifantasy" className="h-16 w-auto" />
              <h1 className="text-2xl font-bold text-white">Omnifantasy</h1>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
              {/* Desktop nav — visible md+ */}
              <div className="hidden md:flex items-center gap-4">
                <button
                  onClick={() => setShowRulesModal(true)}
                  className="text-slate-400 hover:text-white text-sm transition-colors px-3 py-1.5 rounded-md hover:bg-slate-700/50"
                >
                  📖 Rules
                </button>
                <button
                  onClick={() => setShowSportsModal(true)}
                  className="text-slate-400 hover:text-white text-sm transition-colors px-3 py-1.5 rounded-md hover:bg-slate-700/50"
                >
                  🏟️ Sports
                </button>
                <button
                  onClick={() => setShowUserSettings(true)}
                  className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors px-3 py-1.5 rounded-md hover:bg-slate-700/50"
                >
                  <Settings size={14} />
                  Settings
                </button>
                <div className="flex items-center gap-3">
                  <span className="text-slate-300 text-sm">{getUserDisplayName(currentUser)}</span>
                  <button
                    onClick={handleLogout}
                    className="text-slate-400 hover:text-white text-sm transition-colors"
                  >
                    Logout
                  </button>
                </div>
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                  {getUserInitials(currentUser)}
                </div>
              </div>
              {/* Mobile nav — visible below md */}
              <div className="flex md:hidden items-center gap-2">
                <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                  {getUserInitials(currentUser)}
                </div>
                <div className="relative">
                  <button
                    onClick={() => setShowMobileMenu(v => !v)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-md transition-colors"
                    aria-label="Menu"
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><rect y="3" width="20" height="2" rx="1"/><rect y="9" width="20" height="2" rx="1"/><rect y="15" width="20" height="2" rx="1"/></svg>
                  </button>
                  {showMobileMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowMobileMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 w-44 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-20 overflow-hidden">
                        <button onClick={() => { setShowRulesModal(true); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-2">📖 Rules</button>
                        <button onClick={() => { setShowSportsModal(true); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-2">🏟️ Sports</button>
                        <button onClick={() => { setShowUserSettings(true); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-2"><Settings size={14} /> Settings</button>
                        <div className="border-t border-slate-700">
                          <div className="px-4 py-2 text-xs text-slate-500">{getUserDisplayName(currentUser)}</div>
                          <button onClick={handleLogout} className="w-full text-left px-4 py-3 text-sm text-slate-400 hover:bg-slate-700 hover:text-red-400 transition-colors">Logout</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* League info row */}
          <div className="flex items-center gap-4 mb-4">
            <button onClick={backToHome} className="text-slate-400 hover:text-white transition-colors">
              <ArrowLeft size={24} />
            </button>
            <div className="flex items-center gap-3">
              <div className="text-3xl">{selectedLeague?.image}</div>
              <h2 className="text-xl md:text-2xl font-bold text-white">{selectedLeague?.name}</h2>
            </div>
          </div>

          {/* League details */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4">
            <span className="text-sm text-slate-400">
              {selectedLeague?.draftStarted
                ? (() => {
                    const totalExpected = (selectedLeague?.members || 0) * (selectedLeague?.draftRounds || 0);
                    const isDraftComplete = totalExpected > 0 && (supabasePicks?.length || 0) >= totalExpected;
                    if (isDraftComplete) {
                      return `Drafted: ${selectedLeague.draftDate}`;
                    }
                    const picker = getCurrentPickerFromState(supabaseDraftState);
                    const isMyTurn = picker?.email === currentUser?.email;
                    const hasTimer = selectedLeague?.draftTimer && selectedLeague.draftTimer !== 'none';
                    return (
                      <>
                        <span className="text-yellow-400 font-semibold">Draft in progress</span>
                        {isMyTurn ? (
                          <span className="text-green-400 font-semibold ml-2 inline-flex items-center gap-1.5">
                            Your turn!
                            {hasTimer && (
                              <TimerDisplay
                                compact
                                timeRemaining={timeRemaining}
                                isPaused={isTimerPaused}
                                pauseEndHour={selectedLeague?.timerPauseEndHour ?? 8}
                              />
                            )}
                          </span>
                        ) : (() => {
                          const n = picksUntilTurn({
                            myEmail: currentUser?.email,
                            draftOrder: supabaseDraftState?.draftOrder || [],
                            currentPick: supabaseDraftState?.currentPick || 1,
                            currentRound: supabaseDraftState?.currentRound || 1,
                            isSnake: supabaseDraftState?.isSnake,
                            thirdRoundReversal: supabaseDraftState?.thirdRoundReversal,
                          });
                          return n != null
                            ? <span className="text-slate-400 ml-2">{n} pick{n !== 1 ? 's' : ''} until your turn</span>
                            : null;
                        })()}
                      </>
                    );
                  })()
                : 'Draft not started'}
            </span>
            <span className="text-sm text-slate-400">{selectedLeague?.members} Teams</span>
            <span className="text-sm text-slate-400">{selectedLeague?.draftRounds} Rounds</span>
          </div>

          {/* Sports Pills */}
          <div className="flex flex-wrap gap-2 mb-5">
            {selectedLeague?.sports.map(sport => (
              <SportBadge key={sport} sport={sport} size="pill" />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            {/* View Draft Button - If draft started */}
            {selectedLeague?.draftStarted && !isDraftComplete && (
              <button
                onClick={() => setCurrentView('draft')}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-4 py-2.5 md:px-6 md:py-3 rounded-lg font-semibold transition-all shadow-lg shadow-blue-500/20"
              >
                <ArrowRight size={18} />
                Go to Draft
              </button>
            )}

            {/* Start Draft - Commissioner only */}
            {isCommissioner && !selectedLeague?.draftStarted && (() => {
              const notReady = (selectedLeague?.membersList || []).filter(m => m.status !== 'accepted');
              const canStart = notReady.length === 0;
              return (
                <button
                  onClick={canStart ? () => setShowStartDraftConfirmation(true) : undefined}
                  disabled={!canStart}
                  title={!canStart ? `Waiting for ${notReady.length} member${notReady.length !== 1 ? 's' : ''} to accept` : undefined}
                  className={`flex items-center gap-2 px-4 py-2.5 md:px-6 md:py-3 rounded-lg font-semibold transition-all ${
                    canStart
                      ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg shadow-green-500/20'
                      : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Plus size={18} />
                  Start Draft
                </button>
              );
            })()}

            {/* Draft Settings - Visible to all members */}
            <button
              onClick={() => {
                setDraftOrderSettings({
                  ...draftOrderSettings,
                  draftRounds: selectedLeague?.draftRounds || 8,
                  sendOTCEmails: !!selectedLeague?.sendOTCEmails,
                  draftTimer: selectedLeague?.draftTimer || 'none',
                  timerPauseEnabled: (selectedLeague?.timerPauseStartHour ?? 0) !== (selectedLeague?.timerPauseEndHour ?? 8),
                  timerPauseStartHour: selectedLeague?.timerPauseStartHour ?? 0,
                  timerPauseEndHour: selectedLeague?.timerPauseEndHour ?? 8,
                  thirdRoundReversal: !!draftOrderSettings.thirdRoundReversal,
                  draftEverySportRequired: draftOrderSettings.draftEverySportRequired !== false
                });
                setShowDraftSettingsModal(true);
              }}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 md:px-6 md:py-3 rounded-lg font-semibold transition-all"
            >
              Draft Settings
            </button>

            {/* Delete League Button - Only for Commissioner, only before draft starts */}
            {isCommissioner && !selectedLeague?.draftStarted && (
              <button
                onClick={() => { setDeleteError(''); setShowDeleteConfirm(true); }}
                className="flex items-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 hover:border-red-500/50 px-4 py-3 rounded-lg font-semibold transition-all"
              >
                <Trash2 size={18} />
                Delete League
              </button>
            )}

            {selectedLeague?.commissionerEmail === currentUser?.email &&
              selectedLeague?.status !== 'completed' &&
              allSportsAssigned && (
              <button
                onClick={() => { setCompleteError(''); setShowCompleteConfirm(true); }}
                className="flex items-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/50 px-4 py-2.5 md:px-4 md:py-3 rounded-lg font-semibold transition-all"
              >
                <span className="hidden sm:inline">Mark League </span>Complete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-3 md:px-6 py-4 md:py-8">
        {/* Tabs */}
        <div className="overflow-x-auto -mx-3 md:mx-0 px-3 md:px-0">
          <div className="flex gap-2 border-b border-slate-700/50 mb-6 min-w-max md:min-w-0">
            <TabButton label="My Roster" isActive={leagueTab === 'my-roster'} onClick={() => setLeagueTab('my-roster')} />
            <TabButton label="Standings" isActive={leagueTab === 'standings'} onClick={() => setLeagueTab('standings')} />
            {/* Only show Big Board and Draft Results once draft is complete */}
            {selectedLeague?.draftStarted && isDraftComplete && (
              <TabButton label="Big Board" isActive={leagueTab === 'big-board'} onClick={() => setLeagueTab('big-board')} />
            )}
            {selectedLeague?.draftStarted && isDraftComplete && (
              <TabButton label="Draft Results" isActive={leagueTab === 'draft-results'} onClick={() => setLeagueTab('draft-results')} />
            )}
          </div>
        </div>

        {/* Standings Tab */}
        {leagueTab === 'standings' && (
          <>
          <div className="space-y-4">
            {standings.length === 0 ? (
              <EmptyState icon="📋" title="No Standings Yet" description="Standings will appear once the draft is complete." />
            ) : (
              <>
                {/* Commissioner Notice if not participating */}
                {selectedLeague && !standings.some(s => s.isCommissioner) && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-blue-400 font-semibold">ℹ️ Commissioner:</span>
                      <span className="text-slate-300">
                        {selectedLeague.commissionerEmail} (not participating in draft)
                      </span>
                    </div>
                  </div>
                )}

                {/* Results fetch error banner */}
                {resultsError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-red-400">⚠️</span>
                      <span className="text-red-300">Could not load results data. Points may be incomplete.</span>
                    </div>
                    {retryResults && (
                      <button
                        onClick={retryResults}
                        className="shrink-0 text-xs px-2.5 py-1 rounded border border-red-500/50 text-red-300 hover:bg-red-500/20 transition-colors"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )}

                {/* Scrollable standings table */}
                {(() => {
                  const sports = selectedLeague?.sports || [];
                  return (
                    <>
                      {/* Mobile collapsed standings */}
                      <div className="md:hidden space-y-1">
                        {standings.map((team) => {
                          const teamEP = (supabasePicks || [])
                            .filter(p => p.picker_email?.toLowerCase() === team.email?.toLowerCase())
                            .reduce((sum, p) => sum + (getExpectedPoints(p.sport, p.team_name) || 0), 0);
                          const isExpanded = expandedStandingsEmail === team.email;
                          const rankColor = team.rank === 1 ? 'text-yellow-500' : team.rank <= 3 ? 'text-slate-400' : 'text-slate-500';
                          return (
                            <div key={team.email || team.teamName}>
                              <div
                                className={`flex items-center gap-3 px-3 py-3 cursor-pointer transition-all ${
                                  team.isUser
                                    ? 'bg-blue-500/10 border-2 border-blue-500/30'
                                    : 'bg-slate-800/50 border border-slate-700/50'
                                } ${isExpanded ? 'rounded-t-xl' : 'rounded-xl'}`}
                                onClick={() => setExpandedStandingsEmail(isExpanded ? null : team.email)}
                              >
                                <span className={`text-xl font-bold w-8 text-center shrink-0 ${rankColor}`}>{team.rank}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-white truncate">{team.teamName}</div>
                                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                    {team.isCommissioner && (
                                      <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded font-semibold">Commissioner</span>
                                    )}
                                    {!team.hasAccount && (
                                      <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded">Invited</span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-lg font-bold text-white">{team.totalPoints}<span className="text-xs text-slate-400 ml-1">pts</span></div>
                                  {teamEP > 0 && <div className="text-xs text-amber-400">~{Math.round(teamEP * 10) / 10} EP</div>}
                                </div>
                                <span className="text-slate-500 text-xs shrink-0 ml-1">{isExpanded ? '▲' : '▼'}</span>
                              </div>
                              {isExpanded && (
                                <div className={`border border-t-0 rounded-b-xl px-3 py-2 mb-1 ${
                                  team.isUser ? 'bg-blue-500/5 border-blue-500/30' : 'bg-slate-900/60 border-slate-700/50'
                                }`}>
                                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
                                    {sports.map(sport => {
                                      const pick = (supabasePicks || []).find(p =>
                                        p.picker_email?.toLowerCase() === team.email?.toLowerCase() && p.sport === sport
                                      );
                                      const pts = pick ? calculatePickPoints(pick, sportResults) : null;
                                      const partial = pts === null && pick ? getPartialMultiEventPoints(pick, sportResults) : null;
                                      return (
                                        <div key={sport} className="text-center">
                                          <div className="text-[10px] text-slate-500 uppercase">{getSportDisplayCode(sport)}</div>
                                          {pts > 0 ? (
                                            <div className="text-sm font-bold text-green-400">+{pts}</div>
                                          ) : pts === 0 ? (
                                            <div className="text-sm font-bold text-slate-500">—</div>
                                          ) : partial ? (
                                            <div className="text-sm font-bold text-amber-400" title={`${partial.eventsComplete}/${partial.eventsTotal} events done`}>
                                              ~{partial.accumulated}
                                            </div>
                                          ) : (
                                            <div className="text-sm font-bold text-slate-400">…</div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop full standings table */}
                      <div className="hidden md:block overflow-x-auto rounded-xl">
                        <div style={{ minWidth: `${56 + 180 + 72 + 72 + sports.length * 72 + 32}px` }}>
                          {/* Header */}
                          <div
                            className="grid gap-2 px-4 py-2 text-xs font-semibold text-slate-400 uppercase bg-slate-800/50 rounded-t-xl"
                            style={{ gridTemplateColumns: `56px minmax(180px,1fr) 72px 72px ${sports.map(() => '72px').join(' ')}` }}
                          >
                            <div>Rank</div>
                            <div>Team</div>
                            <div className="text-center">Pts</div>
                            <div className="text-center">EP</div>
                            {sports.map(sport => (
                              <div key={sport} className="text-center">{getSportDisplayCode(sport)}</div>
                            ))}
                          </div>

                          {/* Rows */}
                          {standings.map((team) => {
                            const teamEP = (supabasePicks || [])
                              .filter(p => p.picker_email?.toLowerCase() === team.email?.toLowerCase())
                              .reduce((sum, p) => sum + (getExpectedPoints(p.sport, p.team_name) || 0), 0);

                            return (
                              <div
                                key={team.email || team.teamName}
                                className={`grid gap-2 items-center px-4 py-4 mt-1 rounded-xl transition-all ${
                                  team.isUser
                                    ? 'bg-blue-500/10 border-2 border-blue-500/30'
                                    : 'bg-slate-800/50 border border-slate-700/50 hover:border-slate-600/50'
                                }`}
                                style={{ gridTemplateColumns: `56px minmax(180px,1fr) 72px 72px ${sports.map(() => '72px').join(' ')}` }}
                              >
                                {/* Rank */}
                                <div className="flex flex-col items-start">
                                  <span className={`text-2xl font-bold ${
                                    team.rank === 1 ? 'text-yellow-500' :
                                    team.rank <= 3 ? 'text-slate-400' :
                                    'text-slate-500'
                                  }`}>
                                    {team.rank}
                                  </span>
                                  {(() => {
                                    const change = getRankChange(team.rank, team.previousRank);
                                    if (!change) return null;
                                    return (
                                      <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${change.color}`}>
                                        {change.icon} {change.text}
                                      </span>
                                    );
                                  })()}
                                </div>

                                {/* Team */}
                                <div className="min-w-0">
                                  <div className="font-bold text-white truncate">{team.teamName}</div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {team.isCommissioner && (
                                      <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded font-semibold whitespace-nowrap">
                                        Commissioner
                                      </span>
                                    )}
                                    {!team.hasAccount && (
                                      <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded whitespace-nowrap">
                                        Invited
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Total Points */}
                                <div className="text-center">
                                  <div className="text-lg font-bold text-white">{team.totalPoints}</div>
                                </div>

                                {/* Total EP */}
                                <div className="text-center">
                                  {teamEP > 0
                                    ? <span className="text-amber-400 text-sm">~{Math.round(teamEP * 10) / 10}</span>
                                    : <span className="text-slate-600 text-sm">-</span>
                                  }
                                </div>

                                {/* Per-sport earned points */}
                                {sports.map(sport => {
                                  const sportPicks = (supabasePicks || []).filter(p =>
                                    p.picker_email?.toLowerCase() === team.email?.toLowerCase() &&
                                    p.sport === sport
                                  );
                                  if (sportPicks.length === 0) {
                                    return <div key={sport} className="text-center text-slate-600 text-sm">-</div>;
                                  }
                                  const sportComplete = sportResults?.[sport]?.is_complete;
                                  const earned = sportPicks.reduce((sum, p) => sum + (calculatePickPoints(p, sportResults) || 0), 0);
                                  if (sportComplete) {
                                    return (
                                      <div key={sport} className="text-center">
                                        {earned > 0
                                          ? <span className="text-green-400 font-bold text-sm">+{earned}</span>
                                          : <span className="text-slate-500 text-sm">0</span>
                                        }
                                      </div>
                                    );
                                  }
                                  // In-progress Golf/Tennis: show accumulated internal event points
                                  const partials = sportPicks.map(p => getPartialMultiEventPoints(p, sportResults)).filter(Boolean);
                                  if (partials.length > 0) {
                                    const totalAccumulated = partials.reduce((sum, p) => sum + p.accumulated, 0);
                                    const { eventsComplete, eventsTotal } = partials[0];
                                    return (
                                      <div key={sport} className="text-center" title={`${eventsComplete} of ${eventsTotal} events complete`}>
                                        {totalAccumulated > 0
                                          ? <span className="text-amber-400 font-bold text-sm">~{totalAccumulated}</span>
                                          : <span className="text-slate-500 text-sm">~0</span>
                                        }
                                        <div className="text-[9px] text-slate-500">{eventsComplete}/{eventsTotal}</div>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div key={sport} className="text-center">
                                      {resultsLoading
                                        ? <div className="h-4 w-8 bg-slate-700 rounded animate-pulse mx-auto" />
                                        : <span className="text-slate-600 text-sm">-</span>
                                      }
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>

          {/* Member Management Panel — always visible to commissioner; add/remove only pre-draft */}
          {isCommissioner && (() => {
            const members = selectedLeague?.membersList || [];
            const pendingCount = members.filter(m => m.status === 'pending').length;
            const declinedCount = members.filter(m => m.status === 'declined').length;
            return (
              <div className="mt-6 bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Users size={16} className="text-slate-400" />
                    League Members
                    {pendingCount > 0 && (
                      <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
                        {pendingCount} pending
                      </span>
                    )}
                    {declinedCount > 0 && (
                      <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">
                        {declinedCount} declined
                      </span>
                    )}
                  </h3>
                </div>

                {/* Draft start status message — pre-draft only */}
                {!selectedLeague?.draftStarted && (() => {
                  const notReady = members.filter(m => m.status !== 'accepted');
                  if (notReady.length === 0) return null;
                  const pending = notReady.filter(m => m.status === 'pending');
                  const declined = notReady.filter(m => m.status === 'declined');
                  return (
                    <div className="space-y-1">
                      {pending.length > 0 && (
                        <p className="text-xs text-amber-400">
                          ⏳ Waiting for {pending.map(m => m.email.split('@')[0]).join(', ')} to accept
                        </p>
                      )}
                      {declined.length > 0 && (
                        <p className="text-xs text-red-400">
                          ✗ {declined.map(m => m.email.split('@')[0]).join(', ')} declined — remove them to enable draft start
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Member list */}
                <div className="space-y-2">
                  {members.map(member => {
                    const isCommissionerRow = member.email?.toLowerCase() === selectedLeague?.commissionerEmail?.toLowerCase();
                    const statusBadge = member.status === 'accepted'
                      ? <span className="text-xs text-emerald-400">✓ Joined</span>
                      : member.status === 'declined'
                      ? <span className="text-xs text-red-400">✗ Declined</span>
                      : <span className="text-xs text-amber-400">⏳ Pending</span>;
                    return (
                      <div key={member.email} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-slate-700/30">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs font-semibold text-white shrink-0">
                            {(member.name || member.email || '?')[0].toUpperCase()}
                          </div>
                          <span className="text-sm text-slate-200 truncate">{member.name || member.email.split('@')[0]}</span>
                          {isCommissionerRow && <span className="text-xs text-slate-500 shrink-0">commissioner</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {statusBadge}
                          {!selectedLeague?.draftStarted && !isCommissionerRow && (
                            <button
                              onClick={() => setShowRemoveMemberConfirm(member)}
                              className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded"
                              title="Remove member"
                            >
                              <UserMinus size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add member (commissioner only, pre-draft only) */}
                {!selectedLeague?.draftStarted && (
                  <div className="pt-2 border-t border-slate-700/50">
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={newMemberEmail}
                        onChange={e => { setNewMemberEmail(e.target.value); setAddMemberError(''); }}
                        onKeyDown={e => e.key === 'Enter' && !addMemberLoading && handleAddMember()}
                        placeholder="Add member by email…"
                        className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        disabled={addMemberLoading || !newMemberEmail.trim()}
                        onClick={handleAddMember}
                        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors shrink-0"
                      >
                        <UserPlus size={14} />
                        {addMemberLoading ? 'Adding…' : 'Invite'}
                      </button>
                    </div>
                    {addMemberError && <p className="text-xs text-red-400 mt-1.5">{addMemberError}</p>}
                  </div>
                )}
              </div>
            );
          })()}
          </>
        )}

        {/* Big Board Tab */}
        {leagueTab === 'big-board' && (
          <div className="space-y-3">
            {draftBoard.length === 0 ? (
              <EmptyState icon="📋" title="No Draft Results Yet" description="The big board will show all team rosters once the draft is complete." />
            ) : (
              <>
                {/* Draft Board organized by team */}
                {standings.map((team) => {
              const teamPicks = draftBoard.filter(pick => pick.picker_email?.toLowerCase() === team.email?.toLowerCase());
              return (
                <div 
                  key={team.teamName}
                  className={`rounded-xl overflow-hidden ${
                    team.isUser 
                      ? 'bg-blue-500/10 border-2 border-blue-500/30'
                      : 'bg-slate-800/50 border border-slate-700/50'
                  }`}
                >
                  {/* Team Header */}
                  <div className="bg-gradient-to-r from-slate-700/50 to-slate-800/50 px-3 py-2.5 border-b border-slate-700/50">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-white">{team.teamName}</h3>
                      {(() => {
                        const teamPoints = teamPicks.reduce((sum, p) => sum + (calculatePickPoints(p, sportResults) || 0), 0);
                        const teamEP = teamPicks.reduce((sum, p) => {
                          const ep = getExpectedPoints(p.sport, p.team_name);
                          return sum + (ep || 0);
                        }, 0);
                        const hasMissingEP = teamPicks.some(p => hasNoEPData(p.sport));
                        return (
                          <div className="flex items-center gap-2.5">
                            {teamEP > 0 && (
                              <div className="text-xs text-amber-400">
                                ~{Math.round(teamEP * 10) / 10} EP
                                {hasMissingEP && (
                                  <span className="relative group/tip text-slate-500 ml-1 cursor-help">*<span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-700 text-slate-200 text-xs rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity z-50">Some picks lack odds data — EP total is partial</span></span>
                                )}
                              </div>
                            )}
                            {teamPoints > 0 ? (
                              <div className="text-base font-bold text-green-400">{teamPoints} pts</div>
                            ) : (
                              <div className="text-xs text-slate-500">{teamPicks.length} picks</div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Team's Picks */}
                  <div className="px-2.5 py-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5">
                    {teamPicks.map((pick) => {
                      const sportColor = getSportColor(pick.sport);
                      const ep = getExpectedPoints(pick.sport, pick.team_name);
                      const pts = calculatePickPoints(pick, sportResults);
                      return (
                        <div
                          key={pick.pick_number}
                          className={`rounded-lg px-2 py-1.5 border ${sportColor}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <SportBadge sport={pick.sport} size="sm" />
                            <span className="text-[10px] text-slate-500 font-semibold">{formatPick(pick)}</span>
                          </div>
                          <button
                            className="font-semibold text-white text-xs text-left hover:text-amber-300 transition-colors leading-tight w-full truncate block"
                            onClick={() => setSelectedTeamInfo({ sport: pick.sport, team: pick.team_name, currentEP: ep })}
                            title="View EP trend"
                          >
                            {pick.team_name}
                          </button>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {ep !== null ? (
                              <span className="text-[10px] text-amber-400">~{ep} EP</span>
                            ) : hasNoEPData(pick.sport) ? (
                              <span className="relative group/tip text-[10px] text-slate-500 cursor-help">TBD<span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-700 text-slate-200 text-xs rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity z-50">Odds not yet available for this sport</span></span>
                            ) : null}
                            {pts > 0 ? (
                              <span className="text-xs font-bold text-green-400 ml-auto">+{pts}</span>
                            ) : pts === null ? (
                              <span className="text-[10px] text-slate-600 ml-auto">…</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
              </>
            )}
          </div>
        )}

        {/* Draft Results Tab */}
        {leagueTab === 'draft-results' && (
          <div className="space-y-4">
            {draftBoard.length === 0 ? (
              <EmptyState icon="🎯" title="No Draft Results Yet" description="Draft results will appear here once the draft is complete." />
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block space-y-2">
                  <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-semibold text-slate-400 uppercase bg-slate-800/50 rounded-lg">
                    <div className="col-span-1">Pick</div>
                    <div className="col-span-1">Rnd</div>
                    <div className="col-span-3">Drafter</div>
                    <div className="col-span-2">Sport</div>
                    <div className="col-span-3">Selection</div>
                    <div className="col-span-1 text-center">EP</div>
                    <div className="col-span-1 text-center">Pts</div>
                  </div>
                  {draftBoard.map((pick) => {
                    const sportColor = getSportColor(pick.sport);
                    const ep = getExpectedPoints(pick.sport, pick.team_name);
                    const pts = calculatePickPoints(pick, sportResults);
                    return (
                      <div key={pick.pick_number} className={`grid grid-cols-12 gap-4 items-center px-4 py-3 rounded-lg transition-all ${pick.isUser ? 'bg-blue-500/10 border-2 border-blue-500/30' : 'bg-slate-800/50 border border-slate-700/50 hover:border-slate-600/50'}`}>
                        <div className="col-span-1"><span className="text-lg font-bold text-slate-400">{formatPick(pick)}</span></div>
                        <div className="col-span-1"><span className="text-sm text-slate-500">R{pick.round}</span></div>
                        <div className="col-span-3"><div className="font-semibold text-white truncate">{pick.picker_name}</div></div>
                        <div className="col-span-2"><span className={`px-2 py-1 rounded border text-xs font-semibold ${sportColor}`}>{getSportDisplayCode(pick.sport)}</span></div>
                        <div className="col-span-3">
                          <button className="text-white font-medium text-left hover:text-amber-300 transition-colors truncate w-full" onClick={() => setSelectedTeamInfo({ sport: pick.sport, team: pick.team_name, currentEP: ep })}>{pick.team_name}</button>
                        </div>
                        <div className="col-span-1 text-center">
                          {ep !== null ? <span className="text-amber-400 text-sm">~{ep}</span> : hasNoEPData(pick.sport) ? <span className="text-slate-500 text-sm">TBD</span> : <span className="text-slate-600">-</span>}
                        </div>
                        <div className="col-span-1 text-center">
                          {pts > 0 ? <span className="text-green-400 font-bold">+{pts}</span> : pts === 0 ? <span className="text-slate-500">0</span> : resultsLoading ? <div className="h-4 w-8 bg-slate-700 rounded animate-pulse mx-auto" /> : <span className="text-slate-600">-</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-2">
                  {draftBoard.map((pick) => {
                    const sportColor = getSportColor(pick.sport);
                    const ep = getExpectedPoints(pick.sport, pick.team_name);
                    const pts = calculatePickPoints(pick, sportResults);
                    return (
                      <div key={pick.pick_number} className={`rounded-xl px-3 py-3 ${pick.isUser ? 'bg-blue-500/10 border-2 border-blue-500/30' : 'bg-slate-800/50 border border-slate-700/50'}`}>
                        {/* Row 1: pick number + sport badge + team name */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-mono text-slate-500 shrink-0">{formatPick(pick)}</span>
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold shrink-0 ${sportColor}`}>{getSportDisplayCode(pick.sport)}</span>
                          <button
                            className="flex-1 text-sm font-semibold text-white text-left truncate hover:text-amber-300 transition-colors"
                            onClick={() => setSelectedTeamInfo({ sport: pick.sport, team: pick.team_name, currentEP: ep })}
                          >
                            {pick.team_name}
                          </button>
                          {pts > 0 && <span className="text-green-400 font-bold text-sm shrink-0">+{pts}</span>}
                          {pts === 0 && <span className="text-slate-500 text-sm shrink-0">0</span>}
                          {pts === null && resultsLoading && <div className="h-3.5 w-6 bg-slate-700 rounded animate-pulse shrink-0" />}
                        </div>
                        {/* Row 2: drafter + EP */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400 truncate">{pick.picker_name}</span>
                          {ep !== null
                            ? <span className="text-xs text-amber-400 shrink-0 ml-2">~{ep} EP</span>
                            : hasNoEPData(pick.sport)
                              ? <span className="text-xs text-slate-500 shrink-0 ml-2">TBD</span>
                              : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* My Roster Tab */}
        {leagueTab === 'my-roster' && (
          <div className="space-y-4">
            {myRoster.length === 0 ? (
              <EmptyState icon="📝" title="No Roster Yet" description="Your roster will appear here once you complete the draft." />
            ) : (
              <>
                {/* Roster Summary */}
                {(() => {
                  const totalPoints = myRoster.reduce((sum, pick) => sum + (calculatePickPoints(pick, sportResults) || 0), 0);
                  const totalEP = myRoster.reduce((sum, pick) => {
                    const ep = getExpectedPoints(pick.sport, pick.team_name);
                    return sum + (ep || 0);
                  }, 0);
                  const hasMissingEP = myRoster.some(p => hasNoEPData(p.sport));
                  return (totalPoints > 0 || totalEP > 0) ? (
                    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4 mb-6">
                      <div className="flex items-center gap-6">
                        {totalEP > 0 && (
                          <div>
                            <div className="text-slate-400 text-sm mb-1">Expected Points</div>
                            <div className="text-2xl font-bold text-amber-400">
                              ~{Math.round(totalEP * 10) / 10}
                              {hasMissingEP && (
                                <span className="relative group/tip text-slate-500 text-sm ml-1 cursor-help">*<span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-700 text-slate-200 text-xs rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity z-50">Some picks lack odds data — EP total is partial</span></span>
                              )}
                            </div>
                          </div>
                        )}
                        {totalPoints > 0 && (
                          <div>
                            <div className="text-slate-400 text-sm mb-1">Actual Points</div>
                            <div className="text-3xl font-bold text-white">{totalPoints}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null;
                })()}

            {/* Roster grouped by sport */}
            {(() => {
              // Group picks by sport, preserving draft order of first pick
              const sportOrder = [];
              const bySport = {};
              myRoster.forEach((pick) => {
                if (!bySport[pick.sport]) {
                  sportOrder.push(pick.sport);
                  bySport[pick.sport] = [];
                }
                bySport[pick.sport].push(pick);
              });
              return sportOrder.map((sport) => {
                const picks = bySport[sport];
                const sportColor = getSportColor(sport);
                const sportEP = picks.reduce((sum, p) => sum + (getExpectedPoints(p.sport, p.team_name) || 0), 0);
                const sportPts = picks.reduce((sum, p) => sum + (calculatePickPoints(p, sportResults) || 0), 0);
                const sportComplete = sportResults?.[sport]?.is_complete;
                return (
                  <div key={sport} className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
                    {/* Sport header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-700/30 border-b border-slate-700/50">
                      <span className={`text-xs px-2 py-0.5 rounded border font-semibold ${sportColor}`}>
                        {getSportDisplayCode(sport)}
                      </span>
                      <div className="flex items-center gap-3 text-sm">
                        {sportEP > 0 && (
                          <span className="text-amber-400">~{Math.round(sportEP * 10) / 10} EP</span>
                        )}
                        {sportComplete && sportPts > 0 && (
                          <span className="text-green-400 font-bold">+{sportPts} pts</span>
                        )}
                      </div>
                    </div>
                    {/* Picks */}
                    <div className="divide-y divide-slate-700/40">
                      {picks.map((pick) => {
                        const ep = getExpectedPoints(pick.sport, pick.team_name);
                        const pts = calculatePickPoints(pick, sportResults);
                        return (
                          <div key={pick.pick_number} className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-slate-500 w-10 shrink-0">Pick {formatPick(pick)}</span>
                              <button
                                className="font-semibold text-white text-left hover:text-amber-300 transition-colors"
                                onClick={() => setSelectedTeamInfo({ sport: pick.sport, team: pick.team_name, currentEP: ep })}
                                title="View EP trend"
                              >
                                {pick.team_name}
                              </button>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              {ep !== null ? (
                                <span className="text-sm text-amber-400">~{ep} EP</span>
                              ) : hasNoEPData(pick.sport) ? (
                                <span className="relative group/tip text-sm text-slate-500 cursor-help">
                                  TBD
                                  <span className="pointer-events-none absolute bottom-full right-0 mb-1 px-2 py-1 bg-slate-700 text-slate-200 text-xs rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity z-50">
                                    Odds not yet available
                                  </span>
                                </span>
                              ) : null}
                              {pts > 0 ? (
                                <span className="text-base font-bold text-green-400">+{pts}</span>
                              ) : pts === null && resultsLoading ? (
                                <div className="h-4 w-10 bg-slate-700 rounded animate-pulse" />
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
              </>
            )}
          </div>
        )}

      {/* Sports Modal */}
      {showSportsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex flex-col justify-end md:items-center md:justify-center md:p-4">
          <div className="bg-slate-800 rounded-t-2xl md:rounded-2xl max-w-6xl w-full border border-slate-700 shadow-2xl h-[80vh] md:h-auto md:max-h-[90vh] flex flex-col">
            <div className="p-3 md:p-6 border-b border-slate-700 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-white">Sports</h2>
                <p className="text-sm text-slate-400 mt-1">General catalog across all supported sports.</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowSportsModal(false)} className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-700/50 rounded">
                  <X size={22} />
                </button>
              </div>
            </div>
            <div className="p-3 md:p-6 overflow-y-auto flex-1 min-h-0">
              <div className="mb-4 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={sportsSearch}
                  onChange={(e) => setSportsSearch(e.target.value)}
                  placeholder="Search team or player"
                  className="lg:flex-[2] px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                <select
                  value={sportsFilter}
                  onChange={(e) => setSportsFilter(e.target.value)}
                  className="lg:flex-1 px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="ALL">All sports</option>
                  {(allSportCodes || []).map((sport) => (
                    <option key={`league-sports-modal-filter-${sport}`} value={sport}>{getSportNameByCode(sport)}</option>
                  ))}
                </select>
                <select
                  value={sportsSortBy}
                  onChange={(e) => setSportsSortBy(e.target.value)}
                  className="lg:flex-1 px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="ep">Sort: EP</option>
                  <option value="team">Sort: Team</option>
                </select>
                <button
                  onClick={() => setSportsSortDir((prev) => prev === 'desc' ? 'asc' : 'desc')}
                  className="px-4 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white hover:border-slate-500 transition-colors"
                  title={sportsSortDir === 'desc' ? 'Descending' : 'Ascending'}
                >
                  {sportsSortDir === 'desc' ? '↓' : '↑'}
                </button>
              </div>

              <div className="max-h-[55vh] md:max-h-[560px] overflow-y-auto rounded-lg border border-slate-700/50">
                <div className="grid grid-cols-[minmax(0,1fr)_90px_90px] md:grid-cols-[minmax(0,1fr)_120px_140px] gap-0 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-100 bg-slate-700 border-b border-slate-600 sticky top-0 z-10">
                  <div>Team</div>
                  <div>Sport</div>
                  <div>EP</div>
                </div>
                {epLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={`skel-${i}`} className="animate-pulse flex items-center gap-3 px-3 py-2.5 border-b border-slate-700/50">
                      <div className="h-4 bg-slate-700 rounded flex-1" />
                      <div className="h-5 w-16 bg-slate-700 rounded-full" />
                      <div className="h-4 w-14 bg-slate-700 rounded" />
                    </div>
                  ))
                ) : (
                  <>
                    {leagueSportsRows.map((row) => (
                      <div key={`league-sports-row-${row.sport}-${row.team}`} className="grid grid-cols-[minmax(0,1fr)_90px_90px] md:grid-cols-[minmax(0,1fr)_120px_140px] gap-0 items-center px-3 py-2 border-b border-slate-700/40 text-left text-white bg-slate-900/65">
                        <div className="font-semibold min-w-0 pr-2">
                          <button
                            className="text-left hover:text-amber-300 transition-colors line-clamp-2 w-full"
                            onClick={() => {
                              setShowSportsModal(false);
                              teamInfoFromSportsRef.current = true;
                              setSelectedTeamInfo({ sport: row.sport, team: row.team, currentEP: row.ep });
                            }}
                            title="View EP trend"
                          >
                            {row.team}
                          </button>
                        </div>
                        <div>
                          <SportBadge sport={row.sport} />
                        </div>
                        <div className="text-sm">
                          {row.ep !== null ? (
                            <span className="text-amber-400 font-medium">~{row.ep} EP</span>
                          ) : hasNoEPData(row.sport) ? (
                            <span className="text-slate-500">TBD</span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {leagueSportsRows.length === 0 && (
                      <div className="px-3 py-6 text-center text-sm text-slate-500">
                        No options match your filters.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Settings Modal */}
      {showUserSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-slate-800 rounded-2xl w-full max-w-sm border border-slate-700 shadow-2xl">
            <div className="p-5">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-white">My Settings</h2>
                <button
                  onClick={() => setShowUserSettings(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Notifications</h3>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={receiveOtcEmails}
                      onChange={(e) => setReceiveOtcEmails(e.target.checked)}
                      className="mt-0.5 rounded bg-slate-900 border-slate-600"
                    />
                    <div>
                      <div className="text-sm text-white">On-the-clock email notifications</div>
                      <div className="text-xs text-slate-400 mt-0.5">Receive an email when it's your turn to pick, across all leagues</div>
                    </div>
                  </label>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Draft Queue</h3>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!draftSettings?.autoPickFromQueue}
                      onChange={(e) => onUpdateDraftSettings({ autoPickFromQueue: e.target.checked })}
                      className="mt-0.5 rounded bg-slate-900 border-slate-600"
                    />
                    <div>
                      <div className="text-sm text-white">Auto-pick from queue</div>
                      <div className="text-xs text-slate-400 mt-0.5">When it's your turn to pick in any draft, automatically select the top team from your queue immediately</div>
                    </div>
                  </label>
                </div>
              </div>
              <div className="mt-5 pt-4 border-t border-slate-700">
                <button
                  onClick={() => setShowUserSettings(false)}
                  className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <RulesModal show={showRulesModal} onClose={() => setShowRulesModal(false)} />

      {/* Draft Settings Modal */}
      {showDraftSettingsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-xl overflow-y-auto shadow-2xl max-h-[85vh]">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">⚙️ Draft Settings</h2>
                <button
                  onClick={() => setShowDraftSettingsModal(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              <p className="text-sm text-slate-400 mt-2">
                {isCommissioner
                  ? 'Configure draft settings. Timer and pause window can be updated even after draft starts.'
                  : 'View-only. Only the commissioner can change these settings.'}
              </p>
              {isCommissioner && selectedLeague?.draftStarted && (
                <p className="text-xs text-amber-300 mt-2">
                  Draft is in progress: only timer settings can be changed.
                </p>
              )}
            </div>

            <fieldset disabled={!isCommissioner} className="p-6 space-y-6 disabled:opacity-60">
              {!selectedLeague?.draftStarted && (
                <>
                  {/* Draft Rounds */}
                  <div>
                    {(() => {
                      const numSports = selectedLeague?.sports?.length || 0;
                      const minRounds = Math.max(3, numSports);
                      const recommendedRounds = numSports + 5;
                      const currentRounds = draftOrderSettings.draftRounds || selectedLeague?.draftRounds || 8;
                      return (
                        <>
                          <h3 className="text-base font-semibold text-white mb-2">Draft Rounds</h3>
                          <p className="text-sm text-slate-400 mb-1">
                            Minimum: {minRounds} rounds ({numSports} sport{numSports !== 1 ? 's' : ''}, one required pick each).
                            Recommended: <span className="text-white font-semibold">{recommendedRounds} rounds</span> ({numSports} sport picks + 5 flex picks).
                          </p>
                          {currentRounds !== recommendedRounds && (
                            <button
                              type="button"
                              onClick={() => setDraftOrderSettings({ ...draftOrderSettings, draftRounds: recommendedRounds })}
                              className="text-xs text-blue-400 hover:text-blue-300 mb-3 transition-colors"
                            >
                              Set to recommended ({recommendedRounds})
                            </button>
                          )}
                          {currentRounds === recommendedRounds && (
                            <p className="text-xs text-emerald-400 mb-3">✓ Currently set to recommended</p>
                          )}
                          <select
                            value={currentRounds}
                            onChange={(e) => setDraftOrderSettings({
                              ...draftOrderSettings,
                              draftRounds: parseInt(e.target.value, 10)
                            })}
                            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white"
                          >
                            {[...Array(23)].map((_, i) => {
                              const rounds = i + 3;
                              const isRecommended = rounds === recommendedRounds;
                              return (
                                <option key={`draft-rounds-${rounds}`} value={rounds} disabled={rounds < minRounds}>
                                  {rounds} rounds{isRecommended ? ' ★ recommended' : ''}
                                </option>
                              );
                            })}
                          </select>
                        </>
                      );
                    })()}
                  </div>

                  <div className="pt-2 border-t border-slate-700/60">
                    <h3 className="text-base font-semibold text-white mb-2">
                      Draft Order
                    </h3>
                  </div>

                  {/* Randomize Option */}
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <input
                        type="checkbox"
                        id="randomizeDraft"
                        checked={draftOrderSettings.randomize}
                        onChange={(e) => {
                          setDraftOrderSettings({
                            ...draftOrderSettings,
                            randomize: e.target.checked,
                            manualOrder: e.target.checked ? [] : draftOrderSettings.manualOrder
                          });
                        }}
                        className="w-5 h-5 bg-slate-900 border-slate-700 rounded"
                      />
                      <label htmlFor="randomizeDraft" className="text-base font-semibold text-white">
                        Randomize draft order when draft starts
                      </label>
                    </div>
                    <p className="text-sm text-slate-400 ml-8">
                      The draft order will be randomly generated when you click "Start Draft"
                    </p>
                  </div>

                  {/* Manual Order Section */}
                  {!draftOrderSettings.randomize && (
                    <div>
                      <h3 className="text-base font-semibold text-white mb-4">
                        Manual Draft Order
                      </h3>
                      <p className="text-sm text-slate-400 mb-4">
                        Use the arrow buttons to reorder members, or leave as-is to use the default order
                      </p>

                      <div className="space-y-2">
                        {(draftOrderSettings.manualOrder.length > 0
                          ? draftOrderSettings.manualOrder
                          : selectedLeague?.membersList?.map(m => m.email) || []
                        ).map((email, index) => {
                          const member = selectedLeague?.membersList?.find(m => m.email === email);
                          return (
                            <div
                              key={email}
                              className="flex items-center gap-3 bg-slate-900/50 border border-slate-700 rounded-lg p-3"
                            >
                              <div className="flex items-center justify-center w-8 h-8 bg-slate-700 rounded-full text-sm font-bold text-white">
                                {index + 1}
                              </div>
                              <div className="flex-1">
                                <div className="text-white font-medium">{email}</div>
                                {member?.name && (
                                  <div className="text-sm text-slate-400">{member.name}</div>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    const currentOrder = draftOrderSettings.manualOrder.length > 0
                                      ? [...draftOrderSettings.manualOrder]
                                      : selectedLeague?.membersList?.map(m => m.email) || [];
                                    if (index > 0) {
                                      [currentOrder[index], currentOrder[index - 1]] = [currentOrder[index - 1], currentOrder[index]];
                                      setDraftOrderSettings({ ...draftOrderSettings, manualOrder: currentOrder });
                                    }
                                  }}
                                  disabled={index === 0}
                                  className="p-2 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                  ↑
                                </button>
                                <button
                                  onClick={() => {
                                    const currentOrder = draftOrderSettings.manualOrder.length > 0
                                      ? [...draftOrderSettings.manualOrder]
                                      : selectedLeague?.membersList?.map(m => m.email) || [];
                                    const maxIndex = (selectedLeague?.membersList?.length || 1) - 1;
                                    if (index < maxIndex) {
                                      [currentOrder[index], currentOrder[index + 1]] = [currentOrder[index + 1], currentOrder[index]];
                                      setDraftOrderSettings({ ...draftOrderSettings, manualOrder: currentOrder });
                                    }
                                  }}
                                  disabled={index === (selectedLeague?.membersList?.length || 1) - 1}
                                  className="p-2 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                  ↓
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Draft Timer */}
              <div>
                <h3 className="text-base font-semibold text-white mb-2">
                  Draft Timer (Optional)
                </h3>
                <p className="text-sm text-slate-400 mb-4">
                  Set a time limit for each pick. Members will be notified when it's their turn.
                </p>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                  {['none', '4 hours', '8 hours', '12 hours', '24 hours'].map(timer => (
                    <button
                      key={timer}
                      onClick={() => {
                        setDraftOrderSettings({
                          ...draftOrderSettings,
                          draftTimer: timer
                        });
                      }}
                      className={`px-4 py-2 rounded-lg border-2 transition-all ${
                        draftOrderSettings.draftTimer === timer
                          ? 'border-blue-500 bg-blue-500/20 text-white'
                          : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {timer}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timer Pause Window */}
              <div>
                <h3 className="text-base font-semibold text-white mb-2">
                  Timer Pause Window (ET)
                </h3>
                <p className="text-sm text-slate-400 mb-4">
                  Enable or disable the daily pause window for the timer.
                </p>
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="checkbox"
                    id="timerPauseEnabled"
                    checked={draftOrderSettings.timerPauseEnabled !== false}
                    onChange={(e) => setDraftOrderSettings({
                      ...draftOrderSettings,
                      timerPauseEnabled: e.target.checked
                    })}
                    className="w-5 h-5 bg-slate-900 border-slate-700 rounded"
                  />
                  <label htmlFor="timerPauseEnabled" className="text-base font-semibold text-white">
                    Enable Pause Window
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm text-slate-300">
                    Start Hour
                    <select
                      value={draftOrderSettings.timerPauseStartHour ?? 0}
                      disabled={draftOrderSettings.timerPauseEnabled === false}
                      onChange={(e) => setDraftOrderSettings({
                        ...draftOrderSettings,
                        timerPauseStartHour: parseInt(e.target.value, 10)
                      })}
                      className="mt-1 w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {[...Array(24)].map((_, hour) => (
                        <option key={`pause-start-${hour}`} value={hour}>{formatHourLabel(hour)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-slate-300">
                    End Hour
                    <select
                      value={draftOrderSettings.timerPauseEndHour ?? 8}
                      disabled={draftOrderSettings.timerPauseEnabled === false}
                      onChange={(e) => setDraftOrderSettings({
                        ...draftOrderSettings,
                        timerPauseEndHour: parseInt(e.target.value, 10)
                      })}
                      className="mt-1 w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {[...Array(24)].map((_, hour) => (
                        <option key={`pause-end-${hour}`} value={hour}>{formatHourLabel(hour)}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {!selectedLeague?.draftStarted && (
                <>
                  {/* Draft Format */}
                  <div>
                    <h3 className="text-base font-semibold text-white mb-2">
                      Draft Format
                    </h3>
                    <p className="text-sm text-slate-400 mb-4">
                      Snake is default. Third Round Reversal (3RR) keeps rounds 2 and 3 reversed before alternating.
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="thirdRoundReversal"
                        checked={!!draftOrderSettings.thirdRoundReversal}
                        onChange={(e) => {
                          setDraftOrderSettings({
                            ...draftOrderSettings,
                            thirdRoundReversal: e.target.checked
                          });
                        }}
                        className="w-5 h-5 bg-slate-900 border-slate-700 rounded"
                      />
                      <label htmlFor="thirdRoundReversal" className="text-base font-semibold text-white">
                        Enable Third Round Reversal (3RR)
                      </label>
                    </div>
                  </div>

                  {/* Sport Requirement */}
                  <div>
                    <h3 className="text-base font-semibold text-white mb-2">
                      Sport Requirement
                    </h3>
                    <p className="text-sm text-slate-400 mb-4">
                      Require each drafter to pick at least one team from every selected sport before flex picks.
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="draftEverySportRequired"
                        checked={draftOrderSettings.draftEverySportRequired !== false}
                        onChange={(e) => {
                          setDraftOrderSettings({
                            ...draftOrderSettings,
                            draftEverySportRequired: e.target.checked
                          });
                        }}
                        className="w-5 h-5 bg-slate-900 border-slate-700 rounded"
                      />
                      <label htmlFor="draftEverySportRequired" className="text-base font-semibold text-white">
                        Require one pick from every sport
                      </label>
                    </div>
                  </div>
                </>
              )}
            </fieldset>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-700 bg-slate-800">
              {isCommissioner ? (
              <button
                onClick={async () => {
                  // Save draft timer to database
                  if (selectedLeagueId) {
                    try {
                      const updates = {
                        draft_timer: draftOrderSettings.draftTimer,
                        timer_pause_start_hour: draftOrderSettings.timerPauseStartHour ?? 0,
                        timer_pause_end_hour: (draftOrderSettings.timerPauseEnabled === false)
                          ? (draftOrderSettings.timerPauseStartHour ?? 0)
                          : (draftOrderSettings.timerPauseEndHour ?? 8)
                      };
                      if (!selectedLeague?.draftStarted) {
                        updates.draft_rounds = Math.max(
                          draftOrderSettings.draftRounds || selectedLeague?.draftRounds || 8,
                          selectedLeague?.sports?.length || 0
                        );
                        updates.send_otc_emails = !!draftOrderSettings.sendOTCEmails;
                      }
                      await updateLeague(selectedLeagueId, updates);
                      await reloadLeagues();
                    } catch (error) {
                      console.error('Error saving draft settings:', error);
                    }
                  }
                  setShowDraftSettingsModal(false);
                }}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-semibold transition-all shadow-lg shadow-blue-500/20"
              >
                Save Settings
              </button>
              ) : (
              <button
                onClick={() => setShowDraftSettingsModal(false)}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
              >
                Close
              </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Start Draft Confirmation Modal */}
      {showStartDraftConfirmation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="border-b border-slate-700 p-5 shrink-0">
              <h3 className="text-xl font-bold text-white">Confirm Draft Start</h3>
              <p className="text-sm text-slate-400 mt-1">Review settings below — most cannot be changed once the draft begins.</p>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto">
              {/* Members & rounds */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-700/40 rounded-lg px-4 py-3">
                  <div className="text-xs text-slate-400 mb-1">Members</div>
                  <div className="text-lg font-bold text-white">{selectedLeague?.members}</div>
                </div>
                <div className="bg-slate-700/40 rounded-lg px-4 py-3">
                  <div className="text-xs text-slate-400 mb-1">Rounds</div>
                  <div className="text-lg font-bold text-white">{draftOrderSettings.draftRounds || selectedLeague?.draftRounds}</div>
                </div>
              </div>

              {/* Sports */}
              <div>
                <div className="text-xs text-slate-400 mb-2">Sports ({selectedLeague?.sports?.length})</div>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedLeague?.sports || []).map(sport => (
                    <SportBadge key={sport} sport={sport} size="pill" />
                  ))}
                </div>
              </div>

              {/* Draft format row */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div className="flex items-center justify-between col-span-2 border-t border-slate-700/50 pt-3">
                  <span className="text-slate-400">Format</span>
                  <span className="font-semibold text-white">{draftOrderSettings.thirdRoundReversal ? 'Snake (3rd-round reversal)' : 'Snake'}</span>
                </div>
                <div className="flex items-center justify-between col-span-2">
                  <span className="text-slate-400">Draft order</span>
                  <span className="font-semibold text-white">{draftOrderSettings.randomize ? 'Random on start' : 'Manual (set below)'}</span>
                </div>
                <div className="flex items-center justify-between col-span-2">
                  <span className="text-slate-400">Sport pick requirement</span>
                  <span className="font-semibold text-white">{draftOrderSettings.draftEverySportRequired !== false ? 'Required' : 'Optional'}</span>
                </div>
                <div className="flex items-center justify-between col-span-2">
                  <span className="text-slate-400">Pick timer</span>
                  <span className="font-semibold text-white">
                    {selectedLeague?.draftTimer && selectedLeague.draftTimer !== 'none'
                      ? <>
                          {selectedLeague.draftTimer}
                          {selectedLeague?.timerPauseEnabled && ` · paused ${formatHourLabel(selectedLeague.timerPauseStartHour ?? 0)}–${formatHourLabel(selectedLeague.timerPauseEndHour ?? 8)}`}
                        </>
                      : 'None'}
                  </span>
                </div>
              </div>

              {/* Draft order list (manual only) */}
              {!draftOrderSettings.randomize && (() => {
                const order = draftOrderSettings.manualOrder.length > 0
                  ? draftOrderSettings.manualOrder
                  : selectedLeague?.membersList?.map(m => m.email) || [];
                return (
                  <div>
                    <div className="text-xs text-slate-400 mb-2">Draft order</div>
                    <div className="space-y-1">
                      {order.map((email, i) => {
                        const member = selectedLeague?.membersList?.find(m => m.email === email);
                        return (
                          <div key={email} className="flex items-center gap-2 text-sm">
                            <span className="text-slate-500 w-5 text-right shrink-0">{i + 1}.</span>
                            <span className="text-white">{member?.name || email.split('@')[0]}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex gap-3 p-5 border-t border-slate-700 shrink-0">
              <button
                onClick={() => setShowStartDraftConfirmation(false)}
                className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
              >
                Go Back
              </button>
              <button
                onClick={() => {
                  setShowStartDraftConfirmation(false);
                  startDraft();
                }}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-semibold transition-all"
              >
                Start Draft
              </button>
            </div>
          </div>
        </div>
      )}
      {showDeleteConfirm && (
        <ConfirmModal
          title="Delete League?"
          message={<>This will permanently delete <span className="text-white font-semibold">{selectedLeague?.name}</span> and all its picks. This cannot be undone.</>}
          confirmLabel="Delete"
          confirmClassName="bg-red-600/80 hover:bg-red-600 text-white"
          onConfirm={async () => {
            try {
              await deleteLeague();
              setShowDeleteConfirm(false);
            } catch {
              setDeleteError('Failed to delete league. Please try again.');
            }
          }}
          onCancel={() => setShowDeleteConfirm(false)}
          error={deleteError}
        />
      )}
      {showCompleteConfirm && (
        <ConfirmModal
          title="Mark as Complete?"
          message={<>This will move <span className="text-white font-semibold">{selectedLeague?.name}</span> to the Completed tab for all members.</>}
          confirmLabel="Confirm"
          confirmClassName="bg-emerald-600/80 hover:bg-emerald-600 text-white"
          onConfirm={async () => {
            try {
              await updateLeague(selectedLeagueId, { status: 'completed' });
              await reloadLeagues();
              setShowCompleteConfirm(false);
            } catch {
              setCompleteError('Failed to mark league completed. Please try again.');
            }
          }}
          onCancel={() => setShowCompleteConfirm(false)}
          error={completeError}
        />
      )}

      {/* Remove Member Confirmation */}
      {showRemoveMemberConfirm && (
        <ConfirmModal
          title="Remove Member?"
          message={<>Remove <span className="text-white font-semibold">{showRemoveMemberConfirm.name || showRemoveMemberConfirm.email}</span> from this league?</>}
          confirmLabel="Remove"
          confirmClassName="bg-red-600/80 hover:bg-red-600 text-white"
          onConfirm={() => handleRemoveMember(showRemoveMemberConfirm)}
          onCancel={() => setShowRemoveMemberConfirm(null)}
          error={removingMemberId ? 'Removing…' : ''}
        />
      )}

      {/* Team Info Popup */}
      {selectedTeamInfo && (
        <TeamPopup
          sport={selectedTeamInfo.sport}
          team={selectedTeamInfo.team}
          currentEP={selectedTeamInfo.currentEP}
          onClose={() => {
            setSelectedTeamInfo(null);
            if (teamInfoFromSportsRef.current) {
              teamInfoFromSportsRef.current = false;
              setShowSportsModal(true);
            }
          }}
        />
      )}
      </div>
    </div>
    );
};

export default LeagueView;
