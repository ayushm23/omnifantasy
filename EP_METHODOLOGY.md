# Expected Points (EP) Methodology

## Overview

Expected Points (EP) is a pre-season projection of how many fantasy points a team/player is likely to score, derived from championship futures betting odds. It gives league members a way to compare the relative value of draft options before any games are played.

---

## Point Awards (Actual Scoring)

| Finish | Points |
|--------|--------|
| Champion | 80 |
| Runner-up | 50 |
| Semifinalist (×2) | 30 each |
| Quarterfinalist (×4) | 20 each |

Total points distributed per sport: **80 + 50 + 30 + 30 + 20 + 20 + 20 + 20 = 270**

---

## EP Calculation

### Step 1: Get Win Probability from Odds

American odds are converted to implied win probability:

- **Positive odds** (underdog, e.g. +300): `p = 100 / (odds + 100)`
- **Negative odds** (favorite, e.g. -150): `p = |odds| / (|odds| + 100)`

All implied probabilities are then **normalized** to sum to exactly 1.0 across all teams in the field.

### Step 2: Positional Probability Model

Rather than the naive `EP = p × 270`, a positional model is used that respects the actual prize structure:

```
P(reach top 2)  = min(1, 2p)
P(reach top 4)  = min(1, 4p)
P(reach top 8)  = min(1, 8p)

EP = p           × 80   (win championship)
   + P(top 2)    × 50   (runner-up)
   + P(top 4)    × 30   (semifinalist)
   + P(top 8)    × 20   (quarterfinalist)
```

**Why this model?**
- Under a uniform distribution (all teams equal), total EP across all teams sums to exactly 270 — matching the actual total points distributed.
- No single team can exceed 80 EP (the champion's actual award).
- The naive `p × 270` model over-rewards heavy favorites.

---

## Data Sources by Sport

| Sport | EP Source |
|-------|-----------|
| NFL | The Odds API: `americanfootball_nfl_super_bowl_winner` |
| NBA | The Odds API: `basketball_nba_championship_winner` |
| MLB | The Odds API: `baseball_mlb_world_series_winner` |
| NHL | The Odds API: `icehockey_nhl_championship_winner` |
| NCAA Men's Basketball | The Odds API: `basketball_ncaab_championship_winner` |
| NCAA Football | The Odds API: `americanfootball_ncaaf_championship_winner` (seasonal — empty off-season) |
| UEFA Champions League | The Odds API: `soccer_uefa_champs_league_winner` |
| UEFA Euro | The Odds API: `soccer_uefa_european_championship_winner` |
| FIFA World Cup | The Odds API: `soccer_fifa_world_cup_winner` |
| Golf | The Odds API: 4 majors aggregated (Masters, US Open, The Open, PGA Championship) |
| F1 | Jolpica API (live standings mid-season) → softmax probabilities; falls back to preseason market odds |
| Men's Tennis (ATP) | Preseason market-derived implied probabilities (hardcoded, updated each season) |
| Women's Tennis (WTA) | Preseason market-derived implied probabilities (hardcoded, updated each season) |

### Golf — Special Aggregation
A golfer's EP is the **sum** of their EP across all 4 majors in which they appear. A golfer who appears in all 4 majors can accumulate up to 4× the single-event maximum.

### F1 — Special Points Model
F1 uses a **standings-based** model rather than a bracket model. The top 8 finishing positions in the Drivers' Championship map to points:

| Position | Points |
|----------|--------|
| 1st | 80 |
| 2nd | 50 |
| 3rd | 30 |
| 4th | 30 |
| 5th | 20 |
| 6th | 20 |
| 7th | 20 |
| 8th | 20 |

Mid-season, Jolpica live standings are converted to win probabilities via softmax, then the same positional model is applied. Early season / off-season falls back to preseason market odds.

---

## Caching

- EP is cached in Supabase (`odds_cache` table) with a **2-day TTL**, shared across all users.
- The first client to load after the cache expires claims a refresh lock, fetches new odds, and writes the cache — all subsequent clients read from Supabase.
- A `CACHE_VERSION` field (`oddsApi.js`, currently **7**) is embedded in cached data. When the EP formula changes, bumping this version automatically invalidates all stale cached values.
- NCAA Football uses **strict futures mode**: never serves stale cached EP — returns empty off-season to prevent outdated preseason odds from persisting year-round.

---

## API Budget

- **Free tier**: 500 credits/month (The Odds API)
- **~11–13 API calls per refresh** (9 single-event sports + 4 Golf majors, minus seasonal gaps)
- **2-day TTL** → ~15 refreshes/month → ~165 credits/month used
- ~335 credits headroom
- F1 and Tennis use free APIs or hardcoded odds — no Odds API credits consumed
- UCL, Euro, and World Cup fetch from `us,uk,eu,au` regions for better market coverage

---

## Relevant Code Files

| File | Role |
|------|------|
| `src/oddsApi.js` | Fetches odds from The Odds API, runs positional model, manages cache |
| `src/oddsScraper.js` | Handles F1 (Jolpica), ATP, and WTA odds outside The Odds API |
| `src/useExpectedPoints.js` | React hook wrapping `oddsApi.js` for component use |
| `src/utils/aliases.js` | Team name normalization (API names → TEAM_POOLS names) |
| `src/utils/points.js` | `calculatePickPoints()` — applies actual results to compute final scores |
