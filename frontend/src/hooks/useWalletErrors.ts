import { useEffect, useState } from "react";
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { logger } from "../utils/logger";

export const useWalletErrors = () => {
    const { publicKey, wallet, connecting, error } = useWallet();
    const [toast, setToast] = useState<{ message: string; type: "error" | "warning" | "success" } | null>(null);

    useEffect(() => {
        if (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            if (errorMessage.includes("not installed") || errorMessage.includes("No provider")) {
                setToast({
                    message: "Leo Wallet is not installed. Please install it from https://www.aleo.org/get-started",
                    type: "error"
                });
                logger.error("Wallet", "Wallet not installed");
            } else if (errorMessage.includes("rejected") || errorMessage.includes("cancelled") || errorMessage.includes("denied")) {
                if (errorMessage.includes("connection")) {
                    setToast({
                        message: "Connection cancelled",
                        type: "warning"
                    });
                    logger.error("Wallet", "Connection cancelled");
                } else {
                    setToast({
                        message: "Transaction cancelled by user",
                        type: "warning"
                    });
                    logger.error("Transaction", "Cancelled by user");
                }
            } else if (errorMessage.includes("insufficient") || errorMessage.includes("balance")) {
                setToast({
                    message: "Insufficient balance. Please check your wallet.",
                    type: "error"
                });
                logger.error("Transaction", "Insufficient balance");
            } else if (errorMessage.includes("INVALID_PARAMS") || errorMessage.includes("Failed to authorize")) {
                setToast({
                    message: "Transaction authorization failed. Please check your wallet permissions and try again.",
                    type: "error"
                });
                logger.error("Transaction", "Authorization failed - check wallet permissions");
            } else if (errorMessage.includes("network") || errorMessage.includes("Network")) {
                setToast({
                    message: "Network error. Please try again.",
                    type: "error"
                });
                logger.error("Network", errorMessage);
            } else {
                setToast({
                    message: errorMessage,
                    type: "error"
                });
                logger.error("Wallet", errorMessage);
            }
        }
    }, [error]);

    return { toast, setToast };
};

