# OmniFantasy

OmniFantasy is a multi-sport, team-based fantasy draft app. Users draft teams (not players) across up to 13 sports and track results over a full calendar year.

## What this is

- **Snake draft**: Commissioner sets up a league, invites members, and runs a snake draft across multiple sports.
- **Teams, not players**: You draft franchises/countries/golfers/drivers — not individual athletes (except Golf, Tennis, and F1).
- **Year-long season**: Points are scored when your teams reach the top 8 in their respective sports' playoffs or championships.
- **Expected Points (EP)**: Pre-draft, each option shows a projected score derived from betting odds to help compare value.

## Supported Sports

| Code | Sport | Notes |
|------|-------|-------|
| NFL | NFL | |
| NBA | NBA | |
| MLB | MLB | |
| NHL | NHL | |
| NCAAF | NCAA Football | Empty off-season |
| NCAAMB | NCAA Men's Basketball | |
| UCL | UEFA Champions League | |
| Euro | UEFA Euro | Every 4 years (2024, 2028…) |
| WorldCup | FIFA World Cup | Every 4 years (2026, 2030…) |
| Golf | Golf (4 majors) | Special scoring — see below |
| MensTennis | ATP (4 Grand Slams) | Special scoring — see below |
| WomensTennis | WTA (4 Grand Slams) | Special scoring — see below |
| F1 | Formula 1 | Drivers, not constructors |

## Scoring

All sports award **80 / 50 / 30 / 30 / 20 / 20 / 20 / 20** points for finishing champion through top-8.

**Golf & Tennis** use an aggregate system across 4 events (majors/slams). Per-event "golf/tennis points" (8/5/3/2/1) are accumulated across all events; the final ranking of accumulated points determines who earns the 80/50/30/20 Omnifantasy awards. See [docs/EP_METHODOLOGY.md](docs/EP_METHODOLOGY.md) for full detail.

**F1** uses the end-of-season Drivers' Championship standings directly.

## Tech Stack

- **Frontend**: React 18 + Vite, TailwindCSS, Lucide React
- **Backend**: Supabase (PostgreSQL + Realtime + Edge Functions)
- **Auth**: Supabase Auth (email/password)
- **Hosting**: Vercel (auto-deploy on push to main)
- **Email**: Gmail SMTP via Supabase Edge Functions + Nodemailer
- **Odds**: The Odds API (most sports) + Jolpica API (F1) + hardcoded preseason odds (Tennis)

## Local Setup

### 1. Clone and install

```bash
npm install
```

### 2. Configure environment

Create `.env` in the project root:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_ODDS_API_KEY=your_odds_api_key
```

### 3. Set up the database

In the Supabase SQL editor, run these files **in order**:

```
database/database-setup.sql
database/database-migration-timer.sql
database/database-migration-picker-name.sql
database/database-migration-odds-cache.sql
database/database-migration-results.sql
database/database-migration-third-round-reversal.sql
database/database-migration-draft-sport-requirement.sql
database/database-migration-timer-pause-window.sql
database/database-migration-draft-queue.sql
database/database-migration-ep-history.sql
database/database-migration-league-chat.sql
database/database-migration-league-emoji.sql
database/database-migration-member-status.sql
database/database-migration-draft-reminders.sql
```

### 4. Deploy Edge Functions (optional but needed for emails)

```bash
supabase functions deploy send-otc-email
supabase functions deploy check-timer-reminders
supabase functions deploy send-league-invite
```

Set required secrets:

```bash
supabase secrets set SMTP_HOST=... SMTP_PORT=587 SMTP_USER=... SMTP_PASS=... SMTP_FROM=...
supabase secrets set APP_URL=https://your-app-url.com
```

The `check-timer-reminders` function must also be scheduled via pg_cron (see `database/database-migration-draft-reminders.sql` comments).

### 5. Run locally

```bash
npm run dev       # dev server
npm run build     # production build
npm run preview   # preview prod build
```

## Key Features

### League Management
- Commissioners create leagues, pick sports, set draft rounds, and invite members by email
- Members receive invite emails and must accept before the draft can start
- League emoji — 12 curated options, editable after creation
- Commissioner has exclusive control to start and roll back the draft

### Draft Settings
- **Draft order**: randomize or set manually
- **Pick timer**: none, 4h, 8h, 12h, or 24h
- **Timer pause window**: daily quiet hours (default midnight–8 AM UTC) during which the timer is frozen
- **Snake format**: standard snake, or Third Round Reversal (rounds 2–3 reversed, then alternating)
- **Sport requirement**: force each drafter to cover all league sports before flex picks

### Draft Room
- Live pick grid with Supabase Realtime (all browsers update instantly)
- EP shown next to each team to guide picks
- Personal draft queue — queue up picks in advance for auto-pick when it's your turn
- Auto-pick from queue when the timer expires
- "You're on the clock" emails sent after each pick (per-user preference)
- 1-hour warning emails via scheduled cron job

### Standings & Points
- Points auto-calculated from ESPN/Jolpica results — no manual entry
- Standings update live as sports conclude throughout the year
- Rank trend arrows (📈/📉/➡️) track movement between sessions
- Mid-season partial points for Golf/Tennis show current accumulated totals

### Other
- EP trend chart per team (Recharts) with 1W/1M/3M/All time frames
- Recent news per team from ESPN API
- League chat (real-time, floating button)
- Full mobile responsive layout (hamburger nav, bottom-sheet queue, tap-to-expand standings)

## Project Structure

```
Omnifantasy/
  src/
    omnifantasy-app.jsx         # App root: auth, routing, top-level state
    views/
      LeagueView.jsx            # League tabs: My Roster, Standings, Big Board, Draft Results
      DraftView.jsx             # Live draft room
    hooks/
      useAutoPickLogic.js       # Timer expiry + queue auto-pick logic
    components/
      TimerDisplay.jsx          # Draft timer (compact + block variants)
      TeamPopup.jsx             # EP chart + news modal per team
      LeagueChat.jsx            # Floating chat widget
      RulesModal.jsx            # How-to-play help modal
      ConfirmModal.jsx          # Styled confirmation dialog
      SportBadge.jsx            # Sport label with color
    config/
      sports.js                 # AVAILABLE_SPORTS, TEAM_POOLS, color helpers
    utils/
      draft.js                  # Snake draft logic, picker index, formatting
      standings.js              # generateStandings()
      points.js                 # calculatePickPoints(), getPartialMultiEventPoints()
      aliases.js                # Team name normalization maps
      format.js                 # formatHourLabel(), formatTimeRemaining()
      userDisplay.js            # getUserDisplayName(), getUserInitials()
    context/
      AppContext.jsx            # Shared context for DraftView + LeagueView
    oddsApi.js                  # The Odds API integration, EP calculation, cache
    oddsScraper.js              # F1/Tennis odds (Jolpica + hardcoded)
    resultsApi.js               # ESPN/Jolpica results fetcher, results cache
    supabaseClient.js           # All DB read/write operations
    useSupabase.js              # useAuth, useLeagues, useDraft hooks
    useExpectedPoints.js        # EP hook
    useResults.js               # Results hook
    useDraftQueue.js            # Queue + draft settings hook
    useChatMessages.js          # League chat hook
    useEPHistory.js             # EP trend data hook
    useTeamNews.js              # ESPN team news hook
    __tests__/
      draft.test.js             # Vitest: draft order logic
      points.test.js            # Vitest: point calculation
      aliases.test.js           # Vitest: team name normalization
      format.test.js            # Vitest: formatting utilities
  supabase/
    functions/
      send-otc-email/           # Edge Function: "you're on the clock" emails
      check-timer-reminders/    # Edge Function: 1-hour warning cron job
      send-league-invite/       # Edge Function: member invite emails
      _shared/
        draft-helpers.ts        # Shared: getPickerIndex, computeDeadline, sendEmail
  database/
    database-setup.sql          # Full schema + RLS policies
    database-migration-*.sql    # Individual migrations (run in order)
  docs/
    ARCHITECTURE.md             # System diagrams (infrastructure, frontend, DB, data flows)
    EP_METHODOLOGY.md           # EP calculation, scoring rules, caching, API budget
  CLAUDE.md                     # Development guide for AI-assisted development
```

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — System architecture diagrams
- [docs/EP_METHODOLOGY.md](docs/EP_METHODOLOGY.md) — How EP is calculated and how scoring works

## Running Tests

```bash
npm test
```

Tests cover: draft order logic (snake + 3RR), point calculation (all sports including Golf/Tennis), team name alias normalization, and formatting utilities.
