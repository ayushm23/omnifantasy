import { describe, it, expect } from 'vitest';
import { formatHourLabel } from '../utils/format';

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
