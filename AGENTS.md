# OmniFantasy — Agent Context

This file is the short entry point. For real work, always cross‑reference the deeper docs listed below. `CLAUDE.md` is the most comprehensive and should be treated as primary guidance.

## Source Of Truth (Read Order)
1. `CLAUDE.md` — detailed app behavior, edge cases, and operational guidance
2. `docs/ARCHITECTURE.md` — system diagrams and data flows
3. `docs/EP_METHODOLOGY.md` — EP model, caching, special scoring
4. `README.md` — setup, deployment, and high-level overview

## What This Is
OmniFantasy is a multi-sport fantasy draft app (teams, not players) built with React + Vite + Supabase. Commissioners create leagues spanning multiple sports, run a snake draft, and track results across a full calendar year. Expected Points (EP) from betting odds are shown pre-draft to guide choices.

## Stack
- Frontend: React 18 + Vite
- Styling: TailwindCSS
- Backend: Supabase (PostgreSQL + Realtime + Edge Functions)
- Auth: Supabase Auth (email/password)
- Odds: The Odds API (most sports) + Jolpica (F1) + preseason fallback for Tennis
- Email: Supabase Edge Functions via Gmail SMTP

## Repo Map (Key Areas)
- `src/omnifantasy-app.jsx` — app root; auth, view switching, modals, shared state
- `src/views/LeagueView.jsx` — league tabs: My Roster, Standings, Big Board, Draft Results
- `src/views/DraftView.jsx` — live draft room; sport tabs, EP display, queue
- `src/utils/draft.js` — draft helpers (snake/3RR, picker logic)
- `src/utils/points.js` — scoring (incl. Golf/Tennis/F1 special cases)
- `src/utils/aliases.js` — **single source of truth for team name aliases**
- `src/useSupabase.js` — hooks: `useAuth`, `useAdmin`, `useLeagues`, `useDraft`
- `src/supabaseClient.js` — DB operations
- `database/` — schema + migrations
- `supabase/functions/` — Edge Functions for email + server-side auto-pick
- `shared/team-pools.json` — shared team pools (client + Edge Functions)
- `docs/ARCHITECTURE.md` — system diagrams
- `docs/EP_METHODOLOGY.md` — EP model, scoring, caching

## Critical App Rules
- After any DB mutation that affects league display, always call `reloadLeagues()` (from `useLeagues`) to refresh UI state.
- Supabase returns `snake_case` fields. Use `pick.pick_number`, `pick.team_name`, etc.
- `team` and `team_name` are both required (NOT NULL). Always set both.
- `draft_rounds` is the column name (not `num_rounds`).

## Draft + Auto-Pick Notes
- `draft_state.draft_order` entries may be email strings or `{ email, name }`. Normalize before use.
- Server-side auto-pick runs in `supabase/functions/auto-pick-from-queue` (queue first, EP fallback; enforces sport coverage) and relies on a unique `(league_id, pick_number)` constraint.
- Server-side timer-expiry auto-pick runs in `supabase/functions/check-timer-reminders` (queue first, EP fallback) and is scheduled via pg_cron every minute for near real-time picks.

## Data/Scoring Highlights
- Base scoring: 80/50/30/30/20/20/20/20 for top-8.
- Golf/Tennis: aggregate across 4 events (per-event 8/5/3/2/1), then rank and award 80/50/30/20.
- F1 uses end-of-season drivers’ standings.

## Migrations (Order)
Run after `database/database-setup.sql`:
1. `database/database-migration-timer.sql`
2. `database/database-migration-picker-name.sql`
3. `database/database-migration-odds-cache.sql`
4. `database/database-migration-results.sql`
5. `database/database-migration-third-round-reversal.sql`
6. `database/database-migration-draft-sport-requirement.sql`
7. `database/database-migration-timer-pause-window.sql`
8. `database/database-migration-draft-queue.sql`
9. `database/database-migration-ep-history.sql`
10. `database/database-migration-league-chat.sql`
11. `database/database-migration-league-emoji.sql`
12. `database/database-migration-member-status.sql`
13. `database/database-migration-admins.sql`
14. `database/database-migration-issue-reports.sql`
15. `database/database-migration-draft-manual-pick-hold.sql`
16. `database/database-migration-draft-reminders.sql`

## Local Dev
- `npm install`
- `.env` requires `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ODDS_API_KEY`
- `npm run dev` to start
- `npm test` for unit tests

## Common Gotchas
- EP missing for a sport: check `oddsApi.js` keys and alias maps in `src/utils/aliases.js`.
- “Draft not started” after start: missing `await reloadLeagues()`.
- Results not showing: check `database/database-migration-results.sql` and ESPN name aliases.

## Working Guidelines
- Assume Supabase fields arrive in `snake_case` and only map to camelCase in client code when explicitly done in `useSupabase.js`.
- Avoid changing scoring or EP logic without checking `docs/EP_METHODOLOGY.md` and `src/oddsApi.js`.
- Prefer adding alias fixes in `src/utils/aliases.js` instead of one‑off name normalization.
- Any feature that touches drafting should consider `third_round_reversal`, `draft_every_sport_required`, and auto‑pick behavior (client + Edge Function).

## When In Doubt
Read `CLAUDE.md` first, then the docs in `docs/`. This file is intentionally minimal to keep context fast.
