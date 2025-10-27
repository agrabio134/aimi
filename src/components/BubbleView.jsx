// src/components/BubbleView.js
import React, { useState, useEffect, useRef, useCallback } from 'react';

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

export default BubbleView;