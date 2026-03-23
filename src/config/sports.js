import TEAM_POOLS_BY_CODE from '../../shared/team-pools.json';

export const AVAILABLE_SPORTS = [
  { code: 'NFL', name: 'NFL', icon: '🏈', maxLeagueSize: null },
  { code: 'NCAAF', name: 'NCAA Football', icon: '🏈', maxLeagueSize: null },
  { code: 'NBA', name: 'NBA', icon: '🏀', maxLeagueSize: null },
  { code: 'NCAAMB', name: "NCAA Men's Basketball", icon: '🏀', maxLeagueSize: null },
  { code: 'MLB', name: 'MLB', icon: '⚾', maxLeagueSize: null },
  { code: 'NHL', name: 'NHL', icon: '🏒', maxLeagueSize: null },
  { code: 'UCL', name: 'UEFA Champions League', icon: '⚽', maxLeagueSize: null },
  { code: 'Euro', name: 'UEFA Euro', icon: '⚽', maxLeagueSize: null },
  { code: 'WorldCup', name: 'World Cup', icon: '⚽', maxLeagueSize: null },
  { code: 'F1', name: 'F1', icon: '🏎️', maxLeagueSize: null },
  { code: 'Golf', name: 'Golf (majors)', icon: '⛳', maxLeagueSize: null },
  { code: 'MensTennis', name: 'ATP', icon: '🎾', maxLeagueSize: null },
  { code: 'WomensTennis', name: 'WTA', icon: '🎾', maxLeagueSize: null },
];

export const TEAM_POOLS = {};

const DISPLAY_NAME_BY_CODE = {
  NFL: 'NFL',
  NCAAF: 'NCAA Football',
  NBA: 'NBA',
  NCAAMB: "NCAA Men's Basketball",
  MLB: 'MLB',
  NHL: 'NHL',
  UCL: 'UEFA Champions League',
  Euro: 'UEFA Euro',
  WorldCup: 'World Cup',
  F1: 'F1',
  Golf: 'Golf (majors)',
  MensTennis: 'ATP',
  WomensTennis: 'WTA',
};

Object.entries(TEAM_POOLS_BY_CODE).forEach(([code, pool]) => {
  const displayName = DISPLAY_NAME_BY_CODE[code] || code;
  TEAM_POOLS[code] = pool;
  TEAM_POOLS[displayName] = pool;
});

// Backward-compatible aliases for tennis/golf pool names.
TEAM_POOLS['Golf'] = TEAM_POOLS_BY_CODE.Golf;
TEAM_POOLS['Golf (majors)'] = TEAM_POOLS_BY_CODE.Golf;
TEAM_POOLS["Men's Tennis (ATP)"] = TEAM_POOLS_BY_CODE.MensTennis;
TEAM_POOLS["Women's Tennis (WTA)"] = TEAM_POOLS_BY_CODE.WomensTennis;
TEAM_POOLS.ATP = TEAM_POOLS_BY_CODE.MensTennis;
TEAM_POOLS.WTA = TEAM_POOLS_BY_CODE.WomensTennis;

export const EP_DRIVEN_POOL_SPORTS = new Set(['UCL', 'Euro', 'WorldCup', 'Golf', 'MensTennis', 'WomensTennis', 'F1']);

// Sports where TEAM_POOLS acts as a whitelist when filtering EP data.
// Prevents retired/inactive players from appearing just because they have Odds API entries.
// WorldCup/UCL/Euro intentionally excluded — their pools auto-expand from EP.
export const EP_POOL_WHITELIST_SPORTS = new Set(['Golf', 'MensTennis', 'WomensTennis', 'F1']);

export const isTournamentYear = (sportCode, year = new Date().getFullYear()) => {
  if (sportCode === 'Euro') return year >= 2024 && (year - 2024) % 4 === 0;
  if (sportCode === 'WorldCup') return year >= 2026 && (year - 2026) % 4 === 0;
  return true;
};

export const getSelectableSports = (sports, year = new Date().getFullYear()) =>
  sports.filter((sport) => isTournamentYear(sport.code, year));

export const getSportNameByCode = (sportCode, sports = AVAILABLE_SPORTS) => {
  const sport = sports.find((entry) => entry.code === sportCode);
  return sport?.name || sportCode;
};

export const getSportDisplayCode = (sportCode) => {
  const map = {
    MensTennis: 'ATP',
    WomensTennis: 'WTA',
  };
  return map[sportCode] || sportCode;
};

export const getSportColor = (sport) => {
  const colors = {
    NFL: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    NCAAF: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
    NBA: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    NCAAMB: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50',
    MLB: 'bg-red-500/20 text-red-400 border-red-500/50',
    NHL: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50',
    UCL: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
    Euro: 'bg-sky-500/20 text-sky-400 border-sky-500/50',
    WorldCup: 'bg-teal-500/20 text-teal-400 border-teal-500/50',
    F1: 'bg-red-600/20 text-red-500 border-red-600/50',
    Golf: 'bg-lime-500/20 text-lime-400 border-lime-500/50',
    MensTennis: 'bg-violet-500/20 text-violet-400 border-violet-500/50',
    WomensTennis: 'bg-pink-500/20 text-pink-400 border-pink-500/50',
  };
  return colors[sport] || 'bg-slate-600/20 text-slate-400 border-slate-600/50';
};

export const getSportTextColor = (sport) => {
  const colors = {
    NFL: 'text-orange-400',
    NCAAF: 'text-amber-400',
    NBA: 'text-blue-400',
    NCAAMB: 'text-indigo-400',
    MLB: 'text-red-400',
    NHL: 'text-cyan-400',
    UCL: 'text-emerald-400',
    Euro: 'text-sky-400',
    WorldCup: 'text-teal-400',
    F1: 'text-red-500',
    Golf: 'text-lime-400',
    MensTennis: 'text-violet-400',
    WomensTennis: 'text-pink-400',
  };
  return colors[sport] || 'text-slate-400';
};
