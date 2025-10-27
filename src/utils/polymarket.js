// src/utils/polymarket.js
import axios from 'axios';

const CORS_PROXY = 'https://corsproxy.io/?';
const proxyUrl = (url) => `${CORS_PROXY}${encodeURIComponent(url)}`;

const POLYMARKET = {
  GAMMA: 'https://gamma-api.polymarket.com',
};

/* ---------------------------------------------------------
   1. FETCH ACTIVE MARKETS (only active)
   --------------------------------------------------------- */
export const fetchPolymarketMarkets = async (options = {}) => {
  const { limit = 100, offset = 0 } = options;
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
    active: 'true',
    closed: 'false',
    archived: 'false',
  });

  const url = `${POLYMARKET.GAMMA}/markets?${params}`;
  try {
    const { data } = await axios.get(proxyUrl(url), { timeout: 12000 });
    return data
      .map(normalizeMarket)
      .filter(m => m.active);
  } catch (err) {
    console.error('fetchPolymarketMarkets error:', err.message);
    return [];
  }
};

/* ---------------------------------------------------------
   2. MEMECOIN MARKETS ONLY (SOLANA DEGEN + ELON/DOGE)
   --------------------------------------------------------- */
export const getMemecoinMarkets = async (options = {}) => {
  const { limit = 30 } = options;

  const allMarkets = await fetchPolymarketMarkets({ limit: 250 });

  const memecoinKeywords = [
// Core Memecoins & Platforms
'meme coin', 'memecoin', 'pump.fun', 'bonk', '$bonk', 'wif', '$wif', 'dogwifhat',
'popcat', '$popcat', 'goatseus', '$goat', 'fartcoin', 'chill guy', 'peanut the squirrel',
'pnut', '$pnut', 'launc hcoin',

// 2024-2025 Trending Memecoins
'pepe', '$pepe', 'pepecoin', 'brett', '$brett', 'based brett', 'michi', '$michi',
'ponke', '$ponke', 'fwog', '$fwog', 'mumu', '$mumu', 'mumu the bull', 'giga', '$giga',
'gigachad', 'mog', '$mog', 'mew', '$mew', 'cat in a dogs world', 'spx6900', '$spx',
'neiro', '$neiro', 'wojak', '$wojak', 'andy', '$andy', 'boys club', 'landwolf', '$landwolf',
'retardio', '$retardio', 'lockin', '$lockin', 'aura', '$aura', 'billy', '$billy',
'trenchy', '$trench', 'mfer', '$mfer', 'mfers', 'bobo', '$bobo', 'bobo coin',
'catwifhat', 'meow', 'pudgy', '$pudgy', 'pudgy penguins',

// OG / Evergreen
'dogecoin', 'shiba', 'shib', 'floki', 'pepefork'

  ];

  return allMarkets
    .filter(market => {
      const text = `${market.question} ${market.description || ''} ${market.tags?.join(' ')}`.toLowerCase();
      return memecoinKeywords.some(k => text.includes(k.toLowerCase()));
    })
    .sort((a, b) => b.volume - a.volume)
    .slice(0, limit)
    .map(m => ({ ...m, category: 'Memecoin' }));
};

/* ---------------------------------------------------------
   3. BROADER CRYPTO (backup)
   --------------------------------------------------------- */
export const getCryptoMarkets = async () => {
  const all = await fetchPolymarketMarkets({ limit: 200 });
  const cryptoKeywords = [
    'crypto', 'bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol',
    'defi', 'nft', 'token', 'price', 'market cap', 'exchange',
    'pump.fun', 'meme coin', 'bonk', 'wif', 'dogecoin', 'pepe', 'shib', 'floki',
    'raydium', 'jupiter', 'orca', 'birdeye', 'dexscreener', 'gmgn', 'bonkbot'
  ];

  return all
    .filter(m => {
      const txt = `${m.question} ${m.description} ${m.tags?.join(' ')}`.toLowerCase();
      return cryptoKeywords.some(k => txt.includes(k.toLowerCase()));
    })
    .sort((a, b) => b.volume - a.volume);
};

/* ---------------------------------------------------------
   4. SEARCH
   --------------------------------------------------------- */
export const searchPolymarketMarkets = async (query) => {
  if (!query?.trim() || query.length < 2) return [];
  const url = `${POLYMARKET.GAMMA}/search?query=${encodeURIComponent(query)}&active=true`;
  try {
    const { data } = await axios.get(proxyUrl(url));
    return data
      .map(normalizeMarket)
      .filter(m => m.active);
  } catch (err) {
    console.error('search error:', err.message);
    return [];
  }
};

/* ---------------------------------------------------------
   5. NORMALIZE MARKET (ROBUST SLUG FOR NESTED URLS)
   --------------------------------------------------------- */
const normalizeMarket = (m) => {
  let yesPrice = 0.5;
  let noPrice = 0.5;

  if (Array.isArray(m.outcome_prices) && m.outcome_prices.length >= 2) {
    yesPrice = parseFloat(m.outcome_prices[0]) || 0.5;
    noPrice = parseFloat(m.outcome_prices[1]) || 0.5;
  } else if (typeof m.outcome_prices === 'string' && m.outcome_prices.trim()) {
    const parts = m.outcome_prices.split(',').map(p => p.trim()).filter(p => p);
    if (parts.length >= 2) {
      yesPrice = parseFloat(parts[0]) || 0.5;
      noPrice = parseFloat(parts[1]) || 0.5;
    } else if (parts.length === 1) {
      yesPrice = parseFloat(parts[0]) || 0.5;
      noPrice = 1 - yesPrice;
    }
  }

  yesPrice = Math.max(0, Math.min(1, yesPrice));
  noPrice = 1 - yesPrice;

  // FIXED: Generate full nested slug
  let slug = m.slug || m.market_slug || '';
  if (!slug && m.question) {
    // Base slug from question
    let baseSlug = m.question
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Detect nested group (e.g., for Elon/DOGE)
    if (baseSlug.includes('spending') || baseSlug.includes('cut') || baseSlug.includes('budget')) {
      baseSlug = 'how-much-spending-will-elon-and-doge-cut-in-2025/' + baseSlug;
    } else if (baseSlug.includes('employees') || baseSlug.includes('jobs')) {
      baseSlug = 'of-jobs-elon-and-doge-cut-in-2025/' + baseSlug;
    } else if (baseSlug.includes('doge cut')) {
      baseSlug = 'how-much-spending-will-elon-and-doge-cut-in-2025/' + baseSlug;
    }

    slug = baseSlug;
  }

  return {
    id: m.id || m.market_slug || String(Math.random()),
    slug: slug || 'unknown-market',
    question: m.question || 'Unknown Market',
    description: m.description || '',
    endDate: m.end_date_iso || m.end_date || m.closing_date || '',
    volume: Number(m.volume) || 0,
    liquidity: Number(m.liquidity) || 0,
    outcomePrices: [yesPrice, noPrice],
    image: m.image_url || m.icon_url || m.image || '',
    active: m.active === true || m.closed === false,
    closed: m.closed === true,
    tags: Array.isArray(m.tags) ? m.tags : [],
  };
};

/* ---------------------------------------------------------
   6. SENTIMENT (DEGEN BOOST)
   --------------------------------------------------------- */
export const calculateMarketSentiment = (market) => {
  const yesPrice = market.outcomePrices[0] || 0.5;
  const volume = market.volume || 0;
  const liquidity = market.liquidity || 0;

  let score = yesPrice * 60;
  score += Math.min(volume / 100_000, 30);
  score += Math.min(liquidity / 50_000, 10);

  const isMeme = /pump\.fun|bonk|wif|popcat|goat|memecoin|meme coin|solana degen|fartcoin|useless coin|elon|doge|spending|employees/i.test(
    market.question + (market.description || '')
  );
  if (isMeme && volume > 50_000) score += 20;

  score = Math.round(Math.min(score, 100));

  return {
    score,
    yesPrice: (yesPrice * 100).toFixed(1),
    noPrice: ((1 - yesPrice) * 100).toFixed(1),
    confidence: volume > 200_000 ? 'High' : volume > 50_000 ? 'Medium' : 'Low',
    memeBoost: isMeme ? 'Degen Meme' : '',
  };
};

/* ---------------------------------------------------------
   7. FORMAT FOR DISPLAY
   --------------------------------------------------------- */
export const formatMarketForDisplay = (market) => {
  const sentiment = calculateMarketSentiment(market);
  const date = market.endDate ? new Date(market.endDate) : null;
  const endDateStr = date && !isNaN(date)
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
    : 'TBD';

  return {
    ...market,
    sentiment,
    endDate: endDateStr,
  };
};

/* ---------------------------------------------------------
   EXPORT
   --------------------------------------------------------- */
export default {
  fetchPolymarketMarkets,
  getMemecoinMarkets,
  getCryptoMarkets,
  searchPolymarketMarkets,
  calculateMarketSentiment,
  formatMarketForDisplay,
};