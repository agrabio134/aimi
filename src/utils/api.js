// src/utils/api.js

// Fetch Solana tokens with enriched market data
export const fetchTokens = async () => {
  try {
    console.log('Fetching boosted tokens from DexScreener...');
    const res = await fetch('https://api.dexscreener.com/token-boosts/top/v1');

    if (!res.ok) {
      throw new Error(`API error ${res.status}: ${res.statusText}`);
    }

    // The endpoint returns a plain array of boost objects
    const boosts = await res.json();

    if (!Array.isArray(boosts) || boosts.length === 0) {
      console.warn('Empty boost list received');
    }

    const seen = new Set();
    let tokens = [];

    boosts.forEach((boost, idx) => {
      // Debug first few entries
      if (idx < 3) {
        console.log(`Boost ${idx}:`, {
          chainId: boost.chainId,
          tokenAddress: boost.tokenAddress,
          totalAmount: boost.totalAmount,
        });
      }

      // ---- 1. Keep only Solana tokens ----
      if (boost.chainId !== 'solana') return;

      const address = boost.tokenAddress;
      if (!address || seen.has(address)) return;
      seen.add(address);

      // ---- 2. Extract social links (optional) ----
      const website = boost.links?.find((l) => !l.type)?.url;
      const twitter = boost.links?.find((l) => l.type === 'twitter')?.url;
      const telegram = boost.links?.find((l) => l.type === 'telegram')?.url;

      // ---- 3. Build a basic token object ----
      tokens.push({
        id: address,
        symbol: address.slice(0, 6) + '…',               // placeholder, will be updated
        name: boost.description?.split('\n')[0] || address,
        price: 0,                                         // will be updated
        priceChange: 0,
        volume24h: 0,
        liquidity: 0,
        marketCap: 0,
        txns24h: 0,
        logo: boost.openGraph
          ? boost.openGraph
          : boost.icon
            ? `https://dd.dexscreener.com/u/${boost.icon}`
            : null,
        description: boost.description,
        website,
        twitter,
        telegram,
        boostAmount: boost.totalAmount ?? 0,
      });
    });

    console.log(`Parsed ${tokens.length} unique Solana boosted tokens`);
    if (tokens.length > 0) console.log('Sample before enrichment:', tokens[0]);

    // ---- 4. Enrich with market data from token pairs API ----
    // This fetches real price, volume, etc. for each token
    tokens = await Promise.all(tokens.map(async (token) => {
      try {
        const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token.id}`);
        if (!pairRes.ok) return token; // Skip if error

        const pairData = await pairRes.json();
        // Find the main SOL pair (most common for Solana tokens)
        const mainPair = pairData.pairs?.find(p => 
          p.chainId === 'solana' && 
          p.quoteToken?.symbol === 'SOL' &&
          p.volume?.h24 > 0 // Prefer active pairs
        );

        if (mainPair) {
          token.symbol = mainPair.baseToken.symbol;
          token.name = mainPair.baseToken.name || token.symbol;
          token.price = parseFloat(mainPair.priceUsd) || 0;
          token.priceChange = mainPair.priceChange?.h24 || 0;
          token.volume24h = mainPair.volume?.h24 || 0;
          token.liquidity = mainPair.liquidity?.usd || 0;
          token.marketCap = mainPair.fdv || 0;
          token.txns24h = (mainPair.txns?.h24?.buys || 0) + (mainPair.txns?.h24?.sells || 0);
          if (!token.logo && mainPair.info?.imageUrl) {
            token.logo = mainPair.info.imageUrl;
          }
        }
      } catch (err) {
        console.warn(`Failed to enrich token ${token.id}:`, err);
      }
      return token;
    }));

    // Filter out tokens with zero volume (lower threshold to avoid empty list)
    tokens = tokens.filter(t => t.volume24h > 0);

    console.log(`Enriched ${tokens.length} tokens with market data`);
    if (tokens.length > 0) console.log('Sample after enrichment:', tokens[0]);

    // Fallback if still empty: Fetch top Solana meme coins from CoinGecko
    if (tokens.length === 0) {
      console.log('Using fallback: Fetching top Solana meme coins from CoinGecko...');
      const cgRes = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=solana-meme&order=market_cap_desc&per_page=100&page=1&sparkline=false');
      if (cgRes.ok) {
        const cgData = await cgRes.json();
        tokens = cgData.map(coin => ({
          id: coin.id,
          symbol: coin.symbol.toUpperCase(),
          name: coin.name,
          price: coin.current_price || 0,
          priceChange: coin.price_change_percentage_24h || 0,
          volume24h: coin.total_volume || 0,
          liquidity: 0, // Not available
          marketCap: coin.market_cap || 0,
          txns24h: 0, // Not available
          logo: coin.image,
          description: '',
          website: '',
          twitter: '',
          telegram: '',
          boostAmount: 0,
        }));
        console.log(`Fallback fetched ${tokens.length} tokens from CoinGecko`);
      }
    }

    // Return top 100 (sorted by marketCap descending for fallback, or boostAmount)
    return tokens
      .sort((a, b) => b.marketCap - a.marketCap || b.boostAmount - a.boostAmount)
      .slice(0, 100);
  } catch (err) {
    console.error('fetchTokens error:', err);
    return [];
  }
};

// Real-time search via DexScreener API
export const searchTokens = async (query) => {
  try {
    if (!query || query.length < 2) return [];
    const res = await fetch(`https://api.dexscreener.com/latest/dex/search/?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    const solanaPairs = data.pairs?.filter(p => p.chainId === 'solana') || [];
    return solanaPairs.slice(0, 20).map(pair => ({
      id: pair.baseToken.address,
      symbol: pair.baseToken.symbol,
      name: pair.baseToken.name || pair.symbol,
      price: parseFloat(pair.priceUsd) || 0,
      priceChange: pair.priceChange?.h24 || 0,
      volume24h: pair.volume?.h24 || 0,
      liquidity: pair.liquidity?.usd || 0,
      marketCap: pair.fdv || 0,
      txns24h: (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0),
      logo: pair.info?.imageUrl || null,
      description: '',
      website: '',
      twitter: '',
      telegram: '',
      boostAmount: 0,
      memeScore: 50, // Default for search results
      votes: 0,
      boost: null,
    }));
  } catch (err) {
    console.error('Search error:', err);
    return [];
  }
};

// Fetch tweets from BullX API
export const fetchTweets = async () => {
  try {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent('https://api-neo.bullx.io/v2/tweets')}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch tweets: ${res.status}`);
    }
    const data = await res.json();
    // Filter for crypto-related tweets to avoid non-relevant ones
    const cryptoTweets = (data.data || []).filter(tweet => {
      const text = tweet.text?.toLowerCase() || '';
      return text.includes('crypto') || 
             text.includes('bitcoin') || 
             text.includes('ethereum') || 
             text.includes('solana') || 
             text.includes('blockchain') || 
             text.includes('token') || 
             text.includes('nft') || 
             text.includes('defi') || 
             text.includes('web3');
    });
    console.log(`Fetched ${cryptoTweets.length} crypto-related tweets`);
    return cryptoTweets;
  } catch (err) {
    console.error('Tweets fetch error:', err);
    return [];
  }
};

// Calculate AI-powered Meme Score
export const calculateScore = (tokens, votes = {}, boosts = {}) => {
  if (tokens.length === 0) return [];

  const normalize = (v, min, max) => max === min ? 50 : ((v - min) / (max - min)) * 100;
  
  const vols = tokens.map(t => t.volume24h);
  const liqs = tokens.map(t => t.liquidity);
  const txns = tokens.map(t => t.txns24h);

  const minV = Math.min(...vols), maxV = Math.max(...vols);
  const minL = Math.min(...liqs), maxL = Math.max(...liqs);
  const minT = Math.min(...txns), maxT = Math.max(...txns);

  return tokens.map(token => {
    const normVol = normalize(token.volume24h, minV, maxV);
    const normLiq = normalize(token.liquidity, minL, maxL);
    const normTxn = normalize(token.txns24h, minT, maxT);
    
    const baseScore = (0.35 * normVol) + (0.30 * normLiq) + (0.20 * normTxn) + (0.15 * Math.abs(token.priceChange));
    const voteBoost = (votes[token.id] || 0) * 3;
    const boostData = boosts[token.id];
    const boostMultiplier = boostData && new Date(boostData.expiresAt) > new Date() ? boostData.multiplier : 1;
    const finalScore = (baseScore + voteBoost) * boostMultiplier;
    
    return {
      ...token,
      votes: votes[token.id] || 0,
      boost: boostData && new Date(boostData.expiresAt) > new Date() ? boostData : null,
      memeScore: Math.round(finalScore * 10) / 10
    };
  }).sort((a, b) => b.memeScore - a.memeScore);
};