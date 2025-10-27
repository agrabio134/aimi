// src/components/BoostModal.js
import React, { useState } from 'react';
import { BOOST_PACKAGES } from '../constants/config';
import Swal from 'sweetalert2';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { addDoc, collection } from 'firebase/firestore';

const BoostModal = ({ token, isOpen, onClose }) => {
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [loading, setLoading] = useState(false);
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const TREASURY_WALLET = window.constants.TREASURY_WALLET;
  const db = window.firebase.db;

  const handleBoost = async () => {
    if (!publicKey || !selectedPackage) return;

    const result = await Swal.fire({
      title: 'Confirm Boost',
      text: `Boost ${token.symbol} with ${selectedPackage.label} for $${selectedPackage.price}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, boost!',
      cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    setLoading(true);
    try {
      const priceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      if (!priceRes.ok) throw new Error('Failed to fetch SOL price');
      const priceData = await priceRes.json();
      const solPrice = priceData.solana.usd;
      const lamports = Math.floor((selectedPackage.price / solPrice) * LAMPORTS_PER_SOL);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(TREASURY_WALLET),
          lamports,
        })
      );

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, 'confirmed');

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + selectedPackage.duration);

      await addDoc(collection(db, 'boosts'), {
        tokenId: token.id,
        multiplier: selectedPackage.multiplier,
        golden: selectedPackage.golden || false,
        expiresAt: expiresAt.toISOString(),
        txSignature: sig,
        boostedBy: publicKey.toString(),
        createdAt: new Date().toISOString()
      });

      Swal.fire('Success!', 'Boost activated! 🚀', 'success');
      onClose();
      window.location.reload();
    } catch (err) {
      Swal.fire('Error', 'Boost failed: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="boost-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🚀 Boost {token.symbol}</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="boost-packages">
          {BOOST_PACKAGES.map(pkg => (
            <div
              key={pkg.multiplier}
              className={`package ${selectedPackage?.multiplier === pkg.multiplier ? 'selected' : ''} ${pkg.golden ? 'golden' : ''}`}
              onClick={() => setSelectedPackage(pkg)}
            >
              <div className="pkg-label">{pkg.label}</div>
              <div className="pkg-price">${pkg.price}</div>
              <div className="pkg-duration">{pkg.duration}h</div>
              {pkg.golden && <div className="golden-badge">👑 GOLDEN TICKER</div>}
            </div>
          ))}
        </div>
        <button 
          className="confirm-boost-btn"
          onClick={handleBoost}
          disabled={!selectedPackage || loading}
        >
          {loading ? 'Processing...' : `Boost with ${selectedPackage?.label || '...'}`}
        </button>
      </div>
    </div>
  );
};

export default BoostModal;