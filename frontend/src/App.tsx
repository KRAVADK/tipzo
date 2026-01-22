import { useMemo, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { WalletProvider, useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { LeoWalletAdapter } from "@demox-labs/aleo-wallet-adapter-leo";
import { PuzzleWalletAdapter } from "aleo-adapters";
import {
    DecryptPermission,
    WalletAdapterNetwork,
} from "@demox-labs/aleo-wallet-adapter-base";
import { PROGRAM_ID } from "./deployed_program";
import { Header } from "./components/Header";
import { Home } from "./pages/Home";
import { Profile } from "./pages/Profile";
import { Search } from "./pages/Search";
import { History } from "./pages/History";
import { BackgroundAnimation } from "./components/BackgroundAnimation";
import { Toast } from "./components/Toast";
import { useWalletErrors } from "./hooks/useWalletErrors";
import { useWalletEvents } from "./hooks/useWalletEvents";
import { useParallax } from "./hooks/useParallax";
import "./App.css";

const AppContent = () => {
    const { publicKey, wallet, select, wallets } = useWallet();
    const { toast, setToast } = useWalletErrors();
    useWalletEvents();
    const parallaxRef = useParallax(0.3);
    const network = WalletAdapterNetwork.TestnetBeta;

    // Auto-reconnect on mount
    useEffect(() => {
        const wasConnected = localStorage.getItem("wallet_connected");
        const savedAddress = localStorage.getItem("wallet_address");
        const savedAdapter = localStorage.getItem("wallet_adapter");
        
        if (wasConnected === "true" && savedAddress && !publicKey && wallet && savedAdapter) {
            // Try to reconnect after a short delay to ensure wallet is ready
            const attemptReconnect = async () => {
                try {
                    // Wait a bit for wallet to be ready
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Find and select the saved adapter
                    const adapter = wallets.find(w => w.adapter.name === savedAdapter)?.adapter;
                    if (adapter) {
                        await adapter.connect(DecryptPermission.OnChainHistory, network, [PROGRAM_ID]);
                        select(savedAdapter as any);
                        console.log("✅ Auto-reconnected wallet:", savedAddress);
                    }
                } catch (e) {
                    console.warn("⚠️ Auto-reconnect failed:", e);
                    // Don't remove on fail - might be temporary issue
                    // User can manually reconnect if needed
                }
            };
            attemptReconnect();
        }
    }, [publicKey, wallet, select, wallets]);

    return (
        <Router>
            <div className="App">
                <BackgroundAnimation />
                <Header programId={PROGRAM_ID} />
                <main ref={parallaxRef as any} className="main-content parallax-container">
                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/profile/:address?" element={<Profile />} />
                        <Route path="/search" element={<Search />} />
                        <Route path="/history" element={<History />} />
                    </Routes>
                </main>
                {toast && (
                    <Toast
                        message={toast.message}
                        type={toast.type}
                        onClose={() => setToast(null)}
                    />
                )}
            </div>
        </Router>
    );
};

function App() {
    const network = WalletAdapterNetwork.TestnetBeta;

    const wallets = useMemo(
        () => [
            new LeoWalletAdapter({
                appName: "TipZo - Aleo Donations",
            }),
            new PuzzleWalletAdapter({
                appName: "TipZo - Aleo Donations",
                programIdPermissions: {
                    [WalletAdapterNetwork.TestnetBeta]: [PROGRAM_ID],
                    [WalletAdapterNetwork.MainnetBeta]: [PROGRAM_ID]
                }
            }),
        ],
        []
    );

    return (
        <WalletProvider
            wallets={wallets}
            decryptPermission={DecryptPermission.OnChainHistory}
            network={network}
            programs={[PROGRAM_ID]}
            autoConnect={false}
        >
            <AppContent />
        </WalletProvider>
    );
}

export default App;

