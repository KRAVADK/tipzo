// Explorer API integration for Provable Explorer
// API Base URL: https://api.explorer.provable.com/v1/testnet
// Documentation: https://docs.explorer.provable.com/docs/api-reference/5nzkj6j12ol1p-introduction

const API_BASE_URL = "https://api.explorer.provable.com/v1/testnet";
const EXPLORER_URL = "https://testnet.explorer.provable.com";

export interface Transaction {
    id: string;
    program?: string;
    function?: string;
    inputs?: any[];
    outputs?: any[];
    timestamp?: number;
    status?: 'pending' | 'confirmed' | 'failed';
    block_height?: number;
    transitions?: Transition[];
}

export interface Transition {
    id: string;
    program: string;
    function: string;
    inputs: TransitionInput[];
    outputs: TransitionOutput[];
    tpk?: string;
    tcm?: string;
}

export interface TransitionInput {
    type: string;
    value: string;
}

export interface TransitionOutput {
    type: string;
    value: string;
}

export interface TransactionDetails extends Transaction {
    fee?: number;
    execution?: any;
}

export interface DonationTransaction extends Transaction {
    sender: string;
    receiver: string;
    amount: number;
    message?: string;
    explorerUrl: string;
}

// Helper function to handle API errors
async function fetchAPI<T>(endpoint: string): Promise<T> {
    try {
        const url = `${API_BASE_URL}${endpoint}`;
        console.log('[ExplorerAPI] Fetching:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });

        if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait a moment.');
        }

        if (!response.ok) {
            throw new Error(`API error: ${response.statusText} (${response.status})`);
        }

        const data = await response.json();
        console.log('[ExplorerAPI] Response:', data);
        return data as T;
    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new Error('Request timeout');
        }
        console.error('[ExplorerAPI] Error:', error);
        throw error;
    }
}

// 1. Get all transactions for an address
export async function getAddressTransactions(address: string): Promise<Transaction[]> {
    try {
        const data = await fetchAPI<{ transactions?: Transaction[] }>(`/address/${address}/transactions`);
        
        // Handle different response formats
        if (Array.isArray(data)) {
            return data;
        }
        
        if (data.transactions && Array.isArray(data.transactions)) {
            return data.transactions;
        }
        
        // If API doesn't support this endpoint, try alternative
        console.warn('[ExplorerAPI] Address transactions endpoint not available, trying program transitions');
        return [];
    } catch (error: any) {
        console.error('[ExplorerAPI] Failed to fetch address transactions:', error);
        // Return empty array instead of throwing
        return [];
    }
}

// 2. Get transaction details
export async function getTransaction(txId: string): Promise<TransactionDetails | null> {
    try {
        const data = await fetchAPI<TransactionDetails>(`/transaction/${txId}`);
        return data;
    } catch (error: any) {
        console.error('[ExplorerAPI] Failed to fetch transaction:', error);
        return null;
    }
}

// 3. Get program transitions (function calls)
// NOTE: This endpoint returns 400 Bad Request, API may not support it
export async function getProgramTransitions(programId: string): Promise<Transition[]> {
    // API endpoint doesn't work, return empty array
    console.warn('[ExplorerAPI] getProgramTransitions endpoint not available (returns 400)');
    return [];
}

// 4. Filter only donation transactions
export async function filterDonationTransactions(
    transactions: Transaction[],
    programId: string
): Promise<DonationTransaction[]> {
    const donationTxs: DonationTransaction[] = [];

    for (const tx of transactions) {
        // Check if transaction is for our program
        if (tx.program !== programId && tx.program !== programId.replace('.aleo', '')) {
            continue;
        }

        // Check if it's a send_donation function call
        const isDonation = tx.function === 'send_donation' || 
                          tx.transitions?.some(t => t.function === 'send_donation');

        if (!isDonation) {
            continue;
        }

        // Extract donation data from transaction
        const donationTx = await parseDonationTransaction(tx, programId);
        if (donationTx) {
            donationTxs.push(donationTx);
        }
    }

    return donationTxs;
}

// Parse transaction into DonationTransaction
async function parseDonationTransaction(tx: Transaction, programId: string): Promise<DonationTransaction | null> {
    try {
        // Find send_donation transition
        const donationTransition = tx.transitions?.find(
            t => t.function === 'send_donation' && 
            (t.program === programId || t.program === programId.replace('.aleo', ''))
        );

        if (!donationTransition) {
            return null;
        }

        // Extract inputs: [recipient (public address), amount (private u64), message (private field)]
        const inputs = donationTransition.inputs || [];
        
        // First input should be recipient (public address)
        const recipientInput = inputs.find(inp => 
            inp.type === 'address' || 
            (inp.value && inp.value.startsWith('aleo1'))
        );
        
        // Second input should be amount (private u64)
        const amountInput = inputs.find((inp, idx) => 
            idx === 1 || 
            inp.type === 'u64' || 
            (inp.value && inp.value.includes('u64'))
        );

        // Third input should be message (private field)
        const messageInput = inputs.find((inp, idx) => 
            idx === 2 || 
            inp.type === 'field' || 
            (inp.value && inp.value.includes('field'))
        );

        const receiver = recipientInput?.value || '';
        const amountStr = amountInput?.value || '0u64';
        const messageField = messageInput?.value || '';

        // Parse amount (convert from microcredits to ALEO)
        const amountMatch = amountStr.match(/(\d+)u64/);
        const amountMicro = amountMatch ? BigInt(amountMatch[1]) : 0n;
        const amount = Number(amountMicro) / 1_000_000;

        // Try to decode message (if possible)
        let message: string | undefined;
        if (messageField && messageField !== '0field') {
            try {
                // Dynamic import to avoid circular dependency
                const aleoUtils = await import('./aleo');
                message = aleoUtils.fieldToString(messageField);
            } catch (e) {
                message = '[Encrypted]';
            }
        }

        // Get sender from transaction (if available)
        // In Aleo, sender is usually in the transaction metadata
        const sender = (tx as any).sender || (tx as any).caller || '';

        // Get timestamp
        const timestamp = tx.timestamp || Date.now() / 1000;

        // Get status
        const status = tx.status || (tx.block_height ? 'confirmed' : 'pending');

        return {
            ...tx,
            sender,
            receiver,
            amount,
            message,
            explorerUrl: `${EXPLORER_URL}/transaction/${tx.id}`,
            status: status as 'pending' | 'confirmed' | 'failed',
            timestamp,
        };
    } catch (error) {
        console.error('[ExplorerAPI] Failed to parse donation transaction:', error);
        return null;
    }
}

// 5. Categorize donations into sent and received
export function categorizeDonations(
    transactions: DonationTransaction[],
    userAddress: string
): { sent: DonationTransaction[]; received: DonationTransaction[] } {
    const sent: DonationTransaction[] = [];
    const received: DonationTransaction[] = [];

    for (const tx of transactions) {
        // If sender matches user, it's a sent donation
        if (tx.sender && tx.sender.toLowerCase() === userAddress.toLowerCase()) {
            sent.push(tx);
        }
        // If receiver matches user, it's a received donation
        else if (tx.receiver && tx.receiver.toLowerCase() === userAddress.toLowerCase()) {
            received.push(tx);
        }
    }

    return { sent, received };
}

// Helper: Get explorer URL for transaction
export function getExplorerUrl(txId: string, network: 'testnet' | 'mainnet' = 'testnet'): string {
    const baseUrl = network === 'testnet' 
        ? 'https://testnet.explorer.provable.com'
        : 'https://explorer.provable.com';
    return `${baseUrl}/transaction/${txId}`;
}

// Validate transaction data
export function validateTransaction(data: unknown): data is Transaction {
    return (
        typeof data === 'object' &&
        data !== null &&
        'id' in data &&
        typeof (data as any).id === 'string'
    );
}

