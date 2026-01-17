// Transaction cache for performance

export interface CachedTx {
    txId: string;
    height: number;
    sender: string;
    recipient: string;
    amount: string;
    message?: string;
    timestamp: number;
    cachedAt: number;
}

export const TxCache = {
    save: (publicKey: string, txs: CachedTx[]) => {
        try {
            const key = `tipzo_txs_${publicKey}`;
            localStorage.setItem(key, JSON.stringify(txs));
        } catch (e) {
            console.warn("Failed to save tx cache:", e);
        }
    },

    get: (publicKey: string): CachedTx[] => {
        try {
            const key = `tipzo_txs_${publicKey}`;
            const data = localStorage.getItem(key);
            if (!data) return [];
            return JSON.parse(data) as CachedTx[];
        } catch (e) {
            console.warn("Failed to get tx cache:", e);
            return [];
        }
    },

    append: (publicKey: string, txs: CachedTx[]) => {
        const existing = TxCache.get(publicKey);
        const merged = [...existing, ...txs];
        // Remove duplicates
        const unique = merged.filter((tx, index, self) =>
            index === self.findIndex((t) => t.txId === tx.txId)
        );
        TxCache.save(publicKey, unique);
    },

    clear: (publicKey: string) => {
        try {
            const key = `tipzo_txs_${publicKey}`;
            localStorage.removeItem(key);
        } catch (e) {
            console.warn("Failed to clear tx cache:", e);
        }
    },
};

