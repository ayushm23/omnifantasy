// Shared team/player name alias maps for OmniFantasy.
//
// All three data sources (The Odds API, ESPN results, Jolpica F1) return names
// that may differ from TEAM_POOLS keys. A single update here covers all sources.
//
// Consumers:
//   ODDS_API_ALIASES / normalizeOddsApiName → src/oddsApi.js
//   ESPN_RESULT_ALIASES / normalizeResultName → src/resultsApi.js
//   F1_NAME_ALIASES / normalizeF1Name → src/oddsScraper.js, src/resultsApi.js

// Maps The Odds API team names to OmniFantasy TEAM_POOLS names
export const ODDS_API_ALIASES = {
  // NFL
  'Los Angeles Chargers': 'LA Chargers',
  'Los Angeles Rams': 'LA Rams',
  'New York Giants': 'NY Giants',
  'New York Jets': 'NY Jets',
  // NBA
  'Los Angeles Clippers': 'LA Clippers',
  'Los Angeles Lakers': 'LA Lakers',
  // MLB
  'Los Angeles Dodgers': 'LA Dodgers',
  'Los Angeles Angels': 'LA Angels',
  'New York Mets': 'NY Mets',
  'Athletics': 'Oakland Athletics',
  // NHL
  'Montréal Canadiens': 'Montreal Canadiens',
  'St Louis Blues': 'St. Louis Blues',
  'Utah Mammoth': 'Utah Hockey Club',
  // NCAAMB - API uses "School Mascot" format, teamPools uses school name only
  'Alabama Crimson Tide': 'Alabama',
  'Arizona Wildcats': 'Arizona',
  'Arkansas Razorbacks': 'Arkansas',
  'Auburn Tigers': 'Auburn',
  'BYU Cougars': 'BYU',
  'Clemson Tigers': 'Clemson',
  'Duke Blue Devils': 'Duke',
  'Florida Gators': 'Florida',
  'Georgia Bulldogs': 'Georgia',
  'Gonzaga Bulldogs': 'Gonzaga',
  'Houston Cougars': 'Houston',
  'Illinois Fighting Illini': 'Illinois',
  'Indiana Hoosiers': 'Indiana',
  'Iowa Hawkeyes': 'Iowa',
  'Iowa State Cyclones': 'Iowa State',
  'Kansas Jayhawks': 'Kansas',
  'Kentucky Wildcats': 'Kentucky',
  'Louisville Cardinals': 'Louisville',
  'Marquette Golden Eagles': 'Marquette',
  'Miami Hurricanes': 'Miami',
  'Michigan Wolverines': 'Michigan',
  'Michigan St Spartans': 'Michigan State',
  'NC State Wolfpack': 'NC State',
  'North Carolina Tar Heels': 'North Carolina',
  'Ohio State Buckeyes': 'Ohio State',
  'Purdue Boilermakers': 'Purdue',
  'San Diego St Aztecs': 'San Diego State',
  "Saint Mary's Gaels": "Saint Mary's",
  "St. John's Red Storm": "St. John's",
  'TCU Horned Frogs': 'TCU',
  'Tennessee Volunteers': 'Tennessee',
  'Texas Longhorns': 'Texas',
  'Texas A&M Aggies': 'Texas A&M',
  'Texas Tech Red Raiders': 'Texas Tech',
  'UCF Knights': 'UCF',
  'UCLA Bruins': 'UCLA',
  'UConn Huskies': 'UConn',
  'USC Trojans': 'USC',
  'Villanova Wildcats': 'Villanova',
  'Wisconsin Badgers': 'Wisconsin',
  'Creighton Bluejays': 'Creighton',
  'Baylor Bears': 'Baylor',
  'Memphis Tigers': 'Memphis',
  // UCL
  'Paris Saint Germain': 'Paris Saint-Germain',
  'Atletico de Madrid': 'Atletico Madrid',
  'Club Brugge KV': 'Club Brugge',
  'RB Leipzig': 'RB Leipzig',
  'FC Porto': 'Porto',
  'FC Barcelona': 'Barcelona',
  'SSC Napoli': 'Napoli',
  'SL Benfica': 'Benfica',
  'Tottenham Hotspur': 'Tottenham',
  'PSV Eindhoven': 'PSV',
  'AS Roma': 'Roma',
  'FC Shakhtar Donetsk': 'Shakhtar Donetsk',
  'FC Red Bull Salzburg': 'Red Bull Salzburg',
  'FC Copenhagen': 'Copenhagen',
  'Olympique Marseille': 'Marseille',
  // NCAAF - additional school mappings
  'Oregon Ducks': 'Oregon',
  'Penn State Nittany Lions': 'Penn State',
  'Notre Dame Fighting Irish': 'Notre Dame',
  'LSU Tigers': 'LSU',
  'Florida State Seminoles': 'Florida State',
  'Oklahoma Sooners': 'Oklahoma',
  'Washington Huskies': 'Washington',
  'Utah Utes': 'Utah',
  'Ole Miss Rebels': 'Ole Miss',
  'Kansas State Wildcats': 'Kansas State',
  'Tulane Green Wave': 'Tulane',
  'Oregon State Beavers': 'Oregon State',
  'Fresno State Bulldogs': 'Fresno State',
  'South Carolina Gamecocks': 'South Carolina',
};

// Maps ESPN result/display names to OmniFantasy TEAM_POOLS names
export const ESPN_RESULT_ALIASES = {
  // NFL
  'Los Angeles Chargers': 'LA Chargers',
  'Los Angeles Rams':     'LA Rams',
  'New York Giants':      'NY Giants',
  'New York Jets':        'NY Jets',
  // NBA
  'Los Angeles Clippers': 'LA Clippers',
  'Los Angeles Lakers':   'LA Lakers',
  // MLB
  'Los Angeles Dodgers':  'LA Dodgers',
  'Los Angeles Angels':   'LA Angels',
  'New York Mets':        'NY Mets',
  'Oakland Athletics':    'Oakland Athletics',
  // NHL
  'Montréal Canadiens':   'Montreal Canadiens',
  'St. Louis Blues':      'St. Louis Blues',
  // UCL
  'Paris Saint-Germain':  'Paris Saint-Germain',
  'Atlético de Madrid':   'Atletico Madrid',
  'Club Brugge':          'Club Brugge',
  'FC Porto':             'Porto',
  'FC Barcelona':         'Barcelona',
  'SSC Napoli':           'Napoli',
  'SL Benfica':           'Benfica',
  'PSV Eindhoven':        'PSV',
  'AS Roma':              'Roma',
  'FC Shakhtar Donetsk':  'Shakhtar Donetsk',
  'FC Red Bull Salzburg': 'Red Bull Salzburg',
  'FC Copenhagen':        'Copenhagen',
};

// Maps Jolpica F1 driver names to OmniFantasy TEAM_POOLS names (diacritics, etc.)
export const F1_NAME_ALIASES = {
  'Nico Hülkenberg': 'Nico Hulkenberg',
};

export const normalizeOddsApiName = (name) => ODDS_API_ALIASES[name] || name;
export const normalizeResultName  = (name) => ESPN_RESULT_ALIASES[name] || name;
export const normalizeF1Name      = (name) => F1_NAME_ALIASES[name]    || name;
