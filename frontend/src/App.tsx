import React, { useState, useMemo } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { WalletProvider, useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { LeoWalletAdapter } from "@demox-labs/aleo-wallet-adapter-leo";
import { PuzzleWalletAdapter } from "aleo-adapters";
import { DecryptPermission, WalletAdapterNetwork, WalletName } from "@demox-labs/aleo-wallet-adapter-base";
import { LayoutGrid, User, History as HistoryIcon, Menu, X, Wallet, LogOut } from 'lucide-react';

import Landing from './views/Landing';
import Explore from './views/Explore';
import History from './views/History';
import Profile from './views/Profile';
import { NeoButton, NeoCard } from './components/NeoComponents';
import { PROGRAM_ID } from './deployed_program';

// --- Wallet Modal Component ---
interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (adapterName: string) => void;
  wallets: any[];
}

const WalletModal: React.FC<WalletModalProps> = ({ isOpen, onClose, onConnect, wallets }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <NeoCard color="white" className="w-full max-w-md relative animate-in fade-in zoom-in duration-200">
        <button onClick={onClose} className="absolute top-4 right-4 hover:bg-gray-100 p-1 rounded-full transition-colors">
          <X size={24} />
        </button>
        <h2 className="text-2xl font-black mb-6 flex items-center gap-2">
          <Wallet className="text-tipzo-orange" /> Connect Wallet
        </h2>
        <div className="space-y-4">
          {wallets.map((wallet) => (
            <button
              key={wallet.adapter.name}
              onClick={() => onConnect(wallet.adapter.name)}
              className="w-full flex items-center justify-between p-4 border-2 border-black hover:bg-gray-50 transition-colors font-bold text-lg group shadow-neo-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:bg-gray-100"
            >
              <div className="flex items-center gap-3">
                <img src={wallet.adapter.icon} alt={wallet.adapter.name} className="w-8 h-8" />
                {wallet.adapter.name}
              </div>
              <span className="text-sm bg-tipzo-green px-2 py-0.5 border border-black hidden group-hover:inline-block">
                Connect
              </span>
            </button>
          ))}
        </div>
        <p className="mt-6 text-sm text-gray-500 font-medium text-center">
          By connecting, you agree to our Terms of Service and Privacy Policy.
        </p>
      </NeoCard>
    </div>
  );
};

// --- Navbar Component ---
const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  
  // Wallet hooks
  const { publicKey, disconnect, select, wallets } = useWallet();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const network = WalletAdapterNetwork.TestnetBeta;

  const handleConnect = async (adapterName: string) => {
    const adapter = wallets.find(w => w.adapter.name === adapterName)?.adapter;
    if (adapter) {
        try {
            await adapter.connect(DecryptPermission.OnChainHistory, network, [PROGRAM_ID]);
            select(adapterName as WalletName);
            setShowWalletModal(false);
        } catch (error) {
            console.error("Connection failed", error);
            alert("Connection failed: " + (error as any).message);
        }
    }
  };

  const navItems = [
    { path: '/explore', label: 'Explore', icon: <LayoutGrid size={20} /> },
    { path: '/history', label: 'History', icon: <HistoryIcon size={20} /> },
    { path: '/profile', label: 'Profile', icon: <User size={20} /> },
  ];

  const isActive = (path: string) => location.pathname === path;

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <>
      <nav className="sticky top-0 z-50 bg-[#fafaf9] border-b-2 border-black px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2 group">
             <div className="w-10 h-10 bg-tipzo-yellow border-2 border-black flex items-center justify-center font-black text-xl shadow-neo-sm group-hover:rotate-12 transition-transform">
               T
             </div>
             <span className="text-3xl font-black tracking-tighter">TIPZO</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <Link 
                key={item.path} 
                to={item.path}
                className={`flex items-center gap-2 font-bold text-lg transition-colors ${isActive(item.path) ? 'text-black underline decoration-4 underline-offset-4 decoration-tipzo-green' : 'text-gray-500 hover:text-black'}`}
              >
                {item.icon} {item.label}
              </Link>
            ))}
            
            {publicKey ? (
                <div className="flex items-center gap-2">
                    <NeoButton size="sm" variant="secondary" className="flex items-center gap-2" onClick={() => {navigator.clipboard.writeText(publicKey); alert('Address copied!');}}>
                        <Wallet size={16} />
                        {truncateAddress(publicKey)}
                    </NeoButton>
                    <button onClick={() => disconnect()} className="p-2 border-2 border-black bg-red-400 hover:bg-red-500 text-white shadow-neo-sm transition-transform active:translate-y-1 active:shadow-none" title="Disconnect">
                        <LogOut size={20} />
                    </button>
                </div>
            ) : (
                <NeoButton size="sm" onClick={() => setShowWalletModal(true)}>Connect Wallet</NeoButton>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button className="md:hidden" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? <X size={32} /> : <Menu size={32} />}
          </button>
        </div>

        {/* Mobile Nav */}
        {isOpen && (
          <div className="md:hidden absolute top-full left-0 w-full bg-[#fafaf9] border-b-2 border-black p-6 flex flex-col gap-4 shadow-neo">
            {navItems.map((item) => (
              <Link 
                key={item.path} 
                to={item.path}
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-4 text-2xl font-bold p-2 hover:bg-gray-100 border-2 border-transparent hover:border-black"
              >
                {item.icon} {item.label}
              </Link>
            ))}
            {publicKey ? (
                <div className="flex flex-col gap-2 mt-4">
                    <div className="font-mono p-2 border-2 border-black bg-white text-center text-sm">{publicKey}</div>
                    <NeoButton className="w-full" variant="danger" onClick={() => disconnect()}>Disconnect</NeoButton>
                </div>
            ) : (
                <NeoButton className="w-full mt-4" onClick={() => { setIsOpen(false); setShowWalletModal(true); }}>Connect Wallet</NeoButton>
            )}
          </div>
        )}
      </nav>

      <WalletModal 
        isOpen={showWalletModal} 
        onClose={() => setShowWalletModal(false)} 
        onConnect={handleConnect}
        wallets={wallets}
      />
    </>
  );
};

const Footer: React.FC = () => (
  <footer className="border-t-2 border-black bg-white py-12 px-6 mt-auto">
    <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
      <div className="text-center md:text-left">
        <h2 className="text-2xl font-black">TIPZO</h2>
        <p className="font-medium text-gray-500">© 2024 Tipzo Inc. Powered by Aleo.</p>
      </div>
      <div className="flex gap-6 font-bold">
        <a href="#" className="hover:text-tipzo-orange">Twitter</a>
        <a href="#" className="hover:text-tipzo-green">Discord</a>
        <a href="#" className="hover:text-tipzo-pink">GitHub</a>
      </div>
    </div>
  </footer>
);

const AppContent: React.FC = () => {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="min-h-screen flex flex-col font-sans text-black selection:bg-tipzo-pink selection:text-black">
        <Navbar />
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<Landing onGetStarted={() => window.location.hash = '#/explore'} />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/history" element={<History />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
};

const App: React.FC = () => {
    const network = WalletAdapterNetwork.TestnetBeta;

    const wallets = useMemo(
        () => [
            new LeoWalletAdapter({
                appName: "TipZo - Aleo Donations",
            }),
            new PuzzleWalletAdapter({
                appName: "TipZo - Aleo Donations",
                programIdPermissions: {
                    [WalletAdapterNetwork.TestnetBeta]: [PROGRAM_ID]
                }
            }),
        ],
        []
    );

    return (
        <WalletProvider
            wallets={wallets}
            decryptPermission={DecryptPermission.OnChainHistory}
            network={network}
            autoConnect
        >
            <AppContent />
        </WalletProvider>
    );
};

export default App;
