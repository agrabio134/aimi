// src/components/Dashboard.jsx - Updated with FontAwesome icons
import React, { useState, useEffect } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getDocs, collection, addDoc, query, where } from 'firebase/firestore';
import Swal from 'sweetalert2';
import TrendingBar from './TrendingBar';
import LeaderboardView from './LeaderboardView';
import BubbleView from './BubbleView';
import TreeMapView from './TreeMapView';
import PolymarketView from './PolymarketView';
import BoostModal from './BoostModal';
import MobileActionModal from './MobileActionModal';
import NewsSection from './NewsSection';
import PolymarketWidget from './PolymarketWidget';
import { calculateScore, fetchTokens } from '../utils/api';

const Dashboard = ({ isMobile, connected, publicKey }) => {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('leaderboard');
  const [user, setUser] = useState(null);
  const [userVotes, setUserVotes] = useState(new Set());
  const [boostToken, setBoostToken] = useState(null);
  const [selectedToken, setSelectedToken] = useState(null);
  const [selectedMarket, setSelectedMarket] = useState(null);

  const auth = window.firebase.auth;
  const db = window.firebase.db;

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
     y      }

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
    if (!connected || !user || !publicKey) {
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
      Swal.fire('Success!', 'Vote cast successfully!', 'success');
      loadData();
    } catch (err) {
      Swal.fire('Error', 'Vote failed: ' + err.message, 'error');
    }
  };

  const handleItemClick = (token) => {
    setSelectedToken(token);
  };

  const handleBoost = (token) => {
    setBoostToken(token);
  };

  const handleMarketClick = (market) => {
    setSelectedMarket(market);
    Swal.fire({
      title: market.question,
      html: `
        <div style="text-align: left; padding: 10px;">
          <p style="color: #8b8b8b; margin-bottom: 15px;">${market.description || 'No description available'}</p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
            <div style="background: rgba(20, 241, 149, 0.1); padding: 12px; border-radius: 8px;">
              <div style="font-size: 12px; color: #8b8b8b;">YES</div>
              <div style="font-size: 24px; font-weight: bold; color: #14F195;">${market.sentiment.yesPrice}¢</div>
            </div>
            <div style="background: rgba(255, 77, 77, 0.1); padding: 12px; border-radius: 8px;">
              <div style="font-size: 12px; color: #8b8b8b;">NO</div>
              <div style="font-size: 24px; font-weight: bold; color: #ff4d4d;">${market.sentiment.noPrice}¢</div>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 14px; color: #8b8b8b;">
            <span><i class="fas fa-dollar-sign"></i> Volume: $${(market.volume / 1000).toFixed(1)}K</span>
            <span><i class="fas fa-tint"></i> Liquidity: $${(market.liquidity / 1000).toFixed(1)}K</span>
          </div>
          <div style="margin-top: 10px; font-size: 14px; color: #8b8b8b;">
            <i class="fas fa-calendar-alt"></i> Ends: ${market.endDate}
          </div>
          <div style="margin-top: 15px; padding: 10px; background: #1a1f2e; border-radius: 8px;">
            <div style="font-size: 12px; color: #8b8b8b; margin-bottom: 5px;">Sentiment Score</div>
            <div style="font-size: 28px; font-weight: bold; color: ${market.sentiment.score >= 70 ? '#14F195' : market.sentiment.score >= 50 ? '#FFD700' : '#ff4d4d'};">${market.sentiment.score}</div>
          </div>
        </div>
      `,
      confirmButtonText: 'Visit on Polymarket',
      confirmButtonColor: '#9945FF',
      showCancelButton: true,
      cancelButtonText: 'Close'
    }).then((result) => {
      if (result.isConfirmed) {
        window.open(`https://polymarket.com/event/${market.id}`, '_blank');
      }
    });
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p><i className="fas fa-robot"></i> AI analyzing Solana meme tokens...</p>
      </div>
    );
  }

  if (tokens.length === 0 && viewMode !== 'polymarket') {
    return (
      <div className="loading">
        <p><i className="fas fa-exclamation-triangle"></i> No Solana tokens found. Check console for errors.</p>
        <button onClick={loadData} className="refresh" style={{marginTop: '20px', padding: '10px 20px'}}>
          <i className="fas fa-sync-alt"></i> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="main-content">
        {viewMode !== 'polymarket' && <TrendingBar tokens={tokens} />}
        
        <div className="controls">
          <div className="view-tabs">
            <button className={viewMode === 'leaderboard' ? 'active' : ''} onClick={() => setViewMode('leaderboard')}>
              <i className="fas fa-trophy"></i> Leaderboard
            </button>
            <button className={viewMode === 'bubble' ? 'active' : ''} onClick={() => setViewMode('bubble')}>
              <i className="fas fa-circle"></i> Bubble
            </button>
            <button className={viewMode === 'treemap' ? 'active' : ''} onClick={() => setViewMode('treemap')}>
              <i className="fas fa-project-diagram"></i> TreeMap
            </button>
            <button className={viewMode === 'polymarket' ? 'active' : ''} onClick={() => setViewMode('polymarket')}>
              <i className="fas fa-chart-line"></i> Polymarket
            </button>
          </div>
          {viewMode !== 'polymarket' && (
            <button onClick={loadData} className="refresh">
              <i className="fas fa-sync-alt"></i> Refresh
            </button>
          )}
        </div>

        {viewMode === 'leaderboard' && <LeaderboardView tokens={tokens} onVote={handleVote} onBoost={handleBoost} canVote={connected && !!user && !!publicKey} userVotes={userVotes} isMobile={isMobile} onItemClick={handleItemClick} />}
        {viewMode === 'bubble' && <BubbleView tokens={tokens} onVote={handleVote} onBoost={handleBoost} canVote={connected && !!user && !!publicKey} userVotes={userVotes} isMobile={isMobile} onItemClick={handleItemClick} />}
        {viewMode === 'treemap' && <TreeMapView tokens={tokens} onVote={handleVote} onBoost={handleBoost} canVote={connected && !!user && !!publicKey} userVotes={userVotes} isMobile={isMobile} onItemClick={handleItemClick} />}
        {viewMode === 'polymarket' && <PolymarketView isMobile={isMobile} />}
      </div>
      
      <div className="sidebar">
        <div className="ai-indicator">
          <div className="ai-pulse"></div>
          <span><i className="fas fa-robot"></i> AI POWERED</span>
        </div>
        
        {/* Add Polymarket Widget */}
        <PolymarketWidget onMarketClick={handleMarketClick} />
        
        <NewsSection />
      </div>

      {boostToken && <BoostModal token={boostToken} isOpen={!!boostToken} onClose={() => setBoostToken(null)} />}
      <MobileActionModal 
        token={selectedToken} 
        isOpen={!!selectedToken} 
        onClose={() => setSelectedToken(null)} 
        onVote={handleVote} 
        onBoost={handleBoost} 
        canVote={connected && !!user && !!publicKey} 
        hasVoted={userVotes.has(selectedToken?.id || '')} 
      />
    </div>
  );
};

export default Dashboard;