import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { WalletAdapterNetwork, Transaction } from "@demox-labs/aleo-wallet-adapter-base";
import { PROGRAM_ID } from "../deployed_program";
import { stringToField, formatAddress } from "../utils/aleo";
import { logger } from "../utils/logger";
import { requestTransactionWithRetry } from "../utils/walletUtils";
import { useDonationHistory } from "../hooks/useDonationHistory";
import { SuccessModal } from "../components/SuccessModal";
import "./Home.css";

const MAX_RETRIES = 3;

type WalletAdapterExtras = {
    requestTransaction?: (tx: Transaction) => Promise<string>;
    transactionStatus?: (txId: string) => Promise<string>;
};

export const Home = () => {
    const { publicKey, wallet } = useWallet();
    const adapter = wallet?.adapter as unknown as WalletAdapterExtras | undefined;
    const network = WalletAdapterNetwork.TestnetBeta;
    const navigate = useNavigate();
    const { sent } = useDonationHistory(publicKey);

    const [showQuickDonate, setShowQuickDonate] = useState(false);
    const [recipient, setRecipient] = useState("");
    const [amount, setAmount] = useState("");
    const [message, setMessage] = useState("");
    const [status, setStatus] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [successTxId, setSuccessTxId] = useState<string | undefined>();

    // Get popular users - removed (no localStorage, only wallet sync)
    // Popular users would require aggregating data from blockchain which is not efficient
    const popularUsers = useMemo(() => {
        // Return empty array - popular users feature disabled when using wallet-only sync
        return [];
    }, []);

    // Get recent recipients (last 5 users current user donated to) - from wallet records
    const recentRecipients = useMemo(() => {
        if (!publicKey || !sent || sent.length === 0) return [];

        try {
            const uniqueRecipients = new Map<string, { address: string; lastDonation: number; name?: string }>();

            sent.forEach((donation) => {
                if (donation.receiver && !uniqueRecipients.has(donation.receiver)) {
                    const profileKey = `tipzo_profile_${donation.receiver}`;
                    const profile = localStorage.getItem(profileKey);
                    const profileData = profile ? JSON.parse(profile) : {};
                    uniqueRecipients.set(donation.receiver, {
                        address: donation.receiver,
                        lastDonation: donation.timestamp,
                        name: profileData.name
                    });
                }
            });

            return Array.from(uniqueRecipients.values())
                .sort((a, b) => b.lastDonation - a.lastDonation)
                .slice(0, 5);
        } catch (e) {
            return [];
        }
    }, [publicKey, sent]);

    const handleQuickDonate = async () => {
        if (!publicKey) {
            alert("Please connect your wallet first");
            return;
        }

        if (!adapter?.requestTransaction) {
            alert("Wallet not connected");
            return;
        }

        if (!recipient || !amount) {
            alert("Please fill in recipient and amount");
            return;
        }

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            alert("Please enter a valid amount");
            return;
        }

        // Validate amount is not too large
        if (amountNum > 1000000) {
            alert("Amount too large. Maximum is 1,000,000 ALEO");
            return;
        }

        setIsProcessing(true);
        setStatus("Preparing donation transaction...");
        logger.donation.initiating(amountNum, recipient);

        try {
            // Convert ALEO to microcredits (1 ALEO = 1,000,000 microcredits)
            const microcredits = Math.floor(amountNum * 1_000_000);
            if (microcredits <= 0 || !isFinite(microcredits)) {
                throw new Error("Invalid amount conversion");
            }
            
            const amountU64 = BigInt(microcredits);
            const messageField = message ? stringToField(message) : stringToField("");

            // CRITICAL: First transfer tokens to recipient
            // transfer_public expects: (public recipient: address, public amount: u64)
            // Both parameters must be public - no .private suffix needed
            setStatus("Step 1/2: Transferring tokens...");
            logger.transaction.signing();
            
            // For transfer_public, amount should be public u64 (no .private suffix)
            const amountParam = amountU64.toString() + "u64";
            
            const transferTransaction = Transaction.createTransaction(
                publicKey,
                network,
                "credits.aleo",
                "transfer_public",
                [recipient, amountParam], // Both are public in transfer_public
                50000, // Minimal fee for transfer (0.05 ALEO)
                false
            );
            
            console.log("💰 Creating transfer transaction:", {
                recipient,
                amount: amountParam
            });
            
            setStatus("Please confirm the token transfer in your wallet...");
            console.log("[Contract] 🔐 Calling transfer_public()");
            const transferTxId = await requestTransactionWithRetry(adapter, transferTransaction, {
                onRetry: (attempt) => {
                    setStatus(`Waiting for wallet response... (Retry ${attempt}/${MAX_RETRIES})`);
                }
            });
            
            if (!transferTxId) {
                throw new Error("Token transfer was rejected or failed");
            }
            
            logger.transaction.confirmed(transferTxId);
            console.log("✅ Transfer confirmed:", transferTxId);
            
            // Wait a bit for transfer to be processed
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Then create donation record
            setStatus("Step 2/2: Creating donation record...");
            logger.transaction.signing();
            
            // New contract signature: send_donation(private recipient, private amount, private message, public timestamp)
            const timestamp = Math.floor(Date.now() / 1000);
            const timestampParam = BigInt(timestamp).toString() + "u64";
            
            // Private parameters need .private suffix
            const recipientPrivate = recipient + ".private";
            const amountPrivate = amountU64.toString() + "u64.private";
            const messagePrivate = messageField + ".private";
            
            console.log("[Contract] 🔐 Calling private send_donation()");
            console.log("📋 Creating donation transaction with params:", {
                recipient: recipientPrivate,
                amount: amountPrivate,
                message: messagePrivate.substring(0, 50) + "...",
                timestamp: timestampParam,
                amountNum: amountNum,
                microcredits: microcredits
            });

            const transaction = Transaction.createTransaction(
                publicKey,
                network,
                PROGRAM_ID,
                "send_donation",
                [recipientPrivate, amountPrivate, messagePrivate, timestampParam],
                50000, // Minimal fee for donation record (0.05 ALEO)
                false
            );

            setStatus("Please confirm the donation record in your wallet...");
            const txId = await requestTransactionWithRetry(adapter, transaction, {
                onRetry: (attempt) => {
                    setStatus(`Waiting for wallet response... (Retry ${attempt}/${MAX_RETRIES})`);
                }
            });

            if (txId) {
                logger.transaction.confirmed(txId);
                logger.donation.sent(txId);
                setSuccessTxId(txId);
                setShowSuccess(true);
                
                // Donation is saved in wallet records - no localStorage needed
                // History will sync automatically from wallet in 5 seconds
                console.log("✅ Donation sent! Will sync from wallet records automatically");
                // No need to save to recipient's localStorage - they will sync from blockchain
                
                // Trigger refresh event (recipient will sync from blockchain)
                window.dispatchEvent(new CustomEvent('donation-sent', { detail: { txId, transferTxId } }));
            } else {
                console.log("⚠️ Transaction already in history:", txId);
            }

            // Reset form
            setRecipient("");
            setAmount("");
            setMessage("");
            setShowQuickDonate(false);
            setStatus("");
        } catch (e: unknown) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            logger.transaction.failed(errorMsg);
            logger.error("Donation", errorMsg);
            if (errorMsg.includes("Permission") || errorMsg.includes("NOT_GRANTED")) {
                setStatus("Transaction rejected by user.");
            } else {
                setStatus("Error: " + errorMsg);
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSelectUser = (address: string) => {
        setRecipient(address);
    };

    return (
        <div className="home-page fade-in">
            <div className="hero-section">
                <h1 className="hero-title">
                    Send <span className="gradient-text">Private Donations</span> on Aleo
                </h1>
                <p className="hero-subtitle">
                    Fully encrypted, private donations. Just enter an address and donate.
                </p>
                <div className="hero-actions">
                    <button
                        className="btn-primary"
                        onClick={() => setShowQuickDonate(true)}
                        disabled={!publicKey}
                    >
                        Send Donation
                    </button>
                    {publicKey && (
                        <button
                            className="btn-secondary"
                            onClick={() => navigate(`/profile/${publicKey}`)}
                        >
                            My Profile
                        </button>
                    )}
                    {publicKey && (
                        <button
                            className="btn-secondary"
                            onClick={() => navigate("/history")}
                        >
                            History
                        </button>
                    )}
                </div>
            </div>

            <div className="features-grid">
                <div className="feature-card glass glass-hover">
                    <div className="feature-icon">🔒</div>
                    <h3>Fully Encrypted</h3>
                    <p>All donations are encrypted using zero-knowledge proofs. Only you and the recipient can see the details.</p>
                </div>
                <div className="feature-card glass glass-hover">
                    <div className="feature-icon">⚡</div>
                    <h3>Fast & Private</h3>
                    <p>Transactions are fast and completely private. No one can see who donated to whom or how much.</p>
                </div>
                <div className="feature-card glass glass-hover">
                    <div className="feature-icon">🌐</div>
                    <h3>Decentralized</h3>
                    <p>Built on Aleo blockchain. No central authority, no censorship, no intermediaries.</p>
                </div>
            </div>

            {showQuickDonate && (
                <div className="modal-overlay" onClick={() => !isProcessing && setShowQuickDonate(false)}>
                    <div className="modal-content quick-donate-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Send Donation</h2>
                            <button
                                className="close-button"
                                onClick={() => setShowQuickDonate(false)}
                                disabled={isProcessing}
                            >
                                ×
                            </button>
                        </div>
                        <div className="modal-body">
                            {recentRecipients.length > 0 && (
                                <div className="user-list-section">
                                    <label className="section-label">Recent Recipients (optional)</label>
                                    <div className="user-list">
                                        {recentRecipients.map((user) => (
                                            <button
                                                key={user.address}
                                                className="user-chip"
                                                onClick={() => handleSelectUser(user.address)}
                                                disabled={isProcessing}
                                            >
                                                <span className="user-chip-avatar">
                                                    {user.name ? user.name.charAt(0).toUpperCase() : user.address.slice(2, 3).toUpperCase()}
                                                </span>
                                                <span className="user-chip-name">{user.name || formatAddress(user.address)}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="form-group">
                                <label>Recipient Address</label>
                                <input
                                    type="text"
                                    placeholder="aleo1..."
                                    value={recipient}
                                    onChange={(e) => setRecipient(e.target.value)}
                                    disabled={isProcessing}
                                />
                                <p style={{ fontSize: "0.85rem", color: "var(--text-tertiary)", marginTop: "0.5rem" }}>
                                    Enter any Aleo address to send a private donation. No profile needed.
                                </p>
                            </div>
                            <div className="form-group">
                                <label>Amount (ALEO)</label>
                                <input
                                    type="number"
                                    step="0.000001"
                                    placeholder="0.0"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    disabled={isProcessing}
                                />
                            </div>
                            <div className="form-group">
                                <label>Message (Optional)</label>
                                <textarea
                                    placeholder="Add a message..."
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    disabled={isProcessing}
                                    rows={3}
                                />
                            </div>
                            {status && (
                                <div className={`status-message ${status.includes("Error") ? "error" : ""}`}>
                                    {status}
                                </div>
                            )}
                            <button
                                className="btn-primary full-width"
                                onClick={handleQuickDonate}
                                disabled={isProcessing || !recipient || !amount}
                            >
                                {isProcessing ? "Processing..." : "Send Donation"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <SuccessModal
                isOpen={showSuccess}
                onClose={() => {
                    setShowSuccess(false);
                    setSuccessTxId(undefined);
                }}
                message="Donation sent successfully!"
                txId={successTxId}
            />
        </div>
    );
};

