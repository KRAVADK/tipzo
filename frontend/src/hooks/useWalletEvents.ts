import { useEffect } from "react";
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { WalletAdapterNetwork } from "@demox-labs/aleo-wallet-adapter-base";
import { logger } from "../utils/logger";

export const useWalletEvents = () => {
    const { publicKey, disconnect, wallet } = useWallet();
    const network = WalletAdapterNetwork.TestnetBeta;

    useEffect(() => {
        if (!wallet?.adapter) return;

        const adapter = wallet.adapter as any;

        // Handle account change
        const handleAccountChange = (newAddress: string) => {
            if (newAddress && newAddress !== publicKey) {
                logger.wallet.connected(newAddress);
                // Save connection state
                localStorage.setItem("wallet_connected", "true");
                localStorage.setItem("wallet_address", newAddress);
            }
        };

        // Handle disconnect
        const handleDisconnect = () => {
            logger.wallet.disconnected();
            localStorage.removeItem("wallet_connected");
            localStorage.removeItem("wallet_address");
        };

        // Handle network change
        const handleNetworkChange = (newNetwork: string) => {
            if (newNetwork !== network) {
                logger.error("Network", `Network changed to ${newNetwork}. Please switch to ${network}`);
            }
        };

        // Try to attach event listeners if available
        if (adapter.on) {
            adapter.on("accountChanged", handleAccountChange);
            adapter.on("disconnect", handleDisconnect);
            adapter.on("networkChanged", handleNetworkChange);
        }

        // Also listen to window events for Leo Wallet
        const windowAccountChange = (event: CustomEvent) => {
            if (event.detail?.address) {
                handleAccountChange(event.detail.address);
            }
        };

        const windowDisconnect = () => {
            handleDisconnect();
        };

        window.addEventListener("leoWalletAccountChanged" as any, windowAccountChange);
        window.addEventListener("leoWalletDisconnect" as any, windowDisconnect);

        return () => {
            if (adapter.off) {
                adapter.off("accountChanged", handleAccountChange);
                adapter.off("disconnect", handleDisconnect);
                adapter.off("networkChanged", handleNetworkChange);
            }
            window.removeEventListener("leoWalletAccountChanged" as any, windowAccountChange);
            window.removeEventListener("leoWalletDisconnect" as any, windowDisconnect);
        };
    }, [wallet, publicKey, network, disconnect]);
};

