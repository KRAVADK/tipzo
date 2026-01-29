// Compact console logging utility

// Vite injects import.meta.env at build time; guard for type safety
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const metaEnv: any = (import.meta as any).env || {};
const isDev = !!metaEnv.DEV;

// Runtime flag for extra debug logs, controlled via app settings in Profile page.
// Stored in localStorage as { enableDebugLogs: boolean } under key "tipzo_app_settings".
let cachedDebugFlag: boolean | null = null;

const isDebugEnabled = (): boolean => {
  if (!isDev) return false;

  try {
    if (cachedDebugFlag === null) {
      const raw = localStorage.getItem('tipzo_app_settings');
      if (!raw) {
        cachedDebugFlag = false;
      } else {
        const parsed = JSON.parse(raw);
        cachedDebugFlag = !!parsed.enableDebugLogs;
      }
    }
  } catch {
    cachedDebugFlag = false;
  }

  return !!cachedDebugFlag;
};

// Helper to force-refresh debug flag when settings change
export const _refreshLoggerSettings = () => {
  cachedDebugFlag = null;
};

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
  
  // Development-only verbose logs (guarded by app "debug logs" setting)
  debug: (...args: any[]) => {
    if (isDebugEnabled()) console.log(...args);
  },
  
  warn: (...args: any[]) => {
    if (isDebugEnabled()) console.warn(...args);
  }
};
