// Compact console logging utility

type LogLevel = "info" | "success" | "error" | "warning";

const log = (level: LogLevel, emoji: string, category: string, message: string, data?: unknown) => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}] ${emoji} [${category}]`;
    
    switch (level) {
        case "success":
            console.log(`%c${prefix} ${message}`, "color: #00f0ff", data || "");
            break;
        case "error":
            console.error(`%c${prefix} ${message}`, "color: #ff6b6b", data || "");
            break;
        case "warning":
            console.warn(`%c${prefix} ${message}`, "color: #ffa500", data || "");
            break;
        default:
            console.log(`%c${prefix} ${message}`, "color: #8b5cf6", data || "");
    }
};

export const logger = {
    wallet: {
        connected: (address: string) => log("success", "🔗", "Wallet", `Connected: ${address.slice(0, 6)}...${address.slice(-4)}`),
        disconnected: () => log("info", "🔌", "Wallet", "Disconnected"),
        connecting: () => log("info", "⏳", "Wallet", "Connecting..."),
        balanceUpdated: (balance: string) => log("success", "💰", "Wallet", `Balance: ${balance} ALEO`),
    },
    profile: {
        created: (address: string) => log("success", "👤", "Profile", `Created for: ${address.slice(0, 6)}...${address.slice(-4)}`),
        updated: (nickname: string) => log("success", "✏️", "Profile", `Updated: ${nickname}`),
    },
    donation: {
        initiating: (amount: number, recipient: string) => log("info", "💰", "Donation", `Initiating: ${amount} ALEO to ${recipient.slice(0, 6)}...${recipient.slice(-4)}`),
        sent: (txId: string) => log("success", "✅", "Donation", `Sent: ${txId.slice(0, 10)}...`),
    },
    transaction: {
        signing: () => log("info", "✍️", "Transaction", "Signing..."),
        confirmed: (txId: string) => log("success", "✅", "Transaction", `Confirmed: ${txId.slice(0, 10)}...`),
        failed: (error: string) => log("error", "❌", "Transaction", `Failed: ${error}`),
    },
    error: (operation: string, error: string) => log("error", "⚠️", "Error", `${operation}: ${error}`),
};
