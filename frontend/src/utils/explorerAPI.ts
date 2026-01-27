// Explorer API integration for Provable Explorer
// API Base URL: https://api.explorer.provable.com/v1/testnet

import { PROGRAM_ID } from "../deployed_program";
import { fieldToString } from "./aleo";
import { logger } from "./logger";

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
const PROVABLE_API_V1_BASE = "https://api.explorer.provable.com/v1/testnet";
const PROVABLE_API_V2_BASE = "https://api.provable.com/v2/testnet";

// Public profiles registry URL (can be hosted on GitHub, Netlify, or any static hosting)
// Format: JSON array of profile addresses: ["aleo1...", "aleo1...", ...]
// Update this URL to match your repository
const PUBLIC_PROFILES_REGISTRY_URL = "https://raw.githubusercontent.com/barbos001/tipzo/main/public-profiles.json";

// Fallback URL if GitHub doesn't work (Netlify or other hosting)
const PUBLIC_PROFILES_REGISTRY_FALLBACK = "https://tipzo.netlify.app/public-profiles.json";

// Get all profile addresses from public registry (GitHub/Netlify or local public folder)
export const getPublicProfilesRegistry = async (): Promise<string[]> => {
    const urls = [
        // Try local public folder first (works after build)
        '/public-profiles.json',
        // Then try GitHub
        PUBLIC_PROFILES_REGISTRY_URL,
        // Then try Netlify fallback
        PUBLIC_PROFILES_REGISTRY_FALLBACK
    ];
    
    for (const url of urls) {
        try {
            const response = await fetch(url, {
                cache: 'no-cache',
                headers: {
                    'Accept': 'application/json',
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // Handle different formats
                let addresses: string[] = [];
                
                if (Array.isArray(data)) {
                    // Direct array of addresses
                    addresses = data.filter((addr): addr is string => 
                        typeof addr === 'string' && addr.startsWith('aleo1')
                    );
                } else if (data && Array.isArray(data.profiles)) {
                    // Object with profiles array
                    addresses = data.profiles.filter((addr: any): addr is string => 
                        typeof addr === 'string' && addr.startsWith('aleo1')
                    );
                } else if (data && Array.isArray(data.addresses)) {
                    // Object with addresses array
                    addresses = data.addresses.filter((addr: any): addr is string => 
                        typeof addr === 'string' && addr.startsWith('aleo1')
                    );
                }
                
                if (addresses.length > 0) {
                    logger.debug(`[Registry] Loaded ${addresses.length} profiles from ${url}`);
                    return addresses;
                }
            }
        } catch (error) {
            // Silently continue to next URL
            continue;
        }
    }
    
    // If all URLs failed, return empty array (don't log error - it's normal if file doesn't exist yet)
    return [];
};

// Get total number of registered profiles from blockchain
export const getProfileCount = async (): Promise<number> => {
    try {
        const url = `${MAPPING_URL}/${PROGRAM_ID}/mapping/profile_count/0`;
        const response = await fetch(url);
        if (!response.ok) {
            // 404 is normal for new contracts where no profiles have been created yet
            if (response.status === 404) {
                logger.debug("[Registry] Profile count mapping not initialized yet");
                return 0;
            }
            console.warn("Failed to get profile count:", response.statusText);
            return 0;
        }
        const data = await response.json();
        // Parse the u64 value from response
        if (typeof data === 'string') {
            // Extract number from string like "123u64" or "123"
            const match = data.match(/(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
        } else if (typeof data === 'number') {
            return data;
        } else if (data && typeof data.value === 'number') {
            return data.value;
        }
        return 0;
    } catch (error) {
        console.error("Error fetching profile count:", error);
        return 0;
    }
};

// Get profile address at specific index from blockchain
export const getProfileAddressAtIndex = async (index: number): Promise<string | null> => {
    try {
        const url = `${MAPPING_URL}/${PROGRAM_ID}/mapping/active_profiles/${index}`;
        const response = await fetch(url);
        if (!response.ok) {
            // 404 is normal if index doesn't exist (no profile at that index)
            if (response.status === 404) {
                return null;
            }
            console.warn(`Failed to get profile at index ${index}:`, response.statusText);
            return null;
        }
        const data = await response.json();
        // Parse address from response
        if (typeof data === 'string') {
            // Extract address from string (should be aleo1...)
            if (data.startsWith('aleo1')) {
                return data;
            }
            // Try to extract from string representation
            const match = data.match(/aleo1[a-z0-9]{58}/);
            return match ? match[0] : null;
        } else if (data && typeof data.value === 'string') {
            return data.value.startsWith('aleo1') ? data.value : null;
        } else if (data && typeof data === 'object' && data.address) {
            return data.address;
        }
        return null;
    } catch (error) {
        console.error(`Error fetching profile at index ${index}:`, error);
        return null;
    }
};

// Scan blockchain for all profiles using Provable API v2 latest-calls endpoint
// This is the most efficient method as it returns up to 1000 latest calls to the program
export const scanBlockchainForProfiles = async (): Promise<string[]> => {
    const discoveredAddresses = new Set<string>();
    
    try {
        logger.debug("[Blockchain Scan] Scanning for profiles...");
        
        // Method 1: Use registry mapping (if available) - fastest
        try {
            const count = await getProfileCount();
            if (count > 0) {
                logger.debug(`[Blockchain Scan] Found ${count} profiles in registry mapping`);
                for (let i = 0; i < Math.min(count, 1000); i++) {
                    const address = await getProfileAddressAtIndex(i);
                    if (address) {
                        discoveredAddresses.add(address);
                    }
                }
            }
        } catch (e) {
            logger.warn("[Blockchain Scan] Failed to get profiles from registry:", e);
        }
        
        // Method 2: Use Provable API v2 latest-calls endpoint (most efficient)
        // This returns up to 1000 latest calls to the program
        const programIds = [PROGRAM_ID, "tipzo_app_v6.aleo"]; // Try both v7 and v6
        
        for (const programId of programIds) {
            try {
                const latestCallsUrl = `${PROVABLE_API_V2_BASE}/programs/${programId}/latest-calls`;
                logger.debug(`[Blockchain Scan] Fetching latest calls from: ${latestCallsUrl}`);
                
                const response = await fetch(latestCallsUrl);
                if (response.ok) {
                    const calls = await response.json();
                    const callsArray = Array.isArray(calls) ? calls : (calls.calls || calls.data || []);
                    
                    logger.debug(`[Blockchain Scan] Found ${callsArray.length} calls for ${programId}`);
                    
                    callsArray.forEach((call: any) => {
                        // Extract function name and caller address
                        const functionName = call.function || call.functionName || call.transition?.function;
                        const isProfileFunction = functionName === "create_profile" || functionName === "update_profile";
                        
                        if (isProfileFunction) {
                            // Extract caller address from various possible locations
                            let address: string | null = null;
                            if (call.caller) address = call.caller;
                            else if (call.owner) address = call.owner;
                            else if (call.address) address = call.address;
                            else if (call.transition?.caller) address = call.transition.caller;
                            else if (call.transaction?.owner) address = call.transaction.owner;
                            else if (call.transaction?.caller) address = call.transaction.caller;
                            
                            if (address && typeof address === 'string' && address.startsWith('aleo1')) {
                                discoveredAddresses.add(address);
                            }
                        }
                    });
                    
                    // If we found calls, break (don't need to check v6)
                    if (callsArray.length > 0) break;
                } else {
                    console.warn(`[Blockchain Scan] Failed to fetch latest calls for ${programId}: ${response.status} ${response.statusText}`);
                }
            } catch (e) {
                console.warn(`[Blockchain Scan] Error fetching latest calls for ${programId}:`, e);
            }
        }
        
        // Method 3: Fallback - Scan recent blocks if API v2 doesn't work
        if (discoveredAddresses.size === 0) {
            try {
                logger.debug("[Blockchain Scan] Fallback: Scanning recent blocks...");
                const latestBlockUrl = `${PROVABLE_API_V1_BASE}/latest/block`;
                const blockResponse = await fetch(latestBlockUrl);
                
                if (blockResponse.ok) {
                    const blockData = await blockResponse.json();
                    const latestHeight = blockData.height || blockData.block?.height;
                    
                    if (latestHeight) {
                        // Scan last 50 blocks for profile transactions
                        const startHeight = Math.max(0, latestHeight - 50);
                        logger.debug(`[Blockchain Scan] Scanning blocks ${startHeight} to ${latestHeight}...`);
                        
                        for (let height = latestHeight; height >= startHeight && height >= 0; height--) {
                            try {
                                const blockTxUrl = `${PROVABLE_API_V1_BASE}/block/${height}/transactions`;
                                const txResponse = await fetch(blockTxUrl);
                                
                                if (txResponse.ok) {
                                    const txData = await txResponse.json();
                                    const transactions = Array.isArray(txData) ? txData : (txData.transactions || []);
                                    
                                    transactions.forEach((tx: any) => {
                                        const transitions = tx.transitions || tx.execution?.transitions || [];
                                        transitions.forEach((transition: any) => {
                                            const programId = transition.program || transition.programId;
                                            const functionName = transition.function || transition.functionName;
                                            
                                            if ((programId === PROGRAM_ID || programId === "tipzo_app_v6.aleo") &&
                                                (functionName === "create_profile" || functionName === "update_profile")) {
                                                let address: string | null = null;
                                                if (transition.caller) address = transition.caller;
                                                else if (tx.owner) address = tx.owner;
                                                
                                                if (address && address.startsWith('aleo1')) {
                                                    discoveredAddresses.add(address);
                                                }
                                            }
                                        });
                                    });
                                }
                            } catch (e) {
                                // Skip failed blocks
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn("[Blockchain Scan] Failed to scan blocks:", e);
            }
        }
        
        // Method 4: Verify known addresses have profiles
        try {
            const knownAddresses = getKnownProfileAddresses();
            logger.debug(`[Blockchain Scan] Verifying ${knownAddresses.length} known addresses...`);
            
            const checkPromises = knownAddresses.slice(0, 50).map(async (address) => {
                try {
                    const profile = await getProfileFromChain(address);
                    if (profile) {
                        discoveredAddresses.add(address);
                        return true;
                    }
                } catch (e) {
                    // Profile doesn't exist on chain
                }
                return false;
            });
            
            await Promise.all(checkPromises);
        } catch (e) {
            console.warn("[Blockchain Scan] Failed to verify known addresses:", e);
        }
        
        const addresses = Array.from(discoveredAddresses).filter(addr => addr && typeof addr === 'string' && addr.startsWith('aleo1'));
        logger.debug(`[Blockchain Scan] Discovered ${addresses.length} unique profile addresses`);
        return addresses;
    } catch (error) {
        console.error("[Blockchain Scan] Error scanning blockchain for profiles:", error);
        return [];
    }
};

// Get all registered profile addresses from blockchain
export const getAllRegisteredProfiles = async (): Promise<string[]> => {
    try {
        // First try the registry mapping (fastest if it exists)
        const count = await getProfileCount();
        logger.debug(`[Registry] Found ${count} registered profiles on blockchain registry`);
        
        const addressesFromRegistry: string[] = [];
        if (count > 0) {
            // Fetch all profile addresses in parallel (limit to reasonable number)
            const maxProfiles = Math.min(count, 1000); // Limit to 1000 profiles
            const fetchPromises: Promise<string | null>[] = [];
            
            for (let i = 0; i < maxProfiles; i++) {
                fetchPromises.push(getProfileAddressAtIndex(i));
            }
            
            const addresses = await Promise.all(fetchPromises);
            addressesFromRegistry.push(...addresses.filter((addr): addr is string => addr !== null && addr.startsWith('aleo1')));
        }
        
        // Also scan blockchain for profiles (catches profiles even if registry is empty)
        const scannedAddresses = await scanBlockchainForProfiles();
        
        // Combine both sources and remove duplicates
        const allAddresses = new Set([...addressesFromRegistry, ...scannedAddresses]);
        const uniqueAddresses = Array.from(allAddresses);
        
        logger.debug(`[Registry] Total unique profiles: ${uniqueAddresses.length}`);
        return uniqueAddresses;
    } catch (error) {
        console.error("Error fetching all registered profiles:", error);
        // Fallback to scanning if registry fails
        return await scanBlockchainForProfiles();
    }
};

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
            logger.debug(`[Cache] Added ${address} to known profiles list`);
        }
    } catch (e) {
        console.warn("Failed to add known profile:", e);
    }
};

// Removed discoverProfileAddresses - all profiles come from blockchain scanning

// Cache function removed - all data comes from blockchain
export const cacheProfile = () => {
    // No-op: caching removed, all profiles come from blockchain
};

export const getProfileFromChain = async (address: string): Promise<UserProfile | null> => {
    try {
        // Try new contract first (v6)
        const url = `${MAPPING_URL}/${PROGRAM_ID}/mapping/profiles/${address}`;
        logger.debug(`Fetching profile from: ${address}`);
        
        let response = await fetch(url);
        
        // If not found in v6, try old contract v5 as fallback
        if (!response.ok && response.status === 404) {
            const oldProgramId = "tipzo_app_v5.aleo";
            const oldUrl = `${MAPPING_URL}/${oldProgramId}/mapping/profiles/${address}`;
            logger.debug(`Profile not found in v6, trying old contract`);
            response = await fetch(oldUrl);
        }
        
        if (!response.ok) {
            // 404 is normal if profile doesn't exist yet
            if (response.status === 404) {
                return null;
            }
            console.warn("Profile not found or error fetching:", response.statusText);
            return null;
        }

        const data = await response.json();
        logger.debug("Raw profile data from API:", address);
        
        // Add to known profiles list for blockchain scanning
        if (data) {
            addKnownProfileAddress(address);
        }
        
        if (!data) {
            console.warn("⚠️ Empty data returned from API");
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
                    console.warn("⚠️ Failed to parse string format:", e);
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
        
        logger.debug("Parsed fields:", address);
        
        // If we have at least name field, return profile (even if empty)
        if (rawName) {
            const decodedName = fieldToString(rawName);
            const decodedBio = rawBio ? fieldToString(rawBio) : "";
            
            logger.debug("Decoded profile:", address);
            
            const profileData = {
                name: decodedName,
                bio: decodedBio
            };
            
            // No caching - all data comes from blockchain
            
            return profileData;
        }
        
        console.warn("⚠️ Could not parse profile data - no name field found");
        return null;
        
    } catch (error) {
        console.error("Error fetching profile:", error);
        return null;
    }
};
