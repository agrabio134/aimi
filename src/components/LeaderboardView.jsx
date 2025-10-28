// src/components/LeaderboardView.jsx
import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faVoteYea, faRocket, faTrophy, faSync  } from '@fortawesome/free-solid-svg-icons';
import { searchTokens } from '../utils/api';

const LeaderboardView = ({ tokens, onVote, onBoost, canVote, userVotes, isMobile, onItemClick }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const go = async () => {
      if (!searchTerm.trim() || searchTerm.length < 2) { setSearchResults([]); setIsSearching(false); return; }
      setIsSearching(true);
      const r = await searchTokens(searchTerm);
      setSearchResults(r);
      setIsSearching(false);
    };
    go();
  }, [searchTerm]);

  const display = searchTerm.trim() && searchTerm.length >= 2 ? searchResults : tokens;

  return (
    <div className="leaderboard">
      <h2 className="gradient-heading mb-3 d-flex align-items-center gap-2">
        <FontAwesomeIcon icon={faTrophy} />
        AI Meme Index Leaderboard
      </h2>

      {/* Search */}
      <div className="search-container position-relative mb-3">
        <input
          placeholder="Search CA / ticker / name…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="search-input w-100"
        />
        {isSearching && <span className="search-loading"><FontAwesomeIcon icon={faSync} spin /> Searching…</span>}
      </div>

      {/* List */}
      <div className="leaderboard-list">
        {display.slice(0, 50).map((t, i) => {
          const voted = userVotes.has(t.id);
          return (
            <div
              key={t.id}
              className={`leaderboard-item ${voted ? 'voted' : ''} ${t.boost?.golden ? 'golden' : ''} ${isMobile ? 'mobile-clickable' : ''}`}
              onClick={isMobile ? () => onItemClick(t) : undefined}
            >
              {/* Rank */}
              <div className="item-rank">
                <span className="rank-number">#{i + 1}</span>
                {t.boost && <span className="rank-boost">×{t.boost.multiplier}</span>}
              </div>

              {/* Token */}
              <div className="item-token">
                {t.logo && <img src={t.logo} alt={t.symbol} />}
                <div>
                  <div className="token-symbol">{t.symbol}</div>
                  <div className="token-name">{t.name}</div>
                </div>
              </div>

              {/* Score */}
              <div className="item-score">{t.memeScore.toFixed(1)}</div>

              {/* Stats */}
              <div className="item-stats">
                <span className={t.priceChange >= 0 ? 'positive' : 'negative'}>
                  {t.priceChange >= 0 ? '+' : ''}{t.priceChange.toFixed(2)}%
                </span>
                <span>${(t.volume24h / 1000).toFixed(0)}K vol</span>
              </div>

              {/* Votes */}
              <div className="item-votes"><FontAwesomeIcon icon={faVoteYea} /> {t.votes}</div>

              {/* Desktop actions */}
              {!isMobile && (
                <div className="item-actions">
                  <button
                    className={`vote-btn ${voted ? 'voted' : ''}`}
                    onClick={e => { e.stopPropagation(); onVote(t); }}
                    disabled={!canVote}
                  >
                    {voted ? 'Check' : <FontAwesomeIcon icon={faVoteYea} />}
                  </button>
                  <button className="boost-btn-small" onClick={e => { e.stopPropagation(); onBoost(t); }}>
                    <FontAwesomeIcon icon={faRocket} />
                  </button>
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