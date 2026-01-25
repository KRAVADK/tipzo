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
const EXPLORER_API_BASE = "https://api.explorer.provable.com/v1/testnet";
// Try multiple RPC endpoints for reliability
const ALEO_RPC_URLS = [
    "https://api.testnet.aleo.org/v1",
    "https://testnet3.aleorpc.com",
    "https://vm.aleo.org/api/testnet3"
];

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

// Alternative: Try to get profile addresses from Provable Explorer API
// Since RPC might not work, we'll use a different approach - check known addresses
// or use a seed list that gets populated as profiles are discovered
const getKnownProfileAddressesFromStorage = (): string[] => {
    try {
        // Get from global list
        const knownList = localStorage.getItem('tipzo_known_profiles');
        if (knownList) {
            return JSON.parse(knownList);
        }
        return [];
    } catch (e) {
        console.warn("Failed to get known profiles from storage:", e);
        return [];
    }
};

// Try to get profile addresses from Provable Explorer API by checking program transactions
// This is a fallback when RPC doesn't work
const discoverProfilesFromExplorerAPI = async (): Promise<string[]> => {
    const addresses = new Set<string>();
    
    try {
        // Try to get program information which might include transaction history
        // Note: Provable Explorer API might not directly support getting all transactions
        // but we can try to get program details
        const programUrl = `${EXPLORER_API_BASE}/program/${PROGRAM_ID}`;
        const response = await fetch(programUrl);
        
        if (response.ok) {
            const data = await response.json();
            // If the API returns transaction information, extract addresses
            // This is a placeholder - actual implementation depends on API structure
            console.log("[Discover] Program data from Explorer API:", data);
        }
    } catch (e) {
        console.warn("[Discover] Failed to get program data from Explorer API:", e);
    }
    
    return Array.from(addresses);
};

// Helper function to discover profile addresses by scanning transactions
// This uses Aleo RPC to find all addresses that created or updated profiles
// Falls back to known addresses from storage if RPC fails
export const discoverProfileAddresses = async (): Promise<string[]> => {
    const addresses = new Set<string>();
    
    // First, add all known addresses from storage (these are profiles that have been discovered)
    const knownAddresses = getKnownProfileAddressesFromStorage();
    knownAddresses.forEach(addr => addresses.add(addr));
    console.log(`[Discover] Starting with ${knownAddresses.length} known addresses from storage`);
    
    try {
        // Try to get transactions for create_profile and update_profile using RPC
        const functions = ['create_profile', 'update_profile'];
        
        for (const functionName of functions) {
            let success = false;
            // Try each RPC endpoint until one works
            for (const rpcUrl of ALEO_RPC_URLS) {
                try {
                    const response = await fetch(rpcUrl, {
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
                            console.log(`[Discover] Found ${data.result.length} transactions for ${functionName} via ${rpcUrl}`);
                            success = true;
                            
                            data.result.forEach((tx: any) => {
                            // Try multiple ways to extract the caller address
                            let address: string | null = null;
                            
                            // Method 1: Check fee_transition - the owner is usually the caller
                            if (tx.fee_transition) {
                                // Fee transition owner is the caller
                                if (tx.fee_transition.owner && tx.fee_transition.owner.startsWith('aleo1')) {
                                    address = tx.fee_transition.owner;
                                } else if (tx.fee_transition.id) {
                                    // Try to extract from fee transition ID
                                    const feeId = String(tx.fee_transition.id);
                                    const addressMatch = feeId.match(/(aleo1[a-z0-9]{58,63})/);
                                    if (addressMatch) {
                                        address = addressMatch[1];
                                    }
                                }
                            }
                            
                            // Method 2: Check execution transitions - look for finalize operations
                            if (!address && tx.execution?.transitions) {
                                for (const transition of tx.execution.transitions) {
                                    if (transition.function === functionName || transition.function?.includes(functionName)) {
                                        // Check if transition has owner field
                                        if (transition.owner && transition.owner.startsWith('aleo1')) {
                                            address = transition.owner;
                                            break;
                                        }
                                        // Try to extract from transition ID
                                        if (transition.id) {
                                            const transitionId = String(transition.id);
                                            const addressMatch = transitionId.match(/(aleo1[a-z0-9]{58,63})/);
                                            if (addressMatch) {
                                                address = addressMatch[1];
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            
                            // Method 3: Check finalize operations - they contain the caller as first parameter
                            if (!address && tx.execution?.finalize) {
                                const finalize = tx.execution.finalize;
                                if (finalize && Array.isArray(finalize)) {
                                    for (const op of finalize) {
                                        if (op && typeof op === 'object') {
                                            // Finalize operations for create_profile/update_profile have user address as first param
                                            if (op.mappingKey && op.mappingKey.startsWith('aleo1')) {
                                                address = op.mappingKey;
                                                break;
                                            }
                                            if (op.key && op.key.startsWith('aleo1')) {
                                                address = op.key;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            
                            // Method 4: Check transaction metadata
                            if (!address) {
                                if (tx.caller && tx.caller.startsWith('aleo1')) {
                                    address = tx.caller;
                                } else if (tx.sender && tx.sender.startsWith('aleo1')) {
                                    address = tx.sender;
                                } else if (tx.address && tx.address.startsWith('aleo1')) {
                                    address = tx.address;
                                } else if (tx.owner && tx.owner.startsWith('aleo1')) {
                                    address = tx.owner;
                                }
                            }
                            
                            if (address && address.length >= 58) {
                                addresses.add(address);
                                console.log(`[Discover] Found profile address: ${address} from ${functionName} transaction`);
                            } else {
                                console.warn(`[Discover] Could not extract address from transaction:`, tx);
                                }
                            });
                            break; // Success, no need to try other endpoints
                        } else if (data.error) {
                            console.warn(`[Discover] RPC error for ${functionName} from ${rpcUrl}:`, data.error);
                        }
                    } else {
                        console.warn(`[Discover] Failed to fetch from ${rpcUrl} for ${functionName}:`, response.status, response.statusText);
                    }
                } catch (e) {
                    console.warn(`[Discover] Exception with ${rpcUrl} for ${functionName}:`, e);
                    // Continue to next endpoint
                }
            }
            
            if (!success) {
                console.warn(`[Discover] All RPC endpoints failed for ${functionName}, using known addresses from storage`);
                // Try alternative method using Explorer API
                try {
                    const explorerAddresses = await discoverProfilesFromExplorerAPI();
                    explorerAddresses.forEach(addr => addresses.add(addr));
                    if (explorerAddresses.length > 0) {
                        console.log(`[Discover] Found ${explorerAddresses.length} addresses via Explorer API`);
                    }
                } catch (e) {
                    console.warn("[Discover] Explorer API method also failed:", e);
                }
            }
        }
        
        console.log(`[Discover] Discovered ${addresses.size} total profile addresses (${addresses.size - knownAddresses.length} new from blockchain)`);
        
    } catch (e) {
        console.warn("Failed to discover profile addresses:", e);
        console.log(`[Discover] Using ${knownAddresses.length} known addresses from storage as fallback`);
    }
    
    return Array.from(addresses);
};

// Helper function to cache profile in localStorage for nickname search
// This function is called whenever a profile is found or created
// It ensures profiles are available to all users through localStorage
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
        // Add to known profiles list - this is critical for profile discovery
        // When a profile is cached, it's added to the global list that all users can see
        addKnownProfileAddress(address);
        console.log(`[Cache] Cached profile for ${address}:`, profile.name);
        
        // Dispatch event to notify other components that a new profile was discovered
        window.dispatchEvent(new CustomEvent('profileDiscovered', { detail: { address, profile } }));
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
