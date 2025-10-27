import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ConnectionProvider, WalletProvider, useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl, Transaction, SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import Swal from 'sweetalert2';
import '@solana/wallet-adapter-react-ui/styles.css';

// npm install sweetalert2

const firebaseConfig = {
  apiKey: "AIzaSyDSsgYNlY8nrjgZCDyVjqmbTDMy1hqOado",
  authDomain: "aimi-3e35a.firebaseapp.com",
  projectId: "aimi-3e35a",
  storageBucket: "aimi-3e35a.firebasestorage.app",
  messagingSenderId: "917880354279",
  appId: "1:917880354279:web:6928164cb1e8f337fe3942"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const TREASURY_WALLET = '5o3YkaKpfC8oJAjwhzwSTjbCj9UN8PosfT4D1e1xMrZU';

const BOOST_PACKAGES = [
  { multiplier: 10, price: 20, duration: 12, label: '×10 Boost' },
  { multiplier: 50, price: 90, duration: 12, label: '×50 Boost' },
  { multiplier: 100, price: 300, duration: 24, label: '×100 Boost' },
  { multiplier: 300, price: 500, duration: 24, label: '×300 Boost' },
  { multiplier: 500, price: 800, duration: 24, label: '×500 Golden', golden: true }
];

// Fetch Solana tokens with enriched market data
const fetchTokens = async () => {
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

// Fetch tweets from BullX API
const fetchTweets = async () => {
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
const calculateScore = (tokens, votes = {}, boosts = {}) => {
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

// Bubble View with draggable bubbles
const BubbleView = ({ tokens, onVote, onBoost, canVote, userVotes }) => {
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    const generateNonOverlappingPositions = () => {
      const positions = [];
      const minDistance = 15; // Minimum percentage distance between centers
      const attempts = 100; // Max attempts per bubble to find position

      for (let i = 0; i < Math.min(20, tokens.length); i++) {
        let newPos;
        let attempt = 0;
        do {
          newPos = {
            x: Math.random() * 80 + 10,
            y: Math.random() * 80 + 10,
            rotation: Math.random() * 360
          };
          attempt++;
          const overlap = positions.some(pos => {
            const dx = newPos.x - pos.x;
            const dy = newPos.y - pos.y;
            return Math.sqrt(dx*dx + dy*dy) < minDistance;
          });
          if (!overlap) break;
        } while (attempt < attempts);
        positions.push(newPos);
      }
      return positions;
    };

    setPositions(generateNonOverlappingPositions());
  }, [tokens]);

  return (
    <div className="bubble-view">
      {tokens.slice(0, 20).map((token, idx) => {
        const maxScore = Math.max(...tokens.map(t => t.memeScore));
        const minScore = Math.min(...tokens.map(t => t.memeScore));
        const size = 60 + ((token.memeScore - minScore) / (maxScore - minScore)) * 160;
        const hue = token.priceChange >= 0 ? 120 : 0;
        const sat = Math.min(100, Math.abs(token.priceChange) * 2);
        const pos = positions[idx] || { x: 50, y: 50, rotation: 0 };
        
        return (
          <div
            key={token.id}
            className={`bubble ${token.boost?.golden ? 'golden' : ''}`}
            style={{
              width: `${size}px`,
              height: `${size}px`,
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: `translate(-50%, -50%) rotate(${pos.rotation}deg)`,
              background: token.boost?.golden 
                ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                : `linear-gradient(135deg, hsl(${hue}, ${sat}%, 50%), hsl(${hue}, ${sat}%, 40%))`
            }}
          >
            {token.logo && <img src={token.logo} alt={token.symbol} className="bubble-logo" />}
            <div className="bubble-symbol">{token.symbol}</div>
            <div className="bubble-price">${token.price.toLocaleString(undefined, {maximumSignificantDigits: 4})}</div>
            <div className="bubble-change" style={{color: token.priceChange >= 0 ? '#00ff00' : '#ff0000'}}>
              {token.priceChange >= 0 ? '+' : ''}{token.priceChange.toFixed(2)}%
            </div>
          </div>
        );
      })}
    </div>
  );
};

// TreeMap View
const TreeMapView = ({ tokens, onVote, onBoost, canVote, userVotes }) => {
  const topTokens = tokens.slice(0, 100); // More for treemap
  const totalMarketCap = topTokens.reduce((sum, t) => sum + t.marketCap, 0);
  
  return (
    <div className="treemap">
      {topTokens.map((token, idx) => {
        const basis = Math.max(5, (token.marketCap / totalMarketCap) * 100);
        const color = token.priceChange >= 0 ? `hsl(120, ${Math.min(100, token.priceChange * 2)}%, 70%)` : `hsl(0, ${Math.min(100, Math.abs(token.priceChange) * 2)}%, 70%)`;
        
        return (
          <div
            key={token.id}
            className={`treemap-cell ${token.boost?.golden ? 'golden' : ''}`}
            style={{
              flexBasis: `${basis}%`,
              flexGrow: basis,
              minHeight: '100px',
              background: token.boost?.golden
                ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                : color
            }}
          >
            <div className="cell-content">
              {token.logo && <img src={token.logo} alt={token.symbol} />}
              <h3>{token.name}</h3>
              <div className="cell-price">${token.price.toLocaleString()}</div>
              <div className="cell-change" style={{color: '#ffffffff' }}>
                {token.priceChange >= 0 ? '+' : ''}{token.priceChange.toFixed(2)}%
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Leaderboard View
const LeaderboardView = ({ tokens, onVote, onBoost, canVote, userVotes }) => (
  <div className="leaderboard">
    <h2>🏆 AI Meme Index Leaderboard</h2>
    <div className="leaderboard-list">
      {tokens.slice(0, 50).map((token, idx) => {
        const hasVoted = userVotes.has(token.id);
        return (
          <div key={token.id} className={`leaderboard-item ${hasVoted ? 'voted' : ''} ${token.boost?.golden ? 'golden' : ''}`}>
            <div className="item-rank">
              <span className="rank-number">#{idx + 1}</span>
              {token.boost && <span className="rank-boost">×{token.boost.multiplier}</span>}
            </div>
            <div className="item-token">
              {token.logo && <img src={token.logo} alt={token.symbol} />}
              <div>
                <div className="token-symbol">{token.symbol}</div>
                <div className="token-name">{token.name}</div>
              </div>
            </div>
            <div className="item-score">{token.memeScore.toFixed(1)}</div>
            <div className="item-stats">
              <span className={token.priceChange >= 0 ? 'positive' : 'negative'}>
                {token.priceChange >= 0 ? '+' : ''}{token.priceChange.toFixed(2)}%
              </span>
              <span>${(token.volume24h / 1000).toFixed(0)}K vol</span>
            </div>
            <div className="item-votes">❤️ {token.votes}</div>
            <div className="item-actions">
              <button 
                className={`vote-btn ${hasVoted ? 'voted' : ''}`}
                onClick={() => onVote(token)}
                disabled={!canVote || hasVoted}
              >
                {hasVoted ? '✓' : '🗳️'}
              </button>
              <button className="boost-btn-small" onClick={() => onBoost(token)}>🚀</button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

// Boost Modal
const BoostModal = ({ token, isOpen, onClose }) => {
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [loading, setLoading] = useState(false);
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const handleBoost = async () => {
    if (!publicKey || !selectedPackage) return;

    const result = await Swal.fire({
      title: 'Confirm Boost',
      text: `Boost ${token.symbol} with ${selectedPackage.label} for $${selectedPackage.price}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, boost!',
      cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    setLoading(true);
    try {
      const priceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      if (!priceRes.ok) throw new Error('Failed to fetch SOL price');
      const priceData = await priceRes.json();
      const solPrice = priceData.solana.usd;
      const lamports = Math.floor((selectedPackage.price / solPrice) * LAMPORTS_PER_SOL);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(TREASURY_WALLET),
          lamports,
        })
      );

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, 'confirmed');

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + selectedPackage.duration);

      await addDoc(collection(db, 'boosts'), {
        tokenId: token.id,
        multiplier: selectedPackage.multiplier,
        golden: selectedPackage.golden || false,
        expiresAt: expiresAt.toISOString(),
        txSignature: sig,
        boostedBy: publicKey.toString(),
        createdAt: new Date().toISOString()
      });

      Swal.fire('Success!', 'Boost activated! 🚀', 'success');
      onClose();
      window.location.reload();
    } catch (err) {
      Swal.fire('Error', 'Boost failed: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="boost-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🚀 Boost {token.symbol}</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="boost-packages">
          {BOOST_PACKAGES.map(pkg => (
            <div
              key={pkg.multiplier}
              className={`package ${selectedPackage?.multiplier === pkg.multiplier ? 'selected' : ''} ${pkg.golden ? 'golden' : ''}`}
              onClick={() => setSelectedPackage(pkg)}
            >
              <div className="pkg-label">{pkg.label}</div>
              <div className="pkg-price">${pkg.price}</div>
              <div className="pkg-duration">{pkg.duration}h</div>
              {pkg.golden && <div className="golden-badge">👑 GOLDEN TICKER</div>}
            </div>
          ))}
        </div>
        <button 
          className="confirm-boost-btn"
          onClick={handleBoost}
          disabled={!selectedPackage || loading}
        >
          {loading ? 'Processing...' : `Boost with ${selectedPackage?.label || '...'}`}
        </button>
      </div>
    </div>
  );
};

// Tweet Modal
const TweetModal = ({ tweet, onClose }) => {
  if (!tweet) return null;

  // Extract image url if available
  let imageUrl = null;
  if (tweet.entities?.urls) {
    const mediaUrl = tweet.entities.urls.find(url => url.expanded_url.includes('pbs.twimg.com/media'));
    if (mediaUrl) {
      // Extract the media ID and format
      const match = mediaUrl.expanded_url.match(/\/media\/([^?]+)\?format=([a-z]+)&/);
      if (match) {
        const mediaId = match[1];
        const format = match[2];
        imageUrl = `https://pbs.twimg.com/media/${mediaId}.${format}:large`;
      } else {
        imageUrl = mediaUrl.expanded_url.replace(/name=small/, 'name=large').replace(/:small/, ':large');
      }
    }
  } else if (tweet.attachments?.media_keys) {
    // Fallback to constructing URL
    imageUrl = `https://pbs.twimg.com/media/${tweet.attachments.media_keys[0]}?format=jpg&name=large`;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="tweet-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Tweet Details</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="tweet-content">
          <div className="tweet-profile">
            {tweet.user?.profile_image_url && <img src={tweet.user.profile_image_url} alt={tweet.user.name} className="tweet-pfp" />}
            <div className="tweet-user-info">
              <strong>{tweet.user?.name || 'Anonymous'}</strong>
              <span>@{tweet.user?.username}</span>
            </div>
          </div>
          <p className="tweet-text">{tweet.text}</p>
          {imageUrl && <img src={imageUrl} alt="Tweet media" className="tweet-image" />}
        </div>
      </div>
    </div>
  );
};

// News Section with Crypto Updates
const NewsSection = () => {
  const [tweets, setTweets] = useState([]);
  const [selectedTweet, setSelectedTweet] = useState(null);

  useEffect(() => {
    const loadTweets = async () => {
      const tweetData = await fetchTweets();
      setTweets(tweetData);
    };
    loadTweets();
    const interval = setInterval(loadTweets, 30 * 1000); // 30 seconds for tweets
    return () => clearInterval(interval);
  }, []);

  const defaultNews = [
    { title: '🔥 Solana meme tokens surge with 300% volume increase', time: '2h ago', type: 'trending' },
    { title: '🤖 AI detects new opportunities in SOL pairs', time: '4h ago', type: 'ai' },
    { title: '💎 Community rallying behind top SOL tokens', time: '6h ago', type: 'community' },
    { title: '🚀 Golden ticker boosts drive massive engagement', time: '8h ago', type: 'boost' }
  ];

  const getRelativeTime = (timestamp) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const newsToDisplay = tweets.length > 0 
    ? tweets.map((tweet, idx) => ({
        title: `${tweet.user?.name || 'Crypto'}: ${tweet.text?.slice(0, 80) || 'Update'}...`,
        time: getRelativeTime(tweet.created_at),
        type: 'trending',
        tweet // Keep full tweet for modal
      }))
    : defaultNews;

  return (
    <div className="news-section">
      <h3>📰 Latest Crypto Updates</h3>
      <div className="news-list">
        {newsToDisplay.map((item, idx) => (
          <div 
            key={`news-${idx}`} 
            className={`news-item ${item.type}`}
            onClick={() => item.tweet && setSelectedTweet(item.tweet)}
          >
            <div className="news-title">{item.title}</div>
            <div className="news-time">{item.time}</div>
          </div>
        ))}
      </div>
      <TweetModal tweet={selectedTweet} onClose={() => setSelectedTweet(null)} />
    </div>
  );
};

// Trending News Bar for top gaining tokens
const TrendingBar = ({ tokens }) => {
  const gainingTokens = tokens
    .filter(t => t.priceChange > 0)
    .sort((a, b) => b.priceChange - a.priceChange)
    .slice(0, 5);

  return (
    <div className="trending-bar">
      <h3>🔥 Trending Gainers</h3>
      <div className="trending-list">
        {gainingTokens.map((token, idx) => (
          <div key={idx} className="trending-item">
            {token.logo && <img src={token.logo} alt={token.symbol} />}
            <span>{token.symbol}</span>
            <span className="positive">+{token.priceChange.toFixed(2)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Main App
const Dashboard = () => {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('leaderboard');
  const [user, setUser] = useState(null);
  const [userVotes, setUserVotes] = useState(new Set());
  const [boostToken, setBoostToken] = useState(null);
  const { publicKey, connected } = useWallet();

  useEffect(() => {
    signInAnonymously(auth);
    const unsub = onAuthStateChanged(auth, setUser);
    return unsub;
  }, []);

  const loadData = async () => {
    try {
      const tokenData = await fetchTokens();
      if (tokenData.length === 0) {
        console.warn('No tokens loaded from API');
        return [];
      }
      
      // Load votes with error handling
      let voteCounts = {};
      let userVotedSet = new Set();
      
      try {
        const votesSnap = await getDocs(collection(db, 'votes'));
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
        
        votesSnap.forEach(doc => {
          const data = doc.data();
          if (data.createdAt > twelveHoursAgo) {
            voteCounts[data.tokenId] = (voteCounts[data.tokenId] || 0) + 1;
          }
          
          if (user && data.userId === user.uid && data.createdAt > twelveHoursAgo) {
            userVotedSet.add(data.tokenId);
          }
        });
      } catch (voteErr) {
        // Silently handle
      }

      // Load boosts with error handling
      let boostsData = {};
      
      try {
        const boostsSnap = await getDocs(collection(db, 'boosts'));
        
        boostsSnap.forEach(doc => {
          const data = doc.data();
          if (new Date(data.expiresAt) > new Date()) {
            if (!boostsData[data.tokenId] || data.multiplier > boostsData[data.tokenId].multiplier) {
              boostsData[data.tokenId] = data;
            }
          }
        });
      } catch (boostErr) {
        // Silently handle
      }

      setUserVotes(userVotedSet);
      const scored = calculateScore(tokenData, voteCounts, boostsData);
      setTokens(scored);
      return scored;
    } catch (err) {
      console.error('Load data error:', err);
      return [];
    }
  };

  useEffect(() => {
    const initialLoad = async () => {
      setLoading(true);
      await loadData();
      setLoading(false);
    };
    initialLoad();

    const interval = setInterval(loadData, 15 * 1000); // Refresh tokens every 15 seconds
    return () => clearInterval(interval);
  }, [user]);

  const handleVote = async (token) => {
    if (!connected || !user) {
      Swal.fire('Error', 'Connect wallet to vote', 'error');
      return;
    }

    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const userVotesSnap = await getDocs(
      query(
        collection(db, 'votes'),
        where('userId', '==', user.uid),
        where('createdAt', '>', twelveHoursAgo)
      )
    );

    if (userVotesSnap.size >= 2 && !userVotes.has(token.id)) {
      Swal.fire('Limit Reached', 'You can only cast 2 votes per 12 hours', 'warning');
      return;
    }

    if (userVotes.has(token.id)) {
      return;
    }

    const result = await Swal.fire({
      title: 'Confirm Vote',
      text: `Cast your vote for ${token.symbol}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, vote!',
      cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    try {
      await addDoc(collection(db, 'votes'), {
        userId: user.uid,
        walletAddress: publicKey.toString(),
        tokenId: token.id,
        tokenSymbol: token.symbol,
        createdAt: new Date().toISOString()
      });

      setUserVotes(prev => new Set([...prev, token.id]));
      Swal.fire('Success!', 'Vote cast successfully! 🗳️', 'success');
      loadData();
    } catch (err) {
      Swal.fire('Error', 'Vote failed: ' + err.message, 'error');
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>🤖 AI analyzing Solana meme tokens...</p>
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="loading">
        <p>⚠️ No Solana tokens found. Check console for errors.</p>
        <button onClick={loadData} className="refresh" style={{marginTop: '20px', padding: '10px 20px'}}>
          🔄 Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="dashboard">
        <div className="main-content">
          <TrendingBar tokens={tokens} />
          <div className="controls">
            <div className="view-tabs">
              <button className={viewMode === 'leaderboard' ? 'active' : ''} onClick={() => setViewMode('leaderboard')}>
                🏆 Leaderboard
              </button>
              <button className={viewMode === 'bubble' ? 'active' : ''} onClick={() => setViewMode('bubble')}>
                🫧 Bubble
              </button>
              <button className={viewMode === 'treemap' ? 'active' : ''} onClick={() => setViewMode('treemap')}>
                🗺️ TreeMap
              </button>
            </div>
            <button onClick={loadData} className="refresh">🔄 Refresh</button>
          </div>

          {viewMode === 'leaderboard' && <LeaderboardView tokens={tokens} onVote={handleVote} onBoost={setBoostToken} canVote={connected && user} userVotes={userVotes} />}
          {viewMode === 'bubble' && <BubbleView tokens={tokens} onVote={handleVote} onBoost={setBoostToken} canVote={connected && user} userVotes={userVotes} />}
          {viewMode === 'treemap' && <TreeMapView tokens={tokens} onVote={handleVote} onBoost={setBoostToken} canVote={connected && user} userVotes={userVotes} />}
        </div>
        <div className="sidebar">
          <div className="ai-indicator">
            <div className="ai-pulse"></div>
            <span>🤖 AI POWERED</span>
          </div>
          <NewsSection />
        </div>
      </div>

      {boostToken && <BoostModal token={boostToken} isOpen={!!boostToken} onClose={() => setBoostToken(null)} />}
    </>
  );
};

const AppContent = () => (
  <div className="app">
    <header>
      <div className="logo">
        <h1>🚀 AIMI</h1>
        <span>AI Meme Index</span>
      </div>
      <WalletMultiButton />
    </header>
    <Dashboard />
  </div>
);

export default function App() {
  const endpoints = useMemo(() => [
    'https://api.mainnet-beta.solana.com',
    'https://solana-rpc.publicnode.com',
    'https://solana.drpc.org',
    'https://solana.lavenderfive.com/',
    'https://solana.api.onfinality.io/public',
    'https://public.rpc.solanavibestation.com/',
    'https://solana.therpc.io',
    'https://solana-mainnet.rpc.extrnode.com',
    'https://solana.public-rpc.com',
    'https://rpc.ankr.com/solana'
  ], []);

  const randomEndpoint = useMemo(() => endpoints[Math.floor(Math.random() * endpoints.length)], [endpoints]);

  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={randomEndpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AppContent />
        </WalletModalProvider>
      </WalletProvider>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #0a0e1a;
          color: #fff;
        }

        .app { min-height: 100vh; }

        header {
          background: #0f1419;
          border-bottom: 1px solid #1a1f2e;
          padding: 16px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .logo h1 {
          font-size: 24px;
          background: linear-gradient(135deg, #9945FF, #14F195, #FFD700);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .logo span {
          font-size: 11px;
          color: #8b8b8b;
          letter-spacing: 1px;
        }

        .loading {
          text-align: center;
          padding: 100px 20px;
        }

        .spinner {
          width: 50px;
          height: 50px;
          border: 3px solid #1a1f2e;
          border-top-color: #9945FF;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto 20px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .dashboard {
          display: flex;
          flex-direction: row;
          gap: 20px;
          padding: 20px;
          max-width: 1600px;
          margin: 0 auto;
        }

        .sidebar {
          background: #0f1419;
          border-radius: 16px;
          padding: 20px;
          border: 1px solid #1a1f2e;
          height: fit-content;
          position: sticky;
          top: 90px;
          flex: 0 0 300px;
        }

        .ai-indicator {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px;
          background: linear-gradient(135deg, rgba(153, 69, 255, 0.1), rgba(20, 241, 149, 0.1));
          border-radius: 10px;
          border: 1px solid #9945FF;
          margin-bottom: 20px;
        }

        .ai-pulse {
          width: 12px;
          height: 12px;
          background: #14F195;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }

        .news-section h3 {
          font-size: 16px;
          color: #14F195;
          margin-bottom: 16px;
        }

        .news-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .news-item {
          padding: 12px;
          background: #1a1f2e;
          border-radius: 8px;
          border-left: 3px solid #9945FF;
          cursor: pointer;
          transition: all 0.2s;
        }

        .news-item:hover {
          background: #252a3a;
          transform: translateX(4px);
        }

        .news-item.ai { border-left-color: #14F195; }
        .news-item.boost { border-left-color: #FFD700; }
        .news-item.trending { border-left-color: #FF4500; }
        .news-item.community { border-left-color: #9945FF; }

        .news-title {
          font-size: 13px;
          line-height: 1.4;
          margin-bottom: 4px;
        }

        .news-time {
          font-size: 11px;
          color: #8b8b8b;
        }

        .main-content {
          min-height: 80vh;
          flex: 1;
        }

        .controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          gap: 16px;
        }

        .view-tabs {
          display: flex;
          gap: 8px;
          background: #0f1419;
          padding: 4px;
          border-radius: 10px;
        }

        .view-tabs button {
          padding: 10px 20px;
          background: transparent;
          border: none;
          color: #8b8b8b;
          cursor: pointer;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.2s;
        }

        .view-tabs button.active {
          background: linear-gradient(135deg, #9945FF, #14F195);
          color: white;
        }

        .refresh {
          padding: 10px 20px;
          background: #1a1f2e;
          border: none;
          color: white;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
        }

        /* Leaderboard */
        .leaderboard h2 {
          font-size: 24px;
          margin-bottom: 20px;
          background: linear-gradient(135deg, #9945FF, #14F195, #FFD700);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .leaderboard-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .leaderboard-item {
          display: grid;
          grid-template-columns: 80px 1fr 100px 200px 80px 100px;
          gap: 16px;
          align-items: center;
          padding: 16px;
          background: #0f1419;
          border-radius: 12px;
          border: 1px solid #1a1f2e;
          transition: all 0.2s;
        }

        .leaderboard-item:hover {
          background: #1a1f2e;
          transform: translateX(4px);
        }

        .leaderboard-item.voted {
          background: rgba(20, 241, 149, 0.05);
          border-color: rgba(20, 241, 149, 0.3);
        }

        .leaderboard-item.golden {
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 165, 0, 0.1));
          border: 2px solid #FFD700;
          box-shadow: 0 0 20px rgba(255, 215, 0, 0.3);
        }

        .item-rank {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .rank-number {
          font-size: 20px;
          font-weight: 700;
          color: #9945FF;
        }

        .rank-boost {
          background: linear-gradient(135deg, #9945FF, #14F195);
          color: white;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 700;
        }

        .item-token {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .item-token img {
          width: 40px;
          height: 40px;
          border-radius: 50%;
        }

        .token-symbol {
          font-size: 16px;
          font-weight: 700;
        }

        .token-name {
          font-size: 12px;
          color: #8b8b8b;
        }

        .item-score {
          font-size: 24px;
          font-weight: 700;
          color: #FFD700;
        }

        .item-stats {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 13px;
        }

        .positive { color: #14F195; }
        .negative { color: #ff4d4d; }

        .item-votes {
          font-size: 16px;
          font-weight: 600;
          color: #9945FF;
        }

        .item-actions {
          display: flex;
          gap: 8px;
        }

        .vote-btn, .boost-btn-small {
          padding: 8px 16px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          transition: all 0.2s;
        }

        .vote-btn {
          background: linear-gradient(135deg, #9945FF, #14F195);
          color: white;
        }

        .vote-btn.voted {
          background: rgba(20, 241, 149, 0.3);
          color: #14F195;
        }

        .vote-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .boost-btn-small {
          background: #FFD700;
          color: #0a0e1a;
        }

        /* Bubble View */
        .bubble-view {
          position: relative;
          width: 100%;
          min-height: 800px;
          background: #0f1419;
          border-radius: 16px;
          border: 1px solid #1a1f2e;
          overflow: hidden;
        }

        .bubble {
          position: absolute;
          border-radius: 50%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s;
          border: 3px solid rgba(255, 255, 255, 0.2);
          animation: floatAnim 6s ease-in-out infinite;
          user-select: none;
        }

        .bubble:hover {
          transform: translate(-50%, -50%) scale(1.15) !important;
          box-shadow: 0 10px 50px rgba(0, 0, 0, 0.7);
          z-index: 10;
        }

        .bubble.golden {
          border-color: #FFD700;
          box-shadow: 0 0 40px rgba(255, 215, 0, 0.6);
          animation: goldenPulse 2s ease-in-out infinite;
        }

        @keyframes floatAnim {
          0%, 100% { transform: translate(-50%, -50%) translateY(0); }
          50% { transform: translate(-50%, -50%) translateY(-15px); }
        }

        @keyframes goldenPulse {
          0%, 100% { box-shadow: 0 0 40px rgba(255, 215, 0, 0.6); }
          50% { box-shadow: 0 0 60px rgba(255, 215, 0, 0.9); }
        }

        .bubble-logo {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          margin-bottom: 8px;
        }

        .bubble-symbol {
          font-size: 18px;
          font-weight: 700;
          color: white;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
        }

        .bubble-price {
          font-size: 14px;
          font-weight: 600;
          color: white;
          margin-top: 4px;
        }

        .bubble-change {
          font-size: 14px;
          font-weight: 600;
          margin-top: 4px;
        }

        /* TreeMap */
        .treemap {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }

        .treemap-cell {
          position: relative;
          border-radius: 8px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.3s;
          border: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .treemap-cell:hover {
          transform: scale(1.03);
          box-shadow: 0 15px 40px rgba(0, 0, 0, 0.6);
          z-index: 5;
        }

        .treemap-cell.golden {
          border-color: #FFD700;
          box-shadow: 0 0 35px rgba(255, 215, 0, 0.5);
          animation: goldenPulse 2s ease-in-out infinite;
        }

        .cell-content {
          display: flex;
          flex-direction: column;
          gap: 8px;
          text-align: center;
        }

        .cell-content img {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          margin: 0 auto;
        }

        .cell-content h3 {
          font-size: 18px;
          margin: 0;
        }

        .cell-price {
          font-size: 16px;
          font-weight: bold;
        }

        .cell-change {
          font-size: 14px;
        }

        /* Trending Bar */
        .trending-bar {
          background: #1a1f2e;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .trending-list {
          display: flex;
          gap: 16px;
          overflow-x: auto;
        }

        .trending-item {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #0f1419;
          padding: 8px 16px;
          border-radius: 20px;
          white-space: nowrap;
        }

        .trending-item img {
          width: 24px;
          height: 24px;
          border-radius: 50%;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .boost-modal, .tweet-modal {
          background: #0f1419;
          border-radius: 16px;
          padding: 24px;
          width: 90%;
          max-width: 500px;
          border: 1px solid #1a1f2e;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .modal-header h2 {
          font-size: 20px;
        }

        .modal-header button {
          background: none;
          border: none;
          color: #8b8b8b;
          font-size: 24px;
          cursor: pointer;
        }

        .boost-packages {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }

        .package {
          padding: 16px;
          background: #1a1f2e;
          border-radius: 12px;
          cursor: pointer;
          text-align: center;
          transition: all 0.2s;
        }

        .package.selected {
          border: 2px solid #14F195;
        }

        .package.golden {
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 165, 0, 0.2));
        }

        .pkg-label {
          font-size: 18px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .pkg-price {
          font-size: 16px;
          color: #FFD700;
        }

        .pkg-duration {
          font-size: 12px;
          color: #8b8b8b;
        }

        .golden-badge {
          margin-top: 8px;
          background: #FFD700;
          color: #0a0e1a;
          padding: 4px 8px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
        }

        .confirm-boost-btn {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #9945FF, #14F195);
          color: white;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
        }

        .confirm-boost-btn:disabled {
          opacity: 0.5;
        }

        /* Tweet Modal */
        .tweet-content {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .tweet-profile {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .tweet-pfp {
          width: 40px;
          height: 40px;
          border-radius: 50%;
        }

        .tweet-user-info {
          display: flex;
          flex-direction: column;
        }

        .tweet-user-info strong {
          font-size: 15px;
        }

        .tweet-user-info span {
          font-size: 13px;
          color: #8b8b8b;
        }

        .tweet-text {
          font-size: 15px;
          line-height: 1.5;
          white-space: pre-wrap;
        }

        .tweet-image {
          max-width: 100%;
          border-radius: 12px;
          margin-top: 8px;
        }

        /* Mobile Responsive */
        @media (max-width: 1024px) {
          .dashboard {
            flex-direction: column;
          }

          .sidebar {
            position: relative;
            top: 0;
            order: 2;
            flex: auto;
          }

          .main-content {
            order: 1;
          }
        }

        @media (max-width: 768px) {
          header {
            padding: 12px 16px;
          }

          .logo h1 {
            font-size: 20px;
          }

          .dashboard {
            padding: 16px;
            gap: 16px;
          }

          .controls {
            flex-direction: column;
            align-items: stretch;
          }

          .view-tabs {
            width: 100%;
          }

          .view-tabs button {
            flex: 1;
            padding: 10px;
            font-size: 13px;
          }

          .leaderboard-item {
            grid-template-columns: 60px 1fr 80px;
            gap: 12px;
            padding: 12px;
          }

          .item-stats, .item-votes, .item-actions {
            display: none;
          }

          .bubble-view {
            min-height: 400px;
          }

          .bubble {
            min-width: 80px !important;
            min-height: 80px !important;
            max-width: 120px !important;
            max-height: 120px !important;
          }

          .bubble-logo {
            width: 30px;
            height: 30px;
          }

          .bubble-symbol {
            font-size: 12px;
          }

          .bubble-price, .bubble-change {
            font-size: 10px;
          }

          .treemap {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .treemap-cell {
            flex: none;
            width: 100%;
            height: auto;
            min-height: 150px;
            padding: 16px;
          }

          .treemap-cell:nth-child(1) {
            min-height: 250px;
          }

          .treemap-cell:nth-child(2), .treemap-cell:nth-child(3) {
            min-height: 200px;
          }

          .cell-content h3 {
            font-size: 20px;
          }

          .cell-price {
            font-size: 18px;
          }

          .cell-change {
            font-size: 16px;
          }

          .boost-packages {
            grid-template-columns: repeat(2, 1fr);
          }

          .news-section {
            margin-bottom: 20px;
          }
        }

        @media (max-width: 480px) {
          .logo h1 {
            font-size: 18px;
          }

          .leaderboard h2 {
            font-size: 20px;
          }

          .item-token img {
            width: 32px;
            height: 32px;
          }

          .token-symbol {
            font-size: 14px;
          }

          .item-score {
            font-size: 20px;
          }

          .bubble {
            min-width: 70px !important;
            min-height: 70px !important;
            max-width: 100px !important;
            max-height: 100px !important;
          }

          .boost-packages {
            grid-template-columns: 1fr;
          }
        }

        /* Wallet Adapter */
        .wallet-adapter-button {
          background: linear-gradient(135deg, #9945FF, #14F195) !important;
          height: 42px !important;
          border-radius: 10px !important;
          font-weight: 600 !important;
        }

        @media (max-width: 768px) {
          .wallet-adapter-button {
            height: 38px !important;
            font-size: 13px !important;
            padding: 0 12px !important;
          }
        }
      `}</style>
    </ConnectionProvider>
  );
}