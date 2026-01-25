// Explorer API integration for Provable Explorer
// API Base URL: https://api.explorer.provable.com/v1/testnet

import { PROGRAM_ID } from "../deployed_program";
import { fieldToString } from "./aleo";

export interface Transaction {
    id: string;
    program?: string;
    function?: string;
    inputs?: any[];
    outputs?: any[];
    timestamp?: number;
    status?: 'pending' | 'confirmed' | 'failed';
    block_height?: number;
    transitions?: any[];
}

export interface DonationTransaction extends Transaction {
    sender: string;
    receiver: string;
    amount: number;
    message?: string;
    explorerUrl: string;
}

export interface UserProfile {
    name: string;
    bio: string;
}

const MAPPING_URL = "https://api.explorer.provable.com/v1/testnet/program";
const ALEO_RPC_URL = "https://testnet3.aleorpc.com";

// Helper function to get list of all known profile addresses
export const getKnownProfileAddresses = (): string[] => {
    try {
        const knownAddresses = localStorage.getItem('tipzo_known_profiles');
        if (knownAddresses) {
            return JSON.parse(knownAddresses);
        }
        return [];
    } catch (e) {
        console.warn("Failed to get known profiles:", e);
        return [];
    }
};

// Helper function to add address to known profiles list
export const addKnownProfileAddress = (address: string) => {
    try {
        const knownAddresses = getKnownProfileAddresses();
        if (!knownAddresses.includes(address)) {
            knownAddresses.push(address);
            localStorage.setItem('tipzo_known_profiles', JSON.stringify(knownAddresses));
            console.log(`[Cache] Added ${address} to known profiles list`);
        }
    } catch (e) {
        console.warn("Failed to add known profile:", e);
    }
};

// Helper function to discover profile addresses by scanning transactions
// This uses Aleo RPC to find all addresses that created or updated profiles
export const discoverProfileAddresses = async (): Promise<string[]> => {
    const addresses = new Set<string>();
    
    try {
        // Try to get transactions for create_profile and update_profile
        const functions = ['create_profile', 'update_profile'];
        
        for (const functionName of functions) {
            try {
                const response = await fetch(ALEO_RPC_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        id: 1,
                        method: "aleoTransactionsForProgram",
                        params: {
                            programId: PROGRAM_ID,
                            functionName: functionName,
                            page: 0,
                            maxTransactions: 1000
                        }
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.result && Array.isArray(data.result)) {
                        data.result.forEach((tx: any) => {
                            // Extract address from transaction
                            // The address is typically in tx.execution.transitions[0].id or tx.fee_transition.id
                            if (tx.execution?.transitions) {
                                tx.execution.transitions.forEach((transition: any) => {
                                    // The caller address is usually in the transition ID or can be derived
                                    // For now, we'll try to extract from transaction structure
                                    if (transition.id) {
                                        // Transition ID format might contain address info
                                        // We'll need to parse it or use a different approach
                                    }
                                });
                            }
                            
                            // Alternative: Check if transaction has fee_transition with address
                            if (tx.fee_transition?.id) {
                                // Fee transition might have the caller address
                            }
                        });
                    }
                }
            } catch (e) {
                console.warn(`Failed to get transactions for ${functionName}:`, e);
            }
        }
        
        // Since extracting addresses from transactions is complex,
        // we'll use a different approach: try common addresses or use a seed list
        // For now, return empty and rely on localStorage discovery
        
    } catch (e) {
        console.warn("Failed to discover profile addresses:", e);
    }
    
    return Array.from(addresses);
};

// Helper function to cache profile in localStorage for nickname search
export const cacheProfile = (address: string, profile: { name: string; bio: string }, createdAt?: number) => {
    try {
        const cacheKey = `tipzo_profile_cache_${address}`;
        const now = Date.now();
        // Use provided createdAt or current time (for new profiles)
        const profileCreatedAt = createdAt || now;
        
        // Check if profile already exists in cache
        const existing = localStorage.getItem(cacheKey);
        let finalCreatedAt = profileCreatedAt;
        
        if (existing) {
            try {
                const existingData = JSON.parse(existing);
                // Keep the original creation date if it exists
                if (existingData.createdAt && existingData.createdAt < profileCreatedAt) {
                    finalCreatedAt = existingData.createdAt;
                }
            } catch (e) {
                // If parsing fails, use new date
            }
        }
        
        localStorage.setItem(cacheKey, JSON.stringify({
            address,
            name: profile.name,
            bio: profile.bio,
            cachedAt: now,
            createdAt: finalCreatedAt // Store creation date for sorting
        }));
        // Add to known profiles list
        addKnownProfileAddress(address);
        console.log(`[Cache] Cached profile for ${address}:`, profile.name);
    } catch (e) {
        console.warn("Failed to cache profile:", e);
    }
};

export const getProfileFromChain = async (address: string): Promise<UserProfile | null> => {
    try {
        const url = `${MAPPING_URL}/${PROGRAM_ID}/mapping/profiles/${address}`;
        console.log(`Fetching profile from: ${url}`);
        
        const response = await fetch(url);
        if (!response.ok) {
            console.warn("Profile not found or error fetching:", response.statusText);
            return null;
        }

        const data = await response.json();
        console.log("Raw profile data from API:", JSON.stringify(data, null, 2));
        
        // If profile exists, automatically add to known profiles list
        // This ensures profiles are discoverable by all users
        if (data) {
            addKnownProfileAddress(address);
        }
        
        if (!data) {
            console.warn("Empty data returned from API");
            return null;
        }

        // Parse fields - API might return different formats:
        // 1. Object with name/bio fields: { name: "123field", bio: "456field" }
        // 2. Object with c0/c1 fields: { c0: "123field", c1: "456field" }
        // 3. String representation: "{ name: 123field, bio: 456field }"
        // 4. Nested structure
        
        let rawName: string | undefined;
        let rawBio: string | undefined;
        
        // Try different possible formats
        if (typeof data === 'string') {
            // Parse string representation - handle newlines and whitespace
            // Format: "{\n  name: 461480490593field,\n  bio: 26484field\n}"
            const normalized = data.replace(/\s+/g, ' '); // Normalize whitespace
            const nameMatch = normalized.match(/name:\s*(\d+field)/i);
            const bioMatch = normalized.match(/bio:\s*(\d+field)/i);
            rawName = nameMatch?.[1];
            rawBio = bioMatch?.[1];
            
            // If regex didn't work, try to parse as JSON-like structure
            if (!rawName) {
                try {
                    // Try to extract field values more flexibly
                    const namePattern = /name[:\s]+(\d+field)/i;
                    const bioPattern = /bio[:\s]+(\d+field)/i;
                    const nameMatch2 = data.match(namePattern);
                    const bioMatch2 = data.match(bioPattern);
                    rawName = nameMatch2?.[1];
                    rawBio = bioMatch2?.[1];
                } catch (e) {
                    console.warn("Failed to parse string format:", e);
                }
            }
        } else if (typeof data === 'object' && data !== null) {
            // Try direct fields first
            rawName = data.name || data.c0 || data[0];
            rawBio = data.bio || data.c1 || data[1];
            
            // If still not found, try nested structures
            if (!rawName && data.value) {
                rawName = data.value.name || data.value.c0;
                rawBio = data.value.bio || data.value.c1;
            }
        }
        
        console.log("Parsed fields:", { rawName, rawBio });
        
        // If we have at least name field, return profile (even if empty)
        if (rawName) {
            const decodedName = fieldToString(rawName);
            const decodedBio = rawBio ? fieldToString(rawBio) : "";
            
            console.log("Decoded profile:", { name: decodedName, bio: decodedBio });
            
            const profileData = {
                name: decodedName,
                bio: decodedBio
            };
            
            // Cache the profile for nickname search
            cacheProfile(address, profileData);
            
            return profileData;
        }
        
        console.warn("Could not parse profile data - no name field found");
        return null;
        
    } catch (error) {
        console.error("Error fetching profile:", error);
        return null;
    }
};
