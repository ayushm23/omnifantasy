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

export const TEAM_POOLS = {
  'NFL': ['Kansas City Chiefs', 'Buffalo Bills', 'San Francisco 49ers', 'Philadelphia Eagles', 'Baltimore Ravens', 'Detroit Lions', 'Dallas Cowboys', 'Green Bay Packers', 'Miami Dolphins', 'LA Rams', 'Tampa Bay Buccaneers', 'Minnesota Vikings', 'Cleveland Browns', 'Cincinnati Bengals', 'Jacksonville Jaguars', 'Houston Texans', 'Pittsburgh Steelers', 'LA Chargers', 'Seattle Seahawks', 'New Orleans Saints', 'Atlanta Falcons', 'NY Jets', 'Indianapolis Colts', 'Las Vegas Raiders', 'Denver Broncos', 'Tennessee Titans', 'NY Giants', 'New England Patriots', 'Washington Commanders', 'Arizona Cardinals', 'Chicago Bears', 'Carolina Panthers'],
  'NCAA Football': ['Georgia', 'Alabama', 'Ohio State', 'Michigan', 'Texas', 'Oregon', 'Penn State', 'Notre Dame', 'Clemson', 'USC', 'LSU', 'Florida State', 'Tennessee', 'Oklahoma', 'Washington', 'Utah', 'Ole Miss', 'Texas A&M', 'Miami', 'Kansas State', 'Iowa', 'Wisconsin', 'NC State', 'TCU', 'Tulane', 'UCF', 'Louisville', 'Oregon State', 'Fresno State', 'South Carolina', 'Missouri', 'Oklahoma State', 'Iowa State', 'Arizona', 'BYU', 'Boise State', 'Liberty', 'Kansas', 'West Virginia', 'Virginia Tech', 'North Carolina', 'Nebraska', 'Texas Tech', 'SMU', 'Baylor', 'Arizona State', 'Mississippi State', 'Arkansas', 'Kentucky', 'Florida', 'Georgia Tech', 'Auburn', 'Maryland', 'Minnesota', 'Duke', 'Syracuse', 'Pittsburgh', 'Cincinnati', 'Memphis', 'Colorado'],
  'NBA': ['Boston Celtics', 'Cleveland Cavaliers', 'Oklahoma City Thunder', 'Milwaukee Bucks', 'Denver Nuggets', 'New York Knicks', 'LA Lakers', 'Phoenix Suns', 'Dallas Mavericks', 'Minnesota Timberwolves', 'LA Clippers', 'Golden State Warriors', 'Orlando Magic', 'Indiana Pacers', 'Miami Heat', 'Sacramento Kings', 'Philadelphia 76ers', 'Memphis Grizzlies', 'Houston Rockets', 'Atlanta Hawks', 'San Antonio Spurs', 'Chicago Bulls', 'New Orleans Pelicans', 'Detroit Pistons', 'Brooklyn Nets', 'Toronto Raptors', 'Charlotte Hornets', 'Portland Trail Blazers', 'Utah Jazz', 'Washington Wizards'],
  "NCAA Men's Basketball": ['UConn', 'Duke', 'Kansas', 'North Carolina', 'Purdue', 'Houston', 'Kentucky', 'Tennessee', 'Arizona', 'Auburn', 'Gonzaga', 'Marquette', 'Creighton', 'Baylor', 'Illinois', 'Alabama', 'UCLA', 'Texas', 'San Diego State', 'Iowa State', 'Michigan', 'Xavier', 'Miami', 'Arkansas', 'TCU', 'Villanova', "Saint Mary's", 'Memphis', 'Michigan State', 'Indiana', 'Florida', 'Texas Tech', 'BYU', 'Wisconsin', 'Ohio State', 'Rutgers', 'Seton Hall', 'Providence', "St. John's", 'New Mexico', 'Dayton', 'Colorado State', 'Utah State', 'Mississippi State', 'Texas A&M', 'Clemson', 'Virginia', 'NC State', 'Wake Forest', 'Oklahoma', 'Oklahoma State', 'LSU', 'Ole Miss', 'Iowa', 'Nebraska', 'Kansas State', 'Arizona State', 'Cincinnati', 'USC', 'Oregon'],
  'MLB': ['LA Dodgers', 'New York Yankees', 'Atlanta Braves', 'Houston Astros', 'Philadelphia Phillies', 'Baltimore Orioles', 'Texas Rangers', 'Tampa Bay Rays', 'San Diego Padres', 'Toronto Blue Jays', 'Seattle Mariners', 'Arizona Diamondbacks', 'Boston Red Sox', 'San Francisco Giants', 'Minnesota Twins', 'Milwaukee Brewers', 'Cleveland Guardians', 'St. Louis Cardinals', 'Chicago Cubs', 'Miami Marlins', 'Cincinnati Reds', 'Kansas City Royals', 'Detroit Tigers', 'Pittsburgh Pirates', 'LA Angels', 'NY Mets', 'Chicago White Sox', 'Oakland Athletics', 'Colorado Rockies', 'Washington Nationals'],
  'NHL': ['Florida Panthers', 'Edmonton Oilers', 'New York Rangers', 'Dallas Stars', 'Carolina Hurricanes', 'Colorado Avalanche', 'Vancouver Canucks', 'Winnipeg Jets', 'Vegas Golden Knights', 'Toronto Maple Leafs', 'Boston Bruins', 'Tampa Bay Lightning', 'Los Angeles Kings', 'Nashville Predators', 'New Jersey Devils', 'Minnesota Wild', 'Seattle Kraken', 'Washington Capitals', 'Detroit Red Wings', 'St. Louis Blues', 'Ottawa Senators', 'Calgary Flames', 'New York Islanders', 'Buffalo Sabres', 'Pittsburgh Penguins', 'Utah Hockey Club', 'Philadelphia Flyers', 'Montreal Canadiens', 'Columbus Blue Jackets', 'Anaheim Ducks', 'San Jose Sharks', 'Chicago Blackhawks'],
  'UEFA Champions League': ['Real Madrid', 'Manchester City', 'Bayern Munich', 'Liverpool', 'Barcelona', 'Paris Saint-Germain', 'Inter Milan', 'Arsenal', 'Atletico Madrid', 'Borussia Dortmund', 'AC Milan', 'Chelsea', 'RB Leipzig', 'Porto', 'Napoli', 'Benfica', 'Tottenham', 'PSV', 'Juventus', 'Manchester United', 'Sevilla', 'Ajax', 'Sporting CP', 'Roma', 'Shakhtar Donetsk', 'Red Bull Salzburg', 'Celtic', 'Club Brugge', 'Galatasaray', 'Copenhagen', 'Rangers', 'Marseille'],
  'UEFA Euro': ['England', 'France', 'Spain', 'Germany', 'Portugal', 'Italy', 'Netherlands', 'Belgium', 'Croatia', 'Denmark', 'Switzerland', 'Austria', 'Turkey', 'Ukraine', 'Poland', 'Serbia', 'Scotland', 'Wales', 'Sweden', 'Norway', 'Czech Republic', 'Hungary', 'Romania', 'Slovakia'],
  'World Cup': ['Argentina', 'France', 'Brazil', 'England', 'Spain', 'Portugal', 'Germany', 'Netherlands', 'Belgium', 'Italy', 'Croatia', 'Uruguay', 'Morocco', 'Mexico', 'USA', 'Colombia', 'Switzerland', 'Denmark', 'Senegal', 'Japan', 'South Korea', 'Poland', 'Austria', 'Ukraine', 'Sweden', 'Ecuador', 'Australia', 'Wales', 'Canada', 'Serbia', 'Chile', 'Peru'],
  'Golf': ['Scottie Scheffler', 'Rory McIlroy', 'Jon Rahm', 'Viktor Hovland', 'Xander Schauffele', 'Bryson DeChambeau', 'Brooks Koepka', 'Patrick Cantlay', 'Collin Morikawa', 'Ludvig Åberg', 'Tommy Fleetwood', 'Justin Thomas', 'Jordan Spieth', 'Max Homa', 'Cameron Smith'],
  'Golf (majors)': ['Scottie Scheffler', 'Rory McIlroy', 'Jon Rahm', 'Viktor Hovland', 'Xander Schauffele', 'Bryson DeChambeau', 'Brooks Koepka', 'Patrick Cantlay', 'Collin Morikawa', 'Ludvig Åberg', 'Tommy Fleetwood', 'Justin Thomas', 'Jordan Spieth', 'Max Homa', 'Cameron Smith'],
  "Men's Tennis (ATP)": ['Jannik Sinner', 'Carlos Alcaraz', 'Novak Djokovic', 'Daniil Medvedev', 'Alexander Zverev', 'Andrey Rublev', 'Casper Ruud', 'Holger Rune', 'Stefanos Tsitsipas', 'Taylor Fritz', 'Hubert Hurkacz', 'Alex de Minaur', 'Grigor Dimitrov', 'Tommy Paul', 'Frances Tiafoe', 'Karen Khachanov', 'Cameron Norrie', 'Jannik Paul', 'Sebastian Baez', 'Lorenzo Musetti', 'Ben Shelton', 'Nicolas Jarry', 'Ugo Humbert', 'Alexander Bublik', 'Tallon Griekspoor', 'Adrian Mannarino', 'Felix Auger-Aliassime', 'Arthur Fils', 'Sebastian Korda', 'Alexei Popyrin'],
  "Women's Tennis (WTA)": ['Aryna Sabalenka', 'Iga Swiatek', 'Coco Gauff', 'Elena Rybakina', 'Jessica Pegula', 'Ons Jabeur', 'Marketa Vondrousova', 'Qinwen Zheng', 'Maria Sakkari', 'Jelena Ostapenko', 'Barbora Krejcikova', 'Beatriz Haddad Maia', 'Karolina Muchova', 'Danielle Collins', 'Madison Keys', 'Liudmila Samsonova', 'Daria Kasatkina', 'Emma Navarro', 'Jasmine Paolini', 'Victoria Azarenka', 'Caroline Garcia', 'Leylah Fernandez', 'Veronika Kudermetova', 'Elise Mertens', 'Anastasia Pavlyuchenkova', 'Linda Noskova', 'Sloane Stephens', 'Katie Boulter', 'Donna Vekic', 'Marta Kostyuk'],
  'F1': ['Max Verstappen', 'Lewis Hamilton', 'Lando Norris', 'Charles Leclerc', 'George Russell', 'Oscar Piastri', 'Carlos Sainz', 'Fernando Alonso', 'Pierre Gasly', 'Alex Albon', 'Lance Stroll', 'Yuki Tsunoda', 'Nico Hulkenberg', 'Liam Lawson', 'Esteban Ocon', 'Oliver Bearman', 'Jack Doohan', 'Isack Hadjar', 'Gabriel Bortoleto', 'Kimi Antonelli'],
};

// Backward-compatible aliases for tennis pool names.
TEAM_POOLS.ATP = TEAM_POOLS["Men's Tennis (ATP)"];
TEAM_POOLS.WTA = TEAM_POOLS["Women's Tennis (WTA)"];

export const EP_DRIVEN_POOL_SPORTS = new Set(['UCL', 'Euro', 'WorldCup', 'Golf', 'MensTennis', 'WomensTennis', 'F1']);

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
