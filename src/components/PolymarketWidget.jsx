// src/components/PolymarketWidget.jsx
import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChartLine,
  faRocket,
  faFire,
  faExclamationTriangle,
  faDollarSign,
  faCalendarAlt,
} from '@fortawesome/free-solid-svg-icons';
import { getMemecoinMarkets, formatMarketForDisplay } from '../utils/polymarket';

const PolymarketWidget = ({ onMarketClick }) => {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMarkets();
    const interval = setInterval(loadMarkets, 60_000);
    return () => clearInterval(interval);
  }, []);

  const loadMarkets = async () => {
    try {
      const data = await getMemecoinMarkets({ limit: 5 });
      const formatted = data
        .map(formatMarketForDisplay)
        .filter(m => m.active);
      setMarkets(formatted);
    } catch (e) {
      console.error('Widget load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const sentimentColor = score => (score >= 70 ? '#14F195' : score >= 50 ? '#FFD700' : '#ff4d4d');
  const sentimentIcon = score => (score >= 70 ? faRocket : score >= 50 ? faFire : faExclamationTriangle);

  if (loading) {
    return (
      <div style={{ background: '#1a1f2e', borderRadius: '8px', padding: '8px', marginBottom: '16px' }}>
        <div style={{ textAlign: 'center', padding: '12px', color: '#8b8b8b', fontSize: '12px' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 8px',
          background: 'linear-gradient(135deg, rgba(153,69,255,.1), rgba(20,241,149,.1))',
          borderRadius: '6px',
          border: '1px solid #9945FF',
          marginBottom: '8px',
          fontSize: '13px',
          fontWeight: '600',
        }}
      >
        <div
          style={{
            width: '8px',
            height: '8px',
            background: '#14F195',
            borderRadius: '50%',
            animation: 'pulse 2s infinite',
          }}
        />
        <FontAwesomeIcon icon={faChartLine} />
        Memecoin Live
      </div>

      {/* Markets */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {markets.map(m => (
          <div
            key={m.id}
            onClick={() => {
              // FIXED: Use slug for URL
              const eventUrl = m.slug ? `https://polymarket.com/event/${m.slug}` : `https://polymarket.com/event?query=${encodeURIComponent(m.question)}`;
              window.open(eventUrl, '_blank');
            }}
            style={{
              padding: '6px 8px',
              background: '#1a1f2e',
              borderRadius: '6px',
              borderLeft: `3px solid ${sentimentColor(m.sentiment.score)}`,
              cursor: 'pointer',
              transition: 'all .2s',
              fontSize: '12px',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#252a3a';
              e.currentTarget.style.transform = 'translateX(2px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#1a1f2e';
              e.currentTarget.style.transform = 'translateX(0)';
            }}
          >
            {/* Question */}
            <div
              style={{
                color: '#fff',
                fontWeight: '500',
                marginBottom: '4px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {m.question}
            </div>

            {/* Score + Prices */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <FontAwesomeIcon icon={sentimentIcon(m.sentiment.score)} style={{ fontSize: '13px' }} />
                <span style={{ color: sentimentColor(m.sentiment.score), fontWeight: '700' }}>
                  {m.sentiment.score}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', fontSize: '11px' }}>
                <span style={{ color: '#14F195', fontWeight: '600' }}>Y: {m.sentiment.yesPrice}¢</span>
                <span style={{ color: '#ff4d4d', fontWeight: '600' }}>N: {m.sentiment.noPrice}¢</span>
              </div>
            </div>

            {/* Volume + End */}
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8b8b8b', fontSize: '10px', marginTop: '2px' }}>
              <span>
                <FontAwesomeIcon icon={faDollarSign} /> ${(m.volume / 1000).toFixed(1)}K
              </span>
              <span>
                <FontAwesomeIcon icon={faCalendarAlt} /> {m.endDate}
              </span>
            </div>
          </div>
        ))}
      </div>

      {markets.length === 0 && (
        <div style={{ textAlign: 'center', padding: '12px', color: '#8b8b8b', fontSize: '12px' }}>
          No active memecoin markets
        </div>
      )}
    </div>
  );
};

export default PolymarketWidget;