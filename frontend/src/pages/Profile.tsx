import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { WalletAdapterNetwork, Transaction } from "@demox-labs/aleo-wallet-adapter-base";
import { PROGRAM_ID } from "../deployed_program";
import { stringToField, formatAddress } from "../utils/aleo";
import { logger } from "../utils/logger";
import { requestTransactionWithRetry } from "../utils/walletUtils";

const MAX_RETRIES = 3;
import { SuccessModal } from "../components/SuccessModal";
import "./Profile.css";

type WalletAdapterExtras = {
    requestTransaction?: (tx: Transaction) => Promise<string>;
    transactionStatus?: (txId: string) => Promise<string>;
};

interface ProfileData {
    name: string;
    bio: string;
    address: string;
}

export const Profile = () => {
    const { address: paramAddress } = useParams();
    const { publicKey, wallet } = useWallet();
    const adapter = wallet?.adapter as unknown as WalletAdapterExtras | undefined;
    const network = WalletAdapterNetwork.TestnetBeta;
    const navigate = useNavigate();

    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [isOwnProfile, setIsOwnProfile] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState("");
    const [bio, setBio] = useState("");
    const [showDonate, setShowDonate] = useState(false);
    const [donateAmount, setDonateAmount] = useState("");
    const [donateMessage, setDonateMessage] = useState("");
    const [status, setStatus] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    const displayAddress = paramAddress || publicKey || "";

    useEffect(() => {
        if (displayAddress) {
            setIsOwnProfile(displayAddress === publicKey);
            // Load profile from localStorage (in real app, fetch from blockchain)
            const profileKey = `donatu_profile_${displayAddress}`;
            const saved = localStorage.getItem(profileKey);
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    setProfile({ ...data, address: displayAddress });
                    setName(data.name || "");
                    setBio(data.bio || "");
                } catch (e) {
                    console.warn("Failed to parse profile:", e);
                }
            } else {
                setProfile({ name: "", bio: "", address: displayAddress });
                // Auto-show edit form if no profile exists and it's own profile
                if (displayAddress === publicKey) {
                    setIsEditing(true);
                }
            }
        }
    }, [displayAddress, publicKey]);

    const handleSaveProfile = async () => {
        if (!publicKey || !adapter?.requestTransaction) {
            alert("Please connect your wallet");
            return;
        }

        setIsProcessing(true);
        
        // Check if profile already exists
        const profileExists = profile?.name || profile?.bio;
        const functionName = profileExists ? "update_profile" : "create_profile";
        const actionText = profileExists ? "Updating" : "Creating";
        
        setStatus(`${actionText} profile transaction...`);
        logger.profile.updated(name);

        try {
            const nameField = stringToField(name);
            const bioField = stringToField(bio);

            logger.transaction.signing();

            const transaction = Transaction.createTransaction(
                publicKey,
                network,
                PROGRAM_ID,
                functionName, // Use update_profile if profile exists, create_profile otherwise
                [nameField, bioField],
                50000, // Minimal fee (0.05 ALEO)
                false
            );

            setStatus("Please confirm the transaction in your wallet...");
            const txId = await adapter.requestTransaction(transaction);

            if (txId) {
                logger.transaction.confirmed(txId);
                if (profileExists) {
                    logger.profile.updated(publicKey);
                } else {
                    logger.profile.created(publicKey);
                }
                setStatus(`Profile ${profileExists ? 'updated' : 'created'}! Transaction ID: ` + txId);

                // Save locally
                const profileKey = `donatu_profile_${publicKey}`;
                localStorage.setItem(profileKey, JSON.stringify({ name, bio }));
                setProfile({ name, bio, address: publicKey });
                setIsEditing(false);

                setTimeout(() => setStatus(""), 5000);
            }
        } catch (e: unknown) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            logger.transaction.failed(errorMsg);
            logger.error("Profile", errorMsg);
            setStatus("Error: " + errorMsg);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDonate = async () => {
        if (!publicKey || !adapter?.requestTransaction) {
            alert("Please connect your wallet");
            return;
        }

        if (!donateAmount || !displayAddress) {
            alert("Please fill in amount");
            return;
        }

        const amountNum = parseFloat(donateAmount);
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

        try {
            // Convert ALEO to microcredits (1 ALEO = 1,000,000 microcredits)
            const microcredits = Math.floor(amountNum * 1_000_000);
            if (microcredits <= 0 || !isFinite(microcredits)) {
                throw new Error("Invalid amount conversion");
            }
            
            const amountU64 = BigInt(microcredits);
            const messageField = donateMessage ? stringToField(donateMessage) : stringToField("");

            logger.donation.initiating(amountNum, displayAddress);
            
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
                [displayAddress, amountParam], // Both are public in transfer_public
                50000, // Minimal fee for transfer (0.05 ALEO)
                false
            );
            
            console.log("💰 Creating transfer transaction:", {
                recipient: displayAddress,
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
            const recipientPrivate = displayAddress + ".private";
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
                setStatus(`Donation sent! Transfer: ${transferTxId.slice(0, 8)}... Donation: ${txId.slice(0, 8)}...`);

                // Save to history (use donation txId as main ID, but note transfer was done)
                const historyKey = `donatu_sent_${publicKey}`;
                const existing = JSON.parse(localStorage.getItem(historyKey) || "[]");
                
                // Check if transaction already exists (avoid duplicates)
                const exists = existing.find((tx: any) => tx.txId === txId || tx.transferTxId === transferTxId);
                if (!exists) {
                    existing.unshift({
                        txId: txId, // Donation transaction ID
                        transferTxId: transferTxId, // Transfer transaction ID
                        recipient: displayAddress,
                        amount: amountNum,
                        message: donateMessage || "",
                        timestamp: Date.now(),
                        status: "Success" // Mark as Success since both transactions were confirmed
                    });
                    localStorage.setItem(historyKey, JSON.stringify(existing));
                    console.log("💾 Saved donation to sent history:", {
                        transferTxId,
                        donationTxId: txId,
                        total: existing.length
                    });
                    
                    // Note: Received donations are fetched from blockchain via wallet records
                    // No need to save to recipient's localStorage - they will sync from blockchain
                    
                    // Trigger refresh event (recipient will sync from blockchain)
                    window.dispatchEvent(new CustomEvent('donation-sent', { detail: { txId, transferTxId } }));
                } else {
                    console.log("⚠️ Transaction already in history:", txId);
                }

                setDonateAmount("");
                setDonateMessage("");
                setShowDonate(false);

                setTimeout(() => setStatus(""), 5000);
            }
        } catch (e: unknown) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            logger.transaction.failed(errorMsg);
            logger.error("Donation", errorMsg);
            setStatus("Error: " + errorMsg);
        } finally {
            setIsProcessing(false);
        }
    };

    if (!displayAddress) {
        return (
            <div className="profile-page">
                <div className="error-message">
                    Please connect your wallet or provide an address
                </div>
            </div>
        );
    }

    return (
        <div className="profile-page fade-in">
            <div className="profile-header glass">
                <div className="profile-avatar">
                    {profile?.name ? profile.name.charAt(0).toUpperCase() : displayAddress.slice(2, 3).toUpperCase()}
                </div>
                <div className="profile-info">
                    <h1 className="profile-name">
                        {profile?.name || "No Name"}
                    </h1>
                    <div className="profile-address">
                        {formatAddress(displayAddress)}
                    </div>
                    {profile?.bio && (
                        <p className="profile-bio">{profile.bio}</p>
                    )}
                </div>
                {isOwnProfile && (
                    <button
                        className="btn-secondary"
                        onClick={() => setIsEditing(!isEditing)}
                    >
                        {isEditing ? "Cancel" : profile?.name ? "Edit Profile" : "Create Profile"}
                    </button>
                )}
                {!isOwnProfile && publicKey && (
                    <button
                        className="btn-primary"
                        onClick={() => setShowDonate(true)}
                    >
                        Donate
                    </button>
                )}
            </div>

            {isEditing && isOwnProfile && (
                <div className="profile-edit glass">
                    <h2>{profile?.name ? "Edit Profile" : "Create Profile"}</h2>
                    <p className="profile-edit-hint">
                        {profile?.name 
                            ? "Update your profile information below" 
                            : "Create your profile to let others know who you are"}
                    </p>
                    <div className="form-group">
                        <label>Name</label>
                        <input
                            type="text"
                            placeholder="Your name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={isProcessing}
                        />
                    </div>
                    <div className="form-group">
                        <label>Bio</label>
                        <textarea
                            placeholder="Tell us about yourself"
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            disabled={isProcessing}
                            rows={4}
                        />
                    </div>
                    {status && (
                        <div className={`status-message ${status.includes("Error") ? "error" : ""}`}>
                            {status}
                        </div>
                    )}
                    <button
                        className="btn-primary"
                        onClick={handleSaveProfile}
                        disabled={isProcessing || !name.trim()}
                    >
                        {isProcessing ? "Saving..." : "Save Profile"}
                    </button>
                </div>
            )}

            {showDonate && (
                <div className="modal-overlay" onClick={() => !isProcessing && setShowDonate(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Donate to {profile?.name || formatAddress(displayAddress)}</h2>
                            <button
                                className="close-button"
                                onClick={() => setShowDonate(false)}
                                disabled={isProcessing}
                            >
                                ×
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Amount (ALEO)</label>
                                <input
                                    type="number"
                                    step="0.000001"
                                    placeholder="0.0"
                                    value={donateAmount}
                                    onChange={(e) => setDonateAmount(e.target.value)}
                                    disabled={isProcessing}
                                />
                            </div>
                            <div className="form-group">
                                <label>Message (Optional)</label>
                                <textarea
                                    placeholder="Add a message..."
                                    value={donateMessage}
                                    onChange={(e) => setDonateMessage(e.target.value)}
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
                                onClick={handleDonate}
                                disabled={isProcessing || !donateAmount}
                            >
                                {isProcessing ? "Processing..." : "Send Donation"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

