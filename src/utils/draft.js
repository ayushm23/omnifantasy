export const formatPickNumber = (pick, numMembers = 1) => {
  const round = pick.round;
  const pickInRound = ((pick.pick_number - 1) % numMembers) + 1;
  return `${round}.${String(pickInRound).padStart(2, '0')}`;
};

export const getPickerIndex = ({
  currentPick,
  currentRound,
  numMembers,
  isSnake,
  thirdRoundReversal
}) => {
  if (!numMembers || currentPick < 1 || currentRound < 1) return 0;

  const pickInRound = (currentPick - 1) % numMembers;
  let isReversed = false;

  if (isSnake) {
    if (thirdRoundReversal) {
      if (currentRound === 2 || currentRound === 3) {
        isReversed = true;
      } else if (currentRound >= 4) {
        // Round 4 resumes normal direction, then alternates every round.
        isReversed = currentRound % 2 === 1;
      }
    } else {
      isReversed = currentRound % 2 === 0;
    }
  }

  return isReversed ? (numMembers - 1 - pickInRound) : pickInRound;
};

export const getCurrentPickerFromState = (draftState) => {
  const order = draftState?.draftOrder || [];
  if (order.length === 0) return null;

  const pickerIndex = getPickerIndex({
    currentPick: draftState.currentPick,
    currentRound: draftState.currentRound,
    numMembers: order.length,
    isSnake: draftState.isSnake,
    thirdRoundReversal: draftState.thirdRoundReversal
  });

  return normalizeDraftPicker(order[pickerIndex]);
};

export const normalizeDraftPicker = (picker) => {
  if (!picker) return null;
  if (typeof picker === 'string') {
    return {
      email: picker,
      name: picker.includes('@') ? picker.split('@')[0] : picker
    };
  }
  if (typeof picker === 'object') {
    return {
      ...picker,
      email: picker.email || null,
      name: picker.name || (picker.email ? picker.email.split('@')[0] : null)
    };
  }
  return null;
};

/**
 * Sort comparator for rows with { ep, team } fields.
 * Sorts by EP descending (nulls last), with team name as tiebreaker.
 * Combine with direction: `arr.sort((a,b) => dir === 'asc' ? compareByEP(a,b) : -compareByEP(a,b))`
 */
export const compareByEP = (a, b) => {
  const aEP = (a.ep != null && !Number.isNaN(a.ep)) ? a.ep : -Infinity;
  const bEP = (b.ep != null && !Number.isNaN(b.ep)) ? b.ep : -Infinity;
  return aEP === bEP ? a.team.localeCompare(b.team) : aEP - bEP;
};

/**
 * Returns true if picking `team` in `sport` for `pickerEmail` would leave
 * too few remaining teams in that sport for other drafters who still need
 * their required pick from it.
 *
 * @param {object}   params
 * @param {boolean}  params.sportRequirementEnabled
 * @param {string[]} params.leagueSports   - sport codes in this league
 * @param {string[]} params.pool           - full team pool for this sport (base or EP-sorted)
 * @param {string[]} params.draftEmails    - lowercase emails of all drafters (in order)
 * @param {Array}    params.picks          - existing picks (snake_case from DB)
 * @param {string}   params.pickerEmail    - email of the picker making this pick
 * @param {string}   params.sport          - sport code of the candidate pick
 * @param {string}   params.team           - team name of the candidate pick
 * @returns {boolean}
 */
export function wouldBreakSportCoverage({
  sportRequirementEnabled,
  leagueSports,
  pool,
  draftEmails,
  picks,
  pickerEmail,
  sport,
  team,
}) {
  if (!sportRequirementEnabled) return false;
  if (!(leagueSports || []).includes(sport)) return false;
  const pickerEmailLower = pickerEmail?.toLowerCase();
  if (!pickerEmailLower) return false;
  if (!draftEmails || draftEmails.length === 0) return false;
  if (!pool || pool.length === 0) return false;

  const pickedInSport = new Set(
    (picks || []).filter(p => p.sport === sport).map(p => p.team_name)
  );
  let remainingAfterPick = pool.filter(teamName => !pickedInSport.has(teamName)).length;
  if (!pickedInSport.has(team)) {
    remainingAfterPick = Math.max(0, remainingAfterPick - 1);
  }

  let membersStillNeedingSportAfterPick = 0;
  for (const email of draftEmails) {
    const alreadyHasSport = (picks || []).some(
      p => p.picker_email?.toLowerCase() === email && p.sport === sport
    );
    const hasSportAfterPick = alreadyHasSport || email === pickerEmailLower;
    if (!hasSportAfterPick) membersStillNeedingSportAfterPick += 1;
  }

  return remainingAfterPick < membersStillNeedingSportAfterPick;
}

/**
 * Returns how many picks remain until myEmail is on the clock,
 * starting from (but not including) currentPick.
 * Searches up to numMembers * 2 picks forward (one full snake cycle).
 * Returns null if not determinable.
 */
export function picksUntilTurn({ myEmail, draftOrder, currentPick, currentRound, isSnake, thirdRoundReversal }) {
  const n = (draftOrder || []).length;
  if (!myEmail || n === 0) return null;
  const myEmailLower = myEmail.toLowerCase();
  for (let offset = 1; offset <= n * 2; offset++) {
    const nextPick = currentPick + offset;
    const nextRound = Math.ceil(nextPick / n);
    const idx = getPickerIndex({ currentPick: nextPick, currentRound: nextRound, numMembers: n, isSnake, thirdRoundReversal });
    const picker = normalizeDraftPicker(draftOrder[idx]);
    if (picker?.email?.toLowerCase() === myEmailLower) return offset;
  }
  return null;
}

export const generateDraftBoard = (picks, currentUserEmail) => {
  if (!picks || picks.length === 0) return [];
  return picks.map((pick) => ({
    ...pick,
    isUser: pick.picker_email?.toLowerCase() === currentUserEmail?.toLowerCase(),
  }));
};
