import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { useState, useCallback } from "react";
import { requestRecordsWithRetry, decryptWithRetry } from "../utils/walletUtils";

export interface RecordDonation {
    owner: string;
    sender?: string; // Only in RecipientDonation
    recipient?: string; // Only in SentDonation
    amount: number; // in microcredits
    message: string; // field as string
    timestamp: number;
    nonce?: string;
}

export const useWalletRecords = () => {
    const { wallet, publicKey } = useWallet();
    const adapter = wallet?.adapter as any;
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const fetchRecords = useCallback(async (programId: string): Promise<RecordDonation[]> => {
        if (!publicKey || !adapter) {
            return [];
        }
        
        setIsLoading(true);
        try {
            // Attempt to fetch records via requestRecordPlaintexts (requires OnChainHistory permission)
            let records: Array<{ id?: string; plaintext: string }> = [];
            
            if (adapter.requestRecordPlaintexts) {
                try {
                    records = await adapter.requestRecordPlaintexts(programId);
                    if (records && records.length > 0) {
                        setHasPermission(true);
                        console.log(`✅ [DonationRecords] Fetched ${records.length} records via requestRecordPlaintexts`);
                    }
                } catch (error: any) {
                    if (error?.message?.includes("INVALID_PARAMS") || error?.message?.includes("permission")) {
                        console.warn("⚠️ [DonationRecords] requestRecordPlaintexts requires OnChainHistory permission");
                        setHasPermission(false);
                    } else {
                        console.warn("[DonationRecords] requestRecordPlaintexts failed:", error);
                    }
                }
            }
            
            // Fallback: attempt via requestRecords (encrypted) with retry
            if (records.length === 0 && adapter.requestRecords) {
                try {
                    console.log("[DonationRecords] 🔓 Fetching encrypted records...");
                    const encryptedRecords = await requestRecordsWithRetry(adapter, programId);
                    
                    if (encryptedRecords && encryptedRecords.length > 0) {
                        console.log(`✅ [DonationRecords] Fetched ${encryptedRecords.length} encrypted records via requestRecords`);
                        // If decrypt method exists, attempt to decrypt
                        if (adapter.decrypt) {
                            const decryptedRecords: Array<{ id?: string; plaintext: string }> = [];
                            for (const record of encryptedRecords) {
                                try {
                                    if (typeof record === "string" && record.startsWith("record1")) {
                                        const decrypted = await decryptWithRetry(adapter, record);
                                        decryptedRecords.push({ plaintext: decrypted });
                                    } else if (typeof record === "object" && record !== null) {
                                        const obj = record as Record<string, unknown>;
                                        const ciphertext =
                                            (typeof obj.ciphertext === "string" && obj.ciphertext) ||
                                            (typeof obj.record === "string" && obj.record) ||
                                            "";
                                        if (ciphertext && ciphertext.startsWith("record1")) {
                                            const decrypted = await decryptWithRetry(adapter, ciphertext);
                                            decryptedRecords.push({
                                                id: typeof obj.id === "string" ? obj.id : undefined,
                                                plaintext: typeof decrypted === "string" ? decrypted : JSON.stringify(decrypted),
                                            });
                                        }
                                    }
                                } catch (decryptErr) {
                                    console.warn("[DonationRecords] Failed to decrypt record:", decryptErr);
                                }
                            }
                            records = decryptedRecords;
                            if (records.length > 0) {
                                setHasPermission(true);
                            }
                        }
                    }
                } catch (error) {
                    console.warn("[DonationRecords] requestRecords failed:", error);
                }
            }
            
            if (!records || records.length === 0) {
                if (hasPermission === null) {
                    setHasPermission(false);
                }
                return [];
            }
            
            // Parse records
            const parsedRecords: RecordDonation[] = records
                .map(record => parseDonationRecord(record.plaintext || String(record)))
                .filter(Boolean) as RecordDonation[];
            
            console.log(`✅ [DonationRecords] Parsed ${parsedRecords.length} donation records from wallet`);
            return parsedRecords;
            
        } catch (error) {
            console.error("❌ [DonationRecords] Error fetching records:", error);
            setHasPermission(false);
            return [];
        } finally {
            setIsLoading(false);
        }
    }, [publicKey, adapter, hasPermission]);

    return { fetchRecords, hasPermission, isLoading };
};

// Helper function to parse Leo record into TypeScript object
// New structure:
// - RecipientDonation: owner (recipient), sender, amount, message, timestamp
// - SentDonation: owner (sender), recipient, amount, message, timestamp
function parseDonationRecord(recordString: string): RecordDonation | null {
    try {
        console.log("[DonationRecords] 🔍 Parsing record:", recordString.substring(0, 200) + "...");
        
        const ownerMatch = recordString.match(/owner:\s*(aleo1[a-z0-9]+)/);
        const senderMatch = recordString.match(/sender:\s*(aleo1[a-z0-9]+)/);
        const recipientMatch = recordString.match(/recipient:\s*(aleo1[a-z0-9]+)/);
        const amountMatch = recordString.match(/amount:\s*(\d+)u64/);
        const messageMatch = recordString.match(/message:\s*(\d+)field/);
        const timestampMatch = recordString.match(/timestamp:\s*(\d+)u64/);
        const nonceMatch = recordString.match(/_nonce:\s*([a-zA-Z0-9]+)/);
        
        if (!ownerMatch || !amountMatch || !timestampMatch) {
            console.warn("[DonationRecords] Missing required fields (owner, amount, timestamp)");
            return null;
        }
        
        // Determine record type: RecipientDonation has sender, SentDonation has recipient
        const isRecipientDonation = !!senderMatch && !recipientMatch;
        const isSentDonation = !!recipientMatch && !senderMatch;
        
        if (!isRecipientDonation && !isSentDonation) {
            console.warn("[DonationRecords] Record doesn't match RecipientDonation or SentDonation structure");
            return null;
        }
        
        const parsed: RecordDonation = {
            owner: ownerMatch[1],
            amount: parseInt(amountMatch[1], 10), // Keep in microcredits
            message: messageMatch?.[1] || "",
            timestamp: parseInt(timestampMatch[1], 10),
            nonce: nonceMatch?.[1],
        };
        
        if (isRecipientDonation && senderMatch) {
            parsed.sender = senderMatch[1];
            console.log(`[DonationRecords] ✅ Parsed RecipientDonation: owner=${parsed.owner}, sender=${parsed.sender}`);
        } else if (isSentDonation && recipientMatch) {
            parsed.recipient = recipientMatch[1];
            console.log(`[DonationRecords] ✅ Parsed SentDonation: owner=${parsed.owner}, recipient=${parsed.recipient}`);
        }
        
        return parsed;
    } catch (error) {
        console.error("[DonationRecords] Failed to parse record:", error);
        return null;
    }
}

