# OmniFantasy Development Guide

## Project Overview

OmniFantasy is a multi-sport fantasy league platform built with React, Vite, and Supabase. Commissioners can create leagues spanning multiple sports and conduct snake drafts with their friends. Expected points (EP) from betting odds are displayed next to each draft option.

**Tech Stack:**
- Frontend: React 18 + Vite
- Styling: TailwindCSS
- Backend: Supabase (PostgreSQL + Real-time)
- Authentication: Supabase Auth (Email/Password)
- Icons: Lucide React
- Odds Data: The Odds API (free tier, 500 credits/month) + custom scraper for F1/Tennis

## Key Files

- `src/main.jsx` - Entry point; wraps app in ErrorBoundary for render crash recovery
- `src/omnifantasy-app.jsx` - Main application component: shared state, auth UI, home view, and modal orchestration
- `src/views/LeagueView.jsx` - League detail page component (tabs: My Roster, Standings, Big Board, Draft Results; default tab: `'my-roster'`)
- `src/views/DraftView.jsx` - Draft room component (live drafting interface with sport tabs and EP display). Has tab bar: **Pick** (draft grid), **Big Board** (all rosters), **Draft Results** (full pick list). Big Board and Draft Results tabs are always visible (not gated on draft completion). Mobile shows toast for locked pick reasons.
- `src/config/sports.js` - Sports configuration: `AVAILABLE_SPORTS`, `TEAM_POOLS`, `EP_DRIVEN_POOL_SPORTS`, color helpers, `isTournamentYear`
- `src/utils/draft.js` - Draft helpers: `generateDraftBoard`, `formatPickNumber`, `getPickerIndex`, `normalizeDraftPicker`, `getCurrentPickerFromState`, `compareByEP`, `wouldBreakSportCoverage`, `picksUntilTurn`
- `src/utils/standings.js` - `generateStandings(league, picks, currentUserEmail, results, previousRankMap)` helper
- `src/utils/points.js` - Point-calculation utilities: `calculatePickPoints`, `computeStandingsFromPicks`, `filterResultsForLeague`, `getPartialMultiEventPoints`
- `src/utils/userDisplay.js` - User display helpers: `getUserDisplayName(user)` (first/last name from metadata, falls back to email prefix); `getUserInitials(user)` for avatar initials
- `src/utils/format.js` - `formatHourLabel(hour)` converts 24-hour integer to 12-hour AM/PM string; `formatTimeRemaining(ms)` converts milliseconds to a human-readable countdown string (e.g. `"3h 12m"`, `"45s"`)
- `src/hooks/useAutoPickLogic.js` - Extracted auto-pick hook. Manages both auto-pick effects (timer expiry + immediate queue pick). Returns `{ cancelAutoPickCountdown, autoPickCountdown }`. Internally tracks `lastAutoPickKeyRef`, `autoPickCountdownRef`, `prevCurrentPickRef` to prevent duplicate fires and mount-time false triggers.
- `src/components/TimerDisplay.jsx` - Unified draft-timer display. Props: `{ timeRemaining, isPaused, pauseEndHour = 8, compact = false }`. `compact=true` → inline `<span>` (used in headers); `compact=false` → full block card (used in DraftView main timer). Paused state always shows resume time. Active: red+pulse <60s, yellow <5m, blue/green ≥5m.
- `src/utils/aliases.js` - **Single source of truth for all team name alias maps.** `ODDS_API_ALIASES` (The Odds API → TEAM_POOLS), `ESPN_RESULT_ALIASES` (ESPN → TEAM_POOLS), `F1_NAME_ALIASES` (Jolpica diacritics). Exports `normalizeOddsApiName`, `normalizeResultName`, `normalizeF1Name`. Add new aliases here — consumers auto-pick them up.
- `src/context/AppContext.jsx` - React context shared by DraftView and LeagueView. Provides the ~22 props common to both views (including `epLoading`). Provider wraps each view return in `omnifantasy-app.jsx`. Consume with `useAppContext()` hook.
- `src/resultsApi.js` - Fetches final sport results from ESPN/Jolpica APIs, caches in `sport_results` table
- `src/useResults.js` - React hook wrapping `resultsApi.js`: `useResults(sportCodes)` → `{ results, loading, error, retryResults }`
- `src/supabaseClient.js` - Database operations (CRUD for leagues, picks, draft state, odds cache)
- `src/useSupabase.js` - React hooks: `useAuth`, `useLeagues`, `useDraft`
- `src/oddsApi.js` - The Odds API integration: fetches championship odds, converts to expected points via positional probability model, caches in Supabase.
- `src/oddsScraper.js` - Data fetcher for sports not on The Odds API (F1, Men's Tennis, Women's Tennis). F1 uses Jolpica API mid-season, all use market-derived preseason odds as fallback.
- `src/useExpectedPoints.js` - React hook that wraps `oddsApi.js` for component use. Returns `{ expectedPoints, loading, error, refreshExpectedPoints }`. `loading` is exposed as `epLoading` in `omnifantasy-app.jsx` and passed via `AppContext`.
- `src/useTeamNews.js` - Fetches recent news from ESPN API for a team/sport. Returns `{ news: [], hasTeamNews: bool, loading }`. Searches headlines for team name; falls back to top sport headlines. 10-minute in-memory cache.
- `src/useTeamPerformance.js` - Hook: `useTeamPerformance(sport, team)` → `{ performance, loading }`. Fetches the most recently completed season's result for a team from `sport_results` DB. For current in-progress seasons, fetches the prior completed season. Returns `{ type: 'single'|'multi'|'f1', season, result, isComplete, ... }`. Used in TeamPopup Performance tab.
- `src/useTeamRecord.js` - Hook: `useTeamRecord(sport, team, season)` → `{ record, loading, error }`. Fetches live season W-L standings from ESPN standings API or Jolpica (F1). 1-hour localStorage cache. Exports `SPORT_SEASONS` (per-sport `{ current, previous, currentLabel, previousLabel, seasonStarted, currentComplete }`). Returns `{ type: 'team', wins, losses, otLosses, ties, playoffSeed, division }` or `{ type: 'f1', position, points, wins, total }`. Skips Golf/Tennis/Euro/WorldCup (returns null).
- `database/database-setup.sql` - Complete database schema with RLS policies
- `database/database-migration-timer.sql` - Migration for `pick_started_at` column (draft timer)
- `database/database-migration-picker-name.sql` - Migration for `picker_name` column
- `database/database-migration-odds-cache.sql` - Migration for `odds_cache` table
- `database/database-migration-results.sql` - Migration for `sport_results` table
- `database/database-migration-third-round-reversal.sql` - Migration for `third_round_reversal` on `draft_state`
- `database/database-migration-draft-sport-requirement.sql` - Migration for `draft_every_sport_required` on `draft_state`
- `database/database-migration-timer-pause-window.sql` - Migration for `timer_pause_start_hour`/`timer_pause_end_hour` on `leagues`
- `database/database-migration-draft-queue.sql` - Migration for `draft_queue` and `draft_member_settings` tables
- `database/database-migration-ep-history.sql` - Migration for `ep_history` table (EP trend data for team popups)
- `database/database-migration-league-chat.sql` - Migration for `league_chat` table (per-league real-time chat)
- `database/database-migration-league-emoji.sql` - Migration for `league_emoji TEXT DEFAULT '🏆'` column on `leagues`
- `database/database-migration-draft-picks-unique.sql` - Migration for `UNIQUE (league_id, pick_number)` constraint on `draft_picks` (race protection for server-side auto-pick)
- `database/database-migration-member-status.sql` - Migration for `status` column on `league_members` (invite/accept flow)
- `database/database-migration-draft-reminders.sql` - Migration for `draft_reminders` table (OTC/1h reminder dedup) + `get_user_otc_pref(p_email)` SECURITY DEFINER RPC + commented pg_cron setup
- `supabase/functions/auto-pick-from-queue/index.ts` - Edge Function: **server-side auto-pick**. Triggered by a Supabase database webhook on `draft_state` UPDATE. When `current_pick` advances, checks if new picker has `auto_pick_from_queue` enabled → picks their first available queue item → advances `draft_state` → sends OTC email. Cascades naturally through consecutive auto-pick-enabled pickers. Race-safe: unique constraint on `(league_id, pick_number)` in `draft_picks` silently discards duplicate inserts (code `23505`). Requires `APP_URL` secret for email links. Webhook setup: Supabase Dashboard → Database → Webhooks → Table: `draft_state`, Event: Update, URL: `{SUPABASE_URL}/functions/v1/auto-pick-from-queue`, Header: `Authorization: Bearer {SERVICE_ROLE_KEY}`.
- `supabase/functions/send-draft-start-email/index.ts` - Edge Function: emails **all accepted members** when a draft starts (fire-and-forget, no OTC preference check); link: `?draft={leagueId}`; called 2s after `startDraftDB` resolves via `sendDraftStartEmail(leagueId)` in `supabaseClient.js`
- `supabase/functions/send-otc-email/index.ts` - Edge Function: emails next picker after each pick (fire-and-forget, 1.5s delay to avoid stale `draft_state`); checks **only** picker's `receive_otc_emails` via `get_user_otc_pref` RPC (league-level `send_otc_emails` is no longer checked by Edge Functions); link: `?draft={leagueId}`
- `supabase/functions/check-timer-reminders/index.ts` - Edge Function: cron job (every 15 min); sends "1 hour left" reminder to pickers whose timer is within 1h of expiry; deduplicates via `draft_reminders` table; requires `APP_URL` secret
- `supabase/functions/_shared/draft-helpers.ts` - Shared Deno module: `getPickerIndex`, `normalizeDraftPicker`, `timerStringToMs`, `computeTimeRemaining` (pause-aware), `sendEmail`, `escapeHtml`
- `src/useDraftQueue.js` - React hook for managing a user's personal draft queue and per-league draft settings. Returns `{ queue, settings, loading, error, addItem, removeItem, moveItem, reorderAll, clearAll, updateSettings, reload }`. Mutations use optimistic state updates with snapshot+restore rollback on DB failure; `error` is set on failure and cleared on the next mutation attempt. `reorderAll(reorderedItems)` bulk-reorders the queue optimistically and calls `reorderQueue` in `supabaseClient.js`.
- `src/useEPHistory.js` - React hook: `useEPHistory(sportCode, teamName)` → `{ history: [{date, ep}], loading }`. Fetches EP trend data for a team from the `ep_history` table.
- `src/components/TeamPopup.jsx` - Modal popup with 3 tabs: **EP Trend** (Recharts LineChart, 1W/1M/3M/All time frame selector), **Performance** (live season record from `useTeamRecord` + completed season result from `useTeamPerformance`; season selector for current/previous year; sport-specific playoff labels e.g. "Won the Super Bowl", "Lost in the Conference Finals"; Live badge for in-progress seasons), **News** (ESPN headlines). Opens when any team name is clicked in DraftView or LeagueView. Props: `{ sport, team, currentEP, onClose }`.
- `src/components/SportBadge.jsx` - Sport code/name badge with color styling. Props: `sport`, `size` ('sm'|'md'|'pill'), `className`
- `src/components/TabButton.jsx` - Tab navigation button with underline indicator. Props: `label`, `isActive`, `onClick`
- `src/components/EmptyState.jsx` - Centered placeholder with icon, title, description
- `src/components/ConfirmModal.jsx` - Styled confirmation dialog (used for delete/destructive actions). Props: `title`, `message`, `confirmLabel`, `confirmClassName`, `onConfirm`, `onCancel`, `error`
- `src/components/RulesModal.jsx` - Expandable help modal explaining scoring rules. Props: `show`, `onClose`
- `src/components/LeagueChat.jsx` - Floating 💬 chat widget (fixed bottom-right). Visible on LeagueView and DraftView. Props: `{ leagueId, currentUser, isOpen, onOpen, onClose }`. Internally uses `useChatMessages`. Unread badge when closed. Emoji palette (hardcoded ~60 emoji, no external library). 500-char limit. Enter to send, Esc to close.
- `src/useChatMessages.js` - Hook: `useChatMessages(leagueId, userEmail, isOpen)` → `{ messages, loading, unreadCount, sendMessage, clearUnread }`. Loads last 100 messages on mount, real-time via `subscribeToLeagueChat`, optimistic insert with rollback, unread count increments for other-user messages while panel is closed.
- `src/__tests__/draft.test.js` - Vitest unit tests for `getPickerIndex`, `normalizeDraftPicker`, `formatPickNumber`
- `src/__tests__/points.test.js` - Vitest unit tests for `calculatePickPoints`, `filterResultsForLeague`, multi-event Golf/F1 point aggregation
- `src/__tests__/aliases.test.js` - Vitest unit tests for all alias normalizer functions (`normalizeOddsApiName`, `normalizeResultName`, `normalizeF1Name`)
- `src/__tests__/format.test.js` - Vitest unit tests for `formatHourLabel`

## Application Architecture

### Views (controlled by `currentView` state)

The app uses early-return `if` blocks in `omnifantasy-app.jsx` for view switching, but the actual view JSX is in separate components:

- **`'home'`** - My Leagues page: league cards with status, "Your turn!" indicators (rendered inline in `omnifantasy-app.jsx`)
- **`'league'`** - `<LeagueView>` component: tabs in order: My Roster, Standings, Big Board, Draft Results (default tab: `'my-roster'`); Draft Results tab appears as soon as the first pick is made
- **`'draft'`** - `<DraftView>` component: live drafting interface with sport-grouped team selection, EP displayed per option

**Modals** (create league, draft settings, start draft confirmation) are rendered in `omnifantasy-app.jsx` and passed down or conditionally rendered per view.

### State Management

- React hooks (useState, useEffect) — no external state library
- Real-time subscriptions via Supabase channels
- Custom hooks:
  - `useAuth()` — authentication state, returns `{ user, loading, authMessage, signIn, signUp, signOut, clearAuthMessage }`. `signUp(email, password, firstName, lastName)` stores first/last name in `user_metadata`.
  - `useLeagues(userEmail)` — league CRUD, returns `{ leagues, loading, createLeague, deleteLeague, reload: loadLeagues }`. League objects are camelCased (e.g. `draftRounds`, `timerPauseStartHour`, `timerPauseEnabled`). Max 20 members per league (`MAX_LEAGUE_MEMBERS = 20`).
  - `useDraft(leagueId)` — draft state/picks for selected league, returns `{ draftState, picks, loading, startDraft, makePick, undoPick }`. `draftState` is camelCased: `{ currentPick, currentRound, draftOrder, isSnake, thirdRoundReversal, draftEverySportRequired, pickStartedAt }`. `undoPick(targetPickNumber?)` rolls back to any pick number (defaults to previous pick).
  - `useExpectedPoints(sportCodes)` — fetches EP for array of sport codes, returns `{ expectedPoints, loading, error, refreshExpectedPoints }`. `loading` is aliased as `epLoading` in `omnifantasy-app.jsx` and shared via `AppContext`. Call `refreshExpectedPoints()` to force a re-fetch.
  - `useDraftQueue(leagueId, userEmail)` — manages a user's personal draft queue and per-league draft settings. Returns `{ queue, settings, loading, error, addItem, removeItem, moveItem, reorderAll, clearAll, updateSettings, reload }`. `queue` is sorted by `position` ascending. `settings = { autoPickFromQueue: bool }`. Mounted in `omnifantasy-app.jsx` and props threaded through to `DraftView`. Note: `receiveOtcEmails` is a **global** preference stored in `user_metadata` (not per-league), managed via `updateUserMetadata()` from `supabaseClient.js`.
  - `useResults(sportCodes)` — fetches final sport results. Returns `{ results, loading, error, retryResults }`. Called in `omnifantasy-app.jsx`; `sportResults` and `resultsLoading` passed as props to `LeagueView`. `retryResults()` clears the error state before re-fetching.
  - `useEPHistory(sportCode, teamName)` — fetches EP trend data. Returns `{ history: [{date, ep}], loading }`. Used in `TeamPopup.jsx`.
  - `useTeamNews(sport, team)` — fetches recent ESPN news. Returns `{ news: [], hasTeamNews: bool, loading }`. Used in `TeamPopup.jsx`. 10-minute in-memory cache; team-name filtered with sport-level fallback.

### Critical: `reloadLeagues()` After Mutations

After any DB mutation that affects league display (starting draft, saving settings, etc.), you **must** call `reloadLeagues()` (the `reload` returned by `useLeagues`) to refresh the local state. Without this, the UI shows stale data.

```javascript
await startDraft(draftOrder, options);
await reloadLeagues();
setCurrentView('draft');
```

## Database Schema

### Core Tables

1. **leagues** - `id`, `name`, `commissioner_email`, `sports[]`, `draft_rounds`, `draft_started`, `draft_timer`, `send_otc_emails`, `draft_date`, `timer_pause_start_hour`, `timer_pause_end_hour`, `league_emoji` (TEXT DEFAULT '🏆'), `created_at`
2. **league_members** - `id`, `league_id`, `email`, `name`, `draft_position`, `status` (TEXT: `'pending'`|`'accepted'`|`'declined'`, DEFAULT `'pending'`), `joined_at`
3. **draft_picks** - `id`, `league_id`, `pick_number`, `round`, `picker_email`, `picker_name`, `sport`, `team`, `team_name`, `created_at`
4. **draft_state** - `league_id`, `current_pick`, `current_round`, `draft_order`, `is_snake`, `third_round_reversal`, `draft_every_sport_required`, `pick_started_at`, `updated_at`
5. **odds_cache** - `sport_code` (PK), `data` (JSONB), `updated_at` — shared EP cache for all users
6. **sport_results** - `(sport_code, season)` (PK), `results` (JSONB), `updated_at` — shared final results cache; automatically populated from ESPN/Jolpica APIs
7. **draft_queue** - `id`, `league_id`, `user_email`, `sport`, `team`, `position` (integer, 1-based), `created_at` — per-user ordered queue of teams to draft. UNIQUE `(league_id, user_email, sport, team)`. RLS: SELECT = any authenticated (commissioner reads picker's queue for autopick); INSERT/UPDATE/DELETE = own rows only.
8. **draft_member_settings** - `(league_id, user_email)` PK, `auto_pick_from_queue` (bool, default false) — per-user per-league draft preferences. RLS: SELECT = any authenticated; INSERT/UPDATE = own rows only. Note: `receive_otc_emails` moved to Supabase `user_metadata` (global across leagues) — accessed via `currentUser.user_metadata.receive_otc_emails` and updated with `updateUserMetadata({ receive_otc_emails: bool })`.
9. **ep_history** - `id` (BIGINT identity PK), `sport_code`, `snapshot_data` (JSONB — `{ 'Team Name': ep_value, ... }` for ALL teams at that moment), `captured_at` — one row per sport per odds refresh (~every 2 days). Index: `(sport_code, captured_at DESC)`. RLS: SELECT/INSERT = any authenticated.

### Critical Database Notes

- **team vs team_name**: Both columns exist and are NOT NULL. Always send both:
  ```javascript
  { team: teamName, team_name: teamName }
  ```

- **Snake_case from DB**: All properties from Supabase come as snake_case. Use `pick.pick_number`, `pick.team_name`, `pick.picker_email` — NOT camelCase.

- **`draft_rounds` not `num_rounds`**: The leagues table column is `draft_rounds`.

- **Sport Code vs Name Mapping**: DB stores sport codes (`'NCAAF'`, `'MensTennis'`), but `TEAM_POOLS` (in `src/config/sports.js`) uses display names (`'NCAA Football'`, `"Men's Tennis (ATP)"`). Always map using `getSportNameByCode` or `AVAILABLE_SPORTS`:
  ```javascript
  import { getSportNameByCode, TEAM_POOLS } from './config/sports';
  const sportName = getSportNameByCode(sportCode);  // e.g. 'ATP' for MensTennis
  const teams = TEAM_POOLS[sportName] || [];
  ```
  **Note**: `AVAILABLE_SPORTS` uses short display names `'ATP'` and `'WTA'` for tennis, but `TEAM_POOLS` still uses the legacy keys `"Men's Tennis (ATP)"` and `"Women's Tennis (WTA)"`. `TEAM_POOLS.ATP` and `TEAM_POOLS.WTA` are backward-compat aliases pointing to the same arrays.

- **Draft order entries**: `draft_order` in `draft_state` can be plain email strings or `{ email, name }` objects. Always use `normalizeDraftPicker()` from `src/utils/draft.js` before accessing picker properties.

## Expected Points (EP) System

### Architecture

1. `useExpectedPoints(sportCodes)` hook called with `selectedLeague?.sports`
2. Calls `fetchAllExpectedPoints()` from `oddsApi.js`
3. For each sport, checks Supabase `odds_cache` table first (shared across all users)
4. If cache is fresh (< 2 days) and version matches `CACHE_VERSION`, returns cached data
5. If stale, claims a refresh lock (bumps `updated_at`), fetches from The Odds API or scraper, stores result
6. Optimistic lock with 60-second grace period prevents concurrent API calls from multiple clients

### EP Calculation — Positional Probability Model

Instead of naive `p × 270`, EP is calculated using a positional probability model:

```javascript
// Given win probability p:
P(top 2) = min(1, 2p), P(top 4) = min(1, 4p), P(top 8) = min(1, 8p)
EP = P(champ)×80 + P(runner-up)×50 + P(semifinalist)×30 + P(quarterfinalist)×20
```

This correctly sums to 270 total EP across all teams for uniform distributions, and prevents any single team from exceeding 80 EP (the champion's actual point award).

### Cache Versioning

Cached EP data includes a `_v` field set to `CACHE_VERSION` (currently **7**). When the EP formula changes, bump `CACHE_VERSION` in `oddsApi.js` to automatically invalidate stale cached values computed with the old formula.

### API Budget

- **Free tier**: 500 credits/month
- **~11 API calls per refresh** (9 single-event sports + 4 Golf majors = 13, minus seasonal gaps)
- **2-day TTL** → ~15 refreshes/month → **~165 credits/month**
- ~335 credits headroom
- F1/Tennis use free APIs or hardcoded odds — no Odds API credits consumed
- UCL, Euro, and WorldCup fetch odds from `us,uk,eu,au` regions (`GLOBAL_REGIONS_SPORTS`) for better coverage; all others use `us` only
- NCAAF uses `STRICT_FUTURES_ONLY_SPORTS` mode: never serves stale cached EP — always returns empty off-season (prevents outdated preseason odds from persisting)

### EP Coverage by Sport

| Sport | EP Status | Source |
|-------|-----------|--------|
| NFL | Working | Odds API: `americanfootball_nfl_super_bowl_winner` |
| NBA | Working | Odds API: `basketball_nba_championship_winner` |
| NCAAMB | Working | Odds API: `basketball_ncaab_championship_winner` |
| MLB | Working | Odds API: `baseball_mlb_world_series_winner` |
| NHL | Working | Odds API: `icehockey_nhl_championship_winner` |
| UCL | Working | Odds API: `soccer_uefa_champs_league_winner` |
| Euro | Working | Odds API: `soccer_uefa_european_championship_winner` |
| World Cup | Working | Odds API: `soccer_fifa_world_cup_winner` |
| Golf | Working (4 majors aggregated) | Odds API: `golf_masters_tournament_winner`, etc. |
| NCAAF | Seasonal (empty off-season) | Odds API: `americanfootball_ncaaf_championship_winner` |
| F1 | Working (scraper) | Jolpica API mid-season, preseason market odds fallback |
| Men's Tennis | Working (scraper) | Preseason market-derived odds in `oddsScraper.js` |
| Women's Tennis | Working (scraper) | Preseason market-derived odds in `oddsScraper.js` |

### oddsScraper.js — Non-API Sports

Handles F1, Men's Tennis, Women's Tennis (no Odds API coverage for these):

- **F1**: Fetches live driver standings from Jolpica API (`api.jolpi.ca`), converts championship points to win probabilities via softmax. Falls back to preseason market-derived odds during off-season or early season (<25 pts).
- **Men's Tennis / Women's Tennis**: Uses hardcoded market-derived preseason implied probabilities (aggregated from major sportsbooks' futures). Update these at the start of each season.
- All probabilities are normalized to sum to 1.0, then `calculateEP()` is applied.
- Results cached in the same `odds_cache` table with the same 2-day TTL.
- Currently using **2026 preseason odds** (`F1_PRESEASON_ODDS`, `ATP_ODDS`, `WTA_ODDS`) — update at start of each new season.
- **API Football removed**: UCL was previously fetched via API Football as a fallback; it now uses The Odds API exclusively.

### Team Name Normalization

All alias maps live in `src/utils/aliases.js` — **edit only there** when adding a new mapping. A `ODDS_API_ALIASES` map handles The Odds API names:
- NFL: `"Los Angeles Chargers"` → `"LA Chargers"`, `"New York Giants"` → `"NY Giants"`, etc.
- NBA: `"Los Angeles Lakers"` → `"LA Lakers"`, etc.
- MLB: `"Los Angeles Dodgers"` → `"LA Dodgers"`, `"Athletics"` → `"Oakland Athletics"`, etc.
- NHL: `"Montréal Canadiens"` → `"Montreal Canadiens"`, `"Utah Mammoth"` → `"Utah Hockey Club"`, etc.
- NCAAMB: `"Duke Blue Devils"` → `"Duke"`, `"Alabama Crimson Tide"` → `"Alabama"`, etc.
- UCL: `"Paris Saint Germain"` → `"Paris Saint-Germain"`, `"FC Barcelona"` → `"Barcelona"`, etc.
- NCAAF: `"Oregon Ducks"` → `"Oregon"`, `"Penn State Nittany Lions"` → `"Penn State"`, etc.
- F1: `"Nico Hülkenberg"` → `"Nico Hulkenberg"` (in `src/utils/aliases.js` `F1_NAME_ALIASES`, shared by `oddsScraper.js` and `resultsApi.js`)

Normalizer functions (`normalizeOddsApiName`, `normalizeResultName`, `normalizeF1Name`) are applied when building results from each API. If a team name from the API doesn't match our pool, no EP is shown for that option.

### EP Display in UI

```javascript
const { expectedPoints } = useExpectedPoints(selectedLeague?.sports);

const getExpectedPoints = (sportCode, teamName) => {
  return expectedPoints?.[sportCode]?.[teamName] ?? null;
};
```

EP is shown as `~X.X EP` in amber text next to each team name in the draft room, Big Board, and My Roster.

### TBD Display for Missing EP Data

When EP data is unavailable (unsupported sport, off-season, or API returned empty), "TBD" is shown instead of EP values with a CSS hover tooltip. Uses `group-hover/tip` Tailwind pattern for instant, styled tooltips (no native `title` attribute — those have ~1s delay and don't work on mobile).

The `hasNoEPData(sportCode)` helper checks both `isSportSupported()` AND whether `expectedPoints` state actually has data for that sport. This handles off-season cases like NCAAF where the sport IS in `SPORT_KEY_MAP` but the API returns empty data.

EP totals show an asterisk `*` with tooltip "Some picks lack odds data — EP total is partial" when any picks lack EP data.

## Key Helper Functions

### `src/config/sports.js`

- **`getSportColor(sport)`** — Returns full TailwindCSS classes (bg, text, border) for sport badges
- **`getSportTextColor(sport)`** — Returns text color class only; used in sport selection UI
- **`getSportNameByCode(sportCode)`** — Maps code (`'NCAAF'`) to display name (`'NCAA Football'`). Tennis codes return short names: `'MensTennis'` → `'ATP'`, `'WomensTennis'` → `'WTA'`.
- **`getSportDisplayCode(sportCode)`** — Returns a short display label: `'MensTennis'` → `'ATP'`, `'WomensTennis'` → `'WTA'`, all others unchanged.
- **`getSelectableSports(sports, year?)`** — Filters sports list by `isTournamentYear()` (gates Euro/World Cup to correct years)
- **`isTournamentYear(sportCode, year?)`** — Returns `false` for Euro/WorldCup in non-tournament years; `true` for all other sports
- **`EP_DRIVEN_POOL_SPORTS`** — `Set` of sport codes where team pool ordering is EP-driven: `['UCL', 'Euro', 'WorldCup', 'Golf', 'MensTennis', 'WomensTennis', 'F1']`

### `src/utils/draft.js`

- **`formatPickNumber(pick, numMembers)`** — Returns `"round.pick"` format (e.g., `"2.03"`). Takes `numMembers` explicitly (not from closure).

- **`getPickerIndex({ currentPick, currentRound, numMembers, isSnake, thirdRoundReversal })`** — Computes 0-based index into `draft_order` for the current pick. Handles normal snake and third-round-reversal snake variants.

- **`normalizeDraftPicker(picker)`** — Normalizes a draft order entry (string email or `{email, name}` object) to `{ email, name }`. Always use this before accessing picker properties.

- **`getCurrentPickerFromState(draftState)`** — Returns normalized `{ email, name }` for who picks next, given the full `draftState` object.

- **`generateDraftBoard(picks, currentUserEmail)`** — Maps raw DB picks to `[{ ...pick, isUser: bool }]`. Takes `currentUserEmail` explicitly.

- **`compareByEP(a, b)`** — Comparator for sorting rows `{ ep, team }` by EP descending (NaN-safe; nulls sort last), with alphabetical tiebreak. Usage: `arr.sort((a,b) => dir === 'asc' ? compareByEP(a,b) : -compareByEP(a,b))`.

- **`wouldBreakSportCoverage({ sportRequirementEnabled, leagueSports, pool, draftEmails, picks, pickerEmail, sport, team })`** — Returns `true` if picking `team` in `sport` would leave too few remaining teams for members who still need that sport (only relevant when `draft_every_sport_required = true`). Called both client-side in the UI and server-side inside `makePick` in `supabaseClient.js`.

- **`picksUntilTurn({ myEmail, draftOrder, currentPick, currentRound, isSnake, thirdRoundReversal })`** — Returns the number of picks until it is `myEmail`'s next turn (searches up to `numMembers * 2` picks ahead). Used for the auto-pick countdown display in DraftView.

### `src/utils/standings.js`

- **`generateStandings(league, picks, currentUserEmail, results, previousRankMap)`** — Builds standings rows sorted by real points. Pass `picks` from `useDraft()`, `results` from `useResults()`, and `previousRankMap` (`{ [email]: rank }`) from the localStorage snapshot for rank-change arrows. Falls back to zero-point rows if results are not yet available. `previousRankMap` defaults to `{}`.

### `src/utils/points.js`

- **`calculatePickPoints(pick, resultsMap)`** — Returns points for a single pick (80/50/30/20), `null` if the sport is not yet complete, or `0` if complete but pick didn't score. For Golf/Tennis, uses `results.rankings[]` (ranked by accumulated event points) to determine final Omnifantasy placement.
- **`computeStandingsFromPicks(membersList, picks, resultsMap, currentUserEmail)`** — Aggregates points across all picks and returns sorted standings rows.
- **`getPartialMultiEventPoints(pick, resultsMap)`** — For in-progress Golf/Tennis, returns `{ accumulated, eventsComplete, eventsTotal }` based on per-event scores so far (8/5/3/2/1 per event). Returns `null` for non-Golf/Tennis sports, when sport is already complete, or when no events have finished yet. Used in LeagueView My Roster and Big Board to show mid-season progress.
- **`filterResultsForLeague(results, draftDate)`** — Filters Golf/Tennis events to those starting on/after `draftDate`, then recomputes `rankings[]` from the filtered events. Ensures leagues don't get credit for events before their draft.

### `src/resultsApi.js`

- **`fetchSportResults(sportCode)`** — Fetches final results for one sport. Checks `sport_results` Supabase cache first (30-day TTL if complete, 4-hour TTL if in-progress). Uses ESPN API for most sports, Jolpica for F1.
- **`fetchAllResults(sportCodes)`** — Parallel fetch for multiple sport codes, returns `{ [sportCode]: result }`.
- `RESULT_NAME_ALIASES` — Maps ESPN team names to `TEAM_POOLS` names. Add entries here when mismatches are found.
- Cache TTL: 30 days for complete seasons, 4 hours for in-progress seasons.

### `src/useResults.js`

- **`useResults(sportCodes)`** — React hook. Returns `{ results, loading, error, retryResults }` where `results` is `{ [sportCode]: resultObject }`. `retryResults()` clears error before re-fetching.
- Results shape: `{ champion, runner_up, semifinals[], quarterfinalists[], is_complete, season }` for single-event sports; `{ events: [...], rankings: string[], is_complete, season }` for Golf/Tennis (rankings = players sorted by accumulated event points, used for final Omnifantasy 80/50/30/20 award); `{ standings: [...], is_complete, season }` for F1.
- Called in `omnifantasy-app.jsx` with `selectedLeague?.sports`; `sportResults` and `resultsLoading` are passed as props to `LeagueView`.

### `src/oddsApi.js`

- **`calculateEP(winProbability)`** — Exported; used by `oddsScraper.js` to compute EP from normalized probabilities.
- **`isSportSupported(sportCode)`** — Returns `true` if sport is in `SPORT_KEY_MAP` or `isScrapedSport()`.

### `src/utils/format.js`

- **`formatHourLabel(hour)`** — Converts a 24-hour integer (0–23) to a 12-hour AM/PM string (e.g. `0` → `"12 AM"`, `13` → `"1 PM"`). Used in timer pause window display.
- **`formatTimeRemaining(ms)`** — Converts milliseconds to a human-readable countdown (e.g. `"3h 12m"`, `"45s"`, `"< 1s"`). Returns `null` when `ms` is null/undefined. Used by `TimerDisplay.jsx`.

## 13 Supported Sports

| Code | Display Name | Color | Draft Options |
|------|------|-------|---------------|
| NFL | NFL | orange-500 | 32 teams |
| NCAAF | NCAA Football | amber-500 | 59 schools |
| NBA | NBA | blue-500 | 30 teams |
| NCAAMB | NCAA Men's Basketball | indigo-500 | 60 schools |
| MLB | MLB | red-500 | 30 teams |
| NHL | NHL | cyan-500 | 32 teams |
| UCL | UEFA Champions League | emerald-500 | 32 clubs |
| Euro | UEFA Euro | sky-500 | 24 countries |
| WorldCup | World Cup | teal-500 | 32 countries |
| F1 | F1 | red-600 | 20 drivers |
| Golf | Golf (majors) | lime-500 | 15 golfers |
| MensTennis | ATP | violet-500 | 30 players |
| WomensTennis | WTA | pink-500 | 30 players |

Notes:
- F1 options are individual **drivers** (not teams). 2026 pool includes Liam Lawson and Kimi Antonelli.
- Euro is year-gated: only selectable in 2024, 2028, etc. (`isTournamentYear`)
- WorldCup is year-gated: only selectable in 2026, 2030, etc.

## Key Features & Implementation Details

### League Creation
- Commissioner email auto-shown in members list (not editable)
- Duplicate email validation — checks against commissioner and other members
- Deduplication in `createLeague()` using a `Set`
- Minimum 3 sports required
- Only year-appropriate sports shown via `getSelectableSports()`
- Sport selection uses colored text on dark boxes (`getSportTextColor`)
- **League emoji**: Emoji picker row (12 curated options: 🏆 🥇 🏅 ⭐ 🔥 💪 🎯 👑 ⚡ 🎪 🎰 🤝) appears in the create-league modal. Selected emoji stored as `leagueEmoji` in local form state and passed to `createLeague()` as `league_emoji`. Commissioner can also edit the emoji inline on the home card (pencil overlay on hover → popover with 12-emoji picker → calls `updateLeague` + `reloadLeagues`).

### Draft Settings
- **Draft Order**: Random or Manual
- **Draft Rounds**: Dropdown shows recommended count (num sports + 5 flex picks). Recommended option marked with ★. Quick-set link appears when current value differs from recommended; green confirmation text when already at recommended.
- **Pick Timer**: none, 4 hours, 8 hours, 12 hours, 24 hours — stored as `draft_timer` on `leagues`
- **Timer Pause Window**: `timer_pause_start_hour` / `timer_pause_end_hour` on `leagues` (default 0–8, i.e. midnight–8am); configurable per league
- **Third Round Reversal**: `third_round_reversal` on `draft_state` — snake reverses at rounds 2+3 then continues alternating from round 4
- **Draft Every Sport Required**: `draft_every_sport_required` on `draft_state` — forces picks to cover all league sports
- **Send OTC Emails**: `send_otc_emails` on `leagues` — UI toggle still stored in DB but Edge Functions no longer gate on it; per-user `receive_otc_emails` in `user_metadata` is the sole control. **Defaults to ON** (opt-out model): `currentUser?.user_metadata?.receive_otc_emails !== false`. First picker is notified 2s after `startDraft()` via `sendOtcEmail()` in `omnifantasy-app.jsx`.

### Draft Confirmation Modal
- `showStartDraftConfirmation` state controls visibility
- Rendered in `omnifantasy-app.jsx`, surfaced during the league view flow
- Shows full settings review: member count, round count, sports list (with color badges), format (snake/reversal), draft order type, sport requirement flag, pick timer + pause window, and full manual draft order if set. Scrollable content.

### League Invite & Member Acceptance Flow

Members must accept before the draft can start. The flow:

1. **League creation**: Commissioner adds member emails. Commissioner row is inserted as `status = 'accepted'`; all other members as `status = 'pending'`. Invite emails are sent fire-and-forget via the `send-league-invite` Supabase Edge Function.
2. **Invite emails**: The Edge Function checks `auth.users` (service role) to determine if the email is a new or existing user, then sends different copy:
   - **Existing user**: "Log in at [app URL] to accept your invite."
   - **New user**: "Create a free account at [app URL] using this email address."
   - Requires Supabase secrets: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
   - Deploy: `supabase functions deploy send-league-invite`
3. **Home page**: Members with `status = 'pending'` see an amber-bordered invite card with **Accept** and **Decline** buttons instead of normal league stats. Declined leagues are hidden from that member's view.
4. **League detail (pre-draft)**: Standings tab shows a **Member Management** panel:
   - Member list with status badges: ✓ Joined / ⏳ Pending / ✗ Declined
   - Commissioner can add members (sends invite email) or remove any member (ConfirmModal)
5. **Draft start gate**: "Start Draft" button is disabled until all members have `status = 'accepted'`. Shows a message explaining who is pending or that declined members must be removed first.

**`membersList`** entries now include `{ id, email, name, status }`. The league object has `allMembersAccepted: bool`.

**New `supabaseClient.js` helpers**: `acceptLeagueInvite`, `declineLeagueInvite`, `addLeagueMember`, `removeLeagueMember`, `sendLeagueInvite`.

**Migration**: `database/database-migration-member-status.sql` — adds `status` column, backfills existing rows to `'accepted'`, adds self-update RLS policy.

### Draft Timer
- `pick_started_at` column in `draft_state` tracks when each pick began
- Pause window respects `timer_pause_start_hour` / `timer_pause_end_hour` from the league record
- Color-coded urgency in the UI

### Draft Room
- Teams sorted by EP (highest first) when EP data is available
- EP shown as `~X.X EP` in amber next to each team name
- Already-picked teams show who picked them
- "Your Picks This Draft" section shows color-coded sport pills
- Pick confirmation modal: `pendingPick` / `showPickConfirmation` states

### "Your Turn!" Indicators
- **My Leagues page**: `useLeagues` hook fetches draft state for active leagues, computes `currentPickerEmail` using `getPickerIndex` + `normalizeDraftPicker`
- **League detail page**: computed from `draftState` returned by `useDraft`
- Displayed in green text next to "Draft in progress"

### Automatic Points Assignment

Points are computed automatically from `sport_results` — no commissioner action required:
1. `useResults(selectedLeague?.sports)` fetches results in `omnifantasy-app.jsx`
2. Results are passed as `sportResults` prop to `LeagueView`
3. `calculatePickPoints(pick, sportResults)` computes points on the fly for each pick
4. `generateStandings(league, supabasePicks, userEmail, sportResults, prevRankSnapshot?.ranks || {})` sorts members by total points

Results are cached in Supabase (`sport_results` table, 30-day TTL once complete). The first client to load the standings after a sport concludes will fetch from the ESPN/Jolpica API and write the cache — all subsequent clients read from Supabase.

Points display:
- `+N` in green when sport is complete and pick scored
- `-` when sport is complete but pick didn't reach scoring positions
- Skeleton shimmer (`animate-pulse` gray bar) in Big Board/roster when results are still loading
- `null`/nothing when sport is not yet complete

### Big Board & My Roster
- Real points displayed when sport results are available
- EP shown next to picks when available
- **Compact card layout**: Pick cards use tight padding (`px-2 py-1.5`), thinner border, smaller text, and a responsive column grid (`2 col mobile / 3 sm / 4 lg / 5 xl`)

### Mobile Responsiveness
The app is fully responsive with a `md` (768px) breakpoint as the primary split:

- **Hamburger menu**: On `< md` screens, header buttons (Rules, Sports, Settings, Logout) collapse into a dropdown hamburger menu. Present in `omnifantasy-app.jsx` (home), `DraftView.jsx`, and `LeagueView.jsx`.
- **Draft queue bottom sheet**: On mobile, the sidebar queue is hidden. A sticky bottom bar with "My Queue (N items)" toggles a `h-[80vh]` bottom sheet with full queue functionality (reorder, remove, clear, settings).
- **Standings collapse cards**: On mobile, standings render as tap-to-expand cards (rank + name + points visible; per-sport breakdown revealed on tap). Desktop keeps the full table.
- **Sports catalog modal**: Bottom-anchored (`rounded-t-2xl`, no centering) on mobile; centered `md:rounded-2xl` modal on desktop. `max-h-[80vh]` on mobile, `md:max-h-[90vh]` on desktop. Team names use `line-clamp-2` instead of `truncate` for better narrow-screen display.
- **Draft board**: Card-based stacking on mobile; full grid on desktop.
- **Draft Results tab**: Card layout on mobile; full table on desktop.

### Home Page Features
- **Sports modal** (`showHomeSportsModal`): 🏟️ Sports button in header opens a full EP browser for all selectable sports (search, filter by sport, sort by EP or name). EP is fetched for ALL selectable sports while on the home page (`epSportCodes = homeSportCodes`), not just a selected league's sports. While `epLoading` is true, the modal shows 6 skeleton rows instead of data.
- **User Settings modal** (`showUserSettings`): ⚙️ Settings button in header. Global preferences (e.g. `receiveOtcEmails`) stored in `user_metadata`.
- **Standings rank tracking**: When a user views a league's standings, the current ranks are persisted to `localStorage` under key `omnifantasy_standings_{leagueId}` as `{ ranks: {[email]: rank}, myRank, prevMyRank }`. Home page league cards read this snapshot (`leagueRankMeta`) to show rank and trend arrows (📈/📉/➡️) without requiring a fresh DB fetch.
- **`prevRankSnapshot`**: Loaded from localStorage when `selectedLeagueId` changes. Passed to `generateStandings()` as the 5th argument for inline trend arrows in the standings table.
- **`homeTick`**: 1-second interval (active only while `currentView === 'home'`) to keep timer countdown displays live on league cards.

## Row Level Security (RLS) Policies

Simplified to prevent infinite recursion:

- **leagues**: SELECT = `true`, INSERT = commissioner only, UPDATE/DELETE = commissioner only
- **league_members**: SELECT = `true`, INSERT/DELETE = commissioner only, UPDATE = commissioner OR `auth.email() = email` (members can self-accept/decline)
- **draft_picks**: SELECT = `true`, INSERT = any authenticated user, DELETE = commissioner only
- **draft_state**: SELECT = `true`, UPDATE = any authenticated user
- **odds_cache**: SELECT = `true`, INSERT/UPDATE = any authenticated user
- **draft_queue**: SELECT = any authenticated, INSERT/UPDATE/DELETE = `auth.jwt()->>'email' = user_email`
- **draft_member_settings**: SELECT = any authenticated, INSERT/UPDATE = `auth.jwt()->>'email' = user_email`

## Common Issues & Solutions

1. **Draft picks not showing on Big Board/Roster**: `generateDraftBoard()` must receive `picks` from `useDraft()` and `currentUserEmail`. Properties are snake_case from DB.

2. **Modal appears on wrong screen**: Check which component the modal is rendered in.

3. **"Draft not started" after starting**: Missing `await reloadLeagues()` (the `reload` from `useLeagues`) after starting the draft.

4. **EP not showing for a sport**: Check `SPORT_KEY_MAP` in `oddsApi.js` and `isScrapedSport()` in `oddsScraper.js`. Check `NAME_ALIASES` — API team names may not match `TEAM_POOLS` names.

5. **EP showing for some teams but not others in a sport**: Name mismatch. Add the API name → TEAM_POOLS name mapping to `ODDS_API_ALIASES` in `src/utils/aliases.js` (or `F1_NAME_ALIASES` in the same file for F1). One edit covers all consumers.

6. **Stale EP values after formula change**: Bump `CACHE_VERSION` in `oddsApi.js`. Old cached values with mismatched `_v` are automatically treated as stale.

7. **Sport options not showing in draft room**: Use `getSportNameByCode(sportCode)` from `src/config/sports.js` before looking up `TEAM_POOLS`.

8. **Infinite recursion error**: Re-run `database/database-setup.sql` with simplified RLS policies.

9. **odds_cache table not found**: Run `database/database-migration-odds-cache.sql` in Supabase SQL Editor.

10. **Euro/WorldCup not appearing in sport selector**: Year-gated by `isTournamentYear()` — only shows in tournament years.

11. **Wrong picker shown for current pick**: Use `getPickerIndex` with `thirdRoundReversal` flag; old code that only checked `isSnake` will be wrong for leagues with third-round reversal enabled.

12. **Points not appearing after sport completes**: Likely an ESPN team name mismatch. Add the ESPN `displayName` → `TEAM_POOLS` name mapping to `RESULT_NAME_ALIASES` in `src/resultsApi.js`. Check the browser network tab for the ESPN scoreboard response to see the exact name returned. This applies to Tennis results too (MensTennis/WomensTennis use ESPN ATP/WTA bracket data).

13. **Wrong standings sort (all zeros)**: Ensure `generateStandings` is called with all five args: `generateStandings(league, supabasePicks, userEmail, sportResults, previousRankMap)`. Missing `supabasePicks` or `sportResults` causes zero-point rows. `previousRankMap` can be `{}` if no snapshot exists.

14. **`sport_results` table not found**: Run `database/database-migration-results.sql` in Supabase SQL Editor.

15. **`draft_queue` or `draft_member_settings` table not found**: Run `database/database-migration-draft-queue.sql` in Supabase SQL Editor.

16. **Auto-pick countdown fires on mount**: Auto-pick logic lives in `src/hooks/useAutoPickLogic.js` (extracted from `omnifantasy-app.jsx`). The immediate queue auto-pick effect guards against mount using `prevCurrentPickRef` — it only fires when `currentPick` changes from a previous value to the user's turn. If this breaks, verify the `prevCurrentPickRef` tracking logic inside the hook.

17. **Queue not showing in DraftView**: Verify all queue-related props are passed to `<DraftView>` in `omnifantasy-app.jsx`: `queue`, `draftSettings`, `autoPickCountdown`, `cancelAutoPickCountdown`, `onAddToQueue`, `onRemoveFromQueue`, `onMoveQueueItem`, `onClearQueue`, `onUpdateDraftSettings`, `leagueHasOtcEmails`, `queueError`.

18. **`ep_history` table not found**: Run `database/database-migration-ep-history.sql` in Supabase SQL Editor.

19. **Team popup chart shows no data**: Normal on first deploy — `ep_history` starts empty. Data accumulates after the first odds cache refresh cycle (~2 days). If a specific team is missing, check that their name in `TEAM_POOLS` exactly matches the key stored in `snapshot_data` (which uses the same `aggregated` object from `fetchExpectedPoints`, already normalized via `NAME_ALIASES`).

20. **Clicking a team name in the draft grid triggers pick confirmation**: The team name `<button>` in `DraftView.jsx` must call `e.stopPropagation()` to prevent the parent row's `onClick` from firing. Verify `stopPropagation` is present.

21. **`league_members.status` column not found**: Run `database/database-migration-member-status.sql` in Supabase SQL Editor.

22. **Invite emails not sending**: The `send-league-invite` Edge Function must be deployed (`supabase functions deploy send-league-invite`) and the SMTP secrets set (`supabase secrets set SMTP_HOST=... SMTP_PORT=... SMTP_USER=... SMTP_PASS=... SMTP_FROM=...`). Email failures are logged server-side but do NOT block league creation — the `sendLeagueInvite()` call is fire-and-forget.

23. **"Start Draft" button disabled even after all members accepted**: Check that the `status` column exists in DB (run migration). Verify `membersList` in the league object has `status` field — it's mapped in `useSupabase.js`. Pre-migration leagues are backfilled to `'accepted'` so they should be unaffected.

## Code Patterns

**Draft Pick Data:**
```javascript
{
  league_id: selectedLeagueId,
  pick_number: currentPick,
  round: currentRound,
  picker_email: email,
  picker_name: currentPicker?.name || currentPicker?.email?.split('@')[0] || 'Unknown',
  sport: sport,
  team: teamName,
  team_name: teamName
}
```

**Sport → Team Pool Lookup:**
```javascript
import { getSportNameByCode, TEAM_POOLS } from './config/sports';
const sportName = getSportNameByCode(sportCode);  // e.g. 'NCAA Football'
const teams = TEAM_POOLS[sportName] || [];
```

**Draft Queue — adding/removing items (from DraftView via props):**
```javascript
// Queue props come from useDraftQueue mounted in omnifantasy-app.jsx
onAddToQueue(sport, team)       // appends to end; silently no-ops if already queued
onRemoveFromQueue(itemId)       // removes by DB id
onMoveQueueItem(itemId, 'up' | 'down')  // swaps with adjacent item
onClearQueue()                  // removes all items for this user/league (shows ConfirmModal first)
onUpdateDraftSettings({ autoPickFromQueue: bool, receiveOtcEmails: bool })
// queueError: Error object or null — displayed as a red banner above the queue panel when set

// queuePositionMap for O(1) lookups in the draft board grid:
const queuePositionMap = useMemo(() => {
  const map = new Map();
  (queue || []).forEach((item, idx) => {
    map.set(`${item.sport}::${item.team}`, { rank: idx + 1, id: item.id });
  });
  return map;
}, [queue]);
```

**Current Picker:**
```javascript
import { getCurrentPickerFromState, normalizeDraftPicker } from './utils/draft';
const picker = getCurrentPickerFromState(draftState); // { email, name }
```

**Points for a pick:**
```javascript
import { calculatePickPoints } from './utils/points';
const pts = calculatePickPoints(pick, sportResults);
// pts === null  → sport not yet complete (show nothing or TBD)
// pts === 0     → sport complete, pick didn't score
// pts > 0       → show "+N" in green
```

**Results shape reference:**
```javascript
// Single-event sport (NFL, NBA, etc.):
{ champion: 'Chiefs', runner_up: 'Eagles', semifinals: ['49ers', 'Ravens'],
  quarterfinalists: ['Lions', 'Bills', 'Texans', 'Packers'], is_complete: true, season: 2025 }

// Multi-event (Golf/Tennis) — complete only when all 4 events done.
// rankings[] = players sorted by accumulated golf/tennis points (8/5/3/2/1 per event).
// Final Omnifantasy points (80/50/30/20) awarded based on rankings[] position once is_complete.
// Use getPartialMultiEventPoints(pick, sportResults) for mid-season accumulated display.
{ events: [{ name: 'Masters', champion: 'Scheffler', runner_up: 'McIlroy',
             semifinals: [...], quarterfinalists: [...],
             ninth_to_sixteenth: [...],   // Golf only — T9-T16 (1 pt)
             round_of_sixteen: [...],     // Tennis only — R16 losers (1 pt)
             is_complete: true }],
  rankings: ['Scheffler', 'McIlroy', ...],
  is_complete: false, season: 2026 }

// F1 — positions 0-7 map to 80/50/30/30/20/20/20/20:
{ standings: ['Verstappen', 'Norris', 'Leclerc', ...], is_complete: true, season: 2026 }
```

## Migrations (run in order after database-setup.sql)

1. `database/database-migration-timer.sql` — Adds `pick_started_at` column to `draft_state`
2. `database/database-migration-picker-name.sql` — Adds `picker_name` column to `draft_picks`
3. `database/database-migration-odds-cache.sql` — Adds `odds_cache` table for shared EP caching
4. `database/database-migration-results.sql` — Adds `sport_results` table for automatic points assignment
5. `database/database-migration-third-round-reversal.sql` — Adds `third_round_reversal BOOLEAN DEFAULT false` to `draft_state`
6. `database/database-migration-draft-sport-requirement.sql` — Adds `draft_every_sport_required BOOLEAN DEFAULT true` to `draft_state`
7. `database/database-migration-timer-pause-window.sql` — Adds `timer_pause_start_hour INTEGER DEFAULT 0` and `timer_pause_end_hour INTEGER DEFAULT 8` to `leagues`
8. `database/database-migration-draft-queue.sql` — Creates `draft_queue` and `draft_member_settings` tables with RLS
9. `database/database-migration-ep-history.sql` — Creates `ep_history` table for EP trend chart data with RLS and index
10. `database/database-migration-league-chat.sql` — Creates `league_chat` table with RLS and index
11. `database/database-migration-league-emoji.sql` — Adds `league_emoji TEXT DEFAULT '🏆'` to `leagues`
12. `database/database-migration-member-status.sql` — Adds `status TEXT DEFAULT 'pending'` to `league_members`, backfills existing rows to `'accepted'`, adds self-update RLS policy

New columns added directly to `database/database-setup.sql` (no separate migration files):
- `draft_rounds` on `leagues`
- `send_otc_emails`, `draft_date` on `leagues`

## Environment Variables

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_ODDS_API_KEY=your_odds_api_key
```

## Future / Planned

- Update preseason market odds in `oddsScraper.js` at start of each new season (F1, ATP, WTA)
- Switch F1/Tennis to The Odds API if/when they add outright winner markets
- Draft chat functionality
- League history and statistics

## Implemented Features (reference)

These were previously deferred and are now shipped:

- **Error boundaries** — `src/main.jsx` wraps the app in an `ErrorBoundary` with fallback UI
- **Unit tests** — `src/__tests__/draft.test.js`, `src/__tests__/points.test.js`, `src/__tests__/aliases.test.js`, and `src/__tests__/format.test.js` cover core pure functions using Vitest
- **Team news** — `useTeamNews.js` + ESPN API section in `TeamPopup.jsx`
- **EP trend chart in TeamPopup** — Recharts LineChart with 1W/1M/3M/All time frame selector
- **Unified timer display** — `TimerDisplay` component (`compact` + block variants) replaces 4 separate timer display patterns in DraftView and LeagueView
- **Auto-pick hook** — `src/hooks/useAutoPickLogic.js` extracted from `omnifantasy-app.jsx`, encapsulates both auto-pick effects and their refs
- **League emoji** — Commissioners pick from 12 curated emojis at league creation and can edit inline on the home card; stored in `leagues.league_emoji`; mapped as `leagueEmoji` in the league object
- **Clear queue confirmation** — "Clear All ×" button in DraftView queue panel now shows a `ConfirmModal` before clearing
- **Queue error banner** — DraftView shows a red error banner above the queue panel when `queueError` is set
- **Skeleton loading states** — Sports modals (home, DraftView, LeagueView) show 6 `animate-pulse` skeleton rows while `epLoading`; Big Board/roster show shimmer bars while `resultsLoading`
- **`formatTimeRemaining`** — Added to `src/utils/format.js` for millisecond-to-human countdown formatting
- **Mobile responsiveness** — Hamburger nav menu on `< md` screens; draft queue as bottom sheet on mobile; standings as tap-to-expand cards on mobile; Sports catalog as bottom-anchored sheet on mobile; compact Big Board card grid with responsive columns
- **Big Board compact cards** — Tighter padding, thinner border, responsive column grid (2/3/4/5 cols by breakpoint)
- **API Football removed** — UCL fallback via API Football was removed; UCL uses The Odds API exclusively
- **2026 preseason odds** — `F1_PRESEASON_ODDS`, `ATP_ODDS`, `WTA_ODDS` in `oddsScraper.js` updated for 2026 season; F1 pool includes Liam Lawson and Kimi Antonelli
- **docs/ folder** — `docs/EP_METHODOLOGY.md` (EP calculation, data sources, caching, API budget) and `docs/ARCHITECTURE.md` (high-level system architecture). Moved from project root March 2026.
- **Database folder** — All SQL files organized under `database/` subfolder
- **League invite/accept flow** — `league_members.status` (pending/accepted/declined); invite emails via Edge Function; Accept/Decline on home cards; member management panel in LeagueView; draft start blocked until all members accepted
- **OTC email improvements** — Edge Functions no longer gate on `leagues.send_otc_emails`; per-user `receive_otc_emails` is sole control; first picker notified 2s after draft starts; `sendOtcEmail` calls use 1.5s delay to avoid stale `draft_state` race condition
- **LeagueView tab reorder** — Tabs now: My Roster → Standings → Big Board → Draft Results; default tab is `'my-roster'`
- **Draft Results tab** — Visible as soon as first pick is made (was gated on draft completion); card layout on mobile, table on desktop
- **Mobile Draft Results** — Card layout on mobile, full table on desktop
- **Golf/Tennis scoring overhaul** — Per-event 80/50/30/20 replaced with accumulation system: 8/5/3/2/1 per event → ranked → single Omnifantasy 80/50/30/20 award. `resultsApi.js` captures `ninth_to_sixteenth` (Golf T9-T16) and `round_of_sixteen` (Tennis R16 losers). `rankings[]` computed and stored in results. `RESULTS_CACHE_VERSION = 2` auto-invalidates old cache. `points.js` uses `rankings[]` if present; falls back to old per-event sum for legacy entries.
- **Partial mid-season standings** — `getPartialMultiEventPoints(pick, resultsMap)` returns `{ accumulated, eventsComplete, eventsTotal }` for in-progress Golf/Tennis. LeagueView My Roster and Big Board show `~N` accumulated points mid-season with hover tooltip showing events progress.
- **Draft Rounds UX** — Settings panel shows recommended round count (sports + 5 flex), marks it with ★ in dropdown, quick-set link to jump to it, green confirmation when already at recommended.
- **Start Draft confirmation modal enhanced** — Shows full settings review: member count, round count, sports (with color badges), format, draft order type, sport coverage flag, pick timer + pause window, full manual draft order if set. Scrollable.
- **Member name sync on add** — `addLeagueMember` and `createLeague` look up any existing `league_members` row for that email to populate `name` immediately, rather than waiting for the user's next login.
- **Roll Back Draft in mobile hamburger** — Commissioner can access Roll Back Draft on mobile via hamburger menu in DraftView (was hidden below `sm` breakpoint).
- **TeamPopup Performance tab** — New 3rd tab in TeamPopup. Shows live W-L season record (ESPN standings API, 1h localStorage cache) and completed season result (sport_results DB). Season selector for current/previous year; "Live" badge for in-progress seasons; sport-specific playoff labels per sport (e.g. NFL → "Won the Super Bowl", NBA → "Lost in the Conference Finals"). Golf tab shows seasonStarted gate. Uses `useTeamRecord` + `useTeamPerformance` hooks.
- **TeamPopup tab restructure** — Now 3 tabs: EP Trend | Performance | News (was 2: EP Trend | News). Tab `id: 'ep'|'performance'|'news'`.
- **DraftView Big Board + Draft Results tabs** — DraftView tab bar now has Pick | Big Board | Draft Results. Both always visible (not gated on draft completion). State: `activeDraftTab` (`'pick'|'big-board'|'draft-results'`).
- **Auto-remove queue items when drafted** — When any pick is made (by anyone), matching queue items for that sport+team are automatically removed from all users' queues. Handled in `omnifantasy-app.jsx` via a picks effect.
- **Mobile locked-pick toast** — Tapping a locked row on mobile shows a toast explaining the lock reason (sport already have enough picks, coverage lock, etc.) via a dedicated tappable button on each locked row. No-op on desktop (tooltip handles it).
- **OTC emails default ON** — `receiveOtcEmails` now defaults to `true` (opt-out model). Reads as `currentUser?.user_metadata?.receive_otc_emails !== false`. Previously opt-in (defaulted false).
- **Chat unread badge color** — Changed from green to red.
- **Chat unread count localStorage** — `lastReadAt` persisted to localStorage so unread count survives page refresh.
- **docs/ folder** — `EP_METHODOLOGY.md` and `ARCHITECTURE.md` moved from project root to `docs/` subfolder.
