import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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

// Real-time search via DexScreener API
const searchTokens = async (query) => {
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

// Bubble View (enhanced for mobile with positioned bubbles, closer spacing, draggable)
const BubbleView = ({ tokens, onVote, onBoost, canVote, userVotes, isMobile, onItemClick }) => {
  const bubbleRef = useRef(null);
  const dragRef = useRef(null);
  const [positions, setPositions] = useState([]);

  const numBubbles = isMobile ? Math.min(30, tokens.length) : Math.min(20, tokens.length);
  const minDistance = isMobile ? 60 : 100;

  useEffect(() => {
    const container = bubbleRef.current;
    if (!container) return;

    const width = container.offsetWidth;
    const height = container.offsetHeight;
    const attempts = 200;

    const generatePositions = () => {
      let posList = [];
      for (let i = 0; i < numBubbles; i++) {
        let newPos, attempt = 0;
        do {
          // Add some organic offset for mobile
          const organicX = isMobile ? (Math.random() * 15 - 7.5) : 0;
          const organicY = isMobile ? (Math.random() * 15 - 7.5) : 0;
          newPos = {
            x: Math.random() * (width - 100) + 50 + organicX,
            y: Math.random() * (height - 100) + 50 + organicY,
            rotation: isMobile ? 0 : Math.random() * 360
          };
          attempt++;
          const overlaps = posList.some(existing => {
            const dx = newPos.x - existing.x;
            const dy = newPos.y - existing.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return dist < minDistance;
          });
          if (!overlaps) break;
        } while (attempt < attempts);

        if (attempt >= attempts) {
          const gridX = (i % Math.ceil(Math.sqrt(numBubbles))) * (width / Math.ceil(Math.sqrt(numBubbles)));
          const gridY = Math.floor(i / Math.ceil(Math.sqrt(numBubbles))) * (height / Math.ceil(Math.sqrt(numBubbles)));
          newPos = { x: gridX + width / (2 * Math.ceil(Math.sqrt(numBubbles))), y: gridY + height / (2 * Math.ceil(Math.sqrt(numBubbles))), rotation: 0 };
        }

        posList.push(newPos);
      }
      return posList;
    };

    setPositions(generatePositions());
  }, [tokens, isMobile, numBubbles, minDistance]);

  const handleMouseDown = useCallback((index, e) => {
    e.stopPropagation();
    dragRef.current = { 
      index, 
      startX: e.clientX, 
      startY: e.clientY, 
      startPos: { ...positions[index] } 
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [positions]);

  const handleMouseMove = useCallback((e) => {
    if (!dragRef.current) return;
    const { index, startX, startY, startPos } = dragRef.current;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    setPositions(prev => {
      const newPos = [...prev];
      newPos[index] = { ...startPos, x: startPos.x + deltaX, y: startPos.y + deltaY };
      return newPos;
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const handleTouchStart = useCallback((index, e) => {
    e.stopPropagation();
    const touch = e.touches[0];
    dragRef.current = { 
      index, 
      startX: touch.clientX, 
      startY: touch.clientY, 
      startPos: { ...positions[index] } 
    };
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  }, [positions]);

  const handleTouchMove = useCallback((e) => {
    if (!dragRef.current) return;
    const touch = e.touches[0];
    const { index, startX, startY, startPos } = dragRef.current;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    e.preventDefault();
    setPositions(prev => {
      const newPos = [...prev];
      newPos[index] = { ...startPos, x: startPos.x + deltaX, y: startPos.y + deltaY };
      return newPos;
    });
  }, []);

  const handleTouchEnd = useCallback(() => {
    dragRef.current = null;
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
  }, [handleTouchMove]);

  return (
    <div>
      <h2 style={{ fontSize: '24px', marginBottom: '20px', background: 'linear-gradient(135deg, #9945FF, #14F195, #FFD700)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        🫧 Meme Bubble Chart
      </h2>
      <div className="bubble-view" ref={bubbleRef} style={{ minHeight: isMobile ? '70vh' : '80vh' }}>
        {tokens.slice(0, numBubbles).map((token, idx) => {
          const maxScore = Math.max(...tokens.map(t => t.memeScore));
          const minScore = Math.min(...tokens.map(t => t.memeScore));
          const size = isMobile ? (80 + ((token.memeScore - minScore) / (maxScore - minScore || 1)) * 60) : (60 + ((token.memeScore - minScore) / (maxScore - minScore)) * 160);
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
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                transform: `translate(-50%, -50%) rotate(${pos.rotation}deg)`,
                background: token.boost?.golden 
                  ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                  : `linear-gradient(135deg, hsl(${hue}, ${sat}%, 50%), hsl(${hue}, ${sat}%, 40%))`
              }}
              onClick={(e) => { e.stopPropagation(); onItemClick(token); }}
              onMouseDown={(e) => handleMouseDown(idx, e)}
              onTouchStart={(e) => handleTouchStart(idx, e)}
            >
              <div className="bubble-symbol">{token.symbol}</div>
              <div className="bubble-price">${token.price.toLocaleString(undefined, {maximumSignificantDigits: 4})}</div>
              <div className="bubble-change" style={{color: token.priceChange >= 0 ? '#00ff00' : '#ff0000'}}>
                {token.priceChange >= 0 ? '+' : ''}{token.priceChange.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Enhanced TreeMap View (fixed to fill space completely by scaling, restored numTokens)
const TreeMapView = ({ tokens, onVote, onBoost, canVote, userVotes, isMobile, onItemClick }) => {
  const treemapRef = useRef(null);
  const [layout, setLayout] = useState([]);

  const squarify = (data, x, y, width, height) => {
    const nodes = [];

    const getWorstRatio = (row, rw, rh, isHorizontal, sumRemaining) => {
      if (row.length === 0) return 0;
      const rowSum = row.reduce((sum, d) => sum + d.value, 0);
      if (rowSum === 0) return Infinity;
      let stripDim, fullDim;
      if (isHorizontal) {
        stripDim = (rowSum / sumRemaining) * rh; // height of strip
        fullDim = rw; // width full
      } else {
        stripDim = (rowSum / sumRemaining) * rw; // width of strip
        fullDim = rh; // height full
      }
      let maxRatio = 0;
      row.forEach(d => {
        let rectWidth, rectHeight;
        if (isHorizontal) {
          rectWidth = (d.value / rowSum) * fullDim;
          rectHeight = stripDim;
        } else {
          rectWidth = stripDim;
          rectHeight = (d.value / rowSum) * fullDim;
        }
        const longer = Math.max(rectWidth, rectHeight);
        const shorter = Math.min(rectWidth, rectHeight);
        const ratio = shorter > 0 ? longer / shorter : Infinity;
        maxRatio = Math.max(maxRatio, ratio);
      });
      return maxRatio;
    };

    const layoutHorizontalRow = (row, rx, ry, rw, rowHeight) => {
      const rowSum = row.reduce((sum, d) => sum + d.value, 0);
      let currX = rx;
      row.forEach(d => {
        const rectWidth = (d.value / rowSum) * rw;
        nodes.push({ data: d, x: currX, y: ry, w: rectWidth, h: rowHeight });
        currX += rectWidth;
      });
    };

    const layoutVerticalRow = (row, rx, ry, rowWidth, rh) => {
      const rowSum = row.reduce((sum, d) => sum + d.value, 0);
      let currY = ry;
      row.forEach(d => {
        const rectHeight = (d.value / rowSum) * rh;
        nodes.push({ data: d, x: rx, y: currY, w: rowWidth, h: rectHeight });
        currY += rectHeight;
      });
    };

    if (data.length === 0) return nodes;

    // Sort data in descending order
    data = [...data].sort((a, b) => b.value - a.value);

    const initialIsHorizontal = width >= height;

    const recurse = (remaining, rx, ry, rw, rh, isHorizontal) => {
      if (remaining.length === 0) return;

      const sumRemaining = remaining.reduce((sum, d) => sum + d.value, 0);
      if (sumRemaining === 0) return;

      let row = [remaining[0]];
      for (let i = 1; i < remaining.length; i++) {
        const candidateRow = [...row, remaining[i]];
        const currentWorst = getWorstRatio(row, rw, rh, isHorizontal, sumRemaining);
        const candidateWorst = getWorstRatio(candidateRow, rw, rh, isHorizontal, sumRemaining);
        if (candidateWorst <= currentWorst) {
          row = candidateRow;
        } else {
          // Layout current row
          const rowSum = row.reduce((sum, d) => sum + d.value, 0);
          if (isHorizontal) {
            const rowHeight = (rowSum / sumRemaining) * rh;
            layoutHorizontalRow(row, rx, ry, rw, rowHeight);
            const newRy = ry + rowHeight;
            const newRh = rh - rowHeight;
            recurse(remaining.slice(i), rx, newRy, rw, newRh, !isHorizontal);
          } else {
            const rowWidth = (rowSum / sumRemaining) * rw;
            layoutVerticalRow(row, rx, ry, rowWidth, rh);
            const newRx = rx + rowWidth;
            const newRw = rw - rowWidth;
            recurse(remaining.slice(i), newRx, ry, newRw, rh, !isHorizontal);
          }
          return;
        }
      }

      // Layout the last row (full remaining space)
      const rowSum = row.reduce((sum, d) => sum + d.value, 0);
      if (isHorizontal) {
        const rowHeight = rh; // Full remaining height
        layoutHorizontalRow(row, rx, ry, rw, rowHeight);
      } else {
        const rowWidth = rw; // Full remaining width
        layoutVerticalRow(row, rx, ry, rowWidth, rh);
      }
      // No recurse needed, remaining is empty
    };

    recurse(data, x, y, width, height, initialIsHorizontal);
    return nodes;
  };

  useEffect(() => {
    const container = treemapRef.current;
    if (!container || tokens.length === 0) return;

    const width = container.offsetWidth;
    const height = container.offsetHeight || (isMobile ? window.innerHeight * 0.8 : window.innerHeight * 0.6);
    const numTokens = isMobile ? 9 : 16;
    const topTokens = tokens.slice(0, numTokens)
      .filter(t => t.marketCap > 0)
      .sort((a, b) => b.marketCap - a.marketCap)
      .map(t => ({ ...t, value: Math.log(t.marketCap + 1) }));
    let nodes = squarify(topTokens, 0, 0, width, height);

    // Scale to fill exactly to avoid gaps due to floating point
    let maxX = 0, maxY = 0;
    nodes.forEach(node => {
      maxX = Math.max(maxX, node.x + node.w);
      maxY = Math.max(maxY, node.y + node.h);
    });
    const scaleX = width / (maxX || 1);
    const scaleY = height / (maxY || 1);
    const scaledNodes = nodes.map(node => ({
      ...node,
      x: node.x * scaleX,
      y: node.y * scaleY,
      w: node.w * scaleX,
      h: node.h * scaleY
    })).filter(node => node.w > 0.5 && node.h > 0.5); // Filter tiny ones

    setLayout(scaledNodes);
  }, [tokens, isMobile]);

  return (
    <div>
      <h2 style={{ fontSize: '24px', marginBottom: '20px', background: 'linear-gradient(135deg, #9945FF, #14F195, #FFD700)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        📊 Market Cap Treemap
      </h2>
      <div 
        className="treemap" 
        ref={treemapRef} 
        style={{ 
          height: isMobile ? '80vh' : '70vh', 
          overflow: 'hidden',
          padding: 0
        }}
      >
        {layout.map((node, idx) => {
          const { data: token } = node;
          const rectWidth = node.w;
          const rectHeight = node.h;
          if (rectWidth < 1 || rectHeight < 1) return null;
          const change = token.priceChange;
          const isPositive = change >= 0;
          const intensity = Math.min(70, Math.abs(change) * 2);
          const r = isPositive ? 0 : 255;
          const g = isPositive ? 255 : 77;
          const b = isPositive ? 136 : 77;
          const alpha1 = 0.2 + (intensity / 100) * 0.3;
          const alpha2 = 0.5 + (intensity / 100) * 0.3;
          const gradient = `linear-gradient(135deg, rgba(${r},${g},${b},${alpha1}), rgba(${r},${g},${b},${alpha2}))`;
          const fontSize = Math.max(isMobile ? 6 : 8, Math.min(rectWidth, rectHeight) / 12);
          const showSymbol = rectWidth > (isMobile ? 40 : 60) || rectHeight > (isMobile ? 40 : 60);
          
          return (
            <div
              key={idx}
              className={`treemap-cell ${token.boost?.golden ? 'golden' : ''}`}
              style={{
                position: 'absolute',
                left: `${node.x}px`,
                top: `${node.y}px`,
                width: `${rectWidth}px`,
                height: `${rectHeight}px`,
                background: token.boost?.golden
                  ? 'linear-gradient(135deg, rgba(255,215,0,0.6), rgba(255,165,0,0.6))'
                  : gradient,
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: `${Math.max(1, fontSize / 5)}px`,
              }}
              onClick={() => onItemClick(token)}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = `0 0 20px rgba(${r},${g},${b},0.6)`;
                e.currentTarget.style.zIndex = '10';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.zIndex = '1';
              }}
            >
              <div className="cell-content" style={{ fontSize: `${fontSize}px`, textAlign: 'center', width: '100%' }}>
                {showSymbol && (
                  <h3 style={{ 
                    margin: '0 0 2px 0', 
                    whiteSpace: 'nowrap', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    fontWeight: 'bold', 
                    color: 'white',
                    fontSize: `${fontSize * 1.1}px`
                  }}>
                    {token.symbol}
                  </h3>
                )}
                <div className="cell-change" style={{ 
                  fontSize: `${fontSize}px`, 
                  color: change >= 0 ? '#00ff88' : '#ff4d4d', 
                  fontWeight: 'bold' 
                }}>
                  {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Mobile Action Modal
const MobileActionModal = ({ token, isOpen, onClose, onVote, onBoost, canVote, hasVoted }) => {
  if (!isOpen || !token) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="mobile-action-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Actions for {token.symbol}</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="token-info">
          <div>
            <div className="token-symbol">{token.symbol}</div>
            <div className="token-score">{token.memeScore.toFixed(1)} Score</div>
          </div>
        </div>
        <div className="action-buttons">
          <button 
            className={`vote-btn ${hasVoted ? 'voted' : ''}`}
            onClick={() => {
              onVote(token);
              onClose();
            }}
            disabled={!canVote}
          >
            {hasVoted ? '✓ Voted' : '🗳️ Vote'}
          </button>
          <button className="boost-btn" onClick={() => {
            onBoost(token);
            onClose();
          }}>
            🚀 Boost
          </button>
        </div>
      </div>
    </div>
  );
};

// Leaderboard View with instant search (clears immediately on delete)
const LeaderboardView = ({ tokens, onVote, onBoost, canVote, userVotes, isMobile, onItemClick }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const search = async () => {
      if (!searchTerm.trim() || searchTerm.length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      const results = await searchTokens(searchTerm);
      setSearchResults(results);
      setIsSearching(false);
    };

    search();
  }, [searchTerm]);

  const displayTokens = searchTerm.trim() && searchTerm.length >= 2 ? searchResults : tokens;

  return (
    <div className="leaderboard">
      <h2>🏆 AI Meme Index Leaderboard</h2>
      <div className="search-container">
        <input
          type="text"
          placeholder="Search by CA, ticker, or name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        {isSearching && <span className="search-loading">🔍 Searching...</span>}
      </div>
      <div className="leaderboard-list">
        {displayTokens.slice(0, 50).map((token, idx) => {
          const hasVoted = userVotes.has(token.id);
          return (
            <div 
              key={token.id} 
              className={`leaderboard-item ${hasVoted ? 'voted' : ''} ${token.boost?.golden ? 'golden' : ''} ${isMobile ? 'mobile-clickable' : ''}`}
              onClick={isMobile ? () => onItemClick(token) : undefined}
            >
              <div className="item-rank">
                <span className="rank-number">#{idx + 1}</span>
                {token.boost && <span className="rank-boost">×{token.boost.multiplier}</span>}
              </div>
              <div className="item-token">
                {token.logo && <img src={token.logo} alt={token.symbol} style={{objectFit: 'cover'}} />}
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
              {!isMobile && (
                <div className="item-actions">
                  <button 
                    className={`vote-btn ${hasVoted ? 'voted' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onVote(token);
                    }}
                    disabled={!canVote}
                  >
                    {hasVoted ? '✓' : '🗳️'}
                  </button>
                  <button className="boost-btn-small" onClick={(e) => {
                    e.stopPropagation();
                    onBoost(token);
                  }}>🚀</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Boost Modal (simpler, from older)
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

// Tweet Modal, NewsSection, TrendingBar remain the same as older

const TweetModal = ({ tweet, onClose }) => {
  if (!tweet) return null;

  let imageUrl = null;
  let videoUrl = null;

  if (tweet.entities?.urls) {
    tweet.entities.urls.forEach(urlObj => {
      const expanded = urlObj.expanded_url || urlObj.url;
      if (expanded.includes('pbs.twimg.com/media')) {
        const mediaMatch = expanded.match(/\/media\/([^?]+)/);
        if (mediaMatch) {
          const mediaId = mediaMatch[1];
          imageUrl = `https://pbs.twimg.com/media/${mediaId}?format=jpg&name=large`;
        }
      }
    });
  }

  if (tweet.attachments?.media_keys && !imageUrl) {
    const mediaKey = tweet.attachments.media_keys[0];
    imageUrl = `https://pbs.twimg.com/media/${mediaKey}?format=jpg&name=large`;
  }

  if (tweet.includes?.media) {
    tweet.includes.media.forEach(media => {
      if (media.type === 'photo' && !imageUrl) {
        imageUrl = media.url || media.media_key ? `https://pbs.twimg.com/media/${media.media_key}?format=jpg&name=large` : null;
      } else if (media.type === 'video' && !videoUrl) {
        videoUrl = media.variants?.[0]?.url || null;
      }
    });
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
            {tweet.user?.profile_image_url && <img src={tweet.user.profile_image_url.replace('_normal', '_bigger')} alt={tweet.user.name} className="tweet-pfp" />}
            <div className="tweet-user-info">
              <strong>{tweet.user?.name || 'Anonymous'}</strong>
              <span>@{tweet.user?.username || ''}</span>
            </div>
          </div>
          <p className="tweet-text">{tweet.text}</p>
          {imageUrl && <img src={imageUrl} alt="Tweet media" className="tweet-image" />}
          {videoUrl && <video src={videoUrl} controls className="tweet-video" style={{ maxWidth: '100%', borderRadius: '12px' }} />}
        </div>
      </div>
    </div>
  );
};

const NewsSection = () => {
  const [tweets, setTweets] = useState([]);
  const [selectedTweet, setSelectedTweet] = useState(null);

  useEffect(() => {
    const loadTweets = async () => {
      const tweetData = await fetchTweets();
      setTweets(tweetData);
    };
    loadTweets();
    const interval = setInterval(loadTweets, 30 * 1000);
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
        tweet
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
            {token.logo && <img src={token.logo} alt={token.symbol} style={{objectFit: 'cover'}} />}
            <span>{token.symbol}</span>
            <span className="positive">+{token.priceChange.toFixed(2)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Dashboard (from older, with 12h votes, 15s refresh)
const Dashboard = () => {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('leaderboard');
  const [user, setUser] = useState(null);
  const [userVotes, setUserVotes] = useState(new Set());
  const [boostToken, setBoostToken] = useState(null);
  const [selectedToken, setSelectedToken] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const { publicKey, connected } = useWallet();

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

    const interval = setInterval(loadData, 15 * 1000); // 15 seconds
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

  const handleItemClick = (token) => {
    setSelectedToken(token);
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

          {viewMode === 'leaderboard' && <LeaderboardView tokens={tokens} onVote={handleVote} onBoost={setBoostToken} canVote={connected && user} userVotes={userVotes} isMobile={isMobile} onItemClick={handleItemClick} />}
          {viewMode === 'bubble' && <BubbleView tokens={tokens} onVote={handleVote} onBoost={setBoostToken} canVote={connected && user} userVotes={userVotes} isMobile={isMobile} onItemClick={handleItemClick} />}
          {viewMode === 'treemap' && <TreeMapView tokens={tokens} onVote={handleVote} onBoost={setBoostToken} canVote={connected && user} userVotes={userVotes} isMobile={isMobile} onItemClick={handleItemClick} />}
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
      <MobileActionModal 
        token={selectedToken} 
        isOpen={!!selectedToken} 
        onClose={() => setSelectedToken(null)} 
        onVote={handleVote} 
        onBoost={setBoostToken} 
        canVote={connected && user} 
        hasVoted={userVotes.has(selectedToken?.id || '')} 
      />
    </>
  );
};

const AppContent = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="app">
      <header>
        <div className="ca-header">CA: SOON</div>
        <div className="nav-section">
          <div className="logo">
            <h1>🚀 AIMI</h1>
            <span>AI Meme Index</span>
          </div>
          <WalletMultiButton />
        </div>
      </header>
      <Dashboard />
    </div>
  );
};

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
          touch-action: manipulation;
        }

        .app { min-height: 100vh; }

        header {
          background: #0f1419;
          border-bottom: 1px solid #1a1f2e;
          padding: 16px 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .ca-header {
          background: linear-gradient(135deg, #9945FF, #14F195);
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
          align-self: center;
          width: fit-content;
        }

        .nav-section {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }

        .logo {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
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
          top: 120px;
          flex: 0 0 300px;
          min-width: 300px;
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
          touch-action: manipulation;
        }

        .news-item:hover, .news-item:active {
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
          touch-action: manipulation;
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
          touch-action: manipulation;
        }

        /* Leaderboard */
        .leaderboard h2 {
          font-size: 24px;
          margin-bottom: 20px;
          background: linear-gradient(135deg, #9945FF, #14F195, #FFD700);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .search-container {
          margin-bottom: 20px;
          position: relative;
        }

        .search-loading {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #9945FF;
          font-size: 12px;
        }

        .search-input {
          width: 100%;
          padding: 12px 16px;
          background: #1a1f2e;
          border: 1px solid #1a1f2e;
          border-radius: 8px;
          color: white;
          font-size: 14px;
        }

        .search-input::placeholder {
          color: #8b8b8b;
        }

        .search-input:focus {
          border-color: #9945FF;
          outline: none;
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
          touch-action: manipulation;
        }

        .leaderboard-item:hover:not(.mobile-clickable), .leaderboard-item:active:not(.mobile-clickable) {
          background: #1a1f2e;
          transform: translateX(4px);
        }

        .leaderboard-item.mobile-clickable {
          cursor: pointer;
        }

        .leaderboard-item.mobile-clickable:hover, .leaderboard-item.mobile-clickable:active {
          background: rgba(153, 69, 255, 0.1);
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
          object-fit: cover;
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

        .vote-btn, .boost-btn-small, .boost-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          transition: all 0.2s;
          min-height: 44px;
          min-width: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          touch-action: manipulation;
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

        .boost-btn-small, .boost-btn {
          background: #FFD700;
          color: #0a0e1a;
        }

        /* Bubble View */
        .bubble-view {
          position: relative;
          width: 100%;
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
          touch-action: manipulation;
        }

        .bubble:hover, .bubble:active {
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
          position: relative;
          width: 100%;
          background: #0f1419;
          border-radius: 16px;
          border: 1px solid #1a1f2e;
          overflow: hidden;
          padding: 0;
        }

        .treemap-cell {
          position: absolute;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.3s ease;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          touch-action: manipulation;
        }

        .treemap-cell:hover, .treemap-cell:active {
          transform: scale(1.05);
          z-index: 10;
        }

        .treemap-cell.golden {
          border: 2px solid #FFD700;
          box-shadow: 0 0 35px rgba(255, 215, 0, 0.5);
          animation: goldenPulse 2s ease-in-out infinite;
        }

        .cell-content {
          display: flex;
          flex-direction: column;
          gap: 1px;
          text-align: center;
          width: 100%;
          height: 100%;
          justify-content: center;
          align-items: center;
        }

        .cell-content h3 {
          font-size: 1em;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: bold;
          color: white;
        }

        .cell-change {
          font-size: 0.9em;
          font-weight: bold;
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
          padding: 8px 0;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .trending-list::-webkit-scrollbar {
          display: none;
        }

        .trending-item {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #0f1419;
          padding: 8px 16px;
          border-radius: 20px;
          white-space: nowrap;
          min-width: fit-content;
          flex-shrink: 0;
        }

        .trending-item img {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          object-fit: cover;
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
          padding: 20px;
        }

        .boost-modal, .tweet-modal, .mobile-action-modal {
          background: #0f1419;
          border-radius: 16px;
          padding: 24px;
          width: 100%;
          max-width: 500px;
          border: 1px solid #1a1f2e;
          max-height: 90vh;
          overflow-y: auto;
        }

        .mobile-action-modal {
          max-width: 400px;
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
          touch-action: manipulation;
        }

        .token-info {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: #1a1f2e;
          border-radius: 12px;
          margin-bottom: 20px;
        }

        .token-info .token-symbol {
          font-size: 18px;
          font-weight: 700;
        }

        .token-info .token-score {
          font-size: 14px;
          color: #FFD700;
        }

        .action-buttons {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .action-buttons .vote-btn {
          width: 100%;
          justify-content: center;
          font-size: 16px;
          padding: 12px;
        }

        .action-buttons .boost-btn {
          width: 100%;
          justify-content: center;
          font-size: 16px;
          padding: 12px;
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
          touch-action: manipulation;
        }

        .package:hover, .package:active {
          transform: scale(1.05);
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
          min-height: 48px;
          touch-action: manipulation;
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
          object-fit: cover;
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

        .tweet-image, .tweet-video {
          max-width: 100%;
          border-radius: 12px;
          margin-top: 8px;
        }

        /* Mobile Responsive */
        @media (max-width: 1200px) {
          .dashboard {
            gap: 16px;
            padding: 16px;
          }

          .sidebar {
            flex: 0 0 280px;
          }
        }

        @media (max-width: 1024px) {
          .dashboard {
            flex-direction: column;
            gap: 16px;
          }

          .sidebar {
            position: relative;
            top: 0;
            order: 2;
            flex: none;
            width: 100%;
            min-width: auto;
          }

          .main-content {
            order: 1;
            width: 100%;
          }

          header {
            padding: 16px 20px;
          }

          .nav-section {
            flex-wrap: wrap;
            gap: 12px;
          }

          .ca-header {
            order: 0;
          }
        }

        @media (max-width: 768px) {
          header {
            padding: 16px 16px;
            gap: 12px;
          }

          .nav-section {
            justify-content: space-between;
            align-items: center;
          }

          .logo {
            align-items: flex-start;
          }

          .logo h1 {
            font-size: 20px;
          }

          .dashboard {
            padding: 12px;
            gap: 12px;
          }

          .controls {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
          }

          .view-tabs {
            width: 100%;
            justify-content: stretch;
            flex-wrap: wrap;
          }

          .view-tabs button {
            flex: 1;
            padding: 12px;
            font-size: 14px;
            min-width: 100px;
          }

          .leaderboard-item {
            grid-template-columns: 60px 1fr 80px 120px 60px;
            gap: 12px;
            padding: 12px;
          }

          .leaderboard-item .item-actions {
            display: none;
          }

          .item-stats span:last-child {
            display: none;
          }

          .item-votes {
            display: none;
          }

          .boost-packages {
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
          }

          .news-section {
            margin-bottom: 20px;
          }

          .trending-list {
            gap: 8px;
          }

          .trending-item {
            padding: 6px 12px;
            font-size: 14px;
          }

          .sidebar {
            padding: 16px;
          }

          .news-item {
            padding: 10px;
          }

          .news-title {
            font-size: 12px;
          }

          .modal-overlay {
            padding: 10px;
          }

          .mobile-action-modal {
            width: 100%;
            max-width: none;
            margin: 0;
          }

          .action-buttons {
            gap: 16px;
          }

          .action-buttons .vote-btn, .action-buttons .boost-btn {
            min-height: 50px;
            font-size: 18px;
          }

          .search-input {
            padding: 14px 16px;
            font-size: 16px;
          }

          .ca-header {
            font-size: 13px;
            padding: 6px 12px;
          }
        }

        @media (max-width: 480px) {
          .logo h1 {
            font-size: 18px;
          }

          .logo span {
            font-size: 10px;
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

          .vote-btn, .boost-btn-small {
            padding: 12px;
            min-height: 48px;
            min-width: 48px;
            font-size: 18px;
          }

          .boost-packages {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .package {
            padding: 20px;
          }

          .tweet-modal {
            margin: 8px;
            width: calc(100% - 16px);
            padding: 16px;
          }

          .ca-header {
            font-size: 12px;
            padding: 6px 12px;
            align-self: stretch;
            text-align: center;
          }

          .nav-section {
            align-items: center;
          }

          .wallet-adapter-button {
            width: 100% !important;
            margin-top: 8px !important;
          }

          .leaderboard-item {
            grid-template-columns: 50px 1fr 60px 80px;
            gap: 8px;
            padding: 10px;
            font-size: 14px;
          }

          .item-stats {
            font-size: 12px;
          }

          .view-tabs button {
            padding: 10px;
            font-size: 12px;
          }

          .trending-bar {
            padding: 12px;
          }

          .trending-item {
            padding: 4px 8px;
            font-size: 12px;
          }

          .trending-item img {
            width: 20px;
            height: 20px;
          }

          .token-info {
            padding: 12px;
          }

          .news-item {
            padding: 8px;
          }

          .news-title {
            font-size: 11px;
          }

          .news-time {
            font-size: 10px;
          }

          .controls .refresh {
            padding: 12px;
            font-size: 16px;
          }

          .search-input {
            padding: 16px;
            font-size: 16px;
          }

          .sidebar {
            padding: 12px;
          }
        }

        /* Wallet Adapter */
        .wallet-adapter-button {
          background: linear-gradient(135deg, #9945FF, #14F195) !important;
          height: 44px !important;
          border-radius: 10px !important;
          font-weight: 600 !important;
          min-height: 44px !important;
          touch-action: manipulation;
        }

        @media (max-width: 768px) {
          .wallet-adapter-button {
            height: 44px !important;
            font-size: 14px !important;
            padding: 0 16px !important;
            width: auto;
          }
        }
      `}</style>
    </ConnectionProvider>
  );
}