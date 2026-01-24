// Wallet utilities with timeout and retry logic

const WALLET_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

export interface WalletCallOptions {
    timeout?: number;
    maxRetries?: number;
    retryDelay?: number;
    onRetry?: (attempt: number) => void;
}

/**
 * Execute a wallet operation with timeout and retry logic
 */
export async function withWalletTimeout<T>(
    operation: () => Promise<T>,
    options: WalletCallOptions = {}
): Promise<T> {
    const timeout = options.timeout || WALLET_TIMEOUT;
    const maxRetries = options.maxRetries || MAX_RETRIES;
    const retryDelay = options.retryDelay || RETRY_DELAY;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[Wallet] ⏳ Attempt ${attempt}/${maxRetries}...`);
            
            if (options.onRetry && attempt > 1) {
                options.onRetry(attempt);
            }

            const startTime = Date.now();
            
            // Create a promise that rejects after timeout
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Wallet operation timed out after ${timeout}ms`));
                }, timeout);
            });

            // Race between operation and timeout
            const result = await Promise.race([operation(), timeoutPromise]);
            
            const duration = Date.now() - startTime;
            console.log(`[Wallet] ✅ Completed in ${(duration / 1000).toFixed(2)}s`);
            
            return result;
        } catch (error: any) {
            lastError = error;
            const errorMsg = error?.message || String(error);
            
            // Don't retry on user cancellation
            if (errorMsg.includes("User rejected") || errorMsg.includes("User cancelled")) {
                console.log("[Wallet] ❌ User cancelled operation");
                throw error;
            }

            // Don't retry on invalid parameters
            if (errorMsg.includes("INVALID_PARAMS") || errorMsg.includes("Some of the parameters you provided are invalid")) {
                console.log("[Wallet] ❌ Invalid parameters, not retrying");
                throw error;
            }

            console.warn(`[Wallet] ⚠️ Attempt ${attempt}/${maxRetries} failed:`, errorMsg);

            // If this was the last attempt, throw the error
            if (attempt === maxRetries) {
                console.error(`[Wallet] ❌ All ${maxRetries} attempts failed`);
                throw new Error(`Wallet operation failed after ${maxRetries} attempts: ${errorMsg}`);
            }

            // Wait before retrying
            console.log(`[Wallet] 🔄 Retrying in ${retryDelay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error("Wallet operation failed");
}

/**
 * Request transaction with timeout and retry
 */
export async function requestTransactionWithRetry(
    adapter: any,
    transaction: any,
    options: WalletCallOptions = {}
): Promise<string> {
    return withWalletTimeout(
        async () => {
            if (!adapter?.requestTransaction) {
                throw new Error("Wallet adapter does not support requestTransaction");
            }
            const txId = await adapter.requestTransaction(transaction);
            if (!txId) {
                throw new Error("Transaction was rejected or failed");
            }
            return txId;
        },
        {
            ...options,
            onRetry: (attempt) => {
                console.log(`[Wallet] 🔄 Retrying transaction request (${attempt}/${options.maxRetries || MAX_RETRIES})...`);
                if (options.onRetry) {
                    options.onRetry(attempt);
                }
            }
        }
    );
}

/**
 * Request records with timeout and retry
 */
export async function requestRecordsWithRetry(
    adapter: any,
    programId: string,
    options: WalletCallOptions = {}
): Promise<any[]> {
    return withWalletTimeout(
        async () => {
            if (!adapter?.requestRecords) {
                throw new Error("Wallet adapter does not support requestRecords");
            }
            const records = await adapter.requestRecords(programId);
            return records || [];
        },
        options
    );
}

/**
 * Decrypt record with timeout and retry
 */
export async function decryptWithRetry(
    adapter: any,
    ciphertext: string,
    options: WalletCallOptions = {}
): Promise<string> {
    return withWalletTimeout(
        async () => {
            if (!adapter?.decrypt) {
                throw new Error("Wallet adapter does not support decrypt");
            }
            const decrypted = await adapter.decrypt(ciphertext);
            return typeof decrypted === "string" ? decrypted : JSON.stringify(decrypted);
        },
        options
    );
}
