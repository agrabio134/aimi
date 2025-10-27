import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'; // Named import
import Dashboard from './Dashboard';
//fontawesome icon twitter 
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXTwitter } from '@fortawesome/free-brands-svg-icons';
import Swal from 'sweetalert2';



const AppContent = () => {
  const [isMobile, setIsMobile] = useState(false);
  const { connected, publicKey } = useWallet();

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  const copyCa = () => {
    return () => {
      navigator.clipboard.writeText('SOON');
      Swal.fire({
        title: 'Contract Address Copied!',
        text: 'The contract address has been copied to your clipboard.',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false,
      });
    };
  }

  return (
    <div className="app">
      <header>
        <div className="ca-header" onClick={copyCa()}>CA: SOON</div>

        <div className="nav-section">
          <div className="logo">
            <div className="logo-item">
              <img src="logo-square.png" alt="Polymi Logo"
                style={{ width: '50px', height: '50px', borderRadius: '25px' }}
              />
            </div>
            <div className="logo-item">

              <h1> POLYMI</h1>
              <span>POLY Meme Index</span>
            </div>

          </div>
          <div className="nav-right">
            <a href="https://x.com/polymi_ai" target="_blank" rel="noopener noreferrer">
              <FontAwesomeIcon icon={faXTwitter} />
            </a>
            <WalletMultiButton />
          </div>

        </div>
      </header>
      <Dashboard isMobile={isMobile} connected={connected} publicKey={publicKey} />
    </div>
  );
};

export default AppContent;