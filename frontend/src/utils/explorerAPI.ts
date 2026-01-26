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
                    console.log(`[Registry] Loaded ${addresses.length} profiles from ${url}`);
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
                console.log("[Registry] Profile count mapping not initialized yet (no profiles created)");
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

// Scan blockchain for all profiles by finding create_profile and update_profile transactions
export const scanBlockchainForProfiles = async (): Promise<string[]> => {
    const discoveredAddresses = new Set<string>();
    
    try {
        console.log("[Blockchain Scan] Scanning for profile transactions...");
        
        // Try to get profiles from Aleo RPC API
        const rpcUrl = "https://testnet3.aleorpc.com";
        
        // Scan create_profile transactions
        try {
            const createProfileResponse = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "aleoTransactionsForProgram",
                    params: {
                        programId: PROGRAM_ID,
                        functionName: "create_profile",
                        page: 0,
                        maxTransactions: 1000
                    }
                })
            });
            
            if (createProfileResponse.ok) {
                const data = await createProfileResponse.json();
                if (data.result && Array.isArray(data.result)) {
                    console.log(`[Blockchain Scan] Found ${data.result.length} create_profile transactions`);
                    data.result.forEach((tx: any) => {
                        // Extract caller address from transaction
                        // The address can be in different places depending on transaction structure
                        if (tx.transaction?.owner) {
                            discoveredAddresses.add(tx.transaction.owner);
                        }
                        if (tx.owner) {
                            discoveredAddresses.add(tx.owner);
                        }
                        // Also check execution transitions
                        if (tx.transaction?.execution?.transitions) {
                            tx.transaction.execution.transitions.forEach((transition: any) => {
                                if (transition.function === "create_profile") {
                                    // Caller might be in transition metadata
                                    if (transition.caller) {
                                        discoveredAddresses.add(transition.caller);
                                    }
                                }
                            });
                        }
                    });
                }
            }
        } catch (e) {
            console.warn("[Blockchain Scan] Failed to scan create_profile via RPC:", e);
        }
        
        // Scan update_profile transactions
        try {
            const updateProfileResponse = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 2,
                    method: "aleoTransactionsForProgram",
                    params: {
                        programId: PROGRAM_ID,
                        functionName: "update_profile",
                        page: 0,
                        maxTransactions: 1000
                    }
                })
            });
            
            if (updateProfileResponse.ok) {
                const data = await updateProfileResponse.json();
                if (data.result && Array.isArray(data.result)) {
                    console.log(`[Blockchain Scan] Found ${data.result.length} update_profile transactions`);
                    data.result.forEach((tx: any) => {
                        if (tx.transaction?.owner) {
                            discoveredAddresses.add(tx.transaction.owner);
                        }
                        if (tx.owner) {
                            discoveredAddresses.add(tx.owner);
                        }
                        if (tx.transaction?.execution?.transitions) {
                            tx.transaction.execution.transitions.forEach((transition: any) => {
                                if (transition.function === "update_profile") {
                                    if (transition.caller) {
                                        discoveredAddresses.add(transition.caller);
                                    }
                                }
                            });
                        }
                    });
                }
            }
        } catch (e) {
            console.warn("[Blockchain Scan] Failed to scan update_profile via RPC:", e);
        }
        
        // Also try Provable Explorer API as fallback - scan all profiles mapping entries
        // Since we can't directly query transactions, we'll try to scan the profiles mapping
        // by checking known addresses or using a different approach
        try {
            // Alternative: Try to get all addresses that have profiles in the mapping
            // This is less efficient but works if RPC doesn't work
            console.log("[Blockchain Scan] Trying alternative method via profile mappings...");
            // Note: We can't iterate mappings directly, so this is a fallback
        } catch (e) {
            console.warn("[Blockchain Scan] Failed alternative scan:", e);
        }
        
        const addresses = Array.from(discoveredAddresses).filter(addr => addr && typeof addr === 'string' && addr.startsWith('aleo1'));
        console.log(`[Blockchain Scan] Discovered ${addresses.length} unique profile addresses from blockchain`);
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
        console.log(`[Registry] Found ${count} registered profiles on blockchain registry`);
        
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
        
        console.log(`[Registry] Total unique profiles: ${uniqueAddresses.length} (${addressesFromRegistry.length} from registry, ${scannedAddresses.length} from scan)`);
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
            console.log(`[Cache] Added ${address} to known profiles list`);
        }
    } catch (e) {
        console.warn("Failed to add known profile:", e);
    }
};

// Helper function to verify known profile addresses exist on chain
// This only verifies addresses that are already in localStorage, no automatic discovery
export const discoverProfileAddresses = async (): Promise<string[]> => {
    const addresses = new Set<string>();
    
    try {
        // Only get addresses from known profiles list and cache (no API discovery)
        const knownAddresses = getKnownProfileAddresses();
        const allKeys = Object.keys(localStorage);
        const cacheKeys = allKeys.filter(key => key.startsWith("tipzo_profile_cache_"));
        
        // Collect all known addresses
        const addressesToCheck = new Set<string>(knownAddresses);
        for (const key of cacheKeys) {
            try {
                const cached = localStorage.getItem(key);
                if (cached) {
                    const profile = JSON.parse(cached);
                    if (profile.address) {
                        addressesToCheck.add(profile.address);
                    }
                }
            } catch (e) {
                // Ignore
            }
        }
        
        // Verify known addresses exist on chain (only if we have addresses to check)
        if (addressesToCheck.size > 0) {
            console.log(`[Discover] Verifying ${addressesToCheck.size} known addresses...`);
            
            const checkPromises = Array.from(addressesToCheck).slice(0, 50).map(async (address) => {
                try {
                    // Check if already cached to avoid unnecessary API calls
                    const cacheKey = `tipzo_profile_cache_${address}`;
                    const existing = localStorage.getItem(cacheKey);
                    if (existing) {
                        // Already cached, skip API call
                        return address;
                    }
                    
                    const profile = await getProfileFromChain(address);
                    if (profile) {
                        // getProfileFromChain already caches, so we don't need to call cacheProfile again
                        return address;
                    }
                    return null;
                } catch (e) {
                    return null;
                }
            });
            
            const results = await Promise.all(checkPromises);
            const validAddresses = results.filter((addr): addr is string => addr !== null);
            
            validAddresses.forEach(addr => addresses.add(addr));
        }
        
        console.log(`[Discover] Found ${addresses.size} verified profile addresses`);
        return Array.from(addresses);
        
    } catch (e) {
        console.warn("Failed to verify profile addresses:", e);
        return [];
    }
};

// Helper function to cache profile in localStorage for nickname search
export const cacheProfile = (address: string, profile: { name: string; bio: string }, createdAt?: number, skipEvent: boolean = false) => {
    try {
        const cacheKey = `tipzo_profile_cache_${address}`;
        const now = Date.now();
        // Use provided createdAt or current time (for new profiles)
        const profileCreatedAt = createdAt || now;
        
        // Check if profile already exists in cache
        const existing = localStorage.getItem(cacheKey);
        let finalCreatedAt = profileCreatedAt;
        let isNewProfile = false;
        let dataChanged = false;
        
        if (existing) {
            try {
                const existingData = JSON.parse(existing);
                // Keep the original creation date if it exists
                if (existingData.createdAt && existingData.createdAt < profileCreatedAt) {
                    finalCreatedAt = existingData.createdAt;
                }
                // Check if data has changed
                if (existingData.name !== profile.name || existingData.bio !== profile.bio) {
                    dataChanged = true;
                }
            } catch (e) {
                // If parsing fails, treat as new
                isNewProfile = true;
            }
        } else {
            isNewProfile = true;
        }
        
        localStorage.setItem(cacheKey, JSON.stringify({
            address,
            name: profile.name,
            bio: profile.bio,
            cachedAt: now,
            createdAt: finalCreatedAt // Store creation date for sorting
        }));
        // Add to known profiles list (this ensures profile is visible to all users on this device)
        addKnownProfileAddress(address);
        console.log(`[Cache] Cached profile for ${address}:`, profile.name);
        
        // Only dispatch event if this is a new profile or data changed, and skipEvent is false
        // This prevents infinite loops when loading profiles from cache
        if (!skipEvent && (isNewProfile || dataChanged)) {
            window.dispatchEvent(new CustomEvent('profileCached', { 
                detail: { address, name: profile.name } 
            }));
        }
    } catch (e) {
        console.warn("Failed to cache profile:", e);
    }
};

export const getProfileFromChain = async (address: string): Promise<UserProfile | null> => {
    try {
        // Try new contract first (v6)
        const url = `${MAPPING_URL}/${PROGRAM_ID}/mapping/profiles/${address}`;
        console.log(`Fetching profile from: ${url}`);
        
        let response = await fetch(url);
        
        // If not found in v6, try old contract v5 as fallback
        if (!response.ok && response.status === 404) {
            const oldProgramId = "tipzo_app_v5.aleo";
            const oldUrl = `${MAPPING_URL}/${oldProgramId}/mapping/profiles/${address}`;
            console.log(`Profile not found in v6, trying old contract: ${oldUrl}`);
            response = await fetch(oldUrl);
        }
        
        if (!response.ok) {
            // 404 is normal if profile doesn't exist yet
            if (response.status === 404) {
                console.log(`Profile not found for address: ${address.slice(0, 10)}...`);
                return null;
            }
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
            
            // Cache the profile for nickname search (skip event to prevent loops)
            // Check if profile is already cached to avoid unnecessary events
            const cacheKey = `tipzo_profile_cache_${address}`;
            const existing = localStorage.getItem(cacheKey);
            const shouldSkipEvent = !!existing; // Skip event if already cached
            
            cacheProfile(address, profileData, undefined, shouldSkipEvent);
            
            return profileData;
        }
        
        console.warn("Could not parse profile data - no name field found");
        return null;
        
    } catch (error) {
        console.error("Error fetching profile:", error);
        return null;
    }
};
