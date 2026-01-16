import { useState, useEffect, useCallback } from 'react';
import { DonationTransaction } from '../utils/explorerAPI';
import { PROGRAM_ID } from '../deployed_program';
import { useWalletRecords } from './useWalletRecords';

export function useDonationHistory(userAddress: string | null) {
    const [sent, setSent] = useState<DonationTransaction[]>([]);
    const [received, setReceived] = useState<DonationTransaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { fetchRecords } = useWalletRecords();

    // Helper function to load sent donations from localStorage
    const loadSentFromLocalStorage = useCallback(() => {
        if (!userAddress) return [];

        const sentKey = `donatu_sent_${userAddress}`;
        const sentData = localStorage.getItem(sentKey);
        
        if (!sentData) return [];

        try {
            const sentTxs = JSON.parse(sentData);
            // Convert to DonationTransaction format
            const convertedSent: DonationTransaction[] = sentTxs.map((tx: any) => ({
                id: tx.txId || tx.transferTxId || '',
                sender: userAddress,
                receiver: tx.recipient || '',
                amount: tx.amount * 1_000_000, // Convert to microcredits
                message: tx.message || '',
                timestamp: tx.timestamp / 1000, // Convert from ms to seconds
                status: tx.status?.toLowerCase() || 'confirmed',
                explorerUrl: `https://testnet.explorer.provable.com/transaction/${tx.txId || tx.transferTxId || ''}`,
                program: PROGRAM_ID,
                function: 'send_donation',
            }));
            
            return convertedSent;
        } catch (e) {
            console.warn('[History] Failed to parse sent donations:', e);
            return [];
        }
    }, [userAddress]);

    // Helper function to load received donations from localStorage
    const loadReceivedFromLocalStorage = useCallback(() => {
        if (!userAddress) return [];

        const receivedKey = `donatu_received_${userAddress}`;
        const receivedData = localStorage.getItem(receivedKey);
        
        if (!receivedData) return [];

        try {
            const receivedTxs = JSON.parse(receivedData);
            // Convert to DonationTransaction format
            const convertedReceived: DonationTransaction[] = receivedTxs.map((tx: any) => ({
                id: tx.txId || tx.transferTxId || '',
                sender: tx.sender || '',
                receiver: userAddress,
                amount: tx.amount * 1_000_000, // Convert to microcredits
                message: tx.message || '',
                timestamp: tx.timestamp / 1000, // Convert from ms to seconds
                status: tx.status?.toLowerCase() || 'confirmed',
                explorerUrl: `https://testnet.explorer.provable.com/transaction/${tx.txId || tx.transferTxId || ''}`,
                program: PROGRAM_ID,
                function: 'send_donation',
            }));
            
            return convertedReceived;
        } catch (e) {
            console.warn('[History] Failed to parse received donations:', e);
            return [];
        }
    }, [userAddress]);

    // Load initial data on mount
    useEffect(() => {
        if (!userAddress) return;

        // Load sent donations from localStorage (we save these when sending)
        const sentTxs = loadSentFromLocalStorage();
        if (sentTxs.length > 0) {
            setSent(sentTxs);
            console.log('[History] Loaded', sentTxs.length, 'sent donations from localStorage');
        }

        // Try to load received donations from wallet records first (blockchain)
        // If that fails, fallback to cache
        const loadReceived = async () => {
            try {
                const walletRecords = await fetchRecords(PROGRAM_ID);
                // RecipientDonation: owner = recipient, sender, amount, message, timestamp
                const receivedFromWallet = walletRecords
                    .filter(record => {
                        // RecipientDonation: owner = recipient, has sender field, NO recipient field
                        return record.owner?.toLowerCase() === userAddress.toLowerCase() && 
                               record.sender && // Has sender field (RecipientDonation)
                               !record.recipient; // RecipientDonation doesn't have recipient field
                    })
                    .map(record => ({
                        id: record.nonce || `${record.sender || 'unknown'}-${record.timestamp}`,
                        sender: record.sender || 'unknown',
                        receiver: userAddress, // Owner is the recipient
                        amount: record.amount,
                        message: record.message || '[Encrypted]',
                        timestamp: record.timestamp,
                        status: 'confirmed' as const,
                        explorerUrl: `https://testnet.explorer.provable.com/transaction/${record.nonce || ''}`,
                        program: PROGRAM_ID,
                        function: 'send_donation',
                    }));

                if (receivedFromWallet.length > 0) {
                    setReceived(receivedFromWallet);
                    console.log('[History] Loaded', receivedFromWallet.length, 'received donations from blockchain');
                    // Cache for offline access
                    const recipientHistoryKey = `donatu_received_${userAddress}`;
                    const cachedData = receivedFromWallet.map(tx => ({
                        txId: tx.id,
                        sender: tx.sender,
                        amount: tx.amount / 1_000_000,
                        message: tx.message,
                        timestamp: tx.timestamp * 1000,
                        status: "Success"
                    }));
                    localStorage.setItem(recipientHistoryKey, JSON.stringify(cachedData));
                } else {
                    // Fallback to cache
                    const receivedTxs = loadReceivedFromLocalStorage();
                    if (receivedTxs.length > 0) {
                        setReceived(receivedTxs);
                        console.log('[History] Loaded', receivedTxs.length, 'received donations from cache');
                    }
                }
            } catch (err) {
                console.warn('[History] Failed to load from blockchain, using cache:', err);
                const receivedTxs = loadReceivedFromLocalStorage();
                if (receivedTxs.length > 0) {
                    setReceived(receivedTxs);
                    console.log('[History] Loaded', receivedTxs.length, 'received donations from cache');
                }
            }
        };

        loadReceived();
    }, [userAddress, loadSentFromLocalStorage, loadReceivedFromLocalStorage, fetchRecords]);

    // Function to fetch history
    const fetchHistory = useCallback(async () => {
        if (!userAddress || !PROGRAM_ID) {
            setSent([]);
            setReceived([]);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            console.log('[History] Fetching donations for:', userAddress);

            // STEP 1: Load sent donations from localStorage (we save these when sending)
            const sentTxs = loadSentFromLocalStorage();
            if (sentTxs.length > 0) {
                setSent(sentTxs);
                console.log('[History] Loaded', sentTxs.length, 'sent donations from localStorage');
            }

            // STEP 2: Fetch received donations from wallet records (blockchain) - PRIMARY SOURCE
            let receivedFromWallet: DonationTransaction[] = [];
            try {
                console.log('[History] Fetching received donations from wallet records (blockchain)...');
                const walletRecords = await fetchRecords(PROGRAM_ID);
                
                // Filter records where current user is the recipient
                // RecipientDonation has: owner (recipient), sender, amount, message, timestamp
                // SentDonation has: owner (sender), recipient, amount, message, timestamp
                receivedFromWallet = walletRecords
                    .filter(record => {
                        // RecipientDonation: owner = recipient, has sender field
                        return record.owner?.toLowerCase() === userAddress.toLowerCase() && 
                               record.sender && // Has sender field (RecipientDonation)
                               !record.recipient; // RecipientDonation doesn't have recipient field
                    })
                    .map(record => ({
                        id: record.nonce || `${record.sender}-${record.timestamp}`,
                        sender: record.sender,
                        receiver: userAddress, // Owner is the recipient
                        amount: record.amount, // Already in microcredits
                        message: record.message || '[Encrypted]',
                        timestamp: record.timestamp,
                        status: 'confirmed' as const,
                        explorerUrl: `https://testnet.explorer.provable.com/transaction/${record.nonce || ''}`,
                        program: PROGRAM_ID,
                        function: 'send_donation',
                    }));

                if (receivedFromWallet.length > 0) {
                    console.log('[History] ✅ Found', receivedFromWallet.length, 'received donations from wallet records (blockchain)');
                    
                    // Save to cache (localStorage) for offline access
                    const recipientHistoryKey = `donatu_received_${userAddress}`;
                    const cachedData = receivedFromWallet.map(tx => ({
                        txId: tx.id,
                        sender: tx.sender,
                        amount: tx.amount / 1_000_000, // Convert to ALEO
                        message: tx.message,
                        timestamp: tx.timestamp * 1000, // Convert to ms
                        status: "Success"
                    }));
                    localStorage.setItem(recipientHistoryKey, JSON.stringify(cachedData));
                    console.log('[History] 💾 Cached', cachedData.length, 'received donations to localStorage');
                    
                    setReceived(receivedFromWallet);
                } else {
                    console.log('[History] ⚠️ No received donations found in wallet records');
                    // STEP 3: Fallback to cache if no wallet records
                    const receivedTxs = loadReceivedFromLocalStorage();
                    if (receivedTxs.length > 0) {
                        console.log('[History] 📦 Using cached received donations:', receivedTxs.length);
                        setReceived(receivedTxs);
                    } else {
                        setReceived([]);
                    }
                }
            } catch (err: any) {
                console.warn('[History] ❌ Failed to fetch wallet records:', err);
                // Fallback to cache
                const receivedTxs = loadReceivedFromLocalStorage();
                if (receivedTxs.length > 0) {
                    console.log('[History] 📦 Fallback: Using cached received donations:', receivedTxs.length);
                    setReceived(receivedTxs);
                } else {
                    setReceived([]);
                }
            }

            setError(null);
        } catch (err: any) {
            console.error('[History] Error:', err);
            setError(err.message || 'Failed to fetch donation history');
        } finally {
            setLoading(false);
        }
    }, [userAddress, loadSentFromLocalStorage, loadReceivedFromLocalStorage, fetchRecords]);

    // Auto-refresh every 30 seconds and listen for localStorage changes
    useEffect(() => {
        if (!userAddress) return;

        // Initial fetch
        fetchHistory();

        // Listen for localStorage changes (when new donation is sent)
        const handleStorageChange = () => {
            console.log('[History] localStorage changed, refreshing...');
            fetchHistory();
        };
        
        window.addEventListener('storage', handleStorageChange);
        
        // Also listen for custom events (same-tab updates)
        const handleDonationSent = () => {
            console.log('[History] Donation sent event, refreshing...');
            // Immediately update from localStorage
            const sentTxs = loadSentFromLocalStorage();
            if (sentTxs.length > 0) {
                setSent(sentTxs);
                console.log('[History] Updated sent donations from localStorage:', sentTxs.length);
            }
            // Also update received donations
            const receivedTxs = loadReceivedFromLocalStorage();
            if (receivedTxs.length > 0) {
                setReceived(receivedTxs);
                console.log('[History] Updated received donations from localStorage:', receivedTxs.length);
            }
        };
        
        window.addEventListener('donation-sent', handleDonationSent);

        // Set up interval to sync with wallet records periodically (blockchain is source of truth)
        // Reduced to 5 seconds for faster updates
        const interval = setInterval(async () => {
            console.log('[History] 🔄 Syncing with blockchain...');
            
            // Reload sent donations from localStorage
            const sentTxs = loadSentFromLocalStorage();
            if (sentTxs.length > 0) {
                setSent(sentTxs);
            }
            
            // Sync received donations from wallet records (blockchain) with retry
            let retries = 3;
            let success = false;
            
            while (retries > 0 && !success) {
                try {
                    console.log(`[History] 🔓 Fetching records (${4 - retries}/3)...`);
                    const walletRecords = await fetchRecords(PROGRAM_ID);
                    
                    // Filter records where current user is the recipient (RecipientDonation)
                    const receivedFromWallet = walletRecords
                        .filter(record => {
                            // RecipientDonation has owner = recipient, sender = sender
                            // Check if owner matches userAddress (user received this donation)
                            return record.owner?.toLowerCase() === userAddress.toLowerCase() && 
                                   record.sender && // Has sender field (RecipientDonation)
                                   !record.recipient; // RecipientDonation doesn't have recipient field
                        })
                        .map(record => ({
                            id: record.nonce || `${record.sender || 'unknown'}-${record.timestamp}`,
                            sender: record.sender || 'unknown',
                            receiver: userAddress, // Owner is the recipient
                            amount: record.amount,
                            message: record.message || '[Encrypted]',
                            timestamp: record.timestamp,
                            status: 'confirmed' as const,
                            explorerUrl: `https://testnet.explorer.provable.com/transaction/${record.nonce || ''}`,
                            program: PROGRAM_ID,
                            function: 'send_donation',
                        }));

                    if (receivedFromWallet.length > 0) {
                        // Update cache
                        const recipientHistoryKey = `donatu_received_${userAddress}`;
                        const cachedData = receivedFromWallet.map(tx => ({
                            txId: tx.id,
                            sender: tx.sender,
                            amount: tx.amount / 1_000_000,
                            message: tx.message,
                            timestamp: tx.timestamp * 1000,
                            status: "Success"
                        }));
                        localStorage.setItem(recipientHistoryKey, JSON.stringify(cachedData));
                        
                        setReceived(receivedFromWallet);
                        console.log('[History] ✅ Synced', receivedFromWallet.length, 'received donations from blockchain');
                    } else {
                        // No new donations, keep current state
                        console.log('[History] ℹ️ No new received donations');
                    }
                    
                    success = true;
                } catch (err) {
                    retries--;
                    if (retries > 0) {
                        console.warn(`[History] ⚠️ Wallet sync failed, retrying in 2s... (${retries} attempts left)`, err);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } else {
                        console.warn('[History] ⚠️ Wallet sync failed after retries, using cache:', err);
                        // Fallback to cache
                        const receivedTxs = loadReceivedFromLocalStorage();
                        if (receivedTxs.length > 0) {
                            setReceived(receivedTxs);
                        }
                    }
                }
            }
        }, 5000); // 5 seconds - faster sync with blockchain

        return () => {
            clearInterval(interval);
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('donation-sent', handleDonationSent);
        };
    }, [userAddress, loadSentFromLocalStorage, loadReceivedFromLocalStorage, fetchRecords]);

    // Optimistic update function
    const addOptimisticDonation = useCallback((donation: DonationTransaction) => {
        if (donation.sender && donation.sender.toLowerCase() === userAddress?.toLowerCase()) {
            setSent(prev => {
                // Check if already exists
                const exists = prev.find(d => d.id === donation.id);
                if (exists) return prev;
                
                const updated = [donation, ...prev];
                // Cache updated data
                if (userAddress) {
                    localStorage.setItem(
                        `donation_history_${userAddress}`,
                        JSON.stringify({ sent: updated, received })
                    );
                }
                return updated;
            });
            
            // Confirm after 5 seconds
            setTimeout(() => {
                fetchHistory();
            }, 5000);
        }
    }, [userAddress, received, fetchHistory, loadReceivedFromLocalStorage]);

    return {
        sent,
        received,
        loading,
        error,
        refresh: fetchHistory,
        addOptimisticDonation,
    };
}

