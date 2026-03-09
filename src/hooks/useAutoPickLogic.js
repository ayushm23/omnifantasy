// useAutoPickLogic.js
// Encapsulates both auto-pick effects that were previously in omnifantasy-app.jsx:
//
//   1. Timer-expiry auto-pick — fires when `timerExpired` becomes true.
//      Fetches the current picker's queue; falls back to highest-EP available pick.
//      Commissioner auto-picks for any member as a failsafe.
//
//   2. Immediate queue auto-pick — 5-second countdown triggered when
//      `currentPick` advances and `autoPickFromQueue` is enabled for the user.
//
// Returns { cancelAutoPickCountdown } so the caller can cancel the 5-second
// countdown (e.g. when the user makes a manual pick).

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
  const autoPickCountdownRef = useRef(null);
  const prevCurrentPickRef = useRef(null);

  // ─── helpers ────────────────────────────────────────────────────────────────

  const getEP = (sport, team) => expectedPoints?.[sport]?.[team] ?? null;

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
    for (const item of pickerQueue) {
      if (pickedSet.has(`${item.sport}::${item.team}`)) continue;
      if (wouldBreakRequiredSportAvailability(pickerEmail, item.sport, item.team, league, draftSt, picks)) continue;
      return { sport: item.sport, team: item.team };
    }
    return null;
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

      const pickerEmailLower = currentPicker.email.toLowerCase();
      const pickerPicks = (supabasePicks || []).filter(
        p => p.picker_email?.toLowerCase() === pickerEmailLower
      );

      const sportRequirementEnabled = supabaseDraftState?.draftEverySportRequired !== false;
      const missingRequiredSports = (selectedLeague.sports || []).filter(
        sport => !pickerPicks.some(p => p.sport === sport)
      );
      const candidateSports = (sportRequirementEnabled && missingRequiredSports.length > 0)
        ? missingRequiredSports
        : (selectedLeague.sports || []);

      const pickedSet = new Set((supabasePicks || []).map(p => `${p.sport}::${p.team_name}`));
      const candidates = [];
      for (const sport of candidateSports) {
        const teams = getDraftPoolForSport(sport) || [];
        for (const team of teams) {
          if (pickedSet.has(`${sport}::${team}`)) continue;
          if (wouldBreakRequiredSportAvailability(currentPicker.email, sport, team, selectedLeague, supabaseDraftState, supabasePicks)) continue;
          candidates.push({ sport, team, ep: getEP(sport, team) });
        }
      }

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
        sendOtcEmail(selectedLeagueId); // fire-and-forget
      } catch {
        // Clear the key so a retry attempt can fire on the next timerExpired cycle
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

  // ─── Effect 2: Immediate queue auto-pick (5-second countdown) ────────────────
  useEffect(() => {
    const currentPick = supabaseDraftState?.currentPick;

    // Only trigger when currentPick actually advances (not on initial mount)
    if (prevCurrentPickRef.current !== null && prevCurrentPickRef.current !== currentPick) {
      clearTimeout(autoPickCountdownRef.current);

      const shouldFire = (
        currentView === 'draft' &&
        supabaseDraftState &&
        currentUser &&
        draftSettings?.autoPickFromQueue &&
        !supabaseDraftState.isDraftComplete
      );

      if (shouldFire) {
        const draftOrder = (supabaseDraftState.draftOrder || [])
          .map(e => normalizeDraftPicker(e)).filter(Boolean);
        const picker = getCurrentPickerFromState({ ...supabaseDraftState, draftOrder });
        const isMyTurn = picker?.email?.toLowerCase() === currentUser.email?.toLowerCase();

        if (isMyTurn) {
          const queuePick = getQueueAutopick(queue, supabasePicks, selectedLeague, supabaseDraftState, currentUser.email);
          if (queuePick) {
            autoPickCountdownRef.current = setTimeout(async () => {
              // Re-validate at fire time in case queue changed
              const finalPick = getQueueAutopick(queue, supabasePicks, selectedLeague, supabaseDraftState, currentUser.email);
              if (!finalPick || currentView !== 'draft') return;
              const effectivePick = supabaseDraftState.currentPick || ((supabasePicks?.length || 0) + 1);
              const effectiveRound = supabaseDraftState.currentRound || 1;
              try {
                await makePickDB({
                  league_id: selectedLeagueId,
                  pick_number: effectivePick,
                  round: effectiveRound,
                  picker_email: currentUser.email,
                  picker_name: currentUser.user_metadata?.display_name || currentUser.email.split('@')[0] || 'Unknown',
                  sport: finalPick.sport,
                  team: finalPick.team,
                  team_name: finalPick.team,
                });
                sendOtcEmail(selectedLeagueId); // fire-and-forget
              } catch {
                // Pick failed (race condition or validation) — ignore
              }
            }, 5000);
          }
        }
      }
    }

    prevCurrentPickRef.current = currentPick ?? null;

    return () => {
      // Cleanup on unmount or re-run, but don't clear the timer ref here —
      // it's cleared explicitly when currentPick changes.
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseDraftState?.currentPick, supabaseDraftState?.currentRound]);

  const cancelAutoPickCountdown = () => {
    clearTimeout(autoPickCountdownRef.current);
    autoPickCountdownRef.current = null;
  };

  return { cancelAutoPickCountdown };
}
