import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, ArrowLeft, Settings } from 'lucide-react';
import { getCurrentPickerFromState, normalizeDraftPicker, compareByEP, wouldBreakSportCoverage, picksUntilTurn } from '../utils/draft';
import SportBadge from '../components/SportBadge';
import RulesModal from '../components/RulesModal';
import ConfirmModal from '../components/ConfirmModal';
import TimerDisplay from '../components/TimerDisplay';

import { getSportDisplayCode } from '../config/sports';
import { getUserInitials, getUserDisplayName } from '../utils/userDisplay';
import { formatHourLabel } from '../utils/format';
import TeamPopup from '../components/TeamPopup';
import { useAppContext } from '../context/AppContext';
import { sendOtcEmail } from '../supabaseClient';

const DraftView = (props) => {
  const {
    makePickDB, setTimerExpired, undoPickDB,
    formatTimeRemaining, timeRemaining, isInPauseWindow,
    activeDraftSport, setActiveDraftSport,
    getSportNameByCode, getDraftPoolForSport, expectedPoints,
    setPendingPick, setShowPickConfirmation, showPickConfirmation, pendingPick,
    queue, onAddToQueue, onRemoveFromQueue, onMoveQueueItem, onClearQueue,
    queueError,
  } = props;

  const {
    selectedLeague, supabaseDraftState, currentUser, selectedLeagueId,
    setShowRulesModal, handleLogout, backToHome, showRulesModal,
    supabasePicks, getSportColor, getExpectedPoints, hasNoEPData,
    sportResults, refreshExpectedPoints, formatPick, myRoster, setCurrentView,
    draftSettings, onUpdateDraftSettings, receiveOtcEmails, setReceiveOtcEmails,
    allSportCodes, epLoading,
  } = useAppContext();

  const formatDisplayName = (member) => {
    if (member?.name && member.name.trim()) return member.name.trim();
    const local = member?.email?.split('@')[0] || '';
    if (!local) return 'Unknown';
    return local
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };
    const fallbackDraftOrder = (selectedLeague?.membersList || []).map((member) => normalizeDraftPicker(member));
    const hasPersistedOrder = Array.isArray(supabaseDraftState?.draftOrder) && supabaseDraftState.draftOrder.length > 0;
    // Enrich stored draft order with fresh names from membersList (handles post-signup name syncs)
    const effectiveDraftOrder = hasPersistedOrder
      ? supabaseDraftState.draftOrder.map((picker) => {
          const norm = normalizeDraftPicker(picker);
          const freshMember = selectedLeague?.membersList?.find(
            m => m.email?.toLowerCase() === norm?.email?.toLowerCase()
          );
          return freshMember?.name ? { ...norm, name: freshMember.name } : norm;
        }).filter(Boolean)
      : fallbackDraftOrder;
    const effectiveCurrentPick = supabaseDraftState?.currentPick || ((supabasePicks?.length || 0) + 1);
    const effectiveCurrentRound = supabaseDraftState?.currentRound || Math.ceil(effectiveCurrentPick / Math.max(1, effectiveDraftOrder.length));
    const effectiveDraftState = {
      currentPick: effectiveCurrentPick,
      currentRound: effectiveCurrentRound,
      draftOrder: effectiveDraftOrder,
      isSnake: supabaseDraftState?.isSnake ?? true,
      thirdRoundReversal: !!supabaseDraftState?.thirdRoundReversal
    };

    const currentPicker = getCurrentPickerFromState(effectiveDraftState);
    const isMyTurn = currentPicker?.email === currentUser?.email;
    const isCommissioner = selectedLeague?.commissionerEmail?.toLowerCase() === currentUser?.email?.toLowerCase();
    const canDraftForCurrentPicker = isMyTurn || isCommissioner;
    const isCommissionerPickingForOther = isCommissioner && !isMyTurn;
    const totalPicks = selectedLeague ? selectedLeague.members * (selectedLeague.draftRounds || 8) : 0;
    const completedPicks = supabasePicks?.length || 0;
    const isDraftComplete = totalPicks > 0 && completedPicks >= totalPicks;
    const sportRequirementEnabled = supabaseDraftState?.draftEverySportRequired !== false;
    const currentPickerEmail = currentPicker?.email?.toLowerCase();
    const currentPickerPicks = (supabasePicks || []).filter(
      (p) => p.picker_email?.toLowerCase() === currentPickerEmail
    );
    const missingRequiredSports = (selectedLeague?.sports || []).filter(
      (sport) => !currentPickerPicks.some((p) => p.sport === sport)
    );
    const mustPickFromMissingSports = sportRequirementEnabled && missingRequiredSports.length > 0;
    const selectableSports = mustPickFromMissingSports ? missingRequiredSports : (selectedLeague?.sports || []);
    const isSportSelectable = (sport) => selectableSports.includes(sport);
    // How many flex picks remain after fulfilling all required sport picks.
    // Only subtract required sports when the feature is enabled; otherwise all picks are flex.
    const pickerFlexRemaining = Math.max(
      0,
      (selectedLeague?.draftRounds || 0) - currentPickerPicks.length - (sportRequirementEnabled ? missingRequiredSports.length : 0)
    );
    // Sport slot is "full" when picker already drafted it AND has no flex picks left to draft it again
    const isPickerSportFull = (sport) =>
      pickerFlexRemaining <= 0 && currentPickerPicks.some(p => p.sport === sport);
    const isSportAvailableForPicker = (sport) => isSportSelectable(sport) && !isPickerSportFull(sport);
    const [gridSportFilter, setGridSportFilter] = useState('ALL');
    const [gridSearch, setGridSearch] = useState('');
    const [gridAvailableOnly, setGridAvailableOnly] = useState(true);
    const [gridSortBy, setGridSortBy] = useState('ep');
    const [gridSortDir, setGridSortDir] = useState('desc');
    const [gridPage, setGridPage] = useState(0);
    const GRID_PAGE_SIZE = 25;
    const [showSportsModal, setShowSportsModal] = useState(false);
    const [sportsSearch, setSportsSearch] = useState('');
    const [sportsFilter, setSportsFilter] = useState('ALL');
    const [sportsSortBy, setSportsSortBy] = useState('ep');
    const [sportsSortDir, setSportsSortDir] = useState('desc');
    const [showUserSettings, setShowUserSettings] = useState(false);
    const [showRollbackModal, setShowRollbackModal] = useState(false);
    const [rollbackMode, setRollbackMode] = useState('target'); // 'target' | 'restart'
    const [rollbackRound, setRollbackRound] = useState(1);
    const [rollbackPickInRound, setRollbackPickInRound] = useState(1);
    const [pickError, setPickError] = useState('');
    const [rollbackError, setRollbackError] = useState('');
    const [selectedTeamInfo, setSelectedTeamInfo] = useState(null); // { sport, team, currentEP } | null
    const teamInfoFromSportsRef = useRef(false); // true when popup was opened from the sports catalog modal
    const [showClearQueueConfirm, setShowClearQueueConfirm] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [showMobileQueue, setShowMobileQueue] = useState(false);

    useEffect(() => {
      if (!selectedLeague?.sports?.length) return;
      if (gridSportFilter !== 'ALL' && !selectedLeague.sports.includes(gridSportFilter)) {
        setGridSportFilter('ALL');
      }
    }, [gridSportFilter, selectedLeague?.sports]);

    useEffect(() => {
      if (sportsFilter !== 'ALL' && !(allSportCodes || []).includes(sportsFilter)) {
        setSportsFilter('ALL');
      }
    }, [sportsFilter, allSportCodes]);

    const wouldBreakRequiredSportAvailability = (pickerEmail, sport, team) =>
      wouldBreakSportCoverage({
        sportRequirementEnabled,
        leagueSports: selectedLeague?.sports,
        pool: getDraftPoolForSport(sport),
        draftEmails: (effectiveDraftOrder || []).map(m => m?.email?.toLowerCase()).filter(Boolean),
        picks: supabasePicks,
        pickerEmail,
        sport,
        team,
      });

    const draftGridRows = useMemo(() => {
      const pickedMap = new Map(
        (supabasePicks || []).map((p) => [`${p.sport}::${p.team_name}`, p])
      );
      const search = gridSearch.trim().toLowerCase();

      const rows = (selectedLeague?.sports || []).flatMap((sport) => {
        const sportName = getSportNameByCode(sport);
        const teams = getDraftPoolForSport(sport);
        return teams.map((team) => {
          const pickedBy = pickedMap.get(`${sport}::${team}`) || null;
          const alreadyPicked = !!pickedBy;
          const ep = getExpectedPoints(sport, team);
          const canPick = !isDraftComplete && isMyTurn && !alreadyPicked && !isPickerSportFull(sport);
          const blocksRequiredSportCoverage = wouldBreakRequiredSportAvailability(currentPicker?.email, sport, team);
          // isPickable: sport slot not full and not yet drafted (for "Available only" filter)
          // isSportSelectable is intentionally excluded — "must draft missing sports first" is not a permanent lock
          const isPickable = !isDraftComplete && !alreadyPicked && !isPickerSportFull(sport) && !blocksRequiredSportCoverage;

          return {
            sport,
            sportName,
            team,
            ep,
            pickedBy,
            alreadyPicked,
            blocksRequiredSportCoverage,
            isPickable,
            canPick: canPick && !blocksRequiredSportCoverage
          };
        });
      });

      const filtered = rows.filter((row) => {
        if (gridSportFilter !== 'ALL' && row.sport !== gridSportFilter) return false;
        if (gridAvailableOnly && !row.isPickable) return false;
        if (search && !`${row.team}`.toLowerCase().includes(search)) return false;
        return true;
      });

      const sorted = [...filtered].sort((a, b) => {
        let cmp = 0;
        if (gridSortBy === 'ep') {
          cmp = compareByEP(a, b);
        } else if (gridSortBy === 'team') {
          cmp = a.team.localeCompare(b.team);
        } else {
          cmp = a.team.localeCompare(b.team);
        }
        return gridSortDir === 'asc' ? cmp : -cmp;
      });

      return sorted;
    }, [
      selectedLeague?.sports,
      supabasePicks,
      getSportNameByCode,
      getDraftPoolForSport,
      getExpectedPoints,
      isDraftComplete,
      isMyTurn,
      currentPicker?.email,
      effectiveDraftOrder,
      sportRequirementEnabled,
      selectableSports,
      pickerFlexRemaining,
      gridSportFilter,
      gridAvailableOnly,
      gridSearch,
      gridSortBy,
      gridSortDir
    ]);

    const sportsCatalogRows = useMemo(() => {
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
        const cmp = sportsSortBy === 'ep' ? compareByEP(a, b) : a.team.localeCompare(b.team);
        return sportsSortDir === 'asc' ? cmp : -cmp;
      });
    }, [
      allSportCodes,
      getDraftPoolForSport,
      getExpectedPoints,
      sportsSearch,
      sportsFilter,
      sportsSortBy,
      sportsSortDir
    ]);

    const queuePositionMap = useMemo(() => {
      const map = new Map();
      (queue || []).forEach((item, idx) => {
        map.set(`${item.sport}::${item.team}`, { rank: idx + 1, id: item.id });
      });
      return map;
    }, [queue]);

    const myPicks = useMemo(() =>
      (supabasePicks || []).filter(
        p => p.picker_email?.toLowerCase() === currentUser?.email?.toLowerCase()
      ),
      [supabasePicks, currentUser]
    );

    const makePick = async (sport, team) => {
      if (isDraftComplete) {
        return;
      }
      if (!canDraftForCurrentPicker) {
        return;
      }
      if (isPickerSportFull(sport)) {
        return;
      }
      if (wouldBreakRequiredSportAvailability(currentPicker?.email, sport, team)) {
        return;
      }

      const pickData = {
        league_id: selectedLeagueId,
        pick_number: effectiveCurrentPick,
        round: effectiveCurrentRound,
        picker_email: currentPicker?.email,
        picker_name: currentPicker?.name || currentPicker?.email?.split('@')[0] || 'Unknown',
        sport: sport,
        team: team,
        team_name: team
      };

      try {
        // Call database function which handles both pick insertion and draft state update
        await makePickDB(pickData);

        // Notify next picker (fire-and-forget; respects league + user OTC email prefs)
        sendOtcEmail(selectedLeagueId);

        // Auto-remove from queue if this team was queued
        const queueEntry = queuePositionMap.get(`${sport}::${team}`);
        if (queueEntry) onRemoveFromQueue(queueEntry.id);

        // Reset timer expired flag
        setTimerExpired(false);
      } catch (error) {
        console.error('Error making pick:', error);
        setPickError(error?.message ? `Failed to make pick: ${error.message}` : 'Failed to make pick. Please try again.');
      }
    };

    const picksPerRound = Math.max(1, effectiveDraftOrder.length || 1);
    const currentPickInRound = ((Math.max(1, effectiveCurrentPick) - 1) % picksPerRound) + 1;
    const maxRollbackOverall = isDraftComplete
      ? Math.max(0, totalPicks)
      : Math.max(1, effectiveCurrentPick);
    const maxRoundOption = Math.max(1, Math.ceil(Math.max(1, maxRollbackOverall) / picksPerRound));
    const maxPickOptionForRound = (round) => {
      if (round < maxRoundOption) return picksPerRound;
      const mod = maxRollbackOverall % picksPerRound;
      return mod === 0 ? picksPerRound : mod;
    };
    const computedRollbackTarget = rollbackMode === 'restart'
      ? 0
      : Math.max(0, ((rollbackRound - 1) * picksPerRound) + (rollbackPickInRound - 1));
    const rollbackTargetValid = computedRollbackTarget >= 0 && computedRollbackTarget <= maxRollbackOverall;

    useEffect(() => {
      if (rollbackRound > maxRoundOption) {
        setRollbackRound(maxRoundOption);
      } else if (rollbackRound < 1) {
        setRollbackRound(1);
      }
    }, [rollbackRound, maxRoundOption]);

    useEffect(() => {
      const maxPickForSelectedRound = maxPickOptionForRound(rollbackRound);
      if (rollbackPickInRound > maxPickForSelectedRound) {
        setRollbackPickInRound(maxPickForSelectedRound);
      } else if (rollbackPickInRound < 1) {
        setRollbackPickInRound(1);
      }
    }, [rollbackRound, rollbackPickInRound, maxRoundOption, maxRollbackOverall]);

    return (
      <div className="h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* Draft Header */}
        <div className="bg-slate-800/60 backdrop-blur-sm border-b border-slate-700 shrink-0 z-50">
          <div className="max-w-7xl mx-auto px-3 md:px-6 py-4">
            {/* Top row - Branding and User */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="text-3xl">🏆</div>
                <h1 className="text-2xl font-bold text-white">OmniFantasy</h1>
              </div>
              <div className="flex items-center gap-2">
                {/* Desktop nav */}
                <div className="hidden md:flex items-center gap-2 md:gap-4 flex-wrap justify-end">
                  <button
                    onClick={() => setShowRulesModal(true)}
                    className="shrink-0 text-slate-300 hover:text-white text-sm transition-colors px-3 py-1.5 rounded-md border border-slate-600/60 hover:bg-slate-700/50"
                  >
                    📖 Rules
                  </button>
                  <button
                    onClick={() => setShowSportsModal(true)}
                    className="shrink-0 text-slate-300 hover:text-white text-sm transition-colors px-3 py-1.5 rounded-md border border-slate-600/60 hover:bg-slate-700/50"
                  >
                    🏟️ Sports
                  </button>
                  {!isDraftComplete && (
                    <button
                      onClick={() => setShowUserSettings(true)}
                      className="shrink-0 flex items-center gap-1.5 text-slate-300 hover:text-white text-sm transition-colors px-3 py-1.5 rounded-md border border-slate-600/60 hover:bg-slate-700/50"
                    >
                      <Settings size={14} />
                      Settings
                    </button>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="text-slate-300 text-sm">{getUserDisplayName(currentUser)}</span>
                    <button onClick={handleLogout} className="text-slate-400 hover:text-white text-sm transition-colors">
                      Logout
                    </button>
                  </div>
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                    {getUserInitials(currentUser)}
                  </div>
                </div>
                {/* Mobile nav */}
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
                          <button onClick={() => { setShowRulesModal(true); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">📖 Rules</button>
                          <button onClick={() => { setShowSportsModal(true); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">🏟️ Sports</button>
                          {!isDraftComplete && <button onClick={() => { setShowUserSettings(true); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-2"><Settings size={14} /> Settings</button>}
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

            {/* Draft info row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button onClick={() => setCurrentView('league')} className="text-slate-400 hover:text-white transition-colors">
                  <ArrowLeft size={24} />
                </button>
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className="text-base md:text-xl font-bold text-white">{selectedLeague?.name} - Draft</h2>
                    <div className="text-sm text-slate-400">
                      {isDraftComplete
                        ? `Draft complete • ${completedPicks}/${totalPicks} picks`
                        : `Pick ${effectiveCurrentPick} of ${totalPicks} • Round ${effectiveCurrentRound}`
                      }
                    </div>
                  </div>
                  {selectedLeague?.commissionerEmail === currentUser?.email && supabasePicks && supabasePicks.length > 0 && (
                    <button
                      onClick={() => {
                        setRollbackMode('target');
                        setRollbackRound(Math.min(Math.max(1, effectiveCurrentRound), maxRoundOption));
                        setRollbackPickInRound(Math.max(1, currentPickInRound));
                        setShowRollbackModal(true);
                      }}
                      className="hidden sm:inline-flex ml-2 text-xs px-3 py-1.5 bg-slate-700/40 hover:bg-slate-700/60 text-slate-500 hover:text-slate-300 border border-slate-600/40 hover:border-slate-500/60 rounded-lg transition-all whitespace-nowrap"
                      title="Commissioner: roll back draft picks"
                    >
                      ↩ Roll Back
                    </button>
                  )}
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="text-right">
                  {isDraftComplete ? (
                    <>
                      <div className="text-sm text-slate-400">Status</div>
                      <div className="text-xl font-bold text-emerald-400">Draft Complete</div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm text-slate-400">On the Clock</div>
                      <div className="text-xl font-bold text-white">{formatDisplayName(currentPicker)}</div>
                      {isMyTurn && (
                        <div className="text-sm font-semibold text-green-400 mt-1 flex items-center gap-2 justify-end flex-wrap">
                          <span>Your Turn!</span>
                          {selectedLeague?.draftTimer && selectedLeague.draftTimer !== 'none' && (
                            <TimerDisplay
                              compact
                              timeRemaining={timeRemaining}
                              isPaused={isInPauseWindow(
                                selectedLeague.draftTimer,
                                selectedLeague?.timerPauseStartHour ?? 0,
                                selectedLeague?.timerPauseEndHour ?? 8
                              )}
                              pauseEndHour={selectedLeague?.timerPauseEndHour ?? 8}
                            />
                          )}
                        </div>
                      )}
                      {!isMyTurn && (() => {
                        const n = picksUntilTurn({
                          myEmail: currentUser?.email,
                          draftOrder: effectiveDraftOrder,
                          currentPick: effectiveCurrentPick,
                          currentRound: effectiveCurrentRound,
                          isSnake: effectiveDraftState.isSnake,
                          thirdRoundReversal: effectiveDraftState.thirdRoundReversal,
                        });
                        return (
                          <div className="text-sm text-slate-400 mt-1">
                            {n != null ? `${n} pick${n !== 1 ? 's' : ''} until your turn` : 'Waiting...'}
                          </div>
                        );
                      })()}
                    </>
                  )}

                  {/* Draft Timer Countdown */}
                  {selectedLeague?.draftTimer && selectedLeague.draftTimer !== 'none' && (
                    <TimerDisplay
                      timeRemaining={timeRemaining}
                      isPaused={isInPauseWindow(
                        selectedLeague.draftTimer,
                        selectedLeague?.timerPauseStartHour ?? 0,
                        selectedLeague?.timerPauseEndHour ?? 8
                      )}
                      pauseEndHour={selectedLeague?.timerPauseEndHour ?? 8}
                    />
                  )}
                </div>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full bg-slate-700/50 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-green-500 to-emerald-500 h-2 rounded-full transition-all"
                style={{ width: `${(Math.min(completedPicks, totalPicks) / Math.max(1, totalPicks)) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
        
        {/* Draft Content */}
        <div className="flex-1 overflow-hidden flex gap-0 md:gap-6 px-3 md:px-6 max-w-[1600px] mx-auto w-full">
          <div className="flex-1 min-w-0 overflow-y-auto py-4 md:py-8">
<div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-3 md:p-6">
            {isDraftComplete ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                <div className="text-5xl">🏆</div>
                <h2 className="text-2xl font-bold text-emerald-400">Draft Complete!</h2>
                <p className="text-slate-400 text-sm max-w-xs">All picks have been made. Head to the league page to view standings and results.</p>
                <button
                  onClick={() => setCurrentView('league')}
                  className="mt-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  View League
                </button>
              </div>
            ) : (
            <>
            <h2 className="text-xl font-bold text-white mb-4">Make Your Pick</h2>

            {/* My Queue */}
            <div className="mb-6 p-4 bg-slate-700/30 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">My Queue</span>
                  {(queue?.length || 0) > 0 && (
                    <span className="text-xs text-slate-400">({queue.length})</span>
                  )}
                </div>
                {(queue?.length || 0) > 0 && (
                  <button
                    onClick={() => setShowClearQueueConfirm(true)}
                    className="text-xs px-2 py-1 text-slate-400 hover:text-red-400 border border-slate-600/50 hover:border-red-500/50 rounded transition-colors"
                  >
                    Clear All ×
                  </button>
                )}
              </div>
              {queueError && (
                <div className="mb-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-xs">
                  Queue error: {queueError.message || String(queueError)} — try again
                </div>
              )}
              {!(queue?.length) ? (
                <div className="text-sm text-slate-500 italic text-center py-2">
                  — Queue empty — click + on a team below to add it
                </div>
              ) : (
                <div className="space-y-1">
                  {(() => {
                    const visibleQueue = queue.filter((item) => !(supabasePicks || []).some(
                      (p) => p.sport === item.sport && p.team_name === item.team
                    ));
                    return visibleQueue.map((item, idx) => {
                      const itemEp = getExpectedPoints(item.sport, item.team);
                      const canPickFromQueue = (
                        !isDraftComplete && isMyTurn &&
                        !isPickerSportFull(item.sport) &&
                        !wouldBreakRequiredSportAvailability(currentPicker?.email, item.sport, item.team)
                      );
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-all border-slate-600/30 bg-slate-800/40"
                        >
                          <span className="text-xs font-mono text-slate-400 w-5 shrink-0 text-center">{idx + 1}.</span>
                          <SportBadge sport={item.sport} className="shrink-0" />
                          <button
                            className="flex-1 text-sm font-semibold truncate text-left text-white hover:text-amber-300 transition-colors"
                            onClick={() => setSelectedTeamInfo({ sport: item.sport, team: item.team, currentEP: itemEp })}
                            title="View EP trend"
                          >
                            {item.team}
                          </button>
                          {itemEp !== null && (
                            <span className="text-xs text-amber-400 shrink-0">~{itemEp} EP</span>
                          )}
                          {canPickFromQueue && (
                            <button
                              onClick={() => { setPendingPick({ sport: item.sport, team: item.team }); setShowPickConfirmation(true); }}
                              className="shrink-0 px-2 py-0.5 text-xs font-semibold rounded bg-green-600 hover:bg-green-500 text-white transition-colors"
                              title="Draft this pick"
                            >
                              Draft
                            </button>
                          )}
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => onMoveQueueItem(item.id, 'up')}
                              disabled={idx === 0}
                              className="text-slate-500 hover:text-white disabled:opacity-20 w-5 text-center transition-colors"
                              title="Move up"
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => onMoveQueueItem(item.id, 'down')}
                              disabled={idx === visibleQueue.length - 1}
                              className="text-slate-500 hover:text-white disabled:opacity-20 w-5 text-center transition-colors"
                              title="Move down"
                            >
                              ↓
                            </button>
                            <button
                              onClick={() => onRemoveFromQueue(item.id)}
                              className="text-slate-500 hover:text-red-400 w-5 text-center transition-colors"
                              title="Remove from queue"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}

              {showClearQueueConfirm && (
                <ConfirmModal
                  title="Clear Queue"
                  message={`Remove all ${queue.length} item${queue.length !== 1 ? 's' : ''} from your queue?`}
                  confirmLabel="Clear All"
                  confirmClassName="bg-red-600 hover:bg-red-700 text-white"
                  onConfirm={() => { onClearQueue(); setShowClearQueueConfirm(false); }}
                  onCancel={() => setShowClearQueueConfirm(false)}
                />
              )}
            </div>

            <div className="mb-4 flex flex-col md:flex-row gap-2">
              <input
                type="text"
                value={gridSearch}
                onChange={(e) => { setGridSearch(e.target.value); setGridPage(0); }}
                placeholder="Search team or player"
                className="xl:flex-[2] px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              <select
                value={gridSportFilter}
                onChange={(e) => { setGridSportFilter(e.target.value); setGridPage(0); }}
                className="xl:flex-1 px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="ALL">All sports</option>
                {(selectedLeague?.sports || []).map((sport) => (
                  <option key={sport} value={sport}>{getSportNameByCode(sport)}</option>
                ))}
              </select>
              <select
                value={gridSortBy}
                onChange={(e) => { setGridSortBy(e.target.value); setGridPage(0); }}
                className="xl:flex-1 px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="ep">Sort: EP</option>
                <option value="team">Sort: Team</option>
              </select>
              <button
                onClick={() => { setGridSortDir((prev) => prev === 'desc' ? 'asc' : 'desc'); setGridPage(0); }}
                className="xl:flex-none px-4 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white hover:border-slate-500 transition-colors"
                title={gridSortDir === 'desc' ? 'Descending' : 'Ascending'}
              >
                {gridSortDir === 'desc' ? '↓' : '↑'}
              </button>
              <label className="xl:flex-none flex items-center gap-2 px-3 py-2 bg-slate-900/40 border border-slate-700 rounded-lg text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={gridAvailableOnly}
                  onChange={(e) => { setGridAvailableOnly(e.target.checked); setGridPage(0); }}
                  className="rounded bg-slate-800 border-slate-600"
                />
                Available only
              </label>
            </div>

            {pickError && (
              <div className="mt-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-between gap-2">
                <span className="text-red-400 text-sm">{pickError}</span>
                <button onClick={() => setPickError('')} className="text-red-400 hover:text-red-200 text-lg leading-none shrink-0">✕</button>
              </div>
            )}
            <div className="mt-2 p-3 bg-slate-900/50 border border-slate-700/50 rounded-lg">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Draft Board</h3>
                <span className="text-sm text-slate-400">
                  {draftGridRows.length === 0 ? '0 options' : `${gridPage * GRID_PAGE_SIZE + 1}–${Math.min((gridPage + 1) * GRID_PAGE_SIZE, draftGridRows.length)} of ${draftGridRows.length}`}
                </span>
              </div>
              <div className="rounded-lg border border-slate-700/50">
                <div className="hidden md:grid grid-cols-[minmax(0,1fr)_110px_120px_110px_68px_52px] gap-0 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-100 bg-slate-700 border-b border-slate-600 rounded-t-lg">
                  <div>Team</div>
                  <div>Sport</div>
                  <div>EP</div>
                  <div>Status</div>
                  <div></div>
                  <div>Queue</div>
                </div>
                {draftGridRows.slice(gridPage * GRID_PAGE_SIZE, (gridPage + 1) * GRID_PAGE_SIZE).map((row) => {
                  const { sport, sportName, team, ep, alreadyPicked, pickedBy, canPick, blocksRequiredSportCoverage } = row;
                  const rowClass = alreadyPicked
                    ? 'text-slate-500 bg-slate-900/35'
                    : !isDraftComplete && !isPickerSportFull(sport) && !blocksRequiredSportCoverage
                    ? 'text-white bg-slate-900/65'
                    : 'text-slate-500 bg-slate-900/45';
                  const queueEntry = queuePositionMap.get(`${sport}::${team}`);

                  return (
                    <React.Fragment key={`${sport}::${team}`}>
                      {/* Mobile card */}
                      <div className={`md:hidden flex items-center gap-3 px-3 py-3 border-b border-slate-700/40 transition-all ${rowClass}`}>
                        <div className="shrink-0">
                          <SportBadge sport={sport} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <button
                            className="text-left font-semibold truncate w-full hover:text-amber-300 transition-colors"
                            onClick={e => { e.stopPropagation(); setSelectedTeamInfo({ sport, team, currentEP: ep }); }}
                          >
                            {team}
                          </button>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {ep !== null ? (
                              <span className="text-xs text-amber-400">~{ep} EP</span>
                            ) : hasNoEPData(sport) ? (
                              <span className="text-xs text-slate-500">TBD</span>
                            ) : null}
                            <span className="text-xs text-slate-500">
                              {alreadyPicked
                                ? `Picked by ${pickedBy?.picker_name || pickedBy?.picker_email?.split('@')[0] || 'someone'}`
                                : isDraftComplete ? 'Draft complete'
                                : isPickerSportFull(sport) || blocksRequiredSportCoverage ? 'Locked'
                                : 'Available'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {canPick && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setPendingPick({ sport, team }); setShowPickConfirmation(true); }}
                              className="text-xs px-3 py-1.5 rounded font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors"
                            >
                              Draft
                            </button>
                          )}
                          {!alreadyPicked && !isDraftComplete && !blocksRequiredSportCoverage && (() => {
                            const queueEntry = queuePositionMap.get(`${sport}::${team}`);
                            if (queueEntry) {
                              return (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onRemoveFromQueue(queueEntry.id); }}
                                  className="text-base leading-none hover:opacity-70 transition-opacity"
                                  title={`#${queueEntry.rank} in queue — click to remove`}
                                >⭐</button>
                              );
                            }
                            return (
                              <button
                                onClick={(e) => { e.stopPropagation(); onAddToQueue(sport, team); }}
                                className="text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 w-7 h-7 rounded flex items-center justify-center transition-colors font-bold text-lg"
                                title="Add to queue"
                              >+</button>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Desktop row */}
                      <div
                        className={`hidden md:grid w-full grid-cols-[minmax(0,1fr)_110px_120px_110px_68px_52px] gap-0 items-center px-3 py-2 border-b border-slate-700/40 transition-all text-left cursor-default ${rowClass}`}
                      >
                        <div className="font-semibold truncate pr-2">
                          <button
                            className="text-left hover:text-amber-300 transition-colors truncate w-full"
                            onClick={e => { e.stopPropagation(); setSelectedTeamInfo({ sport, team, currentEP: ep }); }}
                            title="View EP trend"
                          >
                            {team}
                          </button>
                        </div>
                        <div>
                          <SportBadge sport={sport} />
                        </div>
                        <div className="text-sm">
                          {ep !== null ? (
                            <span className="text-amber-400 font-medium">~{ep} EP</span>
                          ) : hasNoEPData(sport) ? (
                            <span className="text-slate-500">TBD</span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </div>
                        <div className="text-xs overflow-visible">
                          {alreadyPicked
                            ? (pickedBy?.picker_name || pickedBy?.picker_email?.split('@')[0] || 'Picked')
                            : isDraftComplete
                            ? 'Draft complete'
                            : isPickerSportFull(sport) || blocksRequiredSportCoverage
                            ? (
                              <span className="relative group/lock cursor-help">
                                Locked
                                <span className="pointer-events-none absolute bottom-full left-0 mb-1 px-2 py-1 bg-slate-700 text-slate-200 text-xs rounded opacity-0 group-hover/lock:opacity-100 transition-opacity z-50 w-max max-w-[180px] leading-snug">
                                  {isPickerSportFull(sport)
                                    ? 'Sport slot filled — no flex picks remaining'
                                    : 'Would prevent covering all required sports'}
                                </span>
                              </span>
                            )
                            : 'Available'}
                        </div>
                        <div className="flex items-center justify-center">
                          {canPick && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setPendingPick({ sport, team }); setShowPickConfirmation(true); }}
                              className="text-[11px] px-2 py-1 rounded font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors"
                            >
                              Draft
                            </button>
                          )}
                        </div>
                        <div className="flex items-center justify-center">
                          {!alreadyPicked && !isDraftComplete && !blocksRequiredSportCoverage && (
                            queueEntry ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); onRemoveFromQueue(queueEntry.id); }}
                                className="text-base leading-none hover:opacity-70 transition-opacity"
                                title={`#${queueEntry.rank} in queue — click to remove`}
                              >
                                ⭐
                              </button>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); onAddToQueue(sport, team); }}
                                className="text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 w-6 h-6 rounded flex items-center justify-center transition-colors font-bold text-base"
                                title="Add to queue"
                              >
                                +
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
                {draftGridRows.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-slate-500">
                    No options match your filters.
                  </div>
                )}
              </div>
              {draftGridRows.length > GRID_PAGE_SIZE && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setGridPage(p => Math.max(0, p - 1))}
                    disabled={gridPage === 0}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-slate-400">
                    Page {gridPage + 1} of {Math.ceil(draftGridRows.length / GRID_PAGE_SIZE)}
                  </span>
                  <button
                    onClick={() => setGridPage(p => Math.min(Math.ceil(draftGridRows.length / GRID_PAGE_SIZE) - 1, p + 1))}
                    disabled={gridPage >= Math.ceil(draftGridRows.length / GRID_PAGE_SIZE) - 1}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
            </>
            )}{/* end isDraftComplete ternary */}
          </div>
          </div>{/* end flex-1 main area */}

          {/* My Roster Sidebar */}
          <div className="hidden md:block w-64 shrink-0 overflow-y-auto py-8">
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-white text-sm">My Roster</h2>
                <span className="text-xs text-slate-400">
                  {myPicks.length} / {selectedLeague?.draftRounds || 8}
                </span>
              </div>

              {/* Required slots — first pick per sport */}
              {(selectedLeague?.sports || []).map(sport => {
                const sortedMyPicks = [...myPicks].sort((a, b) => a.pick_number - b.pick_number);
                const firstPick = sortedMyPicks.find(p => p.sport === sport);
                const isRequired = sportRequirementEnabled && !firstPick;
                return (
                  <div key={sport} className="mb-2">
                    <div className="flex items-center gap-2 mb-0.5">
                      <SportBadge sport={sport} size="sm" />
                      {isRequired && (
                        <span className="text-[10px] text-amber-400 font-semibold">required</span>
                      )}
                    </div>
                    {firstPick ? (
                      <div className="ml-1 text-xs text-slate-200 truncate py-0.5">{firstPick.team_name}</div>
                    ) : (
                      <div className="ml-1 text-xs text-slate-600 italic">— empty —</div>
                    )}
                  </div>
                );
              })}

              {/* FLEX slots — picks beyond first per sport */}
              {(() => {
                const sports = selectedLeague?.sports || [];
                const draftRounds = selectedLeague?.draftRounds || 8;
                const flexTotal = draftRounds - sports.length;
                if (flexTotal <= 0) return null;

                const sportsSeen = new Set();
                const flexPicksUsed = [];
                [...myPicks]
                  .sort((a, b) => a.pick_number - b.pick_number)
                  .forEach(p => {
                    if (sportsSeen.has(p.sport)) {
                      flexPicksUsed.push(p);
                    } else {
                      sportsSeen.add(p.sport);
                    }
                  });
                const flexEmpty = flexTotal - flexPicksUsed.length;

                return (
                  <div className="mt-3 pt-3 border-t border-slate-700/50">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                      Flex ({flexPicksUsed.length}/{flexTotal})
                    </div>
                    {flexPicksUsed.map(p => (
                      <div key={p.pick_number} className="flex items-center gap-1.5 mb-1.5">
                        <SportBadge sport={p.sport} size="sm" />
                        <span className="text-xs text-slate-200 truncate">{p.team_name}</span>
                      </div>
                    ))}
                    {Array.from({ length: flexEmpty }).map((_, i) => (
                      <div key={`flex-empty-${i}`} className="mb-1.5 ml-0.5 text-xs text-slate-600 italic">— empty —</div>
                    ))}
                  </div>
                );
              })()}

              {isDraftComplete && (
                <div className="mt-3 pt-3 border-t border-slate-700/50 text-xs text-emerald-400">
                  Draft complete
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile queue toggle bar */}
        <div className="md:hidden shrink-0 px-3 py-2 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700">
          <button
            onClick={() => setShowMobileQueue(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold transition-colors"
          >
            My Queue {(queue?.length || 0) > 0 ? `(${queue.length})` : '(empty)'} ▲
            {(queue?.length || 0) > 0 && draftSettings?.autoPickFromQueue && <span className="text-xs text-blue-400">[auto]</span>}
          </button>
        </div>

        {/* User Settings Modal */}
        {showUserSettings && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
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
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Draft Preferences</h3>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draftSettings?.autoPickFromQueue || false}
                        onChange={(e) => onUpdateDraftSettings({ autoPickFromQueue: e.target.checked })}
                        className="mt-0.5 rounded bg-slate-900 border-slate-600"
                      />
                      <div>
                        <div className="text-sm text-white">Auto-pick from queue</div>
                        <div className="text-xs text-slate-400 mt-0.5">Automatically selects my top available queue pick 5 seconds after it becomes my turn (this league only)</div>
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

        {/* Pick Confirmation Modal */}
        {showPickConfirmation && pendingPick && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-2xl max-w-md w-full border border-slate-700 shadow-2xl">
              <div className="p-6">
                <h2 className="text-2xl font-bold text-white mb-4">Confirm Your Pick</h2>
                <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
                  <div className="text-sm text-slate-400 mb-2">You are drafting:</div>
                  <div className="flex items-center gap-2 mb-2">
                    <SportBadge sport={pendingPick.sport} size="md" />
                  </div>
                  <div className="text-xl font-bold text-white">{pendingPick.team}</div>
                  {(() => {
                    const ep = getExpectedPoints(pendingPick.sport, pendingPick.team);
                    return ep !== null ? (
                      <div className="text-sm text-amber-400 mt-1">~{ep} EP</div>
                    ) : null;
                  })()}
                  {isCommissionerPickingForOther && (
                    <div className="mt-3 text-xs text-amber-300">
                      Commissioner action: this pick will be made for {currentPicker?.name || currentPicker?.email}.
                    </div>
                  )}
                </div>
                <p className="text-slate-300 text-sm mb-6">
                  Are you sure you want to make this pick? This action cannot be undone (unless the commissioner rolls back the draft).
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowPickConfirmation(false);
                      setPendingPick(null);
                    }}
                    className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      makePick(pendingPick.sport, pendingPick.team);
                      setShowPickConfirmation(false);
                      setPendingPick(null);
                    }}
                    disabled={isDraftComplete}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-semibold transition-all"
                  >
                    {isDraftComplete ? 'Draft Complete' : 'Confirm Pick'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rollback Draft Modal */}
        {showRollbackModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-2xl max-w-lg w-full border border-slate-700 shadow-2xl">
              <div className="p-6 border-b border-slate-700">
                <h2 className="text-2xl font-bold text-white">Roll Back Draft</h2>
                <p className="text-sm text-slate-400 mt-2">
                  Current spot: Round {effectiveCurrentRound}, Pick {currentPickInRound} (overall #{effectiveCurrentPick}).
                </p>
              </div>

              <div className="p-6 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setRollbackMode('target')}
                    className={`px-4 py-3 rounded-lg border text-sm font-semibold transition-all ${
                      rollbackMode === 'target'
                        ? 'border-blue-500 bg-blue-500/20 text-white'
                        : 'border-slate-700 bg-slate-900/50 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    Rollback to Round/Pick
                  </button>
                  <button
                    onClick={() => setRollbackMode('restart')}
                    className={`px-4 py-3 rounded-lg border text-sm font-semibold transition-all ${
                      rollbackMode === 'restart'
                        ? 'border-red-500 bg-red-500/20 text-white'
                        : 'border-slate-700 bg-slate-900/50 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    Restart Draft
                  </button>
                </div>

                {rollbackMode === 'target' && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm text-slate-300">
                      Round
                      <select
                        value={rollbackRound}
                        onChange={(e) => setRollbackRound(parseInt(e.target.value, 10))}
                        className="mt-1 w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-white"
                      >
                        {[...Array(maxRoundOption)].map((_, idx) => {
                          const round = idx + 1;
                          return <option key={`rollback-round-${round}`} value={round}>{round}</option>;
                        })}
                      </select>
                    </label>
                    <label className="text-sm text-slate-300">
                      Pick In Round
                      <select
                        value={rollbackPickInRound}
                        onChange={(e) => setRollbackPickInRound(parseInt(e.target.value, 10))}
                        className="mt-1 w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-white"
                      >
                        {[...Array(maxPickOptionForRound(rollbackRound))].map((_, idx) => {
                          const pick = idx + 1;
                          return <option key={`rollback-pick-${pick}`} value={pick}>{pick}</option>;
                        })}
                      </select>
                    </label>
                  </div>
                )}

                <div className="p-3 rounded-lg border border-slate-700 bg-slate-900/50 text-sm">
                  <div className="text-slate-300">
                    {rollbackMode === 'restart'
                      ? 'This will remove all draft picks and restart from Round 1, Pick 1.'
                      : `This will resume at Round ${rollbackRound}, Pick ${rollbackPickInRound} (overall #${computedRollbackTarget + 1}) and remove picks after #${computedRollbackTarget}.`
                    }
                  </div>
                  {!rollbackTargetValid && (
                    <div className="mt-2 text-amber-300">
                      Selected spot is ahead of current progress. Choose an earlier round/pick.
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-slate-700">
                {rollbackError && (
                  <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                    {rollbackError}
                  </div>
                )}
                <div className="flex gap-3">
                <button
                  onClick={() => { setShowRollbackModal(false); setRollbackError(''); }}
                  className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!rollbackTargetValid) return;
                    try {
                      await undoPickDB(computedRollbackTarget);
                      setShowRollbackModal(false);
                      setRollbackError('');
                    } catch (error) {
                      console.error('Error rolling back draft:', error);
                      setRollbackError('Failed to roll back draft. Please try again.');
                    }
                  }}
                  disabled={!rollbackTargetValid}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirm Rollback
                </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sports Modal */}
        {showSportsModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex flex-col justify-end md:items-center md:justify-center z-50 md:p-4">
            <div className="bg-slate-800 rounded-t-2xl md:rounded-2xl max-w-6xl w-full border border-slate-700 shadow-2xl h-[80vh] md:h-auto md:max-h-[90vh] flex flex-col">
              <div className="p-3 md:p-6 border-b border-slate-700 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-white">Sports</h2>
                  <p className="text-sm text-slate-400 mt-1">General catalog across all supported sports.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSportsModal(false)}
                    className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-700/50 rounded"
                  >
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
                      <option key={`sports-modal-filter-${sport}`} value={sport}>{getSportNameByCode(sport)}</option>
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
                      {sportsCatalogRows.map((row) => (
                        <div
                          key={`sports-modal-row-${row.sport}-${row.team}`}
                          className="grid grid-cols-[minmax(0,1fr)_90px_90px] md:grid-cols-[minmax(0,1fr)_120px_140px] gap-0 items-center px-3 py-2 border-b border-slate-700/40 text-left text-white bg-slate-900/65"
                        >
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
                      {sportsCatalogRows.length === 0 && (
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

      <RulesModal show={showRulesModal} onClose={() => setShowRulesModal(false)} />
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

      {/* Mobile queue bottom sheet */}
      {showMobileQueue && (
        <div className="md:hidden fixed inset-0 z-[60] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowMobileQueue(false)} />
          <div className="relative bg-slate-800 rounded-t-2xl max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 px-4 pt-4 pb-3 border-b border-slate-700 flex items-center justify-between rounded-t-2xl">
              <span className="font-semibold text-white">My Queue</span>
              <button onClick={() => setShowMobileQueue(false)} className="text-slate-400 hover:text-white transition-colors">✕</button>
            </div>
            <div className="p-4">
              {/* Queue content — same as sidebar */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">My Queue</span>
                  {(queue?.length || 0) > 0 && <span className="text-xs text-slate-400">({queue.length})</span>}
                </div>
                {(queue?.length || 0) > 0 && (
                  <button
                    onClick={() => setShowClearQueueConfirm(true)}
                    className="text-xs px-2 py-1 text-slate-400 hover:text-red-400 border border-slate-600/50 hover:border-red-500/50 rounded transition-colors"
                  >
                    Clear All ×
                  </button>
                )}
              </div>
              {queueError && (
                <div className="mb-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-xs">
                  Queue error: {queueError.message || String(queueError)} — try again
                </div>
              )}
              {!(queue?.length) ? (
                <div className="text-sm text-slate-500 italic text-center py-4">
                  — Queue empty — tap + on a team to add it
                </div>
              ) : (
                <div className="space-y-1">
                  {(() => {
                    const visibleQueue = queue.filter((item) => !(supabasePicks || []).some(
                      (p) => p.sport === item.sport && p.team_name === item.team
                    ));
                    return visibleQueue.map((item, idx) => {
                      const itemEp = getExpectedPoints(item.sport, item.team);
                      const canPickFromQueue = (
                        !isDraftComplete && isMyTurn &&
                        !isPickerSportFull(item.sport) &&
                        !wouldBreakRequiredSportAvailability(currentPicker?.email, item.sport, item.team)
                      );
                      return (
                        <div key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-600/30 bg-slate-800/40">
                          <span className="text-xs font-mono text-slate-400 w-5 shrink-0 text-center">{idx + 1}.</span>
                          <SportBadge sport={item.sport} className="shrink-0" />
                          <span className="flex-1 text-sm font-semibold truncate text-white">{item.team}</span>
                          {itemEp !== null && <span className="text-xs text-amber-400 shrink-0">~{itemEp} EP</span>}
                          {canPickFromQueue && (
                            <button
                              onClick={() => { setPendingPick({ sport: item.sport, team: item.team }); setShowPickConfirmation(true); setShowMobileQueue(false); }}
                              className="text-xs px-2 py-1 rounded bg-green-600 hover:bg-green-500 text-white font-semibold shrink-0"
                            >Draft</button>
                          )}
                          <button onClick={() => onRemoveFromQueue(item.id)} className="text-slate-400 hover:text-red-400 shrink-0 text-sm">✕</button>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
              {/* Auto-pick toggle */}
              <div className="mt-4 pt-3 border-t border-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!draftSettings?.autoPickFromQueue}
                    onChange={(e) => onUpdateDraftSettings({ autoPickFromQueue: e.target.checked })}
                    className="rounded bg-slate-900 border-slate-600"
                  />
                  <span className="text-sm text-slate-300">Auto-pick from queue</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    );
};

export default DraftView;
