// useAutoPickLogic.js
// Encapsulates both auto-pick effects:
//
//   1. Timer-expiry auto-pick — fires when `timerExpired` becomes true.
//      Fetches the current picker's queue; falls back to highest-EP available pick.
//      Commissioner auto-picks for any member as a failsafe.
//
//   2. Immediate auto-pick — fires when `currentPick` advances (or on page load)
//      and an auto-pick mode is enabled for the current user.
//      - Queue-only mode: queue only (no EP fallback).
//      - General mode: queue first, then EP fallback.
//      Picks immediately — no countdown delay.

import { useEffect, useRef } from 'react';
import { getCurrentPickerFromState, normalizeDraftPicker, wouldBreakSportCoverage } from '../utils/draft';
import { getPickerQueue, sendOtcEmail } from '../supabaseClient';

export function useAutoPickLogic({
  currentView,
  timerExpired,
  setTimerExpired,
  supabaseDraftState,
  selectedLeague,
  selectedLeagueId,
  supabasePicks,
  currentUser,
  queue,           // current user's local queue (for immediate auto-pick)
  draftSettings,   // { autoPickFromQueue: bool }
  makePickDB,
  getDraftPoolForSport,
  expectedPoints,
}) {
  const lastAutoPickKeyRef = useRef(null);
  const prevCurrentPickRef = useRef(null);
  const prevQueueSizeRef = useRef(queue?.length || 0);

  // Refs kept in sync every render so Effect 2 always reads the latest values.
  // Effect 2's dep array is intentionally minimal (currentPick/currentRound only)
  // so it only fires when the pick advances — not on every re-render.
  const draftSettingsRef       = useRef(draftSettings);
  const queueRef               = useRef(queue);
  const currentViewRef         = useRef(currentView);
  const currentUserRef         = useRef(currentUser);
  const supabasePicksRef       = useRef(supabasePicks);
  const selectedLeagueRef      = useRef(selectedLeague);
  const selectedLeagueIdRef    = useRef(selectedLeagueId);
  const makePickDBRef          = useRef(makePickDB);
  const supabaseDraftStateRef  = useRef(supabaseDraftState);
  const getDraftPoolForSportRef = useRef(getDraftPoolForSport);
  const expectedPointsRef      = useRef(expectedPoints);

  draftSettingsRef.current       = draftSettings;
  queueRef.current               = queue;
  currentViewRef.current         = currentView;
  currentUserRef.current         = currentUser;
  supabasePicksRef.current       = supabasePicks;
  selectedLeagueRef.current      = selectedLeague;
  selectedLeagueIdRef.current    = selectedLeagueId;
  makePickDBRef.current          = makePickDB;
  supabaseDraftStateRef.current  = supabaseDraftState;
  getDraftPoolForSportRef.current = getDraftPoolForSport;
  expectedPointsRef.current      = expectedPoints;

  // ─── helpers ────────────────────────────────────────────────────────────────

  const wouldBreakRequiredSportAvailability = (pickerEmail, sport, team, league, draftSt, picks) =>
    wouldBreakSportCoverage({
      sportRequirementEnabled: draftSt?.draftEverySportRequired !== false,
      leagueSports: league?.sports,
      pool: getDraftPoolForSport(sport),
      draftEmails: (draftSt?.draftOrder || [])
        .map(m => normalizeDraftPicker(m)?.email?.toLowerCase())
        .filter(Boolean),
      picks,
      pickerEmail,
      sport,
      team,
    });

  // Returns the first valid queue item for a picker, or null if none are available.
  const getQueueAutopick = (pickerQueue, picks, league, draftSt, pickerEmail) => {
    if (!pickerQueue || pickerQueue.length === 0) return null;
    const pickedSet = new Set((picks || []).map(p => `${p.sport}::${p.team_name}`));

    // Mirror DraftView's isPickerSportFull: skip sports the picker already has when no flex picks remain.
    const pickerPicks = (picks || []).filter(p => p.picker_email?.toLowerCase() === pickerEmail?.toLowerCase());
    const sportReqEnabled = draftSt?.draftEverySportRequired !== false;
    const missingSports = (league?.sports || []).filter(s => !pickerPicks.some(p => p.sport === s));
    const draftRounds = league?.draftRounds || 0;
    const pickerFlexRemaining = Math.max(
      0,
      draftRounds - pickerPicks.length - (sportReqEnabled ? missingSports.length : 0),
    );
    const pickerCoveredSports = new Set(pickerPicks.map(p => p.sport));

    for (const item of pickerQueue) {
      if (pickedSet.has(`${item.sport}::${item.team}`)) continue;
      if (pickerFlexRemaining <= 0 && pickerCoveredSports.has(item.sport)) continue;
      if (wouldBreakRequiredSportAvailability(pickerEmail, item.sport, item.team, league, draftSt, picks)) continue;
      return { sport: item.sport, team: item.team };
    }
    return null;
  };

  // Builds the list of valid candidate picks for a picker, respecting sport
  // coverage requirements and already-picked teams.
  const buildCandidates = (pickerEmail, picks, league, draftSt, getDraftPool, epMap) => {
    const pickerEmailLower = pickerEmail.toLowerCase();
    const pickerPicks = (picks || []).filter(
      p => p.picker_email?.toLowerCase() === pickerEmailLower
    );
    const sportRequirementEnabled = draftSt?.draftEverySportRequired !== false;
    const missingRequiredSports = (league?.sports || []).filter(
      sport => !pickerPicks.some(p => p.sport === sport)
    );
    const candidateSports = (sportRequirementEnabled && missingRequiredSports.length > 0)
      ? missingRequiredSports
      : (league?.sports || []);

    // Mirror DraftView's isPickerSportFull: skip sports the picker already has when no flex picks remain.
    const draftRounds = league?.draftRounds || 0;
    const pickerFlexRemaining = Math.max(
      0,
      draftRounds - pickerPicks.length - (sportRequirementEnabled ? missingRequiredSports.length : 0),
    );
    const pickerCoveredSports = new Set(pickerPicks.map(p => p.sport));

    const pickedSet = new Set((picks || []).map(p => `${p.sport}::${p.team_name}`));
    const candidates = [];
    for (const sport of candidateSports) {
      if (pickerFlexRemaining <= 0 && pickerCoveredSports.has(sport)) continue;
      const teams = getDraftPool(sport) || [];
      for (const team of teams) {
        if (pickedSet.has(`${sport}::${team}`)) continue;
        if (wouldBreakSportCoverage({
          sportRequirementEnabled,
          leagueSports: league?.sports,
          pool: getDraftPool(sport),
          draftEmails: (draftSt?.draftOrder || [])
            .map(m => normalizeDraftPicker(m)?.email?.toLowerCase())
            .filter(Boolean),
          picks,
          pickerEmail,
          sport,
          team,
        })) continue;
        candidates.push({ sport, team, ep: epMap?.[sport]?.[team] ?? null });
      }
    }
    return candidates;
  };

  // ─── Effect 1: Timer-expiry auto-pick ───────────────────────────────────────
  useEffect(() => {
    const runAutoPick = async () => {
      if (!timerExpired) return;
      if (currentView !== 'draft') return;
      if (!selectedLeague || !supabaseDraftState) return;
      if (!selectedLeague?.draftTimer || selectedLeague.draftTimer === 'none') return;

      const totalPicks = (selectedLeague.members || 0) * (selectedLeague.draftRounds || 0);
      if (totalPicks > 0 && (supabasePicks?.length || 0) >= totalPicks) {
        setTimerExpired(false);
        return;
      }

      const draftOrder = (supabaseDraftState.draftOrder || [])
        .map(entry => normalizeDraftPicker(entry))
        .filter(Boolean);
      if (draftOrder.length === 0) return;

      const effectiveState = {
        currentPick: supabaseDraftState.currentPick || ((supabasePicks?.length || 0) + 1),
        currentRound: supabaseDraftState.currentRound || 1,
        draftOrder,
        isSnake: supabaseDraftState.isSnake ?? true,
        thirdRoundReversal: !!supabaseDraftState.thirdRoundReversal,
      };
      const currentPicker = getCurrentPickerFromState(effectiveState);
      if (!currentPicker?.email) return;

      const isMyTurn = currentPicker.email.toLowerCase() === currentUser?.email?.toLowerCase();
      const isCommissioner = selectedLeague.commissionerEmail?.toLowerCase() === currentUser?.email?.toLowerCase();
      if (!isMyTurn && !isCommissioner) return;

      const autoPickKey = `${selectedLeague.id}:${effectiveState.currentPick}:${supabaseDraftState.pickStartedAt || ''}`;
      if (lastAutoPickKeyRef.current === autoPickKey) return;

      const candidates = buildCandidates(
        currentPicker.email, supabasePicks, selectedLeague, supabaseDraftState,
        getDraftPoolForSport, expectedPoints
      );

      if (candidates.length === 0) {
        setTimerExpired(false);
        return;
      }

      let chosen = null;
      try {
        const { data: pickerQueueData } = await getPickerQueue(selectedLeagueId, currentPicker.email);
        chosen = getQueueAutopick(pickerQueueData || [], supabasePicks, selectedLeague, supabaseDraftState, currentPicker.email);
      } catch {
        // Queue fetch failed — fall through to EP logic
      }

      if (!chosen) {
        const withEp = candidates.filter(c => c.ep != null);
        chosen = withEp.length > 0
          ? withEp.sort((a, b) => b.ep - a.ep)[0]
          : candidates[0];
      }

      try {
        lastAutoPickKeyRef.current = autoPickKey;
        await makePickDB({
          league_id: selectedLeagueId,
          pick_number: effectiveState.currentPick,
          round: effectiveState.currentRound,
          picker_email: currentPicker.email,
          picker_name: currentPicker.name || currentPicker.email.split('@')[0] || 'Unknown',
          sport: chosen.sport,
          team: chosen.team,
          team_name: chosen.team,
        });
        setTimeout(() => sendOtcEmail(selectedLeagueId), 1500);
      } catch {
        lastAutoPickKeyRef.current = null;
      } finally {
        setTimerExpired(false);
      }
    };

    runAutoPick();
  }, [
    timerExpired,
    currentView,
    selectedLeague,
    supabaseDraftState,
    supabasePicks,
    currentUser?.email,
    selectedLeagueId,
    makePickDB,
    getDraftPoolForSport,
    expectedPoints,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Effect 2: Immediate auto-pick when it's the user's turn ─────────────────
  // Fires when currentPick changes (real-time subscription) AND on page load
  // (prevCurrentPickRef starts null so null !== currentPick is always true).
  // All values read via refs so the effect never needs to re-subscribe just
  // because league/queue/settings changed — only currentPick/currentRound matter.
  useEffect(() => {
    const runImmediateAutoPick = async () => {
      const currentPick = supabaseDraftStateRef.current?.currentPick;
      const autoPickQueue = !!draftSettingsRef.current?.autoPickFromQueue;
      const autoPickGeneral = !!draftSettingsRef.current?.autoPickGeneral;
      const autoPickMode = autoPickGeneral ? 'general' : (autoPickQueue ? 'queue' : 'off');

      // Fire if pick advanced OR queue size changed (item added while already on the clock).
      // null !== currentPick is true on mount, so the page-load case fires.
      // Toggling auto-pick settings mid-turn does NOT immediately fire — takes effect next turn.
      const pickAdvanced = prevCurrentPickRef.current !== currentPick;
      const queueSize = queueRef.current?.length || 0;
      const queueChanged = queueSize !== prevQueueSizeRef.current;
      if (queueChanged) prevQueueSizeRef.current = queueSize;
      if (!pickAdvanced && !queueChanged) return;
      if (pickAdvanced) prevCurrentPickRef.current = currentPick ?? null;

      const draftState = supabaseDraftStateRef.current;
      const user       = currentUserRef.current;

      if (
        currentViewRef.current !== 'draft' ||
        !draftState ||
        !user ||
        autoPickMode === 'off' ||
        draftState.isDraftComplete
      ) return;

      const draftOrder = (draftState.draftOrder || [])
        .map(e => normalizeDraftPicker(e)).filter(Boolean);
      const picker = getCurrentPickerFromState({ ...draftState, draftOrder });
      if (picker?.email?.toLowerCase() !== user.email?.toLowerCase()) return;

      const autoPickKey = `${selectedLeagueIdRef.current}:${draftState.currentPick}:${draftState.pickStartedAt || ''}`;
      if (lastAutoPickKeyRef.current === autoPickKey) return;

      const picks  = supabasePicksRef.current;
      const league = selectedLeagueRef.current;

      const queuePick = getQueueAutopick(queueRef.current, picks, league, draftState, user.email);
      if (!queuePick && autoPickMode === 'queue') return;

      let chosen = queuePick;
      if (!chosen) {
        const candidates = buildCandidates(
          user.email, picks, league, draftState,
          getDraftPoolForSportRef.current, expectedPointsRef.current
        );
        if (candidates.length === 0) return;
        const withEp = candidates.filter(c => c.ep != null);
        chosen = withEp.length > 0
          ? withEp.sort((a, b) => b.ep - a.ep)[0]
          : candidates[0];
      }

      try {
        lastAutoPickKeyRef.current = autoPickKey;
        await makePickDBRef.current({
          league_id: selectedLeagueIdRef.current,
          pick_number: draftState.currentPick,
          round: draftState.currentRound || 1,
          picker_email: user.email,
          picker_name: user.user_metadata?.display_name || user.email.split('@')[0] || 'Unknown',
          sport: chosen.sport,
          team: chosen.team,
          team_name: chosen.team,
        });
        setTimeout(() => sendOtcEmail(selectedLeagueIdRef.current), 1500);
      } catch {
        lastAutoPickKeyRef.current = null;
      }
    };

    runImmediateAutoPick();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseDraftState?.currentPick, supabaseDraftState?.currentRound, queue?.length]);

  return {};
}
