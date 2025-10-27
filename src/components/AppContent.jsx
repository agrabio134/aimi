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
            <div className="logo-item">
              <img src="logo-square.jpg" alt="Polymi Logo"
                style={{ width: '50px', height: '50px', borderRadius: '25px' }}
              />
            </div>
            <div className="logo-item">

              <h1> POLYMI</h1>
              <span>POLY Meme Index</span>
            </div>

          </div>
          <WalletMultiButton />
        </div>
      </header>
      <Dashboard isMobile={isMobile} connected={connected} publicKey={publicKey} />
    </div>
  );
};

export default AppContent;