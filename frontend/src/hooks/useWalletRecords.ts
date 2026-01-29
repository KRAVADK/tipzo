import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { useState, useCallback } from "react";
import { requestRecordsWithRetry, decryptWithRetry } from "../utils/walletUtils";
import { logger } from "../utils/logger";

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
            // NOTE: requestRecordPlaintexts path is temporarily disabled because
            // current Leo wallet returns INVALID_PARAMS for this program.
            // We rely only on the encrypted requestRecords + decrypt flow for now.
            let records: Array<{ id?: string; plaintext: string }> = [];
            
            // Attempt via requestRecords (encrypted) with retry
            if (records.length === 0 && adapter.requestRecords) {
                try {
                    logger.debug("[DonationRecords] Fetching encrypted records...");
                    const encryptedRecords = await requestRecordsWithRetry(adapter, programId);
                    
                    if (encryptedRecords && encryptedRecords.length > 0) {
                        logger.debug(`[DonationRecords] Fetched ${encryptedRecords.length} encrypted records`);
                        // If decrypt method exists, attempt to decrypt
                        if (adapter.decrypt) {
                            const decryptedRecords: Array<{ id?: string; plaintext: string }> = [];
                            logger.debug(`[DonationRecords] Attempting to decrypt ${encryptedRecords.length} records...`);
                            
                            for (let i = 0; i < encryptedRecords.length; i++) {
                                const record = encryptedRecords[i];
                                try {
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
                                        const decrypted = await decryptWithRetry(adapter, ciphertext);
                                        const plaintext = typeof decrypted === "string" ? decrypted : JSON.stringify(decrypted);
                                        
                                        decryptedRecords.push({
                                            id: typeof record === "object" && record !== null && "id" in record && typeof (record as any).id === "string" ? (record as any).id : undefined,
                                            plaintext: plaintext,
                                        });
                                    } else {
                                        // In many wallets, non-donation records or metadata are returned here.
                                        // Silently skip anything that doesn't look like an Aleo record ciphertext
                                        // to avoid spamming the console.
                                    }
                                } catch (decryptErr) {
                                    console.error(`[DonationRecords] ❌ Failed to decrypt record ${i + 1}:`, decryptErr);
                                }
                            }
                            
                            logger.debug(`[DonationRecords] Successfully decrypted ${decryptedRecords.length} out of ${encryptedRecords.length} records`);
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
                // No records found. We DON'T flip hasPermission to false here,
                // because current wallets may simply not expose history for this program
                // and we don't want to show a misleading "grant OnChainHistory" banner.
                return [];
            }
            
            // Parse records
            logger.debug(`[DonationRecords] Parsing ${records.length} records...`);
            const parsedRecords: RecordDonation[] = [];
            
            for (let i = 0; i < records.length; i++) {
                const record = records[i];
                const recordString = record.plaintext || String(record);
                
                const parsed = parseDonationRecord(recordString);
                if (parsed) {
                    parsedRecords.push(parsed);
                } else {
                    console.warn(`[DonationRecords] ⚠️ Failed to parse record ${i + 1}`);
                }
            }
            
            logger.debug(`[DonationRecords] Parsed ${parsedRecords.length} donation records from wallet (out of ${records.length} total)`);
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
        
        // More flexible regex patterns - handle whitespace variations
        const ownerMatch = fullRecord.match(/owner[:\s]+(aleo1[a-z0-9]+)/i);
        const senderMatch = fullRecord.match(/sender[:\s]+(aleo1[a-z0-9]+)/i);
        const recipientMatch = fullRecord.match(/recipient[:\s]+(aleo1[a-z0-9]+)/i);
        const amountMatch = fullRecord.match(/amount[:\s]+(\d+)u64/i);
        const messageMatch = fullRecord.match(/message[:\s]+(\d+)field/i);
        const timestampMatch = fullRecord.match(/timestamp[:\s]+(\d+)u64/i);
        const nonceMatch = fullRecord.match(/[_\s]nonce[:\s]+([a-zA-Z0-9]+)/i);
        
        if (!ownerMatch || !amountMatch || !timestampMatch) {
            console.warn("[DonationRecords] Missing required fields:", {
                hasOwner: !!ownerMatch,
                hasAmount: !!amountMatch,
                hasTimestamp: !!timestampMatch
            });
            return null;
        }
        
        // Determine record type: RecipientDonation has sender, SentDonation has recipient
        const isRecipientDonation = !!senderMatch && !recipientMatch;
        const isSentDonation = !!recipientMatch && !senderMatch;
        
        if (!isRecipientDonation && !isSentDonation) {
            console.warn("[DonationRecords] Record doesn't match RecipientDonation or SentDonation structure");
            return null;
        }
        
        // Parse timestamp - should be in seconds (Unix timestamp)
        const rawTimestamp = parseInt(timestampMatch[1], 10);
        // Validate timestamp is reasonable (between 2020 and 2100 in seconds)
        // Unix timestamp for 2020-01-01 is 1577836800, for 2100-01-01 is 4102444800
        const MIN_TIMESTAMP = 1577836800; // 2020-01-01
        const MAX_TIMESTAMP = 4102444800; // 2100-01-01
        
        // If timestamp is too large, it might be in milliseconds - convert to seconds
        let timestamp = rawTimestamp;
        if (rawTimestamp > MAX_TIMESTAMP) {
            logger.debug(`[DonationRecords] Timestamp ${rawTimestamp} seems too large, converting from milliseconds to seconds`);
            timestamp = Math.floor(rawTimestamp / 1000);
        }
        
        // Validate final timestamp
        if (timestamp < MIN_TIMESTAMP || timestamp > MAX_TIMESTAMP) {
            logger.debug(`[DonationRecords] Invalid timestamp: ${timestamp} (raw: ${rawTimestamp}), using current time as fallback`);
            timestamp = Math.floor(Date.now() / 1000); // Use current time as fallback
        }
        
        const parsed: RecordDonation = {
            owner: ownerMatch[1],
            amount: parseInt(amountMatch[1], 10), // Keep in microcredits
            message: messageMatch?.[1] || "",
            timestamp: timestamp,
            nonce: nonceMatch?.[1],
        };
        
        if (isRecipientDonation && senderMatch) {
            parsed.sender = senderMatch[1];
        } else if (isSentDonation && recipientMatch) {
            parsed.recipient = recipientMatch[1];
        }
        
        return parsed;
    } catch (error) {
        console.error("[DonationRecords] Failed to parse record:", error, "Record was:", recordString?.substring(0, 200));
        return null;
    }
}

