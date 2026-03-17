import { describe, it, expect } from 'vitest';
import { formatHourLabel, formatTimeRemaining } from '../utils/format';

describe('formatHourLabel', () => {
  it('converts midnight (0) to 12:00 AM', () => {
    expect(formatHourLabel(0)).toBe('12:00 AM');
  });

  it('converts noon (12) to 12:00 PM', () => {
    expect(formatHourLabel(12)).toBe('12:00 PM');
  });

  it('converts AM hours correctly', () => {
    expect(formatHourLabel(1)).toBe('1:00 AM');
    expect(formatHourLabel(8)).toBe('8:00 AM');
    expect(formatHourLabel(11)).toBe('11:00 AM');
  });

  it('converts PM hours correctly', () => {
    expect(formatHourLabel(13)).toBe('1:00 PM');
    expect(formatHourLabel(17)).toBe('5:00 PM');
    expect(formatHourLabel(23)).toBe('11:00 PM');
  });

  it('handles values >= 24 by wrapping', () => {
    expect(formatHourLabel(24)).toBe('12:00 AM');
    expect(formatHourLabel(25)).toBe('1:00 AM');
  });
});

describe('formatTimeRemaining', () => {
  it('returns null for null or 0', () => {
    expect(formatTimeRemaining(null)).toBeNull();
    expect(formatTimeRemaining(0)).toBeNull();
  });

  it('formats seconds-only durations', () => {
    expect(formatTimeRemaining(4_000)).toBe('4s');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimeRemaining(184_000)).toBe('3m 4s');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatTimeRemaining(7_384_000)).toBe('2h 3m 4s');
  });
});
