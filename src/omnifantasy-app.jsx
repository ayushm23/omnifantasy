import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Plus, Users, X, Check, ArrowLeft, TrendingUp, TrendingDown, Minus, Trash2, Settings } from 'lucide-react';
import { useAuth, useLeagues, useDraft } from './useSupabase';
import { useExpectedPoints } from './useExpectedPoints';
import { useResults } from './useResults';
import { useDraftQueue } from './useDraftQueue';
import { useAutoPickLogic } from './hooks/useAutoPickLogic';
import { isSportSupported } from './oddsApi';
import { calculatePickPoints } from './utils/points';
import { updateLeague, getPickerQueue, updateUserMetadata, sendLeagueInvite, acceptLeagueInvite, declineLeagueInvite, syncMemberName } from './supabaseClient';
import {
  AVAILABLE_SPORTS,
  TEAM_POOLS,
  EP_DRIVEN_POOL_SPORTS,
  getSelectableSports,
  getSportNameByCode,
  getSportDisplayCode,
  getSportColor,
  getSportTextColor,
} from './config/sports';
import { generateStandings } from './utils/standings';
import { filterResultsForLeague } from './utils/points';
import { generateDraftBoard, formatPickNumber, getCurrentPickerFromState, normalizeDraftPicker, wouldBreakSportCoverage, picksUntilTurn } from './utils/draft';
import { getUserInitials, getUserDisplayName } from './utils/userDisplay';
import { formatHourLabel } from './utils/format';
import LeagueView from './views/LeagueView';
import DraftView from './views/DraftView';
import { AppContext } from './context/AppContext';
import TeamPopup from './components/TeamPopup';
import LeagueChat from './components/LeagueChat';
import SportBadge from './components/SportBadge';
import RulesModal from './components/RulesModal';

const OmnifantasyApp = () => {
  const MAX_LEAGUE_MEMBERS = 20;
  const MAX_ADDITIONAL_MEMBERS = MAX_LEAGUE_MEMBERS - 1;

  const { user, loading: authLoading, authMessage, signIn, signUp, signOut: handleLogoutDB, clearAuthMessage } = useAuth();
  const isAuthenticated = !!user;
  const currentUser = user;

  const [showLoginModal, setShowLoginModal] = useState(!user);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginFirstName, setLoginFirstName] = useState('');
  const [loginLastName, setLoginLastName] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showHomeSportsModal, setShowHomeSportsModal] = useState(false);
  const [showHomeMobileMenu, setShowHomeMobileMenu] = useState(false);

  // Close modal when authenticated
  useEffect(() => {
    setShowLoginModal(!user);
  }, [user]);

  // Sync the authenticated user's real name into league_members on every login/signup.
  // Runs only when the user identity changes (email). Skips if no first_name in metadata.
  useEffect(() => {
    if (!user?.email || !user?.user_metadata?.first_name) return;
    const displayName = getUserDisplayName(user);
    syncMemberName(user.email, displayName).then(() => reloadLeagues());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);


  // Active sport tab in draft room
  const [activeDraftSport, setActiveDraftSport] = useState(null);
  
  // Draft pick confirmation
  const [pendingPick, setPendingPick] = useState(null); // { sport, team }
  const [showPickConfirmation, setShowPickConfirmation] = useState(false);
  
  const [currentView, setCurrentView] = useState('home'); // 'home', 'league', or 'draft'
  const [selectedLeagueId, setSelectedLeagueId] = useState(null);
  const [activeTab, setActiveTab] = useState('active'); // For homepage: 'active' or 'completed'
  const [leagueTab, setLeagueTab] = useState('standings'); // For league page: 'standings', 'big-board', 'draft-results', or 'my-roster'
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDraftSettingsModal, setShowDraftSettingsModal] = useState(false);
  const [showStartDraftConfirmation, setShowStartDraftConfirmation] = useState(false);
  const [homeSportsSearch, setHomeSportsSearch] = useState('');
  const [homeSportsFilter, setHomeSportsFilter] = useState('ALL');
  const [homeSportsSortBy, setHomeSportsSortBy] = useState('ep');
  const [homeSportsSortDir, setHomeSportsSortDir] = useState('desc');
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [inviteActionLoading, setInviteActionLoading] = useState(null); // leagueId of in-flight accept/decline
  const [selectedHomeTeamInfo, setSelectedHomeTeamInfo] = useState(null); // { sport, team, currentEP }
  const homeTeamInfoFromSportsRef = useRef(false);

  // League Chat
  const [showLeagueChat, setShowLeagueChat] = useState(false);

  // Draft order settings per league (stored locally for now)
  const [draftOrderSettings, setDraftOrderSettings] = useState({
    randomize: false,
    manualOrder: [], // Array of email addresses in draft order
    draftRounds: 8,
    draftTimer: 'none', // Draft timer setting
    thirdRoundReversal: false,
    draftEverySportRequired: true,
    timerPauseEnabled: true,
    timerPauseStartHour: 0,
    timerPauseEndHour: 8
  });
  
  // Draft state
  const [draftState, setDraftState] = useState({
    currentPick: 1,
    currentRound: 1,
    picks: [],
    draftOrder: [],
    isSnake: true,
    thirdRoundReversal: false,
    draftEverySportRequired: true
  });

  // Draft timer state (must be at top level, not in conditional)
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [timerExpired, setTimerExpired] = useState(false);
  // Ref copy of timerExpired so the timer callback can read it without being a dep
  const timerExpiredRef = useRef(false);
  timerExpiredRef.current = timerExpired;
  // Tick counter to drive home-page card countdown re-renders
  const [homeTick, setHomeTick] = useState(0);

  // Standings rank snapshot: { ranks: { [email]: rank }, myRank: number }
  // Loaded from localStorage on league change; saved whenever standings compute to a non-empty state.
  const [prevRankSnapshot, setPrevRankSnapshot] = useState(null);

  // Prevent background page scroll when overlays/panels are open on mobile.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const shouldLockScroll = (
      showLoginModal ||
      showCreateModal ||
      showDraftSettingsModal ||
      showStartDraftConfirmation ||
      showRulesModal ||
      showPickConfirmation
    );
    const previousOverflow = document.body.style.overflow;
    if (shouldLockScroll) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [
    showLoginModal,
    showCreateModal,
    showDraftSettingsModal,
    showStartDraftConfirmation,
    showRulesModal,
    showPickConfirmation
  ]);

  const STANDINGS_SNAPSHOT_VERSION = 1;

  // Load standings snapshot from localStorage whenever the selected league changes.
  useEffect(() => {
    if (!selectedLeagueId) { setPrevRankSnapshot(null); return; }
    try {
      const raw = localStorage.getItem(`omnifantasy_standings_${selectedLeagueId}`);
      if (!raw) { setPrevRankSnapshot(null); return; }
      const snap = JSON.parse(raw);
      // Invalidate snapshots that don't have the current schema version
      if (snap?.v !== STANDINGS_SNAPSHOT_VERSION) { setPrevRankSnapshot(null); return; }
      setPrevRankSnapshot(snap);
    } catch { setPrevRankSnapshot(null); }
  }, [selectedLeagueId]);

  const {
    leagues,
    loading: leaguesLoading,
    createLeague: createLeagueDB,
    deleteLeague: deleteLeagueDB,
    reload: reloadLeagues
  } = useLeagues(user?.email);

  const {
    draftState: supabaseDraftState,
    picks: supabasePicks,
    startDraft: startDraftDB,
    makePick: makePickDB,
    undoPick: undoPickDB
  } = useDraft(selectedLeagueId);

  const {
    queue: myQueue,
    settings: myDraftSettings,
    addItem: addToQueue,
    removeItem: removeFromQueue,
    moveItem: moveQueueItem,
    clearAll: clearQueue,
    reorderAll: reorderAllQueue,
    error: queueError,
    updateSettings: updateDraftSettings,
  } = useDraftQueue(selectedLeagueId, currentUser?.email);

  // Global user preference — stored in Supabase auth user metadata so it applies across all leagues.
  // Default false: users must explicitly opt in.
  const receiveOtcEmails = !!currentUser?.user_metadata?.receive_otc_emails;
  const setReceiveOtcEmails = async (val) => {
    await updateUserMetadata({ receive_otc_emails: val });
    // onAuthStateChange in useAuth will refresh currentUser automatically.
  };

  const LEAGUE_EMOJIS = ['🏆', '🥇', '🏅', '⭐', '🔥', '💪', '🎯', '👑', '⚡', '🎪', '🎰', '🤝'];
  const [newLeague, setNewLeague] = useState({
    name: '',
    sports: [],
    members: [''], // Just email addresses (commissioner auto-added)
    draftRounds: 8,
    draftTimer: 'none',
    timerPauseStartHour: 0,
    timerPauseEndHour: 8,
    leagueEmoji: '🏆',
  });
  const [emojiEditLeagueId, setEmojiEditLeagueId] = useState(null); // which league's emoji picker is open

  // Track email validation errors
  const [emailErrors, setEmailErrors] = useState({});

  // Email validation helper
  const isValidEmail = (email) => {
    if (!email || email.trim() === '') return true; // Empty is okay, just not validated yet
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  // Draft Timer helper functions
  const getTimerDurationMs = (timerSetting) => {
    const durations = {
      'none': 0,
      '4 hours': 4 * 60 * 60 * 1000,
      '8 hours': 8 * 60 * 60 * 1000,
      '12 hours': 12 * 60 * 60 * 1000,
      '24 hours': 24 * 60 * 60 * 1000
    };
    return durations[timerSetting] || 0;
  };

  const isInPauseWindow = (timerSetting, pauseStartHour = 0, pauseEndHour = 8) => {
    if (timerSetting === 'none') return false;
    if (pauseStartHour === pauseEndHour) return false;

    const now = new Date();
    const estDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hour = estDate.getHours();

    if (pauseStartHour < pauseEndHour) {
      return hour >= pauseStartHour && hour < pauseEndHour;
    }
    // Cross-midnight window, e.g. 22 -> 6
    return hour >= pauseStartHour || hour < pauseEndHour;
  };

  const getPausedElapsedMs = (startTimeMs, endTimeMs, pauseStartHour = 0, pauseEndHour = 8) => {
    if (pauseStartHour === pauseEndHour || endTimeMs <= startTimeMs) return 0;

    const hourMs = 60 * 60 * 1000;
    const dayMs = 24 * hourMs;
    const toESTPseudo = (ms) => new Date(new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York' })).getTime();
    const startEST = toESTPseudo(startTimeMs);
    const endEST = toESTPseudo(endTimeMs);

    const overlapMs = (aStart, aEnd, bStart, bEnd) => Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

    let pausedMs = 0;
    const dayCursor = new Date(startEST);
    dayCursor.setHours(0, 0, 0, 0);
    const endDay = new Date(endEST);
    endDay.setHours(0, 0, 0, 0);

    while (dayCursor.getTime() <= endDay.getTime()) {
      const dayStart = dayCursor.getTime();
      const dayEnd = dayStart + dayMs;

      if (pauseStartHour < pauseEndHour) {
        const pauseStart = dayStart + pauseStartHour * hourMs;
        const pauseEnd = dayStart + pauseEndHour * hourMs;
        pausedMs += overlapMs(startEST, endEST, pauseStart, pauseEnd);
      } else {
        const firstStart = dayStart;
        const firstEnd = dayStart + pauseEndHour * hourMs;
        const secondStart = dayStart + pauseStartHour * hourMs;
        pausedMs += overlapMs(startEST, endEST, firstStart, firstEnd);
        pausedMs += overlapMs(startEST, endEST, secondStart, dayEnd);
      }

      dayCursor.setDate(dayCursor.getDate() + 1);
    }

    return Math.max(0, pausedMs);
  };

  const formatTimeRemaining = (ms) => {
    if (ms === null || ms === 0) return null;

    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const selectableSports = getSelectableSports(AVAILABLE_SPORTS);

  useEffect(() => {
    if (homeSportsFilter === 'ALL') return;
    if (!selectableSports.some((sport) => sport.code === homeSportsFilter)) {
      setHomeSportsFilter('ALL');
    }
  }, [homeSportsFilter, selectableSports]);

  const filteredLeagues = leagues
    .filter(league => {
      const isCommissioner = league.commissionerEmail?.toLowerCase() === currentUser?.email.toLowerCase();
      const myMembership = league.membersList?.find(m => m.email.toLowerCase() === currentUser?.email.toLowerCase());
      if (isCommissioner) return true;
      if (!myMembership) return false;
      return myMembership.status !== 'declined'; // hide leagues the user has declined
    })
    .filter(league => league.status === activeTab);
  const selectedLeague = leagues.find(l => l.id === selectedLeagueId);
  const homeSportCodes = useMemo(
    () => getSelectableSports(AVAILABLE_SPORTS).map((sport) => sport.code),
    []
  );
  const { expectedPoints, loading: epLoading, refreshExpectedPoints } = useExpectedPoints(homeSportCodes);
  const { results: sportResults, loading: resultsLoading, error: resultsError, retryResults } = useResults(selectedLeague?.sports);
  const filteredSportResults = filterResultsForLeague(sportResults, selectedLeague?.draftDate);

  const getExpectedPoints = (sportCode, teamName) => {
    return expectedPoints?.[sportCode]?.[teamName] ?? null;
  };

  // Returns true if we have no EP data at all for this sport
  // (unsupported sport OR supported but off-season/no data returned)
  const hasNoEPData = (sportCode) => {
    if (!isSportSupported(sportCode)) return true;
    const sportData = expectedPoints?.[sportCode];
    return !sportData || Object.keys(sportData).length === 0;
  };

  // Sports with participant fields that can change year-to-year.
  // For these, prefer top EP entries as the active draft pool when available.
  const getDraftPoolForSport = useCallback((sportCode) => {
    const sportName = getSportNameByCode(sportCode, AVAILABLE_SPORTS);
    const basePool = TEAM_POOLS[sportName] || [];
    const sportEP = expectedPoints?.[sportCode] || {};

    if (!EP_DRIVEN_POOL_SPORTS.has(sportCode) || Object.keys(sportEP).length === 0) {
      return basePool;
    }

    const dynamicPoolSize = basePool.length || 24;
    const topTeamsByEP = Object.entries(sportEP)
      .sort((a, b) => b[1] - a[1])
      .slice(0, dynamicPoolSize)
      .map(([teamName]) => teamName);

    return topTeamsByEP.length > 0 ? topTeamsByEP : basePool;
  }, [expectedPoints]);

  const wouldBreakRequiredSportAvailability = (pickerEmail, sport, team, league, draftState, picks) =>
    wouldBreakSportCoverage({
      sportRequirementEnabled: draftState?.draftEverySportRequired !== false,
      leagueSports: league?.sports,
      pool: getDraftPoolForSport(sport),
      draftEmails: (draftState?.draftOrder || [])
        .map(m => normalizeDraftPicker(m)?.email?.toLowerCase())
        .filter(Boolean),
      picks,
      pickerEmail,
      sport,
      team,
    });

  const { cancelAutoPickCountdown } = useAutoPickLogic({
    currentView,
    timerExpired,
    setTimerExpired,
    supabaseDraftState,
    selectedLeague,
    selectedLeagueId,
    supabasePicks,
    currentUser,
    queue: myQueue,
    draftSettings: myDraftSettings,
    makePickDB,
    getDraftPoolForSport,
    expectedPoints,
  });

  // When the draft finishes, navigate back to the league view after a short delay.
  const draftTotalPicks = selectedLeague ? (selectedLeague.members * (selectedLeague.draftRounds || 8)) : 0;
  const draftNowComplete = draftTotalPicks > 0 && (supabasePicks?.length || 0) >= draftTotalPicks;
  useEffect(() => {
    if (!draftNowComplete || currentView !== 'draft') return;
    const t = setTimeout(() => {
      setCurrentView('league');
      setLeagueTab('draft-results');
    }, 1500);
    return () => clearTimeout(t);
  }, [draftNowComplete, currentView]);

  // Keep an active draft sport selected when entering/changing leagues.
  useEffect(() => {
    const sports = selectedLeague?.sports || [];
    if (sports.length === 0) {
      setActiveDraftSport(null);
      return;
    }
    if (!activeDraftSport || !sports.includes(activeDraftSport)) {
      setActiveDraftSport(sports[0]);
    }
  }, [selectedLeague?.id, selectedLeague?.sports, activeDraftSport]);

  // Draft Timer countdown effect (must be after selectedLeague is defined)
  useEffect(() => {
    if (currentView !== 'draft' && currentView !== 'league') return;
    if (!supabaseDraftState?.pickStartedAt || !selectedLeague?.draftTimer) return;
    if (selectedLeague.draftTimer === 'none') return;

    const updateTimer = () => {
      const timerDuration = getTimerDurationMs(selectedLeague.draftTimer);
      if (timerDuration === 0) return;

      const startTime = new Date(supabaseDraftState.pickStartedAt).getTime();
      const now = Date.now();
      const rawElapsed = now - startTime;
      const pausedElapsed = getPausedElapsedMs(
        startTime,
        now,
        selectedLeague?.timerPauseStartHour ?? 0,
        selectedLeague?.timerPauseEndHour ?? 8
      );
      const elapsed = Math.max(0, rawElapsed - pausedElapsed);
      const remaining = Math.max(0, timerDuration - elapsed);

      setTimeRemaining(remaining);

      if (remaining === 0 && !timerExpiredRef.current) {
        setTimerExpired(true);
      } else if (remaining > 0 && timerExpiredRef.current) {
        // A pick was made and pick_started_at advanced — reset so the next
        // timer expiry fires cleanly rather than re-triggering immediately.
        setTimerExpired(false);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [
    currentView,
    supabaseDraftState?.pickStartedAt,
    selectedLeague?.draftTimer,
    selectedLeague?.timerPauseStartHour,
    selectedLeague?.timerPauseEndHour,
    // timerExpired intentionally excluded — read via timerExpiredRef to avoid recreating interval on every expiry
  ]);

  // 1-second tick to keep home-page card countdowns live
  useEffect(() => {
    if (currentView !== 'home') return;
    const interval = setInterval(() => setHomeTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [currentView]);

  const handleAuth = async () => {
    if (!loginEmail || !loginEmail.includes('@')) {
      setLoginError('Please enter a valid email address');
      return;
    }

    if (!loginPassword || loginPassword.length < 6) {
      setLoginError('Password must be at least 6 characters');
      return;
    }

    if (isSignUp) {
      if (!loginFirstName.trim() || !loginLastName.trim()) {
        setLoginError('Please enter your first and last name');
        return;
      }
    }

    setLoginError('');

    try {
      if (isSignUp) {
        await signUp(loginEmail, loginPassword, loginFirstName, loginLastName);
      } else {
        await signIn(loginEmail, loginPassword);
      }
      setLoginPassword('');
      setLoginFirstName('');
      setLoginLastName('');
      // authMessage will update automatically from the hook
    } catch (error) {
      // Provide more specific error messages
      const errorMsg = error.message || '';
      if (!isSignUp && errorMsg.includes('Invalid login credentials')) {
        setLoginError('Invalid login credentials. Don\'t have an account? Click "Create Account" below.');
      } else if (errorMsg.includes('User already registered') || errorMsg.includes('already been registered')) {
        setLoginError('An account with this email already exists. Please use "Log In" instead.');
      } else {
        setLoginError(errorMsg || 'Authentication failed');
      }
    }
  };


  const handleLogout = async () => {
    await handleLogoutDB();
    setCurrentView('home');
    // Clear form fields and messages
    setLoginEmail('');
    setLoginPassword('');
    setLoginFirstName('');
    setLoginLastName('');
    setLoginError('');
    setIsSignUp(false);
  };

  // Resolve display names: current user from auth metadata, others from picks or email prefix
  const resolveDisplayName = (member) => {
    if (member.name) return member.name;
    if (member.email?.toLowerCase() === currentUser?.email?.toLowerCase()) {
      const meta = currentUser?.user_metadata;
      const fromMeta = (meta?.display_name || `${meta?.first_name || ''} ${meta?.last_name || ''}`.trim()) || '';
      if (fromMeta) return fromMeta;
    }
    const pick = supabasePicks?.find(p => p.picker_email?.toLowerCase() === member.email?.toLowerCase());
    if (pick?.picker_name && !pick.picker_name.includes('@')) return pick.picker_name;
    return member.email?.split('@')[0] || member.email;
  };
  const leagueForStandings = selectedLeague ? {
    ...selectedLeague,
    membersList: selectedLeague.membersList.map(m => ({ ...m, name: resolveDisplayName(m) }))
  } : null;
  const standings = leagueForStandings
    ? generateStandings(leagueForStandings, supabasePicks, currentUser?.email, filteredSportResults, prevRankSnapshot?.ranks || {})
    : [];
  const draftBoard = generateDraftBoard(supabasePicks, currentUser?.email);
  const myRoster = draftBoard.filter(pick => pick.isUser);
  const formatPick = (pick) => formatPickNumber(pick, selectedLeague?.membersList?.length || 1);

  // Persist standings snapshot to localStorage whenever the computed standings change.
  // We store { ranks: { [email]: rank }, myRank, prevMyRank } so the next session can show
  // previous positions in the standings table and trend arrows on the home page.
  useEffect(() => {
    if (!selectedLeagueId || standings.length === 0) return;
    const ranks = {};
    let myRank = null;
    standings.forEach(row => {
      ranks[row.email] = row.rank;
      if (row.isUser) myRank = row.rank;
    });
    // Preserve the previous session's myRank so home page trend arrows work across sessions.
    const prevMyRank = prevRankSnapshot?.myRank ?? myRank;
    const snapshot = { v: STANDINGS_SNAPSHOT_VERSION, ranks, myRank, prevMyRank };
    try {
      localStorage.setItem(`omnifantasy_standings_${selectedLeagueId}`, JSON.stringify(snapshot));
    } catch { /* storage full — ignore */ }
  }, [standings, selectedLeagueId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build a map of leagueId → { myRank, trend } from localStorage for home page cards.
  const leagueRankMeta = useMemo(() => {
    const meta = {};
    for (const league of (leagues || [])) {
      try {
        const raw = localStorage.getItem(`omnifantasy_standings_${league.id}`);
        if (!raw) continue;
        const snap = JSON.parse(raw);
        if (!snap?.myRank || snap.v !== STANDINGS_SNAPSHOT_VERSION) continue;
        const { myRank, prevMyRank } = snap;
        let trend = 'same';
        if (prevMyRank && myRank < prevMyRank) trend = 'up';
        else if (prevMyRank && myRank > prevMyRank) trend = 'down';
        meta[league.id] = { myRank, trend };
      } catch { /* skip */ }
    }
    return meta;
  }, [leagues, currentUser?.email, currentView]); // re-read on navigation back to home

  const toggleSport = (sport) => {
    let updatedSports;
    if (newLeague.sports.includes(sport)) {
      updatedSports = newLeague.sports.filter(s => s !== sport);
    } else {
      updatedSports = [...newLeague.sports, sport];
    }
    
    // Auto-adjust draft rounds to be at least the number of sports
    const minRounds = Math.max(3, updatedSports.length);
    const adjustedRounds = Math.max(newLeague.draftRounds, minRounds);
    
    setNewLeague({
      ...newLeague,
      sports: updatedSports,
      draftRounds: adjustedRounds
    });
  };

  const addMember = () => {
    if (newLeague.members.length >= MAX_ADDITIONAL_MEMBERS) return;
    setNewLeague({
      ...newLeague,
      members: [...newLeague.members, '']
    });
  };

  const removeMember = (index) => {
    if (newLeague.members.length > 1) {
      setNewLeague({
        ...newLeague,
        members: newLeague.members.filter((_, i) => i !== index)
      });

      // Remove error for this index and shift others
      const updatedErrors = {};
      Object.keys(emailErrors).forEach(key => {
        const keyIndex = parseInt(key);
        if (keyIndex < index) {
          updatedErrors[keyIndex] = emailErrors[keyIndex];
        } else if (keyIndex > index) {
          updatedErrors[keyIndex - 1] = emailErrors[keyIndex];
        }
      });
      setEmailErrors(updatedErrors);
    }
  };

  const updateMember = (index, value) => {
    const updatedMembers = [...newLeague.members];
    updatedMembers[index] = value;
    setNewLeague({
      ...newLeague,
      members: updatedMembers
    });

    // Validate email in real-time
    if (value.trim() !== '') {
      const updatedErrors = { ...emailErrors };
      const trimmedValue = value.trim().toLowerCase();

      if (!isValidEmail(value)) {
        updatedErrors[index] = 'Please enter a valid email address';
      } else if (trimmedValue === currentUser?.email?.trim().toLowerCase()) {
        updatedErrors[index] = 'Commissioner is already included as a member';
      } else if (updatedMembers.some((m, i) => i !== index && m.trim().toLowerCase() === trimmedValue)) {
        updatedErrors[index] = 'This email is already in the members list';
      } else {
        delete updatedErrors[index];
      }
      setEmailErrors(updatedErrors);
    } else {
      // Clear error if field is empty
      const updatedErrors = { ...emailErrors };
      delete updatedErrors[index];
      setEmailErrors(updatedErrors);
    }
  };

  const createLeague = async () => {
    // Check for validation errors
    if (Object.keys(emailErrors).length > 0) {
      return; // Don't submit if there are validation errors
    }

    // Validate emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validMembers = newLeague.members.filter(email => {
      const trimmedEmail = email.trim();
      return trimmedEmail !== '' && emailRegex.test(trimmedEmail);
    });

    if (!newLeague.name || newLeague.sports.length < 3) {
      return; // Validation feedback is already shown inline
    }

    // Need at least 1 additional member since commissioner is added automatically
    if (validMembers.length < 1) {
      return; // Validation feedback is already shown inline
    }

    // Transform email strings to membersList objects, deduplicating
    const commissionerEmail = currentUser?.email?.trim().toLowerCase();
    const seen = new Set();
    if (commissionerEmail) seen.add(commissionerEmail);

    const commissionerName = (
      currentUser?.user_metadata?.display_name ||
      `${currentUser?.user_metadata?.first_name || ''} ${currentUser?.user_metadata?.last_name || ''}`.trim()
    ) || '';
    let membersList = [{
      email: currentUser.email,
      name: commissionerName
    }];

    validMembers.forEach(email => {
      const normalized = email.trim().toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        membersList.push({ email: email.trim(), name: '' });
      }
    });

    // Hard guard after dedupe: minimum 2 total members (including commissioner)
    if (membersList.length < 2) {
      alert('League must have at least 2 total members including commissioner.');
      return;
    }
    if (membersList.length > MAX_LEAGUE_MEMBERS) {
      alert(`League can have at most ${MAX_LEAGUE_MEMBERS} total members including commissioner.`);
      return;
    }

    const leagueData = {
      name: newLeague.name,
      commissionerEmail: currentUser?.email,
      sports: newLeague.sports,
      draftRounds: Math.max(newLeague.draftRounds, newLeague.sports.length),
      draftTimer: newLeague.draftTimer,
      timerPauseStartHour: newLeague.timerPauseStartHour,
      timerPauseEndHour: newLeague.timerPauseEndHour,
      leagueEmoji: newLeague.leagueEmoji || '🏆',
      draftDate: null, // Will be set when draft actually starts
      membersList: membersList
    };

    try {
      await createLeagueDB(leagueData);

      // Fire invite emails to all non-commissioner members (fire-and-forget)
      const commName = getUserDisplayName(currentUser);
      for (const member of membersList) {
        if (member.email?.toLowerCase() !== currentUser?.email?.toLowerCase()) {
          sendLeagueInvite(member.email, newLeague.name, commName);
        }
      }

      // Reset form
      setNewLeague({
        name: '',
        sports: [],
        members: [''],
        draftRounds: 8,
        draftTimer: 'none',
        timerPauseStartHour: 0,
        timerPauseEndHour: 8,
        leagueEmoji: '🏆',
      });
      setEmailErrors({});
      setShowCreateModal(false);
    } catch (error) {
      alert('Error creating league: ' + error.message);
    }
  };

  const getRankColor = (rank) => {
    if (rank === 1) return 'text-yellow-500';
    if (rank <= 3) return 'text-gray-400';
    return 'text-gray-500';
  };

  const getTrendIcon = (trend) => {
    if (trend === 'up') return '📈';
    if (trend === 'down') return '📉';
    return '➡️';
  };

  const getTrendColor = (trend) => {
    if (trend === 'up') return 'text-green-500';
    if (trend === 'down') return 'text-red-500';
    return 'text-slate-500';
  };

  const getStatusBadge = (status) => {
    const badges = {
      champion: { text: '🏆 Champion (80)', shortText: '🏆', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
      runnerup: { text: '🥈 Runner-up (50)', shortText: '🥈', color: 'bg-gray-400/20 text-gray-300 border-gray-400/30' },
      semifinal: { text: '🥉 Semifinal (30)', shortText: '🥉', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
      quarterfinal: { text: '📊 Quarterfinal (20)', shortText: '📊', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
      playoffs: { text: '🔥 In Playoffs', shortText: '🔥', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
      active: { text: '⏳ Active', shortText: '⏳', color: 'bg-slate-600/20 text-slate-400 border-slate-600/30' },
      eliminated: { text: '❌ Eliminated (0)', shortText: '❌', color: 'bg-red-500/20 text-red-400 border-red-500/30' }
    };
    return badges[status] || badges.active;
  };

  const getRankChange = (current, previous) => {
    const change = previous - current;
    if (change > 0) return { icon: <TrendingUp size={16} />, color: 'text-green-500', text: `+${change}` };
    if (change < 0) return { icon: <TrendingDown size={16} />, color: 'text-red-500', text: Math.abs(change) };
    return { icon: <Minus size={16} />, color: 'text-slate-500', text: '-' };
  };

  const openLeague = (leagueId) => {
    const league = leagues.find(l => l.id === leagueId);
    
    // Security check: only allow access if user is commissioner or member
    if (league) {
      const isCommissioner = league.commissionerEmail?.toLowerCase() === currentUser?.email.toLowerCase();
      const isMember = league.membersList && league.membersList.some(m => m.email.toLowerCase() === currentUser?.email.toLowerCase());
      
      if (!isCommissioner && !isMember) {
        alert('You do not have access to this league.');
        return;
      }
    }
    
    setSelectedLeagueId(leagueId);
    setCurrentView('league');
    setLeagueTab('standings');
    setShowLeagueChat(false);
  };

  const backToHome = async () => {
    try {
      await reloadLeagues();
    } catch (error) {
      // Non-blocking: still allow navigation even if refresh fails
    }
    setCurrentView('home');
    setSelectedLeagueId(null);
  };

  // Login/Signup Modal
  if (!isAuthenticated || showLoginModal) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* Fixed Header */}
        <div className="bg-slate-800/60 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="text-3xl">🏆</div>
              <h1 className="text-2xl font-bold text-white">OmniFantasy</h1>
            </div>
          </div>
        </div>
        
        {/* Login Modal Content */}
        <div className="flex items-center justify-center p-4 mt-12">
        <div className="bg-slate-800 rounded-2xl max-w-md w-full border border-slate-700 shadow-2xl">
          {/* Modal Content */}
          <div className="p-8">
            <div className="mb-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => {
                    setLoginEmail(e.target.value);
                    setLoginError('');
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && handleAuth()}
                  placeholder="Enter your email"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {isSignUp && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={loginFirstName}
                      onChange={(e) => {
                        setLoginFirstName(e.target.value);
                        setLoginError('');
                      }}
                      onKeyPress={(e) => e.key === 'Enter' && handleAuth()}
                      placeholder="Enter your first name"
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={loginLastName}
                      onChange={(e) => {
                        setLoginLastName(e.target.value);
                        setLoginError('');
                      }}
                      onKeyPress={(e) => e.key === 'Enter' && handleAuth()}
                      placeholder="Enter your last name"
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => {
                    setLoginPassword(e.target.value);
                    setLoginError('');
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && handleAuth()}
                  placeholder="Enter your password"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {authMessage && (
                <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <p className="text-sm text-green-400">{authMessage}</p>
                </div>
              )}
              {loginError && (
                <div className="text-sm text-red-400">{loginError}</div>
              )}
            </div>

            <div className="space-y-3">
              {isSignUp ? (
                <>
                  <button
                    onClick={handleAuth}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition-all shadow-lg"
                  >
                    Sign Up
                  </button>
                  <button
                    onClick={() => {
                      setIsSignUp(false);
                      setLoginError('');
                      clearAuthMessage();
                    }}
                    className="w-full text-slate-400 hover:text-white text-sm transition-colors"
                  >
                    Already have an account? Log in instead
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleAuth}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition-all shadow-lg"
                  >
                    Log In
                  </button>
                  <button
                    onClick={() => {
                      setIsSignUp(true);
                      setLoginError('');
                      clearAuthMessage();
                    }}
                    className="w-full bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-lg font-semibold transition-all"
                  >
                    Create Account
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
        </div>
      </div>
    );
  }

  const startDraft = () => {
    console.log('Start Draft button clicked');
    console.log('selectedLeague:', selectedLeague);

    if (!selectedLeague) {
      console.log('No selected league - returning');
      return;
    }

    // Generate draft order based on draft settings
    let order;
    if (draftOrderSettings.randomize) {
      // Randomize the order
      order = [...selectedLeague.membersList].sort(() => Math.random() - 0.5);
    } else if (draftOrderSettings.manualOrder.length > 0) {
      // Use manual order - convert emails to member objects
      order = draftOrderSettings.manualOrder
        .map(email => selectedLeague.membersList.find(m => m.email === email))
        .filter(m => m); // Remove any nulls
    } else {
      // Default to member list order
      order = [...selectedLeague.membersList];
    }

    const initialDraftState = {
      currentPick: 1,
      currentRound: 1,
      picks: [],
      draftOrder: order,
      isSnake: true,
      thirdRoundReversal: !!draftOrderSettings.thirdRoundReversal,
      draftEverySportRequired: draftOrderSettings.draftEverySportRequired !== false
    };

    // Start draft in Supabase
    startDraftDB(order, {
      thirdRoundReversal: !!draftOrderSettings.thirdRoundReversal,
      draftEverySportRequired: draftOrderSettings.draftEverySportRequired !== false
    }).then(async () => {
      console.log('Draft started in database');
      setDraftState(initialDraftState);
      await reloadLeagues();
      setCurrentView('draft');
    }).catch(error => {
      console.error('Error starting draft:', error);
      alert('Failed to start draft: ' + error.message);
    });
  };

  const deleteLeague = async () => {
    if (!selectedLeague) return;
    await deleteLeagueDB(selectedLeagueId);
    setCurrentView('home');
    setSelectedLeagueId(null);
  };

  // Homepage View
  if (currentView === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* Header */}
        <div className="bg-slate-800/60 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-3 md:px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-3xl">🏆</div>
                <h1 className="text-2xl font-bold text-white">OmniFantasy</h1>
              </div>
              {/* Desktop nav */}
              <div className="hidden md:flex items-center gap-4">
                <button
                  onClick={() => setShowRulesModal(true)}
                  className="text-slate-400 hover:text-white text-sm transition-colors px-3 py-1.5 rounded-md hover:bg-slate-700/50"
                >
                  📖 Rules
                </button>
                <button
                  onClick={() => setShowHomeSportsModal(true)}
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
                    onClick={() => setShowHomeMobileMenu(v => !v)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-md transition-colors"
                    aria-label="Menu"
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><rect y="3" width="20" height="2" rx="1"/><rect y="9" width="20" height="2" rx="1"/><rect y="15" width="20" height="2" rx="1"/></svg>
                  </button>
                  {showHomeMobileMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowHomeMobileMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 w-44 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-20 overflow-hidden">
                        <button onClick={() => { setShowRulesModal(true); setShowHomeMobileMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-2">📖 Rules</button>
                        <button onClick={() => { setShowHomeSportsModal(true); setShowHomeMobileMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-2">🏟️ Sports</button>
                        <button onClick={() => { setShowUserSettings(true); setShowHomeMobileMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-2"><Settings size={14} /> Settings</button>
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
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-3 md:px-6 py-6 md:py-8">
          {/* Leagues Header with Tabs */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white">My Leagues</h2>
              {leagues.length > 0 && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-lg font-semibold transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 text-sm md:text-base"
                >
                  <Plus size={18} />
                  Create League
                </button>
              )}
            </div>
            
            {/* Tabs */}
            <div className="flex gap-2 border-b border-slate-700/50">
              <button
                onClick={() => setActiveTab('active')}
                className={`px-6 py-3 font-semibold transition-all relative ${
                  activeTab === 'active'
                    ? 'text-blue-400'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Active
                {activeTab === 'active' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400"></div>
                )}
              </button>
              <button
                onClick={() => setActiveTab('completed')}
                className={`px-6 py-3 font-semibold transition-all relative ${
                  activeTab === 'completed'
                    ? 'text-blue-400'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Completed
                {activeTab === 'completed' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400"></div>
                )}
              </button>
            </div>
          </div>

          {/* Leagues Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredLeagues.map(league => {
              const myMembership = league.membersList?.find(m => m.email.toLowerCase() === currentUser?.email?.toLowerCase());
              const isPendingInvite = myMembership?.status === 'pending';
              return (
              <div
                key={league.id}
                onClick={isPendingInvite ? undefined : () => openLeague(league.id)}
                className={`bg-slate-800/50 backdrop-blur-sm border rounded-xl overflow-hidden transition-all ${
                  isPendingInvite
                    ? 'border-amber-500/60 shadow-lg shadow-amber-500/10'
                    : league.draftStarted &&
                      !league.draftComplete &&
                      league.currentPickerEmail?.toLowerCase() === currentUser?.email?.toLowerCase()
                      ? 'border-green-400/80 shadow-xl shadow-green-500/20 cursor-pointer group'
                      : 'border-slate-700/50 hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-500/10 cursor-pointer group'
                }`}
              >
                {/* League Header */}
                <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 p-6 border-b border-slate-700/50">
                  <div className="flex items-start justify-between mb-3">
                    <div className="relative group/emoji">
                      <div className="text-4xl">{league.leagueEmoji || '🏆'}</div>
                      {league.commissionerEmail?.toLowerCase() === currentUser?.email?.toLowerCase() && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setEmojiEditLeagueId(emojiEditLeagueId === league.id ? null : league.id); }}
                          className="absolute -bottom-1 -right-1 w-5 h-5 bg-slate-700 hover:bg-slate-600 border border-slate-500 rounded-full text-[10px] text-slate-400 hover:text-white opacity-0 group-hover/emoji:opacity-100 transition-opacity flex items-center justify-center"
                          title="Change emoji"
                        >
                          ✏
                        </button>
                      )}
                      {emojiEditLeagueId === league.id && (
                        <div
                          className="absolute top-10 left-0 z-50 bg-slate-800 border border-slate-600 rounded-xl p-3 shadow-2xl"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex flex-wrap gap-1.5 w-48">
                            {LEAGUE_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                className={`text-xl p-1.5 rounded-lg border transition-all ${
                                  (league.leagueEmoji || '🏆') === emoji
                                    ? 'border-blue-500 bg-blue-500/20'
                                    : 'border-slate-700 hover:border-slate-500'
                                }`}
                                onClick={async () => {
                                  setEmojiEditLeagueId(null);
                                  await updateLeague(league.id, { league_emoji: emoji });
                                  await reloadLeagues();
                                }}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {(() => {
                      const meta = leagueRankMeta[league.id];
                      const myRank = meta?.myRank ?? league.myRank;
                      const trend = meta?.trend ?? league.trend;
                      return (
                        <div className="flex items-center gap-2">
                          {myRank && (
                            <div className={`text-2xl font-bold ${getRankColor(myRank)}`}>
                              #{myRank}
                            </div>
                          )}
                          {league.status === 'active' && trend && trend !== 'same' && (
                            <div className={`text-lg ${getTrendColor(trend)}`}>
                              {getTrendIcon(trend)}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">
                    {league.name}
                  </h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {league.sports.map(sport => (
                      <SportBadge key={sport} sport={sport} size="pill" />
                    ))}
                  </div>
                  <div className="text-xs text-slate-400">
                    {isPendingInvite
                      ? <span className="text-amber-400 font-semibold">⏳ Invite pending — accept to join</span>
                      : league.draftStarted
                      ? league.draftComplete
                        ? <span className="text-emerald-400 font-semibold">Draft complete</span>
                        : <>
                            <span className="text-yellow-400 font-semibold">Draft in progress</span>
                            {league.currentPickerEmail?.toLowerCase() === currentUser?.email?.toLowerCase() ? (() => {
                              const timerMs = getTimerDurationMs(league.draftTimer);
                              if (timerMs && league.pickStartedAt) {
                                const startTime = new Date(league.pickStartedAt).getTime();
                                const now = Date.now();
                                const paused = getPausedElapsedMs(startTime, now, league.timerPauseStartHour ?? 0, league.timerPauseEndHour ?? 8);
                                const remaining = Math.max(0, timerMs - Math.max(0, now - startTime - paused));
                                const formatted = formatTimeRemaining(remaining);
                                return (
                                  <span className="text-green-400 font-semibold ml-2">
                                    Your turn! {formatted ? `(${formatted})` : ''}
                                  </span>
                                );
                              }
                              return <span className="text-green-400 font-semibold ml-2">Your turn!</span>;
                            })() : (() => {
                              const n = picksUntilTurn({
                                myEmail: currentUser?.email,
                                draftOrder: league.draftOrder || [],
                                currentPick: league.draftCurrentPick || 1,
                                currentRound: league.draftCurrentRound || 1,
                                isSnake: league.isSnake,
                                thirdRoundReversal: league.thirdRoundReversal,
                              });
                              return n != null
                                ? <span className="text-slate-400 ml-2">{n} pick{n !== 1 ? 's' : ''} until your turn</span>
                                : null;
                            })()}
                          </>
                      : 'Draft not started'}
                  </div>

                </div>

                {isPendingInvite ? (
                  /* Pending invite: Accept / Decline */
                  <div className="p-6 space-y-4">
                    <p className="text-sm text-slate-300">
                      <span className="font-semibold text-white">{league.commissionerEmail?.split('@')[0]}</span> invited you to this league.
                    </p>
                    <div className="flex gap-3">
                      <button
                        disabled={inviteActionLoading === league.id}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setInviteActionLoading(league.id);
                          await acceptLeagueInvite(league.id, currentUser.email);
                          await reloadLeagues();
                          setInviteActionLoading(null);
                        }}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                      >
                        {inviteActionLoading === league.id ? 'Saving…' : '✓ Accept'}
                      </button>
                      <button
                        disabled={inviteActionLoading === league.id}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setInviteActionLoading(league.id);
                          await declineLeagueInvite(league.id, currentUser.email);
                          await reloadLeagues();
                          setInviteActionLoading(null);
                        }}
                        className="flex-1 bg-slate-700 hover:bg-red-900/50 hover:border-red-500/50 disabled:opacity-50 text-slate-300 hover:text-red-300 font-semibold py-2 px-4 rounded-lg border border-slate-600 transition-colors text-sm"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ) : (
                /* League Stats & Progress */
                <div className="p-6 space-y-4">
                  {/* Points and Progress */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-sm">Total Points</span>
                    <span className="text-white font-bold text-lg">{league.totalPoints}</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Championships Complete</span>
                      <span className="text-slate-300 font-medium">
                        {league.sportsComplete}/{league.sportsTotal}
                      </span>
                    </div>
                    <div className="w-full bg-slate-700/50 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all"
                        style={{ width: `${(league.sportsComplete / league.sportsTotal) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Top Performing Teams */}
                  {league.myTeams.length > 0 && (
                    <div className="pt-3 border-t border-slate-700/50">
                      <div className="text-xs text-slate-400 mb-2">Top Performers:</div>
                      <div className="space-y-2">
                        {league.myTeams
                          .filter(team => team.status === 'champion' || team.status === 'runnerup' || team.status === 'semifinal' || team.status === 'quarterfinal')
                          .slice(0, 2)
                          .map((team, idx) => {
                            const badge = getStatusBadge(team.status);
                            return (
                              <div key={idx} className="flex items-center justify-between text-xs">
                                <span className="text-slate-300 truncate flex-1">{team.team}</span>
                                <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap ml-2 ${badge.color}`}>
                                  {badge.text}
                                </span>
                              </div>
                            );
                          })}
                        {league.myTeams.filter(team => team.status === 'champion' || team.status === 'runnerup' || team.status === 'semifinal' || team.status === 'quarterfinal').length === 0 && (
                          <div className="text-xs text-slate-500 italic">No completed championships yet</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-700/50">
                    <span className="text-slate-400 text-sm flex items-center gap-2">
                      <Users size={16} />
                      {league.members} teams
                    </span>
                    <button className="text-blue-400 hover:text-blue-300 text-sm font-semibold transition-colors">
                      View League →
                    </button>
                  </div>
                </div>
                )}
              </div>
              );
            })}

            {/* Empty State */}
            {filteredLeagues.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
                <div className="text-6xl mb-4">{activeTab === 'active' ? '🏆' : '📦'}</div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {activeTab === 'active' ? 'No Active Leagues' : 'No Completed Leagues'}
                </h3>
                <p className="text-slate-400 mb-6">
                  {activeTab === 'active' 
                    ? 'Create your first league to get started!' 
                    : 'Your completed leagues will appear here'}
                </p>
                {activeTab === 'active' && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition-all"
                  >
                    <Plus size={20} />
                    Create League
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Create League Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto p-4">
            <div className="bg-slate-800 rounded-2xl max-w-4xl w-full border border-slate-700 shadow-2xl my-8">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-700 bg-slate-800 rounded-t-2xl">
                <h2 className="text-2xl font-bold text-white">Create New League</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 space-y-8">
                {/* Commissioner Notice */}
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <p className="text-sm text-blue-400">
                    You will be the commissioner of this league, the only one allowed to take special administrative actions. (You do not have to be a member of the league to be commissioner. Only the league members make draft picks and compete.)
                  </p>
                </div>

                {/* League Emoji */}
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    League Icon
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {LEAGUE_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => setNewLeague({ ...newLeague, leagueEmoji: emoji })}
                        className={`text-2xl p-2 rounded-lg border-2 transition-all ${
                          newLeague.leagueEmoji === emoji
                            ? 'border-blue-500 bg-blue-500/20 ring-2 ring-blue-500/30'
                            : 'border-slate-700 hover:border-slate-500 bg-slate-900/50'
                        }`}
                        title={emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* League Name */}
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    value={newLeague.name}
                    onChange={(e) => setNewLeague({ ...newLeague, name: e.target.value })}
                    placeholder="League Name"
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Members */}
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    League Members
                  </label>
                  <p className="text-xs text-slate-400 mb-4">
                    Add other members' emails below (max {MAX_ADDITIONAL_MEMBERS}, plus commissioner). The draft order can be configured later in Draft Settings before starting the draft.
                  </p>

                  {/* Commissioner - always first member */}
                  <div className="flex items-center gap-3 mb-3 p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <div className="flex-1 px-4 py-2 bg-slate-900/30 border border-slate-700 rounded-lg text-slate-400 text-sm">
                      {currentUser?.email}
                    </div>
                    <span className="text-xs font-semibold text-blue-400 px-2 whitespace-nowrap">Commissioner</span>
                  </div>

                  <div className="space-y-3 mb-4">
                    {newLeague.members.map((email, index) => (
                      <div key={index}>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <input
                              type="email"
                              value={email}
                              onChange={(e) => updateMember(index, e.target.value)}
                              placeholder="Email"
                              className={`w-full bg-slate-900/50 border rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 ${
                                emailErrors[index]
                                  ? 'border-red-500 focus:ring-red-500'
                                  : 'border-slate-700 focus:ring-blue-500 focus:border-transparent'
                              }`}
                            />
                            {emailErrors[index] && (
                              <p className="text-xs text-red-400 mt-1">{emailErrors[index]}</p>
                            )}
                          </div>
                          {newLeague.members.length > 1 && (
                            <button
                              onClick={() => removeMember(index)}
                              className="text-red-400 hover:text-red-300 transition-colors px-3"
                            >
                              <X size={20} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <button
                    onClick={addMember}
                    disabled={newLeague.members.length >= MAX_ADDITIONAL_MEMBERS}
                    className="text-blue-400 hover:text-blue-300 text-sm font-semibold transition-colors disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    + Add Member
                  </button>
                </div>

                {/* Sports Selection */}
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    Sports (minimum 3) - {newLeague.sports.length} selected
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-96 overflow-y-auto p-1">
                    {selectableSports.map(sport => {
                      const validMembers = newLeague.members.filter(email => email.trim() !== '');
                      const isDisabled = sport.maxLeagueSize && validMembers.length > sport.maxLeagueSize;
                      
                      return (
                        <button
                          key={sport.code}
                          onClick={() => !isDisabled && toggleSport(sport.code)}
                          disabled={isDisabled}
                          className={`p-3 rounded-lg border-2 transition-all ${
                            isDisabled
                              ? 'border-slate-700 bg-slate-900/30 text-slate-600 cursor-not-allowed'
                              : newLeague.sports.includes(sport.code)
                              ? 'border-slate-500 bg-slate-800/80'
                              : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600'
                          }`}
                        >
                          <div className="text-2xl mb-1">{sport.icon}</div>
                          <div className={`font-semibold text-xs ${newLeague.sports.includes(sport.code) ? getSportTextColor(sport.code) : ''}`}>{sport.name}</div>
                          {sport.maxLeagueSize && (
                            <div className="text-[10px] text-slate-500 mt-1">max {sport.maxLeagueSize}</div>
                          )}
                          {newLeague.sports.includes(sport.code) && (
                            <div className="mt-1 flex justify-center">
                              <Check size={14} className={getSportTextColor(sport.code)} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-slate-700 bg-slate-800 rounded-b-2xl">
                {/* Validation Messages */}
                {(!newLeague.name || newLeague.sports.length < 3 || newLeague.members.filter(email => email.trim() !== '').length < 1 || newLeague.members.filter(email => email.trim() !== '').length > MAX_ADDITIONAL_MEMBERS || Object.keys(emailErrors).length > 0) && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-sm text-red-400 font-semibold mb-1">Please fix the following:</p>
                    <ul className="text-xs text-red-400 list-disc list-inside space-y-1">
                      {!newLeague.name && <li>Enter a league name</li>}
                      {newLeague.sports.length < 3 && <li>Select at least 3 sports</li>}
                      {newLeague.members.filter(email => email.trim() !== '').length < 1 && <li>Add at least 1 other league member</li>}
                      {newLeague.members.filter(email => email.trim() !== '').length > MAX_ADDITIONAL_MEMBERS && <li>League can have at most {MAX_LEAGUE_MEMBERS} total members including commissioner</li>}
                      {Object.keys(emailErrors).length > 0 && <li>Fix invalid email addresses</li>}
                    </ul>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="px-6 py-3 text-slate-400 hover:text-white transition-colors font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createLeague}
                    disabled={
                      !newLeague.name ||
                      newLeague.sports.length < 3 ||
                      newLeague.members.filter(email => email.trim() !== '').length < 1 ||
                      newLeague.members.filter(email => email.trim() !== '').length > MAX_ADDITIONAL_MEMBERS ||
                      Object.keys(emailErrors).length > 0
                    }
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                  >
                    Create League
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
                Configure draft settings. Timer and pause window can be updated even after draft starts.
              </p>
              {selectedLeague?.draftStarted && (
                <p className="text-xs text-amber-300 mt-2">
                  Draft is in progress: only timer settings can be changed.
                </p>
              )}
            </div>

            <div className="p-6 space-y-6">
              {!selectedLeague?.draftStarted && (
                <>
                  {/* Draft Rounds */}
                  <div>
                    <h3 className="text-base font-semibold text-white mb-2">
                      Draft Rounds
                    </h3>
                    <p className="text-sm text-slate-400 mb-4">
                      Must be at least number of sports. Recommended: sports + 5 flex picks.
                    </p>
                    <select
                      value={draftOrderSettings.draftRounds || selectedLeague?.draftRounds || 8}
                      onChange={(e) => setDraftOrderSettings({
                        ...draftOrderSettings,
                        draftRounds: parseInt(e.target.value, 10)
                      })}
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-white"
                    >
                      {[...Array(23)].map((_, i) => {
                        const rounds = i + 3;
                        const minRounds = Math.max(3, selectedLeague?.sports?.length || 0);
                        return (
                          <option key={`home-draft-rounds-${rounds}`} value={rounds} disabled={rounds < minRounds}>
                            {rounds} rounds
                          </option>
                        );
                      })}
                    </select>
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
                    id="homeTimerPauseEnabled"
                    checked={draftOrderSettings.timerPauseEnabled !== false}
                    onChange={(e) => setDraftOrderSettings({
                      ...draftOrderSettings,
                      timerPauseEnabled: e.target.checked
                    })}
                    className="w-5 h-5 bg-slate-900 border-slate-700 rounded"
                  />
                  <label htmlFor="homeTimerPauseEnabled" className="text-base font-semibold text-white">
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
                        <option key={`home-pause-start-${hour}`} value={hour}>{formatHourLabel(hour)}</option>
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
                        <option key={`home-pause-end-${hour}`} value={hour}>{formatHourLabel(hour)}</option>
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
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-700 bg-slate-800">
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
                <button onClick={() => setShowUserSettings(false)} className="text-slate-400 hover:text-white transition-colors">
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
                      checked={!!myDraftSettings?.autoPickFromQueue}
                      onChange={(e) => updateDraftSettings({ autoPickFromQueue: e.target.checked })}
                      className="mt-0.5 rounded bg-slate-900 border-slate-600"
                    />
                    <div>
                      <div className="text-sm text-white">Auto-pick from queue</div>
                      <div className="text-xs text-slate-400 mt-0.5">When it's your turn to pick in any draft, automatically select the top team from your queue</div>
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

      {/* Home Sports Modal */}
      {showHomeSportsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex flex-col justify-end md:items-center md:justify-center md:p-4">
          <div className="bg-slate-800 rounded-t-2xl md:rounded-2xl max-w-6xl w-full border border-slate-700 shadow-2xl h-[80vh] md:h-auto md:max-h-[90vh] flex flex-col">
            <div className="p-3 md:p-6 border-b border-slate-700 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-white">Sports</h2>
                <p className="text-sm text-slate-400 mt-1">General catalog across all supported sports.</p>
              </div>
              <button onClick={() => setShowHomeSportsModal(false)} className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-700/50 rounded">
                <X size={22} />
              </button>
            </div>
            <div className="p-3 md:p-6 overflow-y-auto flex-1 min-h-0">
              {(() => {
                const search = homeSportsSearch.trim().toLowerCase();
                const rows = selectableSports.flatMap(({ code, name }) => {
                  const teams = TEAM_POOLS[name] || [];
                  return teams.map((team) => ({
                    sport: code,
                    team,
                    ep: expectedPoints?.[code]?.[team] ?? null
                  }));
                }).filter((row) => {
                  if (homeSportsFilter !== 'ALL' && row.sport !== homeSportsFilter) return false;
                  if (search && !`${row.team}`.toLowerCase().includes(search)) return false;
                  return true;
                }).sort((a, b) => {
                  let cmp = 0;
                  if (homeSportsSortBy === 'ep') {
                    const aEP = a.ep ?? Number.NEGATIVE_INFINITY;
                    const bEP = b.ep ?? Number.NEGATIVE_INFINITY;
                    cmp = aEP === bEP ? a.team.localeCompare(b.team) : aEP - bEP;
                  } else {
                    cmp = a.team.localeCompare(b.team);
                  }
                  return homeSportsSortDir === 'asc' ? cmp : -cmp;
                });

                return (
                  <>
                    <div className="mb-4 flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={homeSportsSearch}
                        onChange={(e) => setHomeSportsSearch(e.target.value)}
                        placeholder="Search team or player"
                        className="lg:flex-[2] px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                      <select
                        value={homeSportsFilter}
                        onChange={(e) => setHomeSportsFilter(e.target.value)}
                        className="lg:flex-1 px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <option value="ALL">All sports</option>
                        {selectableSports.map((sport) => (
                          <option key={`home-sports-filter-${sport.code}`} value={sport.code}>{sport.name}</option>
                        ))}
                      </select>
                      <select
                        value={homeSportsSortBy}
                        onChange={(e) => setHomeSportsSortBy(e.target.value)}
                        className="lg:flex-1 px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <option value="ep">Sort: EP</option>
                        <option value="team">Sort: Team</option>
                      </select>
                      <button
                        onClick={() => setHomeSportsSortDir((prev) => prev === 'desc' ? 'asc' : 'desc')}
                        className="px-4 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-sm text-white hover:border-slate-500 transition-colors"
                        title={homeSportsSortDir === 'desc' ? 'Descending' : 'Ascending'}
                      >
                        {homeSportsSortDir === 'desc' ? '↓' : '↑'}
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
                          {rows.map((row) => (
                            <div key={`home-sports-row-${row.sport}-${row.team}`} className="grid grid-cols-[minmax(0,1fr)_90px_90px] md:grid-cols-[minmax(0,1fr)_120px_140px] gap-0 items-center px-3 py-2 border-b border-slate-700/40 text-left text-white bg-slate-900/65">
                              <div className="font-semibold min-w-0 pr-2">
                                <button
                                  className="text-left hover:text-amber-300 transition-colors line-clamp-2 w-full"
                                  onClick={() => {
                                    setShowHomeSportsModal(false);
                                    homeTeamInfoFromSportsRef.current = true;
                                    setSelectedHomeTeamInfo({ sport: row.sport, team: row.team, currentEP: row.ep });
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
                                ) : (
                                  <span className="text-slate-500">TBD</span>
                                )}
                              </div>
                            </div>
                          ))}
                          {rows.length === 0 && (
                            <div className="px-3 py-6 text-center text-sm text-slate-500">
                              No options match your filters.
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Home Team Info Popup */}
      {selectedHomeTeamInfo && (
        <TeamPopup
          sport={selectedHomeTeamInfo.sport}
          team={selectedHomeTeamInfo.team}
          currentEP={selectedHomeTeamInfo.currentEP}
          onClose={() => {
            setSelectedHomeTeamInfo(null);
            if (homeTeamInfoFromSportsRef.current) {
              homeTeamInfoFromSportsRef.current = false;
              setShowHomeSportsModal(true);
            }
          }}
        />
      )}

      <RulesModal show={showRulesModal} onClose={() => setShowRulesModal(false)} />
      </div>
    );
  }
  // League Page View
  if (currentView === 'league') {
    const appCtx = {
      selectedLeague, selectedLeagueId, currentUser,
      supabasePicks, supabaseDraftState,
      sportResults: filteredSportResults, resultsLoading,
      getSportColor, formatPick, getExpectedPoints, hasNoEPData, refreshExpectedPoints,
      myRoster, setCurrentView, backToHome, handleLogout,
      showRulesModal, setShowRulesModal,
      receiveOtcEmails, setReceiveOtcEmails,
      draftSettings: myDraftSettings, onUpdateDraftSettings: updateDraftSettings,
      getDraftPoolForSport,
      allSportCodes: homeSportCodes,
      epLoading,
      timeRemaining,
      formatTimeRemaining,
      isTimerPaused: isInPauseWindow(
        selectedLeague?.draftTimer,
        selectedLeague?.timerPauseStartHour ?? 0,
        selectedLeague?.timerPauseEndHour ?? 8
      ),
    };
    return (
      <AppContext.Provider value={appCtx}>
        <LeagueView
          deleteLeague={deleteLeague}
          setDraftOrderSettings={setDraftOrderSettings}
          draftOrderSettings={draftOrderSettings}
          setShowDraftSettingsModal={setShowDraftSettingsModal}
          setShowStartDraftConfirmation={setShowStartDraftConfirmation}
          leagueTab={leagueTab}
          setLeagueTab={setLeagueTab}
          standings={standings}
          getRankChange={getRankChange}
          draftBoard={draftBoard}
          updateLeague={updateLeague}
          reloadLeagues={reloadLeagues}
          showDraftSettingsModal={showDraftSettingsModal}
          showStartDraftConfirmation={showStartDraftConfirmation}
          startDraft={startDraft}
          resultsError={resultsError}
          retryResults={retryResults}
          setShowUserSettings={setShowUserSettings}
          showUserSettings={showUserSettings}
        />
        <LeagueChat
          leagueId={selectedLeagueId}
          currentUser={currentUser}
          isOpen={showLeagueChat}
          onOpen={() => setShowLeagueChat(true)}
          onClose={() => setShowLeagueChat(false)}
        />
      </AppContext.Provider>
    );
  }

  // Draft Room View
  if (currentView === 'draft') {
    const appCtx = {
      selectedLeague, selectedLeagueId, currentUser,
      supabasePicks, supabaseDraftState,
      sportResults: filteredSportResults, resultsLoading,
      getSportColor, formatPick, getExpectedPoints, hasNoEPData, refreshExpectedPoints,
      myRoster, setCurrentView, backToHome, handleLogout,
      showRulesModal, setShowRulesModal,
      receiveOtcEmails, setReceiveOtcEmails,
      draftSettings: myDraftSettings, onUpdateDraftSettings: updateDraftSettings,
      allSportCodes: homeSportCodes,
      epLoading,
    };
    return (
      <AppContext.Provider value={appCtx}>
        <DraftView
          makePickDB={makePickDB}
          setTimerExpired={setTimerExpired}
          undoPickDB={undoPickDB}
          formatTimeRemaining={formatTimeRemaining}
          timeRemaining={timeRemaining}
          isInPauseWindow={isInPauseWindow}
          activeDraftSport={activeDraftSport}
          setActiveDraftSport={setActiveDraftSport}
          getSportNameByCode={getSportNameByCode}
          getDraftPoolForSport={getDraftPoolForSport}
          expectedPoints={expectedPoints}
          setPendingPick={setPendingPick}
          setShowPickConfirmation={setShowPickConfirmation}
          showPickConfirmation={showPickConfirmation}
          pendingPick={pendingPick}
          queue={myQueue}
          onAddToQueue={addToQueue}
          onRemoveFromQueue={removeFromQueue}
          onMoveQueueItem={moveQueueItem}
          onClearQueue={clearQueue}
          onReorderQueue={reorderAllQueue}
          queueError={queueError}
        />
        <LeagueChat
          leagueId={selectedLeagueId}
          currentUser={currentUser}
          isOpen={showLeagueChat}
          onOpen={() => setShowLeagueChat(true)}
          onClose={() => setShowLeagueChat(false)}
        />
      </AppContext.Provider>
    );
  }
};

export default OmnifantasyApp;
