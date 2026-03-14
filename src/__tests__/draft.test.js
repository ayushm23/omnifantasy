import { describe, it, expect } from 'vitest';
import { getPickerIndex, normalizeDraftPicker, formatPickNumber, wouldBreakSportCoverage } from '../utils/draft';

// ---------------------------------------------------------------------------
// getPickerIndex
// ---------------------------------------------------------------------------

describe('getPickerIndex — linear draft (no snake)', () => {
  const args = { numMembers: 4, isSnake: false, thirdRoundReversal: false };

  it('always picks left-to-right regardless of round', () => {
    expect(getPickerIndex({ ...args, currentPick: 1, currentRound: 1 })).toBe(0);
    expect(getPickerIndex({ ...args, currentPick: 4, currentRound: 1 })).toBe(3);
    expect(getPickerIndex({ ...args, currentPick: 5, currentRound: 2 })).toBe(0);
    expect(getPickerIndex({ ...args, currentPick: 8, currentRound: 2 })).toBe(3);
  });
});

describe('getPickerIndex — standard snake', () => {
  const args = { numMembers: 4, isSnake: true, thirdRoundReversal: false };

  it('round 1 goes 0→3', () => {
    expect(getPickerIndex({ ...args, currentPick: 1, currentRound: 1 })).toBe(0);
    expect(getPickerIndex({ ...args, currentPick: 4, currentRound: 1 })).toBe(3);
  });

  it('round 2 reverses: 3→0', () => {
    expect(getPickerIndex({ ...args, currentPick: 5, currentRound: 2 })).toBe(3);
    expect(getPickerIndex({ ...args, currentPick: 8, currentRound: 2 })).toBe(0);
  });

  it('round 3 resumes forward: 0→3', () => {
    expect(getPickerIndex({ ...args, currentPick: 9, currentRound: 3 })).toBe(0);
    expect(getPickerIndex({ ...args, currentPick: 12, currentRound: 3 })).toBe(3);
  });

  it('round 4 reverses again', () => {
    expect(getPickerIndex({ ...args, currentPick: 13, currentRound: 4 })).toBe(3);
  });
});

describe('getPickerIndex — third-round-reversal snake', () => {
  const args = { numMembers: 4, isSnake: true, thirdRoundReversal: true };

  it('round 1 goes forward: 0→3', () => {
    expect(getPickerIndex({ ...args, currentPick: 1, currentRound: 1 })).toBe(0);
    expect(getPickerIndex({ ...args, currentPick: 4, currentRound: 1 })).toBe(3);
  });

  it('round 2 reverses: 3→0', () => {
    expect(getPickerIndex({ ...args, currentPick: 5, currentRound: 2 })).toBe(3);
    expect(getPickerIndex({ ...args, currentPick: 8, currentRound: 2 })).toBe(0);
  });

  it('round 3 also reverses (the "reversal"): 3→0', () => {
    expect(getPickerIndex({ ...args, currentPick: 9, currentRound: 3 })).toBe(3);
    expect(getPickerIndex({ ...args, currentPick: 12, currentRound: 3 })).toBe(0);
  });

  it('round 4 is even → forward', () => {
    // TRR uses isReversed = round%2===1 for rounds≥4; round 4 is even → forward (0→3)
    expect(getPickerIndex({ ...args, currentPick: 13, currentRound: 4 })).toBe(0);
  });

  it('round 5 is odd → reversed', () => {
    expect(getPickerIndex({ ...args, currentPick: 17, currentRound: 5 })).toBe(3);
  });
});

describe('getPickerIndex — edge cases', () => {
  it('returns 0 for invalid inputs', () => {
    expect(getPickerIndex({ numMembers: 0, currentPick: 1, currentRound: 1, isSnake: true, thirdRoundReversal: false })).toBe(0);
    expect(getPickerIndex({ numMembers: 4, currentPick: 0, currentRound: 1, isSnake: true, thirdRoundReversal: false })).toBe(0);
  });

  it('handles single-member league', () => {
    expect(getPickerIndex({ numMembers: 1, currentPick: 5, currentRound: 5, isSnake: true, thirdRoundReversal: false })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// normalizeDraftPicker
// ---------------------------------------------------------------------------

describe('normalizeDraftPicker', () => {
  it('returns null for null/undefined', () => {
    expect(normalizeDraftPicker(null)).toBeNull();
    expect(normalizeDraftPicker(undefined)).toBeNull();
  });

  it('converts a plain email string', () => {
    const result = normalizeDraftPicker('alice@example.com');
    expect(result).toEqual({ email: 'alice@example.com', name: 'alice' });
  });

  it('converts a non-email string (uses full value as name)', () => {
    const result = normalizeDraftPicker('Alice');
    expect(result).toMatchObject({ email: 'Alice', name: 'Alice' });
  });

  it('passes through an object with email and name', () => {
    const result = normalizeDraftPicker({ email: 'alice@example.com', name: 'Alice Smith' });
    expect(result.email).toBe('alice@example.com');
    expect(result.name).toBe('Alice Smith');
  });

  it('derives name from email when object.name is missing', () => {
    const result = normalizeDraftPicker({ email: 'bob@example.com' });
    expect(result.name).toBe('bob');
  });
});

// ---------------------------------------------------------------------------
// formatPickNumber
// ---------------------------------------------------------------------------

describe('formatPickNumber', () => {
  it('formats round and pick-in-round correctly', () => {
    expect(formatPickNumber({ round: 1, pick_number: 1 }, 4)).toBe('1.01');
    expect(formatPickNumber({ round: 1, pick_number: 4 }, 4)).toBe('1.04');
    expect(formatPickNumber({ round: 2, pick_number: 5 }, 4)).toBe('2.01');
    expect(formatPickNumber({ round: 3, pick_number: 10 }, 4)).toBe('3.02');
  });

  it('pads single-digit picks with a leading zero', () => {
    expect(formatPickNumber({ round: 2, pick_number: 7 }, 10)).toBe('2.07');
  });
});

// ---------------------------------------------------------------------------
// wouldBreakSportCoverage
// ---------------------------------------------------------------------------

describe('wouldBreakSportCoverage', () => {
  const baseParams = {
    sportRequirementEnabled: true,
    leagueSports: ['NBA'],
    pool: ['A', 'B', 'C'],
    draftEmails: ['a@example.com', 'b@example.com', 'c@example.com'],
    picks: [],
    pickerEmail: 'a@example.com',
    sport: 'NBA',
    team: 'A',
  };

  it('returns false when sport requirement is disabled', () => {
    expect(wouldBreakSportCoverage({ ...baseParams, sportRequirementEnabled: false })).toBe(false);
  });

  it('returns false when sport is not in league sports', () => {
    expect(wouldBreakSportCoverage({ ...baseParams, leagueSports: ['NFL'] })).toBe(false);
  });

  it('returns false when pool is empty', () => {
    expect(wouldBreakSportCoverage({ ...baseParams, pool: [] })).toBe(false);
  });

  it('blocks a pick when remaining teams would be fewer than members still needing the sport', () => {
    const params = {
      ...baseParams,
      pool: ['A', 'B'], // only 2 teams available
      draftEmails: ['a@example.com', 'b@example.com', 'c@example.com'],
      picks: [],
      pickerEmail: 'a@example.com',
      team: 'A',
    };
    // After A is picked: remaining teams = 1, members still needing sport = 2 (b,c)
    expect(wouldBreakSportCoverage(params)).toBe(true);
  });

  it('allows a pick when remaining teams match members still needing the sport', () => {
    const params = {
      ...baseParams,
      pool: ['A', 'B', 'C'], // 3 teams, 3 members
      draftEmails: ['a@example.com', 'b@example.com', 'c@example.com'],
      picks: [],
      pickerEmail: 'a@example.com',
      team: 'A',
    };
    // After A is picked: remaining teams = 2, members still needing sport = 2 (b,c)
    expect(wouldBreakSportCoverage(params)).toBe(false);
  });
});
