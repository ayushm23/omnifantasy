import { describe, it, expect } from 'vitest';
import {
  normalizeOddsApiName,
  normalizeResultName,
  normalizeF1Name,
  ODDS_API_ALIASES,
  ESPN_RESULT_ALIASES,
  F1_NAME_ALIASES,
} from '../utils/aliases';

// ---------------------------------------------------------------------------
// normalizeOddsApiName
// ---------------------------------------------------------------------------

describe('normalizeOddsApiName', () => {
  it('maps known NFL aliases', () => {
    expect(normalizeOddsApiName('Los Angeles Chargers')).toBe('LA Chargers');
    expect(normalizeOddsApiName('Los Angeles Rams')).toBe('LA Rams');
    expect(normalizeOddsApiName('New York Giants')).toBe('NY Giants');
    expect(normalizeOddsApiName('New York Jets')).toBe('NY Jets');
  });

  it('maps known NBA aliases', () => {
    expect(normalizeOddsApiName('Los Angeles Lakers')).toBe('LA Lakers');
    expect(normalizeOddsApiName('Los Angeles Clippers')).toBe('LA Clippers');
  });

  it('maps known MLB aliases', () => {
    expect(normalizeOddsApiName('Los Angeles Dodgers')).toBe('LA Dodgers');
    expect(normalizeOddsApiName('Athletics')).toBe('Oakland Athletics');
    expect(normalizeOddsApiName('New York Mets')).toBe('NY Mets');
  });

  it('maps known NHL aliases', () => {
    expect(normalizeOddsApiName('Montréal Canadiens')).toBe('Montreal Canadiens');
    expect(normalizeOddsApiName('St Louis Blues')).toBe('St. Louis Blues');
    expect(normalizeOddsApiName('Utah Mammoth')).toBe('Utah Hockey Club');
  });

  it('maps known NCAAMB aliases (school + mascot → school only)', () => {
    expect(normalizeOddsApiName('Duke Blue Devils')).toBe('Duke');
    expect(normalizeOddsApiName('Kentucky Wildcats')).toBe('Kentucky');
    expect(normalizeOddsApiName('Michigan St Spartans')).toBe('Michigan State');
    expect(normalizeOddsApiName('UConn Huskies')).toBe('UConn');
  });

  it('maps known UCL aliases', () => {
    expect(normalizeOddsApiName('FC Barcelona')).toBe('Barcelona');
    expect(normalizeOddsApiName('Paris Saint Germain')).toBe('Paris Saint-Germain');
    expect(normalizeOddsApiName('Atletico de Madrid')).toBe('Atletico Madrid');
    expect(normalizeOddsApiName('Tottenham Hotspur')).toBe('Tottenham');
  });

  it('maps known NCAAF aliases', () => {
    expect(normalizeOddsApiName('Penn State Nittany Lions')).toBe('Penn State');
    expect(normalizeOddsApiName('Notre Dame Fighting Irish')).toBe('Notre Dame');
    expect(normalizeOddsApiName('Ole Miss Rebels')).toBe('Ole Miss');
  });

  it('passes through names not in the alias map', () => {
    expect(normalizeOddsApiName('Kansas City Chiefs')).toBe('Kansas City Chiefs');
    expect(normalizeOddsApiName('Boston Celtics')).toBe('Boston Celtics');
    expect(normalizeOddsApiName('')).toBe('');
  });

  it('every value in ODDS_API_ALIASES is reachable via normalizeOddsApiName', () => {
    for (const [apiName, poolName] of Object.entries(ODDS_API_ALIASES)) {
      expect(normalizeOddsApiName(apiName)).toBe(poolName);
    }
  });
});

// ---------------------------------------------------------------------------
// normalizeResultName
// ---------------------------------------------------------------------------

describe('normalizeResultName', () => {
  it('maps known NFL aliases', () => {
    expect(normalizeResultName('Los Angeles Chargers')).toBe('LA Chargers');
    expect(normalizeResultName('New York Giants')).toBe('NY Giants');
  });

  it('maps known NBA aliases', () => {
    expect(normalizeResultName('Los Angeles Lakers')).toBe('LA Lakers');
  });

  it('maps known NHL aliases', () => {
    expect(normalizeResultName('Montréal Canadiens')).toBe('Montreal Canadiens');
  });

  it('maps known UCL aliases', () => {
    expect(normalizeResultName('FC Barcelona')).toBe('Barcelona');
    expect(normalizeResultName('Atlético de Madrid')).toBe('Atletico Madrid');
    expect(normalizeResultName('PSV Eindhoven')).toBe('PSV');
  });

  it('passes through names not in the alias map', () => {
    expect(normalizeResultName('Kansas City Chiefs')).toBe('Kansas City Chiefs');
    expect(normalizeResultName('Real Madrid')).toBe('Real Madrid');
  });

  it('every value in ESPN_RESULT_ALIASES is reachable via normalizeResultName', () => {
    for (const [espnName, poolName] of Object.entries(ESPN_RESULT_ALIASES)) {
      expect(normalizeResultName(espnName)).toBe(poolName);
    }
  });
});

// ---------------------------------------------------------------------------
// normalizeF1Name
// ---------------------------------------------------------------------------

describe('normalizeF1Name', () => {
  it('maps diacritic variant to ASCII pool name', () => {
    expect(normalizeF1Name('Nico Hülkenberg')).toBe('Nico Hulkenberg');
  });

  it('passes through names not in the alias map', () => {
    expect(normalizeF1Name('Max Verstappen')).toBe('Max Verstappen');
    expect(normalizeF1Name('Lewis Hamilton')).toBe('Lewis Hamilton');
  });

  it('every value in F1_NAME_ALIASES is reachable via normalizeF1Name', () => {
    for (const [apiName, poolName] of Object.entries(F1_NAME_ALIASES)) {
      expect(normalizeF1Name(apiName)).toBe(poolName);
    }
  });
});
