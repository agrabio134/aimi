// src/components/Dashboard.jsx (fixed: add missing imports for signInAnonymously and onAuthStateChanged)
import React, { useState, useEffect } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getDocs, collection, addDoc, query, where } from 'firebase/firestore';
import Swal from 'sweetalert2';
import TrendingBar from './TrendingBar';
import LeaderboardView from './LeaderboardView';
import BubbleView from './BubbleView';
import TreeMapView from './TreeMapView';
import BoostModal from './BoostModal';
import MobileActionModal from './MobileActionModal';
import NewsSection from './NewsSection';
import { calculateScore, fetchTokens } from '../utils/api';

const Dashboard = ({ isMobile, connected, publicKey }) => {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('leaderboard');
  const [user, setUser] = useState(null);
  const [userVotes, setUserVotes] = useState(new Set());
  const [boostToken, setBoostToken] = useState(null);
  const [selectedToken, setSelectedToken] = useState(null);

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
      Swal.fire('Success!', 'Vote cast successfully! 🗳️', 'success');
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

        {viewMode === 'leaderboard' && <LeaderboardView tokens={tokens} onVote={handleVote} onBoost={handleBoost} canVote={connected && !!user && !!publicKey} userVotes={userVotes} isMobile={isMobile} onItemClick={handleItemClick} />}
        {viewMode === 'bubble' && <BubbleView tokens={tokens} onVote={handleVote} onBoost={handleBoost} canVote={connected && !!user && !!publicKey} userVotes={userVotes} isMobile={isMobile} onItemClick={handleItemClick} />}
        {viewMode === 'treemap' && <TreeMapView tokens={tokens} onVote={handleVote} onBoost={handleBoost} canVote={connected && !!user && !!publicKey} userVotes={userVotes} isMobile={isMobile} onItemClick={handleItemClick} />}
      </div>
      <div className="sidebar">
        <div className="ai-indicator">
          <div className="ai-pulse"></div>
          <span>🤖 AI POWERED</span>
        </div>
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