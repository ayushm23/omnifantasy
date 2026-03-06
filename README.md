# OmniFantasy

OmniFantasy is a multi-sport, team-based fantasy draft app.  
Users draft teams (not players) across multiple sports, then track results over a full season/year.

## What this project currently does

- Email/password auth via Supabase Auth.
- League creation with commissioner + invited members.
- Multi-sport league setup with minimum sport count.
- Draft room with live pick updates (Supabase realtime).
- Draft settings before start:
  - Random order or manual order.
  - Pick timer (`none`, `4 hours`, `8 hours`, `12 hours`, `24 hours`).
  - Third Round Reversal (`3RR`) on/off.
  - "Require one pick from every sport" on/off.
- Commissioner-only draft controls:
  - Start draft.
  - Undo last pick (rollback).
- Expected points (`EP`) pulled from odds sources and shown during drafting.
- Odds cache in database with 2-day refresh cadence.
- Tournament-year sport filtering (Euro/World Cup hidden when out of cycle).

## Product workflow

### 1) Authentication

- User signs up or logs in with email/password.
- Session is managed by Supabase client auth state.

### 2) League creation

Commissioner configures:

- League name.
- Sports (minimum 3).
- Members by email (commissioner appears in league automatically).
- Draft rounds.
- Draft timer default.
- OTC email flag (`send_otc_emails`) is stored on league data.

### 3) Pre-draft settings (commissioner)

From Draft Settings panel:

- `Draft Order`
  - `Randomize`: order shuffled at draft start.
  - `Manual`: commissioner moves members up/down.
- `Draft Timer`
  - Saved to league settings.
  - Draft room timer pauses daily between 12:00am and 8:00am ET for 4/8/12-hour modes.
- `Draft Format`
  - Standard snake, or snake with `3RR`.
- `Sport Requirement`
  - On: each drafter must take at least one team from every selected sport before unrestricted flex picks.
  - Off: no required sport coverage.

### 4) Start draft

On confirmation, app persists draft state:

- `current_pick = 1`
- `current_round = 1`
- `draft_order = [...]`
- `is_snake = true`
- `third_round_reversal = true/false`
- `draft_every_sport_required = true/false`
- `pick_started_at = now`

### 5) Draft room behavior

- Current picker is computed from central draft order logic.
- If `3RR` is enabled:
  - Round 1 normal.
  - Rounds 2 and 3 reversed.
  - Round 4 normal, then alternating by round.
- If sport requirement is enabled:
  - Missing required sports are detected per current picker.
  - Non-eligible sport tabs are disabled.
  - Picks from non-eligible sports are hard-blocked.
- Pick confirmation modal appears before submit.
- Commissioner can undo latest pick.

### 6) League views after/while drafting

- Standings and roster surfaces include drafted teams and EP where available.
- Draft progress and "Your turn" indicators update from realtime draft state.

## Expected points and odds pipeline

`EP` is derived from championship probabilities and displayed in draft + league screens.

### Data sources

- The Odds API (`VITE_ODDS_API_KEY`) for supported outrights markets.
- API-Football fallback (`VITE_API_FOOTBALL_KEY`) for UCL when outright winner market is unavailable.
- Scraped/derived pipeline (`src/oddsScraper.js`) for:
  - F1
  - Men's Tennis
  - Women's Tennis

### Caching

- Cached in Supabase table `odds_cache`.
- Cache TTL is 2 days.
- Cache is shared across users.
- Cache versioning is used for invalidating stale formulas.

### Tournament-year logic

- `Euro`: selectable only every 4 years from 2024 cycle.
- `WorldCup`: selectable only every 4 years from 2026 cycle.
- UCL remains selectable regardless of region.

## Sports and pools

- Sports are defined in `src/config/sports.js` (`AVAILABLE_SPORTS`).
- Static team/player pools are in `TEAM_POOLS`.
- EP-driven pool sports can refresh from top EP entries year-over-year:
  - `UCL`, `Euro`, `WorldCup`, `Golf`, `MensTennis`, `WomensTennis`, `F1`.

## Tech stack

- React 18 + Vite
- Tailwind CSS
- Supabase (Postgres, Auth, Realtime)
- Lucide React icons

## Environment configuration

Set these in `.env`:

```env
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
VITE_ODDS_API_KEY=your_odds_api_key_here
VITE_API_FOOTBALL_KEY=your_api_football_rapidapi_key_here
```

Notes:

- `VITE_ODDS_API_KEY` is required for most odds-backed EP.
- `VITE_API_FOOTBALL_KEY` is optional but needed for UCL fallback.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Configure `.env` with values above.

3. In Supabase SQL editor, run:
  - `database-setup.sql`
  - `database-migration-timer.sql`
  - `database-migration-timer-pause-window.sql`
  - `database-migration-picker-name.sql`
  - `database-migration-odds-cache.sql`
  - `database-migration-third-round-reversal.sql`
  - `database-migration-draft-sport-requirement.sql`

4. Start app:

```bash
npm run dev
```

5. Build check:

```bash
npm run build
```

## Database and migrations

### Core entities

- `leagues`
- `league_members`
- `draft_state`
- `draft_picks`
- `odds_cache`

### Migration summary

1. `database-migration-timer.sql`
  - Adds `pick_started_at` to `draft_state`.
2. `database-migration-timer-pause-window.sql`
  - Adds `timer_pause_start_hour` and `timer_pause_end_hour` to `leagues`.
3. `database-migration-picker-name.sql`
  - Adds `picker_name` to `draft_picks`.
4. `database-migration-odds-cache.sql`
  - Adds `odds_cache` table + RLS policies.
5. `database-migration-third-round-reversal.sql`
  - Adds `third_round_reversal` to `draft_state`.
6. `database-migration-draft-sport-requirement.sql`
  - Adds `draft_every_sport_required` to `draft_state`.

## Project structure

```text
Omnifantasy/
  src/
    omnifantasy-app.jsx       # App orchestration + top-level state
    views/
      LeagueView.jsx          # League detail page + draft settings modal
      DraftView.jsx           # Draft room and pick flow
    useSupabase.js            # Hooks for auth/leagues/draft realtime state
    supabaseClient.js         # DB operations and subscriptions
    config/sports.js          # Sport catalog, pools, sport-year filtering
    oddsApi.js                # Odds API + UCL fallback + EP conversion
    oddsScraper.js            # F1/tennis probability providers
    useExpectedPoints.js      # EP fetch hook
    utils/draft.js            # Draft order utilities (snake + 3RR)
    utils/standings.js        # Standings generation
  database-setup.sql
  database-migration-*.sql
```

## Runtime scripts

- `npm run dev` - run local development server.
- `npm run build` - production build.
- `npm run preview` - preview production build locally.

## Known behavior and limits

- If odds are unavailable for a sport, EP displays as `TBD`.
- Team pools and alias maps may need periodic updates as competitions change.
- Realtime requires Supabase realtime enabled for relevant tables.
- Draft setting changes apply before draft start; started drafts use persisted draft state.
