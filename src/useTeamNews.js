// useTeamNews.js
// Fetches recent sport news from ESPN's public API and filters by team/player name.
// Sport-level articles are cached at the module level (10-min TTL) so clicking
// different players within the same sport doesn't trigger extra network calls.
// Falls back to top sport headlines when no team-specific articles are found.

import { useState, useEffect } from 'react';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

// Maps sport codes to ESPN sport/league URL path segments
const NEWS_PATH = {
  NFL:          'football/nfl',
  NBA:          'basketball/nba',
  MLB:          'baseball/mlb',
  NHL:          'hockey/nhl',
  NCAAF:        'football/college-football',
  NCAAMB:       'basketball/mens-college-basketball',
  UCL:          'soccer/uefa.champions',
  Euro:         'soccer/uefa.euro',
  WorldCup:     'soccer/fifa.world',
  F1:           'racing/f1',
  Golf:         'golf/pga',
  MensTennis:   'tennis/atp',
  WomensTennis: 'tennis/wta',
};

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_SCHEMA = 3; // bump when article shape changes to auto-invalidate in-memory cache
const cache = {}; // { [sportCode]: { articles, fetchedAt, schema } }

async function fetchSportNews(sportCode) {
  const path = NEWS_PATH[sportCode];
  if (!path) return [];

  const cached = cache[sportCode];
  if (cached && cached.schema === CACHE_SCHEMA && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.articles;
  }

  try {
    const resp = await fetch(`${ESPN_BASE}/${path}/news?limit=50`);
    if (!resp.ok) return [];
    const data = await resp.json();

    const articles = (data.articles || [])
      .filter(a => {
        const url = a.links?.web?.href || '';
        // Drop video clips — they have no readable article content
        if (url.includes('/video/clip') || url.includes('video/clip')) return false;
        if ((a.type || '').toLowerCase() === 'media') return false;
        return true;
      })
      .map(a => ({
        headline:    a.headline    || '',
        description: a.description || '',
        url:         a.links?.web?.href || '',
        published:   a.published   || '',
        // Extract team/athlete category labels for precise matching
        categoryLabels: (a.categories || [])
          .filter(c => c.type === 'team' || c.type === 'athlete')
          .map(c => (c.description || c.alternateDescription || '').toLowerCase()),
      }));

    cache[sportCode] = { articles, fetchedAt: Date.now(), schema: CACHE_SCHEMA };
    return articles;
  } catch {
    return [];
  }
}

// Words that, when they immediately follow a matched team name, signal a DIFFERENT team.
// e.g. "Michigan" followed by "State" → Michigan State, not Michigan.
const DISAMBIGUATING_WORDS = new Set([
  'state', 'city', 'tech', 'a&m', 'am', 'polytechnic',
  'central', 'northern', 'southern', 'eastern', 'western',
  'christian', 'international', 'agricultural', 'mechanical',
]);

// Words too short or generic to use as standalone tokens (only match as part of full name).
const SKIP_TOKENS = new Set([
  'la', 'ny', 'fc', 'ac', 'rb', 'cf', 'sc', 'if', 'bk',
  'the', 'and', 'for', 'of', 'de', 'les', 'los', 'las',
  'state', 'city', 'tech', // also skip these as individual tokens — too ambiguous alone
]);

/**
 * Break a team/player name into word-sequence arrays, most-specific first.
 * "Michigan"       → [["michigan"]]
 * "Michigan State" → [["michigan", "state"]]   (no single-word fallback — "state" is in SKIP_TOKENS)
 * "Denver Nuggets" → [["denver", "nuggets"], ["nuggets"], ["denver"]]
 * "Carlos Alcaraz" → [["carlos", "alcaraz"], ["alcaraz"], ["carlos"]]
 */
function buildWordTokens(name) {
  const lower = name.toLowerCase().trim();
  const fullWords = lower.split(/[\s\-]+/).filter(Boolean);
  const sequences = [fullWords]; // full name always included

  // Add individual meaningful words as single-word sequences
  for (const word of fullWords) {
    if (word.length > 2 && !SKIP_TOKENS.has(word)) {
      if (!sequences.some(s => s.length === 1 && s[0] === word)) {
        sequences.push([word]);
      }
    }
  }

  return sequences;
}

/**
 * Check whether a sequence of team-name words appears in `text` (array of words)
 * at position `i`, AND is not immediately followed by a disambiguating qualifier.
 *
 * "michigan" in ["michigan", "state", "spartans"] → false  (Michigan State, not Michigan)
 * "michigan" in ["michigan", "wolverines"]        → true   (Michigan ✓)
 * ["michigan","state"] in ["michigan","state","spartans"] → true (Michigan State ✓)
 */
function teamWordsMatchAt(textWords, i, teamWords) {
  for (let j = 0; j < teamWords.length; j++) {
    if (textWords[i + j] !== teamWords[j]) return false;
  }
  const nextWord = textWords[i + teamWords.length];
  return !nextWord || !DISAMBIGUATING_WORDS.has(nextWord);
}

/**
 * Returns true if the teamWords sequence appears correctly in text
 * (as a whole-word match, not cut off by a disambiguating qualifier).
 */
function containsTeamName(text, teamWords) {
  const textWords = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (let i = 0; i <= textWords.length - teamWords.length; i++) {
    if (teamWordsMatchAt(textWords, i, teamWords)) return true;
  }
  return false;
}

/**
 * Score an article against the word-token sequences.
 * Uses ESPN category labels (team/athlete tags) when available — most reliable.
 * Falls back to headline word-sequence matching.
 * Returns 0 if nothing matches.
 */
function scoreArticle(article, wordTokens) {
  // ESPN category labels: most reliable — definitively tags what team the article covers.
  if (article.categoryLabels && article.categoryLabels.length > 0) {
    for (const label of article.categoryLabels) {
      for (let i = 0; i < wordTokens.length; i++) {
        if (containsTeamName(label, wordTokens[i])) return i === 0 ? 4 : 3;
      }
    }
    // Has category tags but none matched our team — exclude.
    return 0;
  }

  // No category data: fall back to headline word-sequence matching.
  let score = 0;
  for (let i = 0; i < wordTokens.length; i++) {
    if (containsTeamName(article.headline, wordTokens[i])) {
      score += i === 0 ? 3 : 1;
    }
  }
  return score;
}

/**
 * Fetch news for a team/player within a sport.
 * @param {string} sportCode  - e.g. 'NFL', 'MensTennis'
 * @param {string} teamName   - exact team/player name
 * @returns {{ news: Array<{headline, description, url, published}>, hasTeamNews: boolean, loading: boolean }}
 *   hasTeamNews: true when the articles are team-specific (false = sport-level fallback)
 */
export function useTeamNews(sportCode, teamName) {
  const [news, setNews] = useState([]);
  const [hasTeamNews, setHasTeamNews] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newsError, setNewsError] = useState(null);

  useEffect(() => {
    if (!sportCode || !teamName) {
      setNews([]);
      setNewsError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setNews([]);
    setHasTeamNews(false);
    setNewsError(null);

    fetchSportNews(sportCode).then(articles => {
      if (cancelled) return;

      const wordTokens = buildWordTokens(teamName);

      const scored = articles
        .map(a => ({ ...a, _score: scoreArticle(a, wordTokens) }))
        .filter(a => a._score > 0)
        .sort((a, b) => b._score - a._score);

      if (scored.length > 0) {
        setNews(scored.slice(0, 5).map(({ _score: _s, ...a }) => a));
        setHasTeamNews(true);
      } else {
        // Fall back to top sport-level headlines
        setNews(articles.slice(0, 4));
        setHasTeamNews(false);
      }

      setLoading(false);
    }).catch(err => {
      if (cancelled) return;
      console.error('Failed to load news:', err);
      setNewsError(err);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [sportCode, teamName]);

  return { news, hasTeamNews, loading, newsError };
}
