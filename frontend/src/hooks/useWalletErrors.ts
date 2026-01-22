import { useState } from "react";

export const useWalletErrors = () => {
    const [toast, setToast] = useState<{ message: string; type: "error" | "warning" | "success" } | null>(null);

    // Error handling is done in components via try-catch blocks
    // This hook just provides toast state management
    return { toast, setToast };
};
