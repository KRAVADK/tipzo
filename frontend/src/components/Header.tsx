import { useState, useEffect } from "react";
import type { FC } from "react";
import { Link, useLocation } from "react-router-dom";
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { WalletAdapterNetwork, DecryptPermission } from "@demox-labs/aleo-wallet-adapter-base";
import type { WalletName } from "@demox-labs/aleo-wallet-adapter-base";
import { logger } from "../utils/logger";
import "./Header.css";

interface HeaderProps {
    programId: string;
}

const WalletIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
        <path d="M4 6v12a2 2 0 0 0 2 2h14v-4" />
        <path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z" />
    </svg>
);

export const Header: FC<HeaderProps> = ({ programId }) => {
    const { publicKey, disconnect, connecting, select, wallets, requestRecords, connect, wallet } = useWallet();
    const [showModal, setShowModal] = useState(false);
    const [showInstructions, setShowInstructions] = useState(false);
    const [walletAddress, setWalletAddress] = useState<string | null>(null);
    const location = useLocation();
    const network = WalletAdapterNetwork.TestnetBeta;

    // Check if first time connecting
    useEffect(() => {
        const hasSeenInstructions = localStorage.getItem("donatu_seen_wallet_instructions");
        if (!hasSeenInstructions && !publicKey) {
            // Don't show automatically, only when user clicks connect
        }
    }, [publicKey]);

    // Animate wallet address appearance and save connection state
    useEffect(() => {
        if (publicKey) {
            setWalletAddress(publicKey);
            logger.wallet.connected(publicKey);
            localStorage.setItem("wallet_connected", "true");
            localStorage.setItem("wallet_address", publicKey);
            // Save wallet adapter name for auto-reconnect
            if (wallet?.adapter?.name) {
                localStorage.setItem("wallet_adapter", wallet.adapter.name);
            }
        } else {
            setWalletAddress(null);
            // Don't remove on disconnect - keep for auto-reconnect
            // localStorage.removeItem("wallet_connected");
            // localStorage.removeItem("wallet_address");
        }
    }, [publicKey, wallet]);

    const handleConnect = async (adapterName: string) => {
        const adapter = wallets.find(w => w.adapter.name === adapterName)?.adapter;
        if (!adapter) return;

        // Check if wallet is installed
        if (adapterName === "Leo Wallet" && !(window as any).leoWallet) {
            setShowInstructions(true);
            setShowModal(false);
            return;
        }

        try {
            logger.wallet.connecting();
            await adapter.connect(DecryptPermission.OnChainHistory, network, [programId]);
            select(adapterName as WalletName);
            setShowModal(false);
            setShowInstructions(false);
            localStorage.setItem("donatu_seen_wallet_instructions", "true");
        } catch (e) {
            logger.error("Wallet Connection", e instanceof Error ? e.message : String(e));
            const errorMsg = e instanceof Error ? e.message : String(e);
            if (errorMsg.includes("NETWORK_NOT_GRANTED")) {
                alert(`Connection failed: Incorrect Network.\nPlease switch your Leo Wallet to '${network}' and try again.`);
            } else {
                alert("Connection failed: " + errorMsg);
            }
        }
    };

    const handleDisconnect = () => {
        disconnect();
        logger.wallet.disconnected();
        // Remove connection state on manual disconnect
        localStorage.removeItem("wallet_connected");
        localStorage.removeItem("wallet_address");
        localStorage.removeItem("wallet_adapter");
    };

    const isActive = (path: string) => location.pathname === path;

    return (
        <>
            <header className="header">
                <div className="header-container">
                    <Link to="/" className="logo">
                        <div className="logo-icon"></div>
                        <span className="logo-text">DON<span className="logo-highlight">ATU</span></span>
                    </Link>

                    <nav className="nav">
                        <Link to="/" className={`nav-link ${isActive("/") ? "active" : ""}`}>
                            Home
                        </Link>
                        {publicKey && (
                            <>
                                <Link to="/history" className={`nav-link ${isActive("/history") ? "active" : ""}`}>
                                    History
                                </Link>
                                <Link to={`/profile/${publicKey}`} className={`nav-link ${isActive(`/profile/${publicKey}`) ? "active" : ""}`}>
                                    My Profile
                                </Link>
                            </>
                        )}
                    </nav>

                    <div className="wallet-section">
                        {publicKey ? (
                            <div className="wallet-info wallet-connected">
                                <span className="status-dot connected"></span>
                                <div className={`wallet-address ${walletAddress ? "fade-in-slide" : ""}`}>
                                    {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
                                </div>
                                <button onClick={handleDisconnect} className="wallet-button disconnect">
                                    Disconnect
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="wallet-status-indicator disconnected" title="Wallet Disconnected"></div>
                                <button
                                    onClick={() => setShowModal(true)}
                                    className="wallet-button connect"
                                    disabled={connecting}
                                >
                                    <WalletIcon />
                                    <span>{connecting ? "Connecting..." : "Connect Wallet"}</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </header>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h3 className="modal-title">Select Wallet</h3>
                        <div className="wallet-options">
                            {wallets.map((w) => (
                                <button
                                    key={w.adapter.name}
                                    onClick={() => handleConnect(w.adapter.name)}
                                    className="wallet-option"
                                >
                                    <span>{w.adapter.name}</span>
                                    {w.readyState === "Installed" && (
                                        <span className="wallet-status">Detected</span>
                                    )}
                                </button>
                            ))}
                            <button onClick={() => setShowModal(false)} className="cancel-button">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showInstructions && (
                <div className="modal-overlay" onClick={() => setShowInstructions(false)}>
                    <div className="modal-content instructions-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">How to Connect Leo Wallet</h3>
                            <button
                                className="close-button"
                                onClick={() => setShowInstructions(false)}
                            >
                                ×
                            </button>
                        </div>
                        <div className="instructions-content">
                            <ol className="instructions-list">
                                <li>
                                    <strong>Install Leo Wallet</strong>
                                    <p>Download and install the Leo Wallet browser extension from <a href="https://www.aleo.org/get-started" target="_blank" rel="noopener noreferrer">aleo.org</a></p>
                                </li>
                                <li>
                                    <strong>Create or Import Wallet</strong>
                                    <p>Set up your wallet in the extension and make sure you're on <strong>Testnet</strong></p>
                                </li>
                                <li>
                                    <strong>Connect</strong>
                                    <p>Click "Connect Wallet" again and select Leo Wallet from the list</p>
                                </li>
                            </ol>
                            <button
                                className="btn-primary"
                                onClick={() => {
                                    setShowInstructions(false);
                                    setShowModal(true);
                                }}
                            >
                                Got it, let's connect
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

