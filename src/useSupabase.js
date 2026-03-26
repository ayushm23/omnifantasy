// useSupabase.js
// Drop-in hooks for Supabase integration
// Import this into your app and use these hooks instead of useState

import { useState, useEffect, useCallback } from 'react';
import {
  supabase,
  signInWithEmail,
  signUpWithEmail,
  signOut as signOutDB,
  getCurrentUser,
  resetPasswordForEmail,
  updatePassword,
  getIsAdmin,
  onAuthStateChange,
  createLeague as createLeagueDB,
  getMyLeagues,
  getDraftPicks,
  getDraftState as getDraftStateDB,
  getLeague as getLeagueDB,
  makePick as makePickDB,
  updateDraftState as updateDraftStateDB,
  startDraft as startDraftDB,
  deleteLeague as deleteLeagueDB,
  rollbackDraftToPick as rollbackDraftToPickDB,
  subscribeToDraftPicks,
  subscribeToDraftState,
  unsubscribe
} from './supabaseClient';
import { getPickerIndex, normalizeDraftPicker } from './utils/draft';

// ============ AUTH HOOK ============
export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState('');
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    // Check current session
    getCurrentUser().then(currentUser => {
      setUser(currentUser);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
      setUser(session?.user || null);
    });

    return () => subscription?.unsubscribe();
  }, []);

  const signIn = async (email, password) => {
    const { error } = await signInWithEmail(email, password);
    if (error) {
      throw error;
    }
    setAuthMessage('✅ Successfully logged in!');
    return { error: null };
  };

  const signUp = async (email, password, firstName, lastName) => {
    const { error } = await signUpWithEmail(email, password, firstName, lastName);
    if (error) {
      throw error;
    }
    setAuthMessage('✅ Account created! You can now log in.');
    return { error: null };
  };

  const signOut = async () => {
    await signOutDB();
    setUser(null);
    setAuthMessage(''); // Clear auth message on logout
  };

  const clearAuthMessage = () => {
    setAuthMessage('');
  };

  const sendPasswordReset = async (email) => {
    const { error } = await resetPasswordForEmail(email);
    if (error) throw error;
    setAuthMessage('✅ Password reset email sent! Check your inbox.');
  };

  const doUpdatePassword = async (newPassword) => {
    const { error } = await updatePassword(newPassword);
    if (error) throw error;
    setIsPasswordRecovery(false);
    setAuthMessage('✅ Password updated! You are now logged in.');
  };

  return { user, loading, authMessage, signIn, signUp, signOut, clearAuthMessage,
           isPasswordRecovery, sendPasswordReset, doUpdatePassword };
};

// ============ ADMIN HOOK ============
export const useAdmin = (userEmail) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!userEmail) {
      setIsAdmin(false);
      return;
    }
    setLoading(true);
    getIsAdmin(userEmail).then(({ data, error }) => {
      if (!active) return;
      if (error) console.error('Error checking admin status:', error);
      setIsAdmin(!!data);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [userEmail]);

  return { isAdmin, loading };
};

// ============ LEAGUES HOOK ============
export const useLeagues = (userEmail) => {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLeagues = useCallback(async () => {
    if (!userEmail) return;

    const { data, error } = await getMyLeagues(userEmail);
    if (error) {
      console.error('Error loading leagues:', error);
      setLoading(false);
      return;
    }

    if (!data) {
      setLeagues([]);
      setLoading(false);
      return;
    }

    // Transform to match app format
    const transformed = data.map(league => ({
      id: league.id,
      name: league.name,
      sports: league.sports || [],
      members: league.league_members?.length || 0,
      membersList: league.league_members?.map(m => ({
        id: m.id,
        email: m.email,
        name: m.name,
        status: m.status ?? 'accepted'
      })) || [],
      commissionerEmail: league.commissioner_email,
      draftRounds: league.draft_rounds,
      draftTimer: league.draft_timer,
      timerPauseStartHour: league.timer_pause_start_hour ?? 0,
      timerPauseEndHour: league.timer_pause_end_hour ?? 8,
      timerPauseEnabled: (league.timer_pause_start_hour ?? 0) !== (league.timer_pause_end_hour ?? 8),
      leagueEmoji: league.league_emoji || '🏆',
      sendOTCEmails: league.send_otc_emails,
      draftStarted: league.draft_started,
      status: league.status,
      draftDate: league.draft_date,
      sportsTotal: league.sports?.length || 0,
      sportsComplete: 0,
      myRank: 1,
      totalPoints: 0,
      myTeams: [],
      currentPickerEmail: null,
      draftComplete: false,
      allMembersAccepted: (league.league_members || []).every(m => (m.status ?? 'accepted') === 'accepted')
    }));

    // Batch fetch picks counts + draft states for all active leagues (2 queries total vs 2N)
    const activeLeagues = transformed.filter(l => l.draftStarted);
    if (activeLeagues.length > 0) {
      const activeLeagueIds = activeLeagues.map(l => l.id);
      try {
        const [picksResult, statesResult] = await Promise.all([
          supabase
            .from('draft_picks')
            .select('league_id')
            .in('league_id', activeLeagueIds),
          supabase
            .from('draft_state')
            .select('league_id, current_pick, current_round, draft_order, is_snake, third_round_reversal, pick_started_at')
            .in('league_id', activeLeagueIds),
        ]);

        // Build O(1) lookup maps from batch results
        const picksCountByLeague = {};
        for (const pick of (picksResult.data || [])) {
          picksCountByLeague[pick.league_id] = (picksCountByLeague[pick.league_id] || 0) + 1;
        }
        const stateByLeague = {};
        for (const state of (statesResult.data || [])) {
          stateByLeague[state.league_id] = state;
        }

        for (const league of activeLeagues) {
          const picksCount = picksCountByLeague[league.id] || 0;
          const totalExpectedPicks = (league.members || 0) * (league.draftRounds || 0);
          const isDraftComplete = totalExpectedPicks > 0 && picksCount >= totalExpectedPicks;
          league.draftComplete = isDraftComplete;

          if (isDraftComplete) {
            league.currentPickerEmail = null;
            continue;
          }

          const stateData = stateByLeague[league.id];
          if (stateData?.draft_order && stateData.draft_order.length > 0) {
            const numMembers = stateData.draft_order.length;
            const pickerIndex = getPickerIndex({
              currentPick: stateData.current_pick,
              currentRound: stateData.current_round,
              numMembers,
              isSnake: stateData.is_snake,
              thirdRoundReversal: stateData.third_round_reversal
            });
            const picker = normalizeDraftPicker(stateData.draft_order[pickerIndex]);
            league.currentPickerEmail = picker?.email || null;
            league.pickStartedAt = stateData.pick_started_at || null;
            league.draftCurrentPick = stateData.current_pick;
            league.draftCurrentRound = stateData.current_round;
            league.draftOrder = stateData.draft_order;
            league.isSnake = stateData.is_snake;
            league.thirdRoundReversal = stateData.third_round_reversal;
          }
        }
      } catch (e) {
        console.error('Error fetching draft states:', e);
      }
    }

    setLeagues(transformed);
    setLoading(false);
  }, [userEmail]);

  useEffect(() => {
    loadLeagues();
  }, [loadLeagues]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadLeagues();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [loadLeagues]);

  const createLeague = async (leagueData) => {
    const { data, error } = await createLeagueDB(leagueData);
    if (error) throw error;
    await loadLeagues();
    return data;
  };

  const deleteLeague = async (leagueId) => {
    const { error } = await deleteLeagueDB(leagueId);
    if (error) throw error;
    await loadLeagues();
  };

  return { leagues, loading, createLeague, deleteLeague, reload: loadLeagues };
};

// ============ DRAFT HOOK ============
export const useDraft = (leagueId) => {
  const [draftState, setDraftState] = useState(null);
  const [picks, setPicks] = useState([]);
  const [maxPicks, setMaxPicks] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueId) return;

    const loadDraft = async () => {
      // Load picks
      const { data: picksData } = await getDraftPicks(leagueId);
      setPicks(picksData || []);

      // Load state
      const { data: stateData } = await getDraftStateDB(leagueId);
      const { data: leagueData } = await getLeagueDB(leagueId);
      if (stateData) {
        const orderSize = stateData.draft_order?.length || 0;
        const rounds = leagueData?.draft_rounds || 0;
        setMaxPicks(orderSize > 0 && rounds > 0 ? orderSize * rounds : null);

        setDraftState({
          currentPick: stateData.current_pick,
          currentRound: stateData.current_round,
          draftOrder: stateData.draft_order,
          isSnake: stateData.is_snake,
          thirdRoundReversal: stateData.third_round_reversal,
          draftEverySportRequired: stateData.draft_every_sport_required !== false,
          pickStartedAt: stateData.pick_started_at,
          picks: picksData || []
        });
      }
      setLoading(false);
    };

    loadDraft();

    // Re-fetch whenever the tab becomes visible — catches stale state from
    // backgrounded tabs where the WebSocket was silently dropped.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadDraft();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Re-fetch if a channel recovers after being disconnected (e.g. brief
    // network interruption while the tab is active).
    let channelWasLost = false;
    const handleStatus = (status) => {
      if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        channelWasLost = true;
      } else if (status === 'SUBSCRIBED' && channelWasLost) {
        channelWasLost = false;
        loadDraft();
      }
    };

    const picksSub = subscribeToDraftPicks(leagueId, () => loadDraft(), handleStatus);
    const stateSub = subscribeToDraftState(leagueId, () => loadDraft(), handleStatus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      unsubscribe(picksSub);
      unsubscribe(stateSub);
    };
  }, [leagueId]);

  const startDraft = async (draftOrder, options = {}) => {
    const { error } = await startDraftDB(leagueId, draftOrder, options);
    if (error) throw error;
  };

  const makePick = async (pickData) => {
    if (maxPicks && (picks.length >= maxPicks || draftState?.currentPick > maxPicks)) {
      throw new Error('Draft is complete');
    }

    const { error: pickError } = await makePickDB(pickData);
    if (pickError) throw pickError;

    // Update state
    if (!draftState) return; // pick inserted; state will refresh via real-time subscription
    const nextPick = draftState.currentPick + 1;
    const members = draftState.draftOrder.length;
    const nextRound = Math.ceil(nextPick / members);

    const { error: stateError } = await updateDraftStateDB(leagueId, {
      current_pick: nextPick,
      current_round: nextRound,
      pick_started_at: new Date().toISOString(),
    }, draftState.currentPick);

    if (stateError) console.error(stateError);
  };

  const undoPick = async (targetPickNumber = null) => {
    const resolvedTarget = targetPickNumber == null
      ? Math.max(0, (draftState?.currentPick || 1) - 2)
      : Math.max(0, Math.floor(Number(targetPickNumber)));

    const { error } = await rollbackDraftToPickDB(leagueId, resolvedTarget);
    if (error) throw error;

    // Update state
    const newPick = resolvedTarget + 1;
    const members = Math.max(1, draftState?.draftOrder?.length || 1);
    const newRound = Math.ceil(newPick / members);

    await updateDraftStateDB(leagueId, {
      current_pick: newPick,
      current_round: newRound,
      pick_started_at: new Date().toISOString(),
    });
  };

  return { draftState, picks, loading, startDraft, makePick, undoPick };
};
