// src/components/MobileActionModal.js
import React from 'react';

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

export default MobileActionModal;