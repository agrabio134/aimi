// src/components/PolymarketView.jsx
import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChartLine, faCoins, faDog, faSearch, faSync, faExclamationTriangle,
  faDollarSign, faTrophy, faCalendarAlt, faTag,
} from '@fortawesome/free-solid-svg-icons';
import {
  getMemecoinMarkets,
  getCryptoMarkets,
  searchPolymarketMarkets,
  formatMarketForDisplay,
} from '../utils/polymarket';

const PolymarketView = ({ isMobile }) => {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [filter, setFilter] = useState('memecoins');

  /* ---------- LOAD MARKETS ---------- */
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let data = [];

      if (filter === 'crypto') {
        data = await getCryptoMarkets();
      } else {
        data = await getMemecoinMarkets({ limit: 50 });
      }

      setMarkets(data.map(formatMarketForDisplay));
      setLoading(false);
    };
    load();
  }, [filter]);

  /* ---------- SEARCH ---------- */
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!searchTerm.trim() || searchTerm.length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      const r = await searchPolymarketMarkets(searchTerm);
      setSearchResults(r.map(formatMarketForDisplay));
      setIsSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const display = searchTerm.trim() && searchTerm.length >= 2 ? searchResults : markets;

  const sentimentColor = s => (s >= 70 ? '#14F195' : s >= 50 ? '#FFD700' : '#ff4d4d');
  const sentimentIcon = s => (s >= 70 ? faDog : s >= 50 ? faCoins : faExclamationTriangle);

  /* ---------- RENDER ---------- */
  if (loading) {
    return (
      <div className="loading">
        <FontAwesomeIcon icon={faSync} spin size="2x" style={{ color: '#9945FF' }} />
        <p className="mt-2 text-muted">Loading memecoin markets…</p>
      </div>
    );
  }

  return (
    <div className="polymarket-view">
      {/* Header */}
      <h2 className="gradient-heading mb-3 d-flex align-items-center gap-2">
        <FontAwesomeIcon icon={faChartLine} />
        Memecoin Prediction Markets
      </h2>

      {/* Search */}
      <div className="position-relative mb-3">
        <input
          placeholder="Search BONK, WIF, Pump.fun, memecoin..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="search-input w-100"
        />
        {isSearching && (
          <span className="search-loading">
            <FontAwesomeIcon icon={faSync} spin /> Searching…
          </span>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="view-tabs mb-3">
        {[
          { id: 'memecoins', label: 'Memecoins', icon: faDog },
          { id: 'crypto', label: 'Crypto', icon: faCoins },
        ].map(t => (
          <button
            key={t.id}
            className={filter === t.id ? 'active' : ''}
            onClick={() => setFilter(t.id)}
          >
            <FontAwesomeIcon icon={t.icon} className="me-1" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Market Grid */}
      <div className={`grid ${isMobile ? 'grid-mobile' : 'grid-desktop'}`}>
        {display.map(m => (
          <div
            key={m.id}
            className="market-card"
            onClick={() => {
              // FIXED: Use slug for URL
              const eventUrl = m.slug ? `https://polymarket.com/event/${m.slug}` : `https://polymarket.com/event?query=${encodeURIComponent(m.question)}`;
              window.open(eventUrl, '_blank');
            }}
          >
            {/* Question */}
            <h3 className="market-question">{m.question}</h3>

            {/* Sentiment */}
            <div className="sentiment-box">
              <div className="sentiment-score">
                <span className="text-muted small">Meme Score</span>
                <div className="d-flex align-items-center gap-1" style={{ color: sentimentColor(m.sentiment.score) }}>
                  <FontAwesomeIcon icon={sentimentIcon(m.sentiment.score)} />
                  <strong>{m.sentiment.score}</strong>
                </div>
              </div>
              <div className="sentiment-confidence text-end">
                <span className="text-muted small">Confidence</span>
                <div className={
                  m.sentiment.confidence === 'High' ? 'text-success' :
                  m.sentiment.confidence === 'Medium' ? 'text-warning' : 'text-danger'
                }>
                  {m.sentiment.confidence}
                </div>
              </div>
            </div>

            {/* YES / NO */}
            <div className="yn-grid">
              <div className="yn yes">
                <div className="text-muted tiny">YES</div>
                <div className="text-success fw-bold">{m.sentiment.yesPrice}¢</div>
              </div>
              <div className="yn no">
                <div className="text-muted tiny">NO</div>
                <div className="text-danger fw-bold">{m.sentiment.noPrice}¢</div>
              </div>
            </div>

            {/* Stats */}
            <div className="stats-row">
              <span><FontAwesomeIcon icon={faDollarSign} /> ${(m.volume / 1000).toFixed(1)}K</span>
              <span><FontAwesomeIcon icon={faTrophy} /> ${(m.liquidity / 1000).toFixed(1)}K</span>
            </div>

            {/* End Date */}
            <div className="footer-row">
              <span className="text-muted">
                <FontAwesomeIcon icon={faCalendarAlt} /> {m.endDate}
              </span>
              {m.sentiment.memeBoost && (
                <span className="status-badge active">
                  {m.sentiment.memeBoost}
                </span>
              )}
            </div>

            {/* Tags */}
            {m.tags?.length > 0 && (
              <div className="tags mt-2">
                {m.tags.slice(0, 3).map((t, i) => (
                  <span key={i} className="tag">
                    <FontAwesomeIcon icon={faTag} /> {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty State */}
      {display.length === 0 && (
        <div className="text-center py-5 text-muted">
          <FontAwesomeIcon icon={faExclamationTriangle} size="2x" />
          <p className="mt-2">No active memecoin markets found</p>
          <p className="small">Try searching for BONK, WIF, or Pump.fun</p>
        </div>
      )}

      {/* Refresh */}
      <div className="text-center mt-4">
        <button onClick={() => window.location.reload()} className="refresh">
          <FontAwesomeIcon icon={faSync} /> Refresh
        </button>
      </div>
    </div>
  );
};

export default PolymarketView;