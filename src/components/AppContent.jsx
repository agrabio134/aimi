// src/components/AppContent.jsx (fixed import)
import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'; // Named import
import Dashboard from './Dashboard';

const AppContent = () => {
  const [isMobile, setIsMobile] = useState(false);
  const { connected, publicKey } = useWallet();

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="app">
      <header>
        <div className="ca-header">CA: SOON</div>
        <div className="nav-section">
          <div className="logo">
            <h1>🚀 AIMI</h1>
            <span>AI Meme Index</span>
          </div>
          <WalletMultiButton />
        </div>
      </header>
      <Dashboard isMobile={isMobile} connected={connected} publicKey={publicKey} />
    </div>
  );
};

export default AppContent;