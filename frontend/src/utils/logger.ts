// Compact console logging utility

const isDev = import.meta.env.DEV;

// Styles
const styles = {
  success: 'color: #00f0ff; font-weight: bold;',
  error: 'color: #ff6b6b; font-weight: bold;',
  warning: 'color: #ffa500; font-weight: bold;',
  info: 'color: #8b5cf6; font-weight: bold;'
};

export const logger = {
  // Production - always show
  wallet: {
    connected: (address: string) => 
      console.log(`%c🔗 [Wallet] Connected: ${address}`, styles.success),
    disconnected: () => 
      console.log(`%c🔌 [Wallet] Disconnected`, styles.info),
    balanceUpdated: (balance: string) => 
      console.log(`%c💰 [Wallet] Balance: ${balance} ALEO`, styles.info),
  },
  
  profile: {
    created: (address: string) => 
      console.log(`%c👤 [Profile] Created: ${address}`, styles.success),
    updated: (nickname: string) => 
      console.log(`%c✏️ [Profile] Updated: ${nickname}`, styles.success),
  },
  
  donation: {
    sent: (txId: string) => 
      console.log(`%c✅ [Donation] Sent: ${txId}`, styles.success),
    received: (amount: string) => 
      console.log(`%c💰 [Donation] Received: ${amount}`, styles.success),
  },
  
  transaction: {
    confirmed: (txId: string) => 
      console.log(`%c✅ [Transaction] Confirmed: ${txId}`, styles.success),
    failed: (error: string) => 
      console.error(`%c❌ [Transaction] Failed: ${error}`, styles.error),
  },
  
  error: (operation: string, error: any) => 
    console.error(`%c⚠️ [Error] ${operation}:`, styles.error, error),
  
  // Development only
  debug: (...args: any[]) => {
    if (isDev) console.log(...args);
  },
  
  warn: (...args: any[]) => {
    if (isDev) console.warn(...args);
  }
};
