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
                    // requestRecordPlaintexts may need programId as a parameter or may need to be called differently
                    // Some adapters expect an object with programId, others expect just the string
                    // Try both approaches
                    let result;
                    try {
                        // First try: pass programId as string
                        result = await adapter.requestRecordPlaintexts(programId);
                    } catch (e) {
                        // Second try: pass as object if string fails
                        if (typeof programId === 'string' && programId) {
                            result = await adapter.requestRecordPlaintexts({ programId });
                        } else {
                            throw e;
                        }
                    }
                    
                    records = Array.isArray(result) ? result : [];
                    if (records && records.length > 0) {
                        setHasPermission(true);
                        console.log(`✅ [DonationRecords] Fetched ${records.length} records via requestRecordPlaintexts`);
                    }
                } catch (error: any) {
                    const errorMsg = error?.message || String(error);
                    if (errorMsg.includes("INVALID_PARAMS") || errorMsg.includes("permission") || errorMsg.includes("Permission")) {
                        console.warn("⚠️ [DonationRecords] requestRecordPlaintexts requires OnChainHistory permission or invalid params");
                        console.warn("⚠️ [DonationRecords] Error details:", errorMsg);
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
                            console.log(`[DonationRecords] 🔓 Attempting to decrypt ${encryptedRecords.length} records...`);
                            
                            for (let i = 0; i < encryptedRecords.length; i++) {
                                const record = encryptedRecords[i];
                                try {
                                    console.log(`[DonationRecords] Processing record ${i + 1}/${encryptedRecords.length}:`, typeof record === "string" ? record.substring(0, 100) + "..." : record);
                                    
                                    let ciphertext: string | null = null;
                                    
                                    if (typeof record === "string" && record.startsWith("record1")) {
                                        ciphertext = record;
                                    } else if (typeof record === "object" && record !== null) {
                                        const obj = record as Record<string, unknown>;
                                        ciphertext =
                                            (typeof obj.ciphertext === "string" && obj.ciphertext) ||
                                            (typeof obj.record === "string" && obj.record) ||
                                            (typeof obj.data === "string" && obj.data) ||
                                            "";
                                    }
                                    
                                    if (ciphertext && ciphertext.startsWith("record1")) {
                                        console.log(`[DonationRecords] 🔐 Decrypting record ${i + 1}...`);
                                        const decrypted = await decryptWithRetry(adapter, ciphertext);
                                        const plaintext = typeof decrypted === "string" ? decrypted : JSON.stringify(decrypted);
                                        console.log(`[DonationRecords] ✅ Decrypted record ${i + 1}:`, plaintext.substring(0, 300) + "...");
                                        
                                        decryptedRecords.push({
                                            id: typeof record === "object" && record !== null && "id" in record && typeof (record as any).id === "string" ? (record as any).id : undefined,
                                            plaintext: plaintext,
                                        });
                                    } else {
                                        console.warn(`[DonationRecords] ⚠️ Record ${i + 1} doesn't look like a valid record (doesn't start with 'record1'):`, ciphertext?.substring(0, 50));
                                    }
                                } catch (decryptErr) {
                                    console.error(`[DonationRecords] ❌ Failed to decrypt record ${i + 1}:`, decryptErr);
                                }
                            }
                            
                            console.log(`[DonationRecords] ✅ Successfully decrypted ${decryptedRecords.length} out of ${encryptedRecords.length} records`);
                            records = decryptedRecords;
                            if (records.length > 0) {
                                setHasPermission(true);
                            }
                        } else {
                            console.warn("[DonationRecords] ⚠️ Adapter doesn't have decrypt method, cannot decrypt records");
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
            console.log(`[DonationRecords] 📝 Parsing ${records.length} records...`);
            const parsedRecords: RecordDonation[] = [];
            
            for (let i = 0; i < records.length; i++) {
                const record = records[i];
                const recordString = record.plaintext || String(record);
                console.log(`[DonationRecords] Parsing record ${i + 1}/${records.length}:`, recordString.substring(0, 200) + "...");
                
                const parsed = parseDonationRecord(recordString);
                if (parsed) {
                    console.log(`[DonationRecords] ✅ Successfully parsed record ${i + 1}:`, parsed);
                    parsedRecords.push(parsed);
                } else {
                    console.warn(`[DonationRecords] ⚠️ Failed to parse record ${i + 1}`);
                }
            }
            
            console.log(`✅ [DonationRecords] Parsed ${parsedRecords.length} donation records from wallet (out of ${records.length} total)`);
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
        if (!recordString || typeof recordString !== 'string') {
            console.warn("[DonationRecords] Invalid record string:", recordString);
            return null;
        }
        
        const fullRecord = recordString;
        console.log("[DonationRecords] 🔍 Parsing record (full):", fullRecord);
        
        // More flexible regex patterns - handle whitespace variations
        const ownerMatch = fullRecord.match(/owner[:\s]+(aleo1[a-z0-9]+)/i);
        const senderMatch = fullRecord.match(/sender[:\s]+(aleo1[a-z0-9]+)/i);
        const recipientMatch = fullRecord.match(/recipient[:\s]+(aleo1[a-z0-9]+)/i);
        const amountMatch = fullRecord.match(/amount[:\s]+(\d+)u64/i);
        const messageMatch = fullRecord.match(/message[:\s]+(\d+)field/i);
        const timestampMatch = fullRecord.match(/timestamp[:\s]+(\d+)u64/i);
        const nonceMatch = fullRecord.match(/[_\s]nonce[:\s]+([a-zA-Z0-9]+)/i);
        
        console.log("[DonationRecords] Matches:", {
            owner: ownerMatch?.[1],
            sender: senderMatch?.[1],
            recipient: recipientMatch?.[1],
            amount: amountMatch?.[1],
            message: messageMatch?.[1],
            timestamp: timestampMatch?.[1],
            nonce: nonceMatch?.[1]
        });
        
        if (!ownerMatch || !amountMatch || !timestampMatch) {
            console.warn("[DonationRecords] Missing required fields:", {
                hasOwner: !!ownerMatch,
                hasAmount: !!amountMatch,
                hasTimestamp: !!timestampMatch
            });
            console.warn("[DonationRecords] Full record for debugging:", fullRecord);
            return null;
        }
        
        // Determine record type: RecipientDonation has sender, SentDonation has recipient
        const isRecipientDonation = !!senderMatch && !recipientMatch;
        const isSentDonation = !!recipientMatch && !senderMatch;
        
        if (!isRecipientDonation && !isSentDonation) {
            console.warn("[DonationRecords] Record doesn't match RecipientDonation or SentDonation structure");
            console.warn("[DonationRecords] Has sender:", !!senderMatch, "Has recipient:", !!recipientMatch);
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
            console.log(`[DonationRecords] ✅ Parsed RecipientDonation: owner=${parsed.owner}, sender=${parsed.sender}, amount=${parsed.amount}, timestamp=${parsed.timestamp}`);
        } else if (isSentDonation && recipientMatch) {
            parsed.recipient = recipientMatch[1];
            console.log(`[DonationRecords] ✅ Parsed SentDonation: owner=${parsed.owner}, recipient=${parsed.recipient}, amount=${parsed.amount}, timestamp=${parsed.timestamp}`);
        }
        
        return parsed;
    } catch (error) {
        console.error("[DonationRecords] Failed to parse record:", error, "Record was:", recordString?.substring(0, 200));
        return null;
    }
}

