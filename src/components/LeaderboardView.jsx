// src/components/LeaderboardView.js
import React, { useState, useEffect } from 'react';
import { searchTokens } from '../utils/api';

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

export default LeaderboardView;