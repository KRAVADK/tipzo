// Utility functions for Aleo data conversion

export const stringToField = (str: string): string => {
    try {
        if (!str) return "0field";
        const encoder = new TextEncoder();
        const encoded = encoder.encode(str);
        let val = BigInt(0);
        for (let i = 0; i < Math.min(encoded.length, 31); i++) {
            val = (val << BigInt(8)) | BigInt(encoded[i]);
        }
        return val.toString() + "field";
    } catch (e) {
        console.error("Error encoding string to field:", e);
        return "0field";
    }
};

export const fieldToString = (fieldStr: string): string => {
    try {
        let valStr = fieldStr
            .replace(/field/g, "")
            .replace(/u64/g, "")
            .replace(/\.private/g, "")
            .replace(/\.public/g, "");

        valStr = valStr.replace(/\D/g, "");

        if (!valStr) return fieldStr;

        let val = BigInt(valStr);
        const bytes = [];
        while (val > 0n) {
            bytes.unshift(Number(val & 0xffn));
            val >>= 8n;
        }

        if (bytes.length === 0) return "";

        const decoder = new TextDecoder();
        const decoded = decoder.decode(new Uint8Array(bytes));

        if (decoded.length === 0) return valStr;

        // Check if printable
        let isPrintable = true;
        for (let i = 0; i < decoded.length; i++) {
            if (decoded.charCodeAt(i) < 32) {
                isPrintable = false;
                break;
            }
        }

        return isPrintable ? decoded : valStr;
    } catch {
        return fieldStr;
    }
};

export const parseRecordContent = (raw: string): string => {
    if (!raw) return "";

    if (!raw.includes("owner:") && !raw.includes("content:")) {
        if (raw.match(/^\d+field(?:\.(?:private|public))?$/)) {
            return fieldToString(raw);
        }
        return raw;
    }

    const cleanStr = String(raw).replace(/\s+/g, " ");
    const match = cleanStr.match(/content:\s*([^,}\s]+)/);

    if (match && match[1]) {
        return fieldToString(match[1]);
    }

    return raw;
};

export const parseMessageFromRecord = (raw: string): string => {
    if (!raw) return "";
    
    const cleanStr = String(raw).replace(/\s+/g, " ");
    const match = cleanStr.match(/message:\s*([^,}\s]+)/);

    if (match && match[1]) {
        return fieldToString(match[1]);
    }

    return "";
};

export const formatAddress = (address: string, start: number = 6, end: number = 4): string => {
    if (!address) return "";
    if (address.length <= start + end) return address;
    return `${address.slice(0, start)}...${address.slice(-end)}`;
};

export const getExplorerUrl = (txId: string, network: string = "testnet"): string => {
    // AleoScan format: /transaction/{txId}
    return `https://${network}.aleoscan.io/transaction/${txId}`;
};

export const getProvableUrl = (txId: string, network: string = "testnet"): string => {
    // Provable format: /transaction/{txId}
    return `https://${network}.explorer.provable.com/transaction/${txId}`;
};

// Get balance from AleoScan (API not available, return null)
// Note: AleoScan doesn't provide public API, balance must come from wallet
export const getBalanceFromAleoScan = async (address: string, network: string = "testnet"): Promise<string | null> => {
    // AleoScan doesn't have public API for balance
    // Balance should come from wallet adapter
    return null;
};

// Get balance from Provable (API not available, return null)
// Note: Provable doesn't provide public API, balance must come from wallet
export const getBalanceFromProvable = async (address: string, network: string = "testnet"): Promise<string | null> => {
    // Provable doesn't have public API for balance
    // Balance should come from wallet adapter
    return null;
};

// Get balance from any available source
export const getBalanceFromExplorers = async (address: string, network: string = "testnet"): Promise<string | null> => {
    // Try Provable first (usually more reliable)
    let balance = await getBalanceFromProvable(address, network);
    if (balance) {
        return balance;
    }
    
    // Fallback to AleoScan
    balance = await getBalanceFromAleoScan(address, network);
    if (balance) {
        return balance;
    }
    
    return null;
};

