// supabaseClient.js
// Supabase client configuration for OmniFantasy

import { createClient } from '@supabase/supabase-js';
import { AVAILABLE_SPORTS, TEAM_POOLS, getSportNameByCode } from './config/sports';
import { wouldBreakSportCoverage, normalizeDraftPicker } from './utils/draft';

// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.
// Get them from: https://app.supabase.com/project/YOUR_PROJECT/settings/api
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper functions for database operations

// ============ AUTH FUNCTIONS ============

export const signUpWithEmail = async (email, password, firstName, lastName) => {
  const displayName = `${firstName} ${lastName}`.trim();
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        display_name: displayName,
      }
    }
  });
  return { data, error };
};

export const signInWithEmail = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });
  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// Update global user metadata (e.g. receive_otc_emails).
// Merges into existing metadata; onAuthStateChange will refresh currentUser automatically.
export const updateUserMetadata = async (metadata) => {
  const { data, error } = await supabase.auth.updateUser({ data: metadata });
  return { data, error };
};

export const onAuthStateChange = (callback) => {
  return supabase.auth.onAuthStateChange(callback);
};

// ============ LEAGUE FUNCTIONS ============

export const createLeague = async (leagueData) => {
  if ((leagueData.membersList?.length || 0) > 20) {
    return { data: null, error: new Error('League can have at most 20 total members including commissioner.') };
  }

  // Insert league
  const { data: league, error: leagueError } = await supabase
    .from('leagues')
    .insert([{
      name: leagueData.name,
      commissioner_email: leagueData.commissionerEmail,
      sports: leagueData.sports,
      draft_rounds: leagueData.draftRounds,
      draft_timer: leagueData.draftTimer,
      draft_date: leagueData.draftDate,
      league_emoji: leagueData.leagueEmoji || '🏆',
    }])
    .select()
    .single();

  if (leagueError) return { data: null, error: leagueError };

  // Insert league members — commissioner auto-accepted, others pending
  const commissionerEmail = leagueData.commissionerEmail?.toLowerCase();
  const members = leagueData.membersList.map((member, index) => ({
    league_id: league.id,
    email: member.email,
    name: member.name,
    draft_position: index,
    status: member.email?.toLowerCase() === commissionerEmail ? 'accepted' : 'pending',
  }));

  const { error: membersError } = await supabase
    .from('league_members')
    .insert(members);

  if (membersError) return { data: null, error: membersError };

  return { data: league, error: null };
};

export const getMyLeagues = async (userEmail) => {
  const { data, error } = await supabase
    .from('leagues')
    .select(`
      *,
      league_members (
        id,
        email,
        name,
        draft_position,
        status
      )
    `)
    .order('created_at', { ascending: false });

  // Filter client-side since RLS now allows viewing all leagues
  // Only show leagues where user is commissioner or a member
  if (data && !error) {
    const filtered = data.filter(league => {
      const isCommissioner = league.commissioner_email === userEmail;
      const isMember = league.league_members?.some(m => m.email === userEmail);
      return isCommissioner || isMember;
    });
    return { data: filtered, error: null };
  }

  return { data, error };
};

export const getLeague = async (leagueId) => {
  const { data, error } = await supabase
    .from('leagues')
    .select(`
      *,
      league_members (
        email,
        name,
        draft_position
      )
    `)
    .eq('id', leagueId)
    .single();

  return { data, error };
};

export const updateLeague = async (leagueId, updates) => {
  const { data, error } = await supabase
    .from('leagues')
    .update(updates)
    .eq('id', leagueId)
    .select()
    .single();

  return { data, error };
};

export const deleteLeague = async (leagueId) => {
  const { error } = await supabase
    .from('leagues')
    .delete()
    .eq('id', leagueId);

  return { error };
};

// ============ DRAFT FUNCTIONS ============

export const startDraft = async (leagueId, draftOrder, options = {}) => {
  // Update league to mark draft started and set draft date
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const { error: leagueError } = await supabase
    .from('leagues')
    .update({
      draft_started: true,
      draft_date: dateStr
    })
    .eq('id', leagueId);

  if (leagueError) return { error: leagueError };

  // Create draft state
  const { data, error } = await supabase
    .from('draft_state')
    .insert([{
      league_id: leagueId,
      current_pick: 1,
      current_round: 1,
      draft_order: draftOrder,
      is_snake: true,
      third_round_reversal: !!options.thirdRoundReversal,
      draft_every_sport_required: options.draftEverySportRequired !== false,
      pick_started_at: new Date().toISOString()
    }])
    .select()
    .single();

  return { data, error };
};

export const getDraftState = async (leagueId) => {
  const { data, error } = await supabase
    .from('draft_state')
    .select('*')
    .eq('league_id', leagueId)
    .single();

  return { data, error };
};

export const updateDraftState = async (leagueId, updates) => {
  const { data, error } = await supabase
    .from('draft_state')
    .update(updates)
    .eq('league_id', leagueId)
    .select()
    .single();

  return { data, error };
};

export const makePick = async (pickData) => {
  try {
    const leagueId = pickData?.league_id;
    if (leagueId) {
      const [{ data: stateData }, { data: leagueData }, { count: picksCount }, { data: existingPicks }] = await Promise.all([
        supabase
          .from('draft_state')
          .select('draft_order, draft_every_sport_required')
          .eq('league_id', leagueId)
          .single(),
        supabase
          .from('leagues')
          .select('draft_rounds, sports')
          .eq('id', leagueId)
          .single(),
        supabase
          .from('draft_picks')
          .select('id', { count: 'exact', head: true })
          .eq('league_id', leagueId),
        supabase
          .from('draft_picks')
          .select('sport, team_name, picker_email')
          .eq('league_id', leagueId)
      ]);

      const orderSize = stateData?.draft_order?.length || 0;
      const rounds = leagueData?.draft_rounds || 0;
      const maxPicks = orderSize > 0 && rounds > 0 ? orderSize * rounds : null;

      if (maxPicks && ((picksCount || 0) >= maxPicks || (pickData.pick_number || 0) > maxPicks)) {
        return { data: null, error: new Error('Draft is complete') };
      }

      const sportRequirementEnabled = stateData?.draft_every_sport_required !== false;
      const sport = pickData?.sport;
      const team = pickData?.team_name || pickData?.team;
      const pickerEmailLower = pickData?.picker_email?.toLowerCase();
      if (sport && team && pickerEmailLower) {
        const sportName = getSportNameByCode(sport, AVAILABLE_SPORTS);
        const pool = TEAM_POOLS[sportName] || [];
        const draftEmails = (stateData?.draft_order || [])
          .map(m => normalizeDraftPicker(m)?.email?.toLowerCase())
          .filter(Boolean);
        if (wouldBreakSportCoverage({
          sportRequirementEnabled,
          leagueSports: leagueData?.sports,
          pool,
          draftEmails,
          picks: existingPicks || [],
          pickerEmail: pickerEmailLower,
          sport,
          team,
        })) {
          return { data: null, error: new Error('Pick blocked: this would leave too few teams in that sport for required picks.') };
        }
      }
    }
  } catch (guardError) {
    // If guard lookup fails, fall through to normal insert behavior.
  }

  const { data, error } = await supabase
    .from('draft_picks')
    .insert([pickData])
    .select()
    .single();

  return { data, error };
};

export const getDraftPicks = async (leagueId) => {
  const { data, error } = await supabase
    .from('draft_picks')
    .select('*')
    .eq('league_id', leagueId)
    .order('pick_number', { ascending: true });

  return { data, error };
};

export const rollbackDraftToPick = async (leagueId, targetPickNumber) => {
  const normalizedTarget = Number.isFinite(Number(targetPickNumber))
    ? Math.max(0, Math.floor(Number(targetPickNumber)))
    : NaN;

  if (!Number.isInteger(normalizedTarget) || normalizedTarget < 0) {
    return { data: null, error: new Error('Invalid rollback target pick number') };
  }

  if (normalizedTarget === 0) {
    const { error } = await supabase
      .from('draft_picks')
      .delete()
      .eq('league_id', leagueId);
    return { data: { rolledBackTo: 0 }, error };
  }

  const { error } = await supabase
    .from('draft_picks')
    .delete()
    .eq('league_id', leagueId)
    .gt('pick_number', normalizedTarget);

  return { data: { rolledBackTo: normalizedTarget }, error };
};

// ============ ODDS CACHE FUNCTIONS ============

export const getOddsCache = async (sportCode) => {
  const { data, error } = await supabase
    .from('odds_cache')
    .select('*')
    .eq('sport_code', sportCode)
    .single();

  return { data, error };
};

export const upsertOddsCache = async (sportCode, oddsData) => {
  const { data, error } = await supabase
    .from('odds_cache')
    .upsert({
      sport_code: sportCode,
      data: oddsData,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'sport_code' })
    .select()
    .single();

  return { data, error };
};

// ─── EP History ──────────────────────────────────────────────────────────────

// Insert a new EP snapshot for a sport.
// snapshotData: { 'Team Name': epValue, ... } — all teams for this sport at this moment.
export const insertEPHistory = async (sportCode, snapshotData) =>
  supabase.from('ep_history')
    .insert([{ sport_code: sportCode, snapshot_data: snapshotData }]);

// Fetch EP history snapshots for a sport, going back limitDays days.
// Returns rows ordered oldest-first (for charting).
export const getEPHistory = async (sportCode, limitDays = 180) => {
  const cutoff = new Date(Date.now() - limitDays * 24 * 60 * 60 * 1000).toISOString();
  return supabase.from('ep_history')
    .select('snapshot_data, captured_at')
    .eq('sport_code', sportCode)
    .gte('captured_at', cutoff)
    .order('captured_at', { ascending: true });
};

// ============ RESULTS CACHE FUNCTIONS ============

export const getResultsCache = async (sportCode, season) => {
  const { data, error } = await supabase
    .from('sport_results')
    .select('*')
    .eq('sport_code', sportCode)
    .eq('season', season)
    .single();
  return { data, error };
};

export const upsertResultsCache = async (sportCode, season, results) => {
  const { data, error } = await supabase
    .from('sport_results')
    .upsert({
      sport_code: sportCode,
      season,
      results,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'sport_code,season' })
    .select()
    .single();
  return { data, error };
};

// ============ DRAFT QUEUE FUNCTIONS ============

export const getDraftQueue = async (leagueId, userEmail) => {
  const { data, error } = await supabase
    .from('draft_queue')
    .select('*')
    .eq('league_id', leagueId)
    .eq('user_email', userEmail)
    .order('position', { ascending: true });
  return { data, error };
};

// Used by commissioner/autopick to read any picker's queue
export const getPickerQueue = async (leagueId, pickerEmail) => {
  const { data, error } = await supabase
    .from('draft_queue')
    .select('*')
    .eq('league_id', leagueId)
    .eq('user_email', pickerEmail)
    .order('position', { ascending: true });
  return { data, error };
};

export const addToQueue = async (leagueId, userEmail, sport, team, position) => {
  const { data, error } = await supabase
    .from('draft_queue')
    .insert([{ league_id: leagueId, user_email: userEmail, sport, team, position }])
    .select()
    .single();
  return { data, error };
};

export const removeFromQueue = async (itemId) => {
  const { error } = await supabase
    .from('draft_queue')
    .delete()
    .eq('id', itemId);
  return { error };
};

// Batch-update positions after reorder: items = [{ id, position }, ...]
export const reorderQueue = async (items) => {
  const results = await Promise.all(
    items.map(({ id, position }) =>
      supabase.from('draft_queue').update({ position }).eq('id', id)
    )
  );
  const err = results.find(r => r.error)?.error || null;
  return { error: err };
};

export const clearQueue = async (leagueId, userEmail) => {
  const { error } = await supabase
    .from('draft_queue')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_email', userEmail);
  return { error };
};

// ============ MEMBER SETTINGS FUNCTIONS ============

export const getMemberSettings = async (leagueId, userEmail) => {
  const { data, error } = await supabase
    .from('draft_member_settings')
    .select('*')
    .eq('league_id', leagueId)
    .eq('user_email', userEmail)
    .maybeSingle();
  return { data, error };
};

export const upsertMemberSettings = async (leagueId, userEmail, settings) => {
  const { data, error } = await supabase
    .from('draft_member_settings')
    .upsert(
      { league_id: leagueId, user_email: userEmail, ...settings },
      { onConflict: 'league_id,user_email' }
    )
    .select()
    .single();
  return { data, error };
};

// ============ REAL-TIME SUBSCRIPTIONS ============

export const subscribeToLeague = (leagueId, callback) => {
  return supabase
    .channel(`league:${leagueId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'leagues',
        filter: `id=eq.${leagueId}`
      },
      callback
    )
    .subscribe();
};

export const subscribeToDraftPicks = (leagueId, callback) => {
  return supabase
    .channel(`draft_picks:${leagueId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'draft_picks',
        filter: `league_id=eq.${leagueId}`
      },
      callback
    )
    .subscribe();
};

export const subscribeToDraftState = (leagueId, callback) => {
  return supabase
    .channel(`draft_state:${leagueId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'draft_state',
        filter: `league_id=eq.${leagueId}`
      },
      callback
    )
    .subscribe();
};

export const unsubscribe = (subscription) => {
  if (subscription) {
    supabase.removeChannel(subscription);
  }
};

// ============ LEAGUE CHAT ============

export const getLeagueChat = async (leagueId, limit = 100) => {
  const { data, error } = await supabase
    .from('league_chat')
    .select('*')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: true })
    .limit(limit);
  return { data: data || [], error };
};

export const sendChatMessage = async (leagueId, userEmail, userName, message) => {
  const { data, error } = await supabase
    .from('league_chat')
    .insert([{ league_id: leagueId, user_email: userEmail, user_name: userName, message }])
    .select()
    .single();
  return { data, error };
};

export const subscribeToLeagueChat = (leagueId, callback) => {
  return supabase
    .channel(`league_chat:${leagueId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'league_chat',
        filter: `league_id=eq.${leagueId}`
      },
      callback
    )
    .subscribe();
};

// ============ LEAGUE INVITE / MEMBER MANAGEMENT ============

export const acceptLeagueInvite = async (leagueId, userEmail) => {
  const { error } = await supabase
    .from('league_members')
    .update({ status: 'accepted' })
    .eq('league_id', leagueId)
    .eq('email', userEmail);
  return { error };
};

export const declineLeagueInvite = async (leagueId, userEmail) => {
  const { error } = await supabase
    .from('league_members')
    .update({ status: 'declined' })
    .eq('league_id', leagueId)
    .eq('email', userEmail);
  return { error };
};

// Add a new member to a pre-draft league (commissioner only).
// Returns { data, error } — error if email already in league.
export const addLeagueMember = async (leagueId, email) => {
  const { data, error } = await supabase
    .from('league_members')
    .insert([{ league_id: leagueId, email: email.trim().toLowerCase(), name: '', draft_position: 0, status: 'pending' }])
    .select()
    .single();
  return { data, error };
};

// Remove any member from a pre-draft league (commissioner only).
export const removeLeagueMember = async (memberId) => {
  const { error } = await supabase
    .from('league_members')
    .delete()
    .eq('id', memberId);
  return { error };
};

// Send a league invite email via the Edge Function (fire-and-forget).
// Does NOT throw — caller should not block on this.
export const sendLeagueInvite = async (memberEmail, leagueName, commissionerName) => {
  try {
    const appUrl = window.location.origin;
    await supabase.functions.invoke('send-league-invite', {
      body: { memberEmail, leagueName, commissionerName, appUrl }
    });
  } catch (e) {
    console.warn('sendLeagueInvite: failed to send invite email', e);
  }
};
