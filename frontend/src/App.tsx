import React, { useState, useMemo, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { WalletProvider, useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { LeoWalletAdapter } from "@demox-labs/aleo-wallet-adapter-leo";
import { DecryptPermission, WalletAdapterNetwork, WalletName } from "@demox-labs/aleo-wallet-adapter-base";
import { LayoutGrid, User, History as HistoryIcon, Menu, X, Wallet, LogOut, Moon, Sun, Bell } from 'lucide-react';

import Landing from './views/Landing';
import History from './views/History';
import Profile from './views/Profile';
import QuickDonate from './views/QuickDonate';
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
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  type NotificationItem = {
    id: string;
    type: 'sent' | 'received';
    message: string;
    timestamp: number;
    read: boolean;
  };
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifPage, setNotifPage] = useState(0);
  
  // Wallet hooks
  const { publicKey, disconnect, select, wallets } = useWallet();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const network = WalletAdapterNetwork.TestnetBeta;

  // Listen for custom event to open wallet modal
  useEffect(() => {
    const handleOpenWalletModal = () => {
      setShowWalletModal(true);
    };
    window.addEventListener('openWalletModal', handleOpenWalletModal);
    return () => {
      window.removeEventListener('openWalletModal', handleOpenWalletModal);
    };
  }, []);

  // Load and apply theme on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('tipzo_theme');
      const initial: 'light' | 'dark' = stored === 'dark' ? 'dark' : 'light';
      setTheme(initial);
      if (initial === 'dark') {
        document.body.classList.add('tipzo-dark');
      } else {
        document.body.classList.remove('tipzo-dark');
      }
    } catch {
      // ignore
    }
  }, []);

  // Load notifications from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('tipzo_notifications');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const normalized: NotificationItem[] = parsed.map((n: any) => ({
            id: String(n.id || `${Date.now()}-${Math.random()}`),
            type: n.type === 'received' ? 'received' : 'sent',
            message: String(n.message || ''),
            timestamp: typeof n.timestamp === 'number' ? n.timestamp : Date.now(),
            read: !!n.read,
          }));
          setNotifications(normalized);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Listen for global donation notifications
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      if (!detail) return;
      const item: NotificationItem = {
        id: typeof detail.id === 'string' && detail.id ? detail.id : `${Date.now()}-${Math.random()}`,
        type: detail.type === 'received' ? 'received' : 'sent',
        message: String(detail.message || ''),
        timestamp: typeof detail.timestamp === 'number' ? detail.timestamp : Date.now(),
        read: false,
      };
      setNotifications(prev => {
        const next = [item, ...prev].slice(0, 20);
        try {
          localStorage.setItem('tipzo_notifications', JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      setNotifPage(0);
    };
    window.addEventListener('tipzo-notification', handler as EventListener);
    return () => {
      window.removeEventListener('tipzo-notification', handler as EventListener);
    };
  }, []);

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      if (next === 'dark') {
        document.body.classList.add('tipzo-dark');
      } else {
        document.body.classList.remove('tipzo-dark');
      }
      try {
        localStorage.setItem('tipzo_theme', next);
      } catch {
        // ignore
      }
      return next;
    });
  };

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
    { path: '/explore', label: 'Explore', icon: <LayoutGrid size={20} />, disabled: true },
    { path: '/quick-donate', label: 'Quick Donate', icon: <LayoutGrid size={20} /> },
    { path: '/history', label: 'History', icon: <HistoryIcon size={20} /> },
    { path: '/profile', label: 'Profile', icon: <User size={20} /> },
  ];

  const isActive = (path: string) => location.pathname === path;

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const pageSize = 3;
  const totalPages = Math.max(1, Math.ceil(notifications.length / pageSize));
  const safePage = Math.min(notifPage, totalPages - 1);
  if (safePage !== notifPage) {
    setNotifPage(safePage);
  }
  const startIndex = safePage * pageSize;
  const visibleNotifications = notifications.slice(startIndex, startIndex + pageSize);
  const unreadCount = notifications.filter(n => !n.read).length;

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
            {navItems.map((item) => {
              const isDisabled = (item as any).disabled;
              if (isDisabled) {
                return (
                  <span
                    key={item.path}
                    className="flex items-center gap-2 font-bold text-lg text-gray-400 cursor-not-allowed opacity-60"
                    title="Temporarily unavailable"
                  >
                    {item.icon} {item.label}
                  </span>
                );
              }
              const active = isActive(item.path);
              const activeColor = theme === 'dark' ? 'text-white' : 'text-black';
              const inactiveColor = theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-500 hover:text-black';
              return (
                <Link 
                  key={item.path} 
                  to={item.path}
                  className={`flex items-center gap-2 font-bold text-lg transition-colors ${active ? `${activeColor} underline decoration-4 underline-offset-4 decoration-tipzo-green` : inactiveColor}`}
                >
                  {item.icon} {item.label}
                </Link>
              );
            })}
            {/* Notifications bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsNotifOpen(prev => !prev)}
                className="mr-1 p-2 border-2 border-black bg-white hover:bg-gray-100 shadow-neo-sm flex items-center justify-center transition-transform active:translate-y-[2px] active:shadow-none"
                title="Notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-black border border-black">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {isNotifOpen && (
                <div className="absolute right-0 mt-2 w-80 z-40">
                  <NeoCard color="white" className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-black text-sm">Notifications</span>
                      {unreadCount > 0 && (
                        <button
                          className="text-[10px] font-bold underline"
                          onClick={() => {
                            setNotifications(prev => {
                              const next = prev.map(n => ({ ...n, read: true }));
                              try {
                                localStorage.setItem('tipzo_notifications', JSON.stringify(next));
                              } catch {
                                // ignore
                              }
                              return next;
                            });
                            try {
                              // keep history, just mark as read
                            } catch {
                              // ignore
                            }
                          }}
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <p className="text-xs text-gray-500 font-medium">No notifications yet.</p>
                    ) : (
                      <>
                        <ul className="space-y-2 max-h-52 overflow-hidden">
                          {visibleNotifications.map((n) => (
                            <li
                              key={n.id}
                              className={`border-2 border-black bg-white px-2 py-1 text-xs font-medium shadow-neo-sm cursor-pointer ${n.read ? 'opacity-70' : ''}`}
                              onClick={() => {
                                setNotifications(prev => {
                                  const next = prev.map(item =>
                                    item.id === n.id ? { ...item, read: true } : item
                                  );
                                  try {
                                    localStorage.setItem('tipzo_notifications', JSON.stringify(next));
                                  } catch {
                                    // ignore
                                  }
                                  return next;
                                });
                              }}
                            >
                              <div className="flex justify-between gap-2">
                                <span className={n.type === 'received' ? 'text-green-700' : 'text-blue-700'}>
                                  {n.message}
                                </span>
                                {!n.read && (
                                  <span className="w-2 h-2 rounded-full bg-red-500 border border-black mt-[2px]" />
                                )}
                              </div>
                              <div className="text-[10px] text-gray-500 mt-0.5">
                                {new Date(n.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </div>
                            </li>
                          ))}
                        </ul>
                        {notifications.length > pageSize && (
                          <div className="flex items-center justify-between mt-2 text-[10px] font-semibold">
                            <button
                              className="px-2 py-0.5 border-2 border-black bg-white disabled:opacity-40"
                              disabled={safePage === 0}
                              onClick={() => setNotifPage(p => Math.max(0, p - 1))}
                            >
                              ↑ Newer
                            </button>
                            <span>
                              Page {safePage + 1} / {totalPages}
                            </span>
                            <button
                              className="px-2 py-0.5 border-2 border-black bg-white disabled:opacity-40"
                              disabled={safePage >= totalPages - 1}
                              onClick={() => setNotifPage(p => Math.min(totalPages - 1, p + 1))}
                            >
                              ↓ Older
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </NeoCard>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="mr-2 p-2 border-2 border-black bg-white hover:bg-gray-100 shadow-neo-sm flex items-center justify-center transition-transform active:translate-y-[2px] active:shadow-none"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
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
            {navItems.map((item) => {
              const isDisabled = (item as any).disabled;
              if (isDisabled) {
                return (
                  <div
                    key={item.path}
                    className="flex items-center gap-4 text-2xl font-bold p-2 border-2 border-dashed border-gray-400 text-gray-400 opacity-60 cursor-not-allowed"
                  >
                    {item.icon} {item.label}
                    <span className="ml-2 text-xs font-semibold uppercase tracking-wide">Soon</span>
                  </div>
                );
              }
              return (
                <Link 
                  key={item.path} 
                  to={item.path}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-4 text-2xl font-bold p-2 hover:bg-gray-100 border-2 border-transparent hover:border-black"
                >
                  {item.icon} {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-2 px-3 py-1 border-2 border-black bg-white hover:bg-gray-100 shadow-neo-sm text-sm font-semibold"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>
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
        <p className="font-medium text-gray-500">© 2026 Tipzo Inc. Powered by Aleo.</p>
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
            <Route path="/" element={<Landing onGetStarted={() => window.location.hash = '#/quick-donate'} />} />
            {/* Explore route kept for backward compatibility but reuses QuickDonate */}
            <Route path="/explore" element={<QuickDonate />} />
            <Route path="/quick-donate" element={<QuickDonate />} />
            <Route path="/history" element={<History />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/:address" element={<Profile />} />
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
