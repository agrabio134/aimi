// src/components/TrendingBar.js
import React from 'react';

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

export default TrendingBar;