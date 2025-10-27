// src/App.jsx (no changes needed, but ensure globals are set)
import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl, Transaction, SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import Swal from 'sweetalert2';
import './App.css';
import '@solana/wallet-adapter-react-ui/styles.css';

// Import components
import Dashboard from './components/Dashboard';
import AppContent from './components/AppContent'; 
import BubbleView from './components/BubbleView';
import TreeMapView from './components/TreeMapView';
import MobileActionModal from './components/MobileActionModal';
import LeaderboardView from './components/LeaderboardView';
import BoostModal from './components/BoostModal';
import TweetModal from './components/TweetModal';
import NewsSection from './components/NewsSection';
import TrendingBar from './components/TrendingBar';

// Import utils and constants
import { fetchTokens, searchTokens, fetchTweets, calculateScore } from './utils/api';
import { BOOST_PACKAGES, TREASURY_WALLET } from './constants/config';

const firebaseConfig = {
  apiKey: "AIzaSyDSsgYNlY8nrjgZCDyVjqmbTDMy1hqOado",
  authDomain: "aimi-3e35a.firebaseapp.com",
  projectId: "aimi-3e35a",
  storageBucket: "aimi-3e35a.firebasestorage.app",
  messagingSenderId: "917880354279",
  appId: "1:917880354279:web:6928164cb1e8f337fe3942"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Make globals available to components (in a real app, use Context)
window.firebase = { app, auth, db };
window.constants = { TREASURY_WALLET, BOOST_PACKAGES };
window.utils = { fetchTokens, searchTokens, fetchTweets, calculateScore, LAMPORTS_PER_SOL, PublicKey, Transaction, SystemProgram };
window.Swal = Swal;

export default function App() {
  const endpoints = useMemo(() => [
    'https://api.mainnet-beta.solana.com',
    'https://solana-rpc.publicnode.com',
    'https://solana.drpc.org',
    'https://solana.lavenderfive.com/',
    'https://solana.api.onfinality.io/public',
    'https://public.rpc.solanavibestation.com/',
    'https://solana.therpc.io',
    'https://solana-mainnet.rpc.extrnode.com',
    'https://solana.public-rpc.com',
    'https://rpc.ankr.com/solana'
  ], []);

  const randomEndpoint = useMemo(() => endpoints[Math.floor(Math.random() * endpoints.length)], [endpoints]);

  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={randomEndpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AppContent />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}