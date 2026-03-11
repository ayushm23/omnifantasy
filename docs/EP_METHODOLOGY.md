# Expected Points (EP) Methodology

## Overview

Expected Points (EP) is a pre-season projection of how many fantasy points a team/player is likely to score, derived from championship futures betting odds. It gives league members a way to compare the relative value of draft options before any games are played.

---

## Actual Scoring (All Sports)

| Finish | Points |
|--------|--------|
| Champion | 80 |
| Runner-up | 50 |
| Semifinalist (×2) | 30 each |
| Quarterfinalist (×4) | 20 each |

Total points distributed per sport: **80 + 50 + 30 + 30 + 20 + 20 + 20 + 20 = 270**

Golf, Tennis, and F1 use **special scoring rules** — see below.

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

---

## Special Scoring: Golf

### Actual Scoring

Golf does **not** award 80/50/30/20 per tournament. Instead:

1. **Per-event golf points** are awarded at each of the 4 majors (Masters, PGA Championship, US Open, The Open):

   | Finish | Golf Points |
   |--------|-------------|
   | 1st | 8 |
   | 2nd | 5 |
   | 3rd–4th | 3 |
   | 5th–8th | 2 |
   | 9th–16th | 1 |

2. After all 4 majors, each golfer's per-event golf points are **summed**.
3. Players are **ranked** by total golf points.
4. The ranked standings determine the Omnifantasy awards:

   | Rank | Omnifantasy Points |
   |------|--------------------|
   | 1st | 80 |
   | 2nd | 50 |
   | 3rd–4th | 30 each |
   | 5th–8th | 20 each |

A golfer who consistently finishes T9 at every major may outscore one who wins a single event but misses the others.

**Tie-breaking** (golf points totals are equal):
1. Best single-event finish
2. Best finish outside the top 16 at any event
3. Points split if still tied

**Mid-season display:** Before all 4 majors are complete, `~N` shows the Omnifantasy points the golfer would earn if the season ended today, based on accumulated golf points so far.

### EP for Golf

A golfer's EP is the **average** of their per-event EP across all majors that have returned data. This reflects that fantasy scoring is based on a single aggregate ranking (not additive per-event payouts) — averaging keeps EP on the same ~0–80 scale as all other sports.

> A golfer appearing in all 4 majors with an average EP of ~25 is roughly "quarterfinalist-equivalent" in composite performance.

---

## Special Scoring: Tennis (ATP & WTA)

### Actual Scoring

Tennis follows the same structure as Golf, but at the 4 Grand Slams (Australian Open, French Open, Wimbledon, US Open):

1. **Per-event tennis points** are awarded at each Slam:

   | Finish | Tennis Points |
   |--------|---------------|
   | Champion | 8 |
   | Runner-up | 5 |
   | Semifinalist | 3 |
   | Quarterfinalist | 2 |
   | Round of 16 | 1 |

2. After all 4 Slams, each player's per-event tennis points are **summed**.
3. Players are **ranked** by total tennis points.
4. The ranked standings determine the Omnifantasy awards (same 80/50/30/20 structure as Golf).

**Tie-breaking:**
1. Best single-tournament finish
2. Best finish in events where neither player reached the Round of 16
3. A player must have advanced past the first round to win a tiebreaker
4. Points split if still tied

**Mid-season display:** Same as Golf — `~N` reflects points if the season ended today.

### EP for Tennis

Tennis EP uses preseason market-derived implied probabilities (aggregated from major sportsbooks) converted with the standard positional model. Since there is no single "championship" odds market for the full season, these are approximations based on per-Slam win odds.

---

## Special Scoring: F1

F1 uses the end-of-season **Drivers' Championship standings** directly — no intermediate conversion:

| Drivers' Championship Finish | Omnifantasy Points |
|-------------------------------|-------------------|
| 1st | 80 |
| 2nd | 50 |
| 3rd–4th | 30 each |
| 5th–8th | 20 each |

**EP for F1:** Mid-season, Jolpica live standings are converted to win probabilities via softmax, then the standard positional model is applied. Early season / off-season falls back to preseason market-derived odds.

---

## Caching

### EP Cache (`odds_cache` table)

- EP is cached in Supabase with a **2-day TTL**, shared across all users.
- The first client to load after the cache expires claims a refresh lock, fetches new odds, and writes the cache — all subsequent clients read from Supabase.
- `CACHE_VERSION = 7` (in `oddsApi.js`) is embedded in cached data. Bumping this version automatically invalidates stale cached values computed with the old formula.
- NCAA Football uses **strict futures mode**: never serves stale cached EP — returns empty off-season to prevent outdated preseason odds from persisting year-round.

### Results Cache (`sport_results` table)

- Final season results are cached in Supabase.
- TTL: **30 days** once a sport is complete; **4 hours** while in progress.
- `RESULTS_CACHE_VERSION = 2` (in `resultsApi.js`) invalidates pre-v2 cached Golf/Tennis results that used the old per-event scoring format.

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
| `src/oddsApi.js` | Fetches odds from The Odds API, runs positional model, manages EP cache |
| `src/oddsScraper.js` | Handles F1 (Jolpica), ATP, and WTA odds outside The Odds API |
| `src/resultsApi.js` | Fetches final results from ESPN/Jolpica, manages results cache |
| `src/useExpectedPoints.js` | React hook wrapping `oddsApi.js` for component use |
| `src/utils/aliases.js` | Team name normalization (API names → TEAM_POOLS names) |
| `src/utils/points.js` | `calculatePickPoints()`, `getPartialMultiEventPoints()` — applies results to compute scores |
