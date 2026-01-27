import { useState, useEffect, useCallback } from 'react';
import { DonationTransaction } from '../utils/explorerAPI';
import { PROGRAM_ID } from '../deployed_program';
import { useWalletRecords } from './useWalletRecords';
import { logger } from '../utils/logger';

export function useDonationHistory(userAddress: string | null) {
    const [sent, setSent] = useState<DonationTransaction[]>([]);
    const [received, setReceived] = useState<DonationTransaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { fetchRecords } = useWalletRecords();

    // Function to fetch history - ONLY from wallet records (blockchain)
    const fetchHistory = useCallback(async () => {
        if (!userAddress || !PROGRAM_ID) {
            setSent([]);
            setReceived([]);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            logger.debug('[History] Fetching donations from wallet...');

            // Fetch all records from wallet
            const walletRecords = await fetchRecords(PROGRAM_ID);
            logger.debug(`[History] Found ${walletRecords.length} total records`);

            // Filter received donations (RecipientDonation: owner = recipient, has sender, NO recipient field)
            const receivedFromWallet = walletRecords
                .filter(record => {
                    return record.owner?.toLowerCase() === userAddress.toLowerCase() && 
                           record.sender && // Has sender field (RecipientDonation)
                           !record.recipient; // RecipientDonation doesn't have recipient field
                })
                .map(record => ({
                    id: record.nonce || `${record.sender || 'unknown'}-${record.timestamp}`,
                    sender: record.sender || 'unknown',
                    receiver: userAddress, // Owner is the recipient
                    amount: record.amount, // Already in microcredits
                    message: record.message || '[Encrypted]',
                    timestamp: record.timestamp,
                    status: 'confirmed' as const,
                    explorerUrl: `https://testnet.explorer.provable.com/transaction/${record.nonce || ''}`,
                    program: PROGRAM_ID,
                    function: 'send_donation',
                }));

            // Filter sent donations (SentDonation: owner = sender, has recipient, NO sender field)
            const sentFromWallet = walletRecords
                .filter(record => {
                    return record.owner?.toLowerCase() === userAddress.toLowerCase() && 
                           record.recipient && // Has recipient field (SentDonation)
                           !record.sender; // SentDonation doesn't have sender field
                })
                .map(record => ({
                    id: record.nonce || `${record.recipient || 'unknown'}-${record.timestamp}`,
                    sender: userAddress, // Owner is the sender
                    receiver: record.recipient || 'unknown',
                    amount: record.amount, // Already in microcredits
                    message: record.message || '[Encrypted]',
                    timestamp: record.timestamp,
                    status: 'confirmed' as const,
                    explorerUrl: `https://testnet.explorer.provable.com/transaction/${record.nonce || ''}`,
                    program: PROGRAM_ID,
                    function: 'send_donation',
                }));

            logger.debug(`[History] Found ${sentFromWallet.length} sent, ${receivedFromWallet.length} received donations`);
            
            setSent(sentFromWallet);
            setReceived(receivedFromWallet);
            setError(null);
        } catch (err: any) {
            console.error('[History] ❌ Error fetching from wallet:', err);
            setError(err.message || 'Failed to fetch donation history from wallet');
            setSent([]);
            setReceived([]);
        } finally {
            setLoading(false);
        }
    }, [userAddress, fetchRecords]);

    // Auto-refresh every 5 seconds - ONLY from wallet
    useEffect(() => {
        if (!userAddress) return;

        // Initial fetch
        fetchHistory();

        // Set up interval to sync with wallet records periodically
        const interval = setInterval(async () => {
            logger.debug('[History] Auto-syncing with wallet...');
            
            try {
                const walletRecords = await fetchRecords(PROGRAM_ID);
                
                // Filter received donations
                const receivedFromWallet = walletRecords
                    .filter(record => {
                        return record.owner?.toLowerCase() === userAddress.toLowerCase() && 
                               record.sender && 
                               !record.recipient;
                    })
                    .map(record => ({
                        id: record.nonce || `${record.sender || 'unknown'}-${record.timestamp}`,
                        sender: record.sender || 'unknown',
                        receiver: userAddress,
                        amount: record.amount,
                        message: record.message || '[Encrypted]',
                        timestamp: record.timestamp,
                        status: 'confirmed' as const,
                        explorerUrl: `https://testnet.explorer.provable.com/transaction/${record.nonce || ''}`,
                        program: PROGRAM_ID,
                        function: 'send_donation',
                    }));

                // Filter sent donations
                const sentFromWallet = walletRecords
                    .filter(record => {
                        return record.owner?.toLowerCase() === userAddress.toLowerCase() && 
                               record.recipient && 
                               !record.sender;
                    })
                    .map(record => ({
                        id: record.nonce || `${record.recipient || 'unknown'}-${record.timestamp}`,
                        sender: userAddress,
                        receiver: record.recipient || 'unknown',
                        amount: record.amount,
                        message: record.message || '[Encrypted]',
                        timestamp: record.timestamp,
                        status: 'confirmed' as const,
                        explorerUrl: `https://testnet.explorer.provable.com/transaction/${record.nonce || ''}`,
                        program: PROGRAM_ID,
                        function: 'send_donation',
                    }));

                setSent(sentFromWallet);
                setReceived(receivedFromWallet);
                
                logger.debug(`[History] Synced: ${sentFromWallet.length} sent, ${receivedFromWallet.length} received`);
            } catch (err) {
                console.warn('[History] ⚠️ Auto-sync failed:', err);
                // Don't clear state on error, just log it
            }
        }, 5000); // 5 seconds

        return () => {
            clearInterval(interval);
        };
    }, [userAddress, fetchRecords, fetchHistory]);

    // Optimistic update function - just refresh from wallet
    const addOptimisticDonation = useCallback(() => {
        // Trigger refresh from wallet after a short delay
        setTimeout(() => {
            fetchHistory();
        }, 2000);
    }, [fetchHistory]);

    return {
        sent,
        received,
        loading,
        error,
        refresh: fetchHistory,
        addOptimisticDonation,
    };
}
