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

describe('calculatePickPoints — Golf (multi-event)', () => {
  const results = {
    Golf: {
      is_complete: true,
      events: [
        { name: 'Masters', is_complete: true, champion: 'Scheffler', runner_up: 'McIlroy', semifinals: ['Hovland', 'Schauffele'], quarterfinalists: [] },
        { name: 'PGA', is_complete: true, champion: 'McIlroy', runner_up: 'Scheffler', semifinals: [], quarterfinalists: ['Hovland', 'Koepka', 'Thomas', 'Morikawa'] },
      ],
    },
  };

  it('accumulates points across events', () => {
    // Scheffler: 80 (Masters champion) + 50 (PGA runner-up) = 130
    expect(calculatePickPoints({ sport: 'Golf', team_name: 'Scheffler' }, results)).toBe(130);
  });
  it('picks up runner-up in one event, champion in another', () => {
    // McIlroy: 50 (Masters runner-up) + 80 (PGA champion) = 130
    expect(calculatePickPoints({ sport: 'Golf', team_name: 'McIlroy' }, results)).toBe(130);
  });
  it('accumulates from quarterfinalist positions', () => {
    // Hovland: 30 (Masters semi) + 20 (PGA quarter) = 50
    expect(calculatePickPoints({ sport: 'Golf', team_name: 'Hovland' }, results)).toBe(50);
  });
  it('returns 0 for golfer with no placements', () => {
    expect(calculatePickPoints({ sport: 'Golf', team_name: 'Fleetwood' }, results)).toBe(0);
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
