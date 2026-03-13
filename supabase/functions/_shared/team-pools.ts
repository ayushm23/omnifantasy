// Shared team pools for server-side auto-pick.
// Source of truth: shared/team-pools.json (used by both client and Edge Functions).

import teamPools from '../../../shared/team-pools.json' assert { type: 'json' };

export const TEAM_POOLS_BY_CODE = teamPools as Record<string, string[]>;

export function getTeamPoolForSport(sportCode: string): string[] {
  return TEAM_POOLS_BY_CODE[sportCode] || [];
}
