import { describe, it, expect } from 'vitest';
import { calculatePickPoints, filterResultsForLeague } from '../utils/points';

// ---------------------------------------------------------------------------
// calculatePickPoints
// ---------------------------------------------------------------------------

describe('calculatePickPoints — single-event sport', () => {
  const results = {
    NFL: {
      is_complete: true,
      champion: 'Chiefs',
      runner_up: 'Eagles',
      semifinals: ['49ers', 'Ravens'],
      quarterfinalists: ['Lions', 'Bills', 'Texans', 'Packers'],
    },
  };

  it('returns 80 for champion pick', () => {
    expect(calculatePickPoints({ sport: 'NFL', team_name: 'Chiefs' }, results)).toBe(80);
  });

  it('returns 50 for runner-up pick', () => {
    expect(calculatePickPoints({ sport: 'NFL', team_name: 'Eagles' }, results)).toBe(50);
  });

  it('returns 30 for semifinalist pick', () => {
    expect(calculatePickPoints({ sport: 'NFL', team_name: '49ers' }, results)).toBe(30);
    expect(calculatePickPoints({ sport: 'NFL', team_name: 'Ravens' }, results)).toBe(30);
  });

  it('returns 20 for quarterfinalist pick', () => {
    expect(calculatePickPoints({ sport: 'NFL', team_name: 'Lions' }, results)).toBe(20);
  });

  it('returns 0 for team that did not score', () => {
    expect(calculatePickPoints({ sport: 'NFL', team_name: 'Cowboys' }, results)).toBe(0);
  });

  it('returns null when sport is not yet complete', () => {
    const incompleteResults = { NFL: { is_complete: false } };
    expect(calculatePickPoints({ sport: 'NFL', team_name: 'Chiefs' }, incompleteResults)).toBeNull();
  });

  it('returns null when sport is missing from results', () => {
    expect(calculatePickPoints({ sport: 'NFL', team_name: 'Chiefs' }, {})).toBeNull();
  });

  it('falls back to pick.team if team_name is absent', () => {
    expect(calculatePickPoints({ sport: 'NFL', team: 'Chiefs' }, results)).toBe(80);
  });
});

describe('calculatePickPoints — F1', () => {
  const results = {
    F1: {
      is_complete: true,
      standings: ['Verstappen', 'Norris', 'Leclerc', 'Piastri', 'Russell', 'Hamilton', 'Sainz', 'Alonso', 'Gasly'],
    },
  };

  it('returns 80 for P1', () => {
    expect(calculatePickPoints({ sport: 'F1', team_name: 'Verstappen' }, results)).toBe(80);
  });
  it('returns 50 for P2', () => {
    expect(calculatePickPoints({ sport: 'F1', team_name: 'Norris' }, results)).toBe(50);
  });
  it('returns 30 for P3 and P4', () => {
    expect(calculatePickPoints({ sport: 'F1', team_name: 'Leclerc' }, results)).toBe(30);
    expect(calculatePickPoints({ sport: 'F1', team_name: 'Piastri' }, results)).toBe(30);
  });
  it('returns 20 for P5–P8', () => {
    expect(calculatePickPoints({ sport: 'F1', team_name: 'Russell' }, results)).toBe(20);
    expect(calculatePickPoints({ sport: 'F1', team_name: 'Alonso' }, results)).toBe(20);
  });
  it('returns 0 for P9+', () => {
    expect(calculatePickPoints({ sport: 'F1', team_name: 'Gasly' }, results)).toBe(0);
  });
  it('returns 0 for driver not in standings', () => {
    expect(calculatePickPoints({ sport: 'F1', team_name: 'Magnussen' }, results)).toBe(0);
  });
});

describe('calculatePickPoints — Golf (aggregated rankings system)', () => {
  // Golf points accumulated:
  //   Scheffler: Masters win (8) + PGA semi (3) = 11 pts → rank 1 → 80 Omni pts
  //   McIlroy:   Masters RU  (5) + PGA win  (8) = 13 pts → rank 0 → 80 Omni pts
  // Wait — McIlroy 13 > Scheffler 11, so McIlroy is rank 0.
  //   McIlroy  13pts → rank 0 → 80
  //   Scheffler 11pts → rank 1 → 50
  //   Hovland   5pts (Masters semi 3 + PGA quarter 2) → rank 2 → 30
  //   Koepka    2pts (PGA quarter) → rank 3 → 30
  //   Thomas    2pts → rank 4 → 20
  //   Morikawa  2pts → rank 5 → 20
  //   Fowler    1pt  (9th-16th) → rank 6 → 20
  const results = {
    Golf: {
      is_complete: true,
      rankings: ['McIlroy', 'Scheffler', 'Hovland', 'Koepka', 'Thomas', 'Morikawa', 'Fowler'],
      events: [
        {
          name: 'Masters', is_complete: true,
          champion: 'Scheffler', runner_up: 'McIlroy',
          semifinals: ['Hovland', 'Schauffele'], quarterfinalists: [],
          ninth_to_sixteenth: ['Fowler'],
        },
        {
          name: 'PGA', is_complete: true,
          champion: 'McIlroy', runner_up: 'Scheffler',
          semifinals: ['Hovland'], quarterfinalists: ['Koepka', 'Thomas', 'Morikawa', 'Day'],
          ninth_to_sixteenth: [],
        },
      ],
    },
  };

  it('returns 80 for the overall golf-points leader (rank 1)', () => {
    expect(calculatePickPoints({ sport: 'Golf', team_name: 'McIlroy' }, results)).toBe(80);
  });
  it('returns 50 for rank 2', () => {
    expect(calculatePickPoints({ sport: 'Golf', team_name: 'Scheffler' }, results)).toBe(50);
  });
  it('returns 30 for ranks 3 and 4', () => {
    expect(calculatePickPoints({ sport: 'Golf', team_name: 'Hovland' }, results)).toBe(30);
    expect(calculatePickPoints({ sport: 'Golf', team_name: 'Koepka' }, results)).toBe(30);
  });
  it('returns 20 for ranks 5–8', () => {
    expect(calculatePickPoints({ sport: 'Golf', team_name: 'Thomas' }, results)).toBe(20);
    expect(calculatePickPoints({ sport: 'Golf', team_name: 'Fowler' }, results)).toBe(20);
  });
  it('returns 0 for golfer not in rankings', () => {
    expect(calculatePickPoints({ sport: 'Golf', team_name: 'Fleetwood' }, results)).toBe(0);
  });
  it('returns null when not yet complete', () => {
    const inc = { Golf: { ...results.Golf, is_complete: false } };
    expect(calculatePickPoints({ sport: 'Golf', team_name: 'McIlroy' }, inc)).toBeNull();
  });
});

describe('calculatePickPoints — Golf (backward-compat: no rankings field)', () => {
  // Old cache entries without rankings fall back to per-event sum
  const legacyResults = {
    Golf: {
      is_complete: true,
      events: [
        { name: 'Masters', is_complete: true, champion: 'Scheffler', runner_up: 'McIlroy', semifinals: ['Hovland', 'Schauffele'], quarterfinalists: [] },
        { name: 'PGA', is_complete: true, champion: 'McIlroy', runner_up: 'Scheffler', semifinals: [], quarterfinalists: ['Hovland', 'Koepka', 'Thomas', 'Morikawa'] },
      ],
    },
  };

  it('falls back to per-event sum when rankings absent', () => {
    // Scheffler: 80 (Masters win) + 50 (PGA RU) = 130 (old behavior)
    expect(calculatePickPoints({ sport: 'Golf', team_name: 'Scheffler' }, legacyResults)).toBe(130);
  });
});

describe('calculatePickPoints — Tennis (aggregated rankings system)', () => {
  // Tennis points:
  //   Sinner:  Slam1 win (8) + Slam2 SF (3) = 11 → rank 0 → 80
  //   Alcaraz: Slam1 RU  (5) + Slam2 win (8) = 13 → rank 1... wait, 13>11 so Alcaraz rank 0
  //   Let's just supply explicit rankings to avoid ambiguity in the test:
  //   rankings: ['Alcaraz', 'Sinner', 'Zverev', 'Medvedev', 'Fritz', 'Ruud']
  const results = {
    MensTennis: {
      is_complete: true,
      rankings: ['Alcaraz', 'Sinner', 'Zverev', 'Medvedev', 'Fritz', 'Ruud'],
      events: [
        {
          name: 'French Open', is_complete: true,
          champion: 'Sinner', runner_up: 'Alcaraz',
          semifinals: ['Zverev', 'Medvedev'], quarterfinalists: ['Fritz', 'Ruud', 'Djokovic', 'Rune'],
          round_of_sixteen: ['Shelton', 'Hurkacz'],
        },
      ],
    },
  };

  it('returns 80 for rank 1', () => {
    expect(calculatePickPoints({ sport: 'MensTennis', team_name: 'Alcaraz' }, results)).toBe(80);
  });
  it('returns 50 for rank 2', () => {
    expect(calculatePickPoints({ sport: 'MensTennis', team_name: 'Sinner' }, results)).toBe(50);
  });
  it('returns 30 for ranks 3 and 4', () => {
    expect(calculatePickPoints({ sport: 'MensTennis', team_name: 'Zverev' }, results)).toBe(30);
    expect(calculatePickPoints({ sport: 'MensTennis', team_name: 'Medvedev' }, results)).toBe(30);
  });
  it('returns 20 for ranks 5–8', () => {
    expect(calculatePickPoints({ sport: 'MensTennis', team_name: 'Fritz' }, results)).toBe(20);
    expect(calculatePickPoints({ sport: 'MensTennis', team_name: 'Ruud' }, results)).toBe(20);
  });
  it('returns 0 for player not in rankings', () => {
    expect(calculatePickPoints({ sport: 'MensTennis', team_name: 'Tsitsipas' }, results)).toBe(0);
  });
  it('works identically for WomensTennis', () => {
    const wta = { WomensTennis: { ...results.MensTennis } };
    expect(calculatePickPoints({ sport: 'WomensTennis', team_name: 'Alcaraz' }, wta)).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// filterResultsForLeague
// ---------------------------------------------------------------------------

describe('filterResultsForLeague', () => {
  const fullResults = {
    NFL: { is_complete: true, champion: 'Chiefs' },
    Golf: {
      is_complete: false,
      events: [
        { name: 'Masters', year: 2026, approxMonth: 4, is_complete: true, champion: 'Scheffler', runner_up: 'McIlroy', semifinals: [], quarterfinalists: [] },
        { name: 'PGA', year: 2026, approxMonth: 5, is_complete: false, champion: null, runner_up: null, semifinals: [], quarterfinalists: [] },
        { name: 'US Open', year: 2026, approxMonth: 6, is_complete: false, champion: null, runner_up: null, semifinals: [], quarterfinalists: [] },
      ],
    },
  };

  it('passes through non-multi-event sports unchanged', () => {
    const filtered = filterResultsForLeague(fullResults, '2026-03-01');
    expect(filtered.NFL).toBe(fullResults.NFL);
  });

  it('excludes Golf events before draft date', () => {
    // Draft on April 30 2026: Masters (Apr 1 < Apr 30) excluded, PGA (May 1 ≥ Apr 30) and US Open (Jun 1) included
    const filtered = filterResultsForLeague(fullResults, '2026-04-30');
    expect(filtered.Golf.events).toHaveLength(2);
    expect(filtered.Golf.events[0].name).toBe('PGA');
    expect(filtered.Golf.events[1].name).toBe('US Open');
  });

  it('includes all Golf events when draft predates all of them', () => {
    const filtered = filterResultsForLeague(fullResults, '2026-01-01');
    expect(filtered.Golf.events).toHaveLength(3);
  });

  it('returns results unchanged when no draftDate provided', () => {
    expect(filterResultsForLeague(fullResults, null)).toBe(fullResults);
  });

  it('returns results unchanged when results is null/undefined', () => {
    expect(filterResultsForLeague(null, '2026-03-01')).toBeNull();
    expect(filterResultsForLeague(undefined, '2026-03-01')).toBeUndefined();
  });

  it('marks is_complete false when not all relevant events are done', () => {
    const filtered = filterResultsForLeague(fullResults, '2026-01-01');
    expect(filtered.Golf.is_complete).toBe(false);
  });
});
