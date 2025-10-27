// src/components/TreeMapView.js
import React, { useState, useEffect, useRef } from 'react';

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
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = 'none';
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

export default TreeMapView;