import React, { useState, useEffect } from 'react';
import { NeoCard, NeoButton, NeoInput, NeoBadge, WalletRequiredModal } from '../components/NeoComponents';
import { Creator } from '../types';
import { Search, DollarSign, Loader2, User, X } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { WalletAdapterNetwork } from "@demox-labs/aleo-wallet-adapter-base";
import { PROGRAM_ID } from '../deployed_program';
import { stringToField } from '../utils/aleo';
import { getProfileFromChain, cacheProfile } from '../utils/explorerAPI';
import { requestTransactionWithRetry } from '../utils/walletUtils';

const Explore: React.FC = () => {
  const { wallet, publicKey } = useWallet();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(false);
  const [donationAmount, setDonationAmount] = useState<string>("1");
  const [donationMessage, setDonationMessage] = useState<string>("");
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [selectedCreatorForDonation, setSelectedCreatorForDonation] = useState<Creator | null>(null);

  const [searchError, setSearchError] = useState<string | null>(null);

  // Helper function to get all known profiles and verify on blockchain
  const getAllCachedProfiles = async (): Promise<Creator[]> => {
    const profilesList: Creator[] = [];
    try {
      // Get all known profile addresses (from cache and known list)
      const allKeys = Object.keys(localStorage);
      const cacheKeys = allKeys.filter(key => key.startsWith("tipzo_profile_cache_"));
      const knownAddresses = new Set<string>();
      const cacheData = new Map<string, { createdAt: number }>();
      
      // Add addresses from cache and store creation dates
      for (const key of cacheKeys) {
        try {
          const cached = localStorage.getItem(key);
          if (cached) {
            const profile = JSON.parse(cached);
            if (profile.address) {
              knownAddresses.add(profile.address);
              cacheData.set(profile.address, {
                createdAt: profile.createdAt || profile.cachedAt || Date.now()
              });
            }
          }
        } catch (e) {
          console.warn("Failed to parse cached profile:", e);
        }
      }
      
      // Get known addresses from global list
      try {
        const knownList = localStorage.getItem('tipzo_known_profiles');
        if (knownList) {
          const addresses = JSON.parse(knownList);
          addresses.forEach((addr: string) => {
            knownAddresses.add(addr);
            // If not in cache, use current time as fallback
            if (!cacheData.has(addr)) {
              cacheData.set(addr, { createdAt: Date.now() });
            }
          });
        }
      } catch (e) {
        console.warn("Failed to get known profiles list:", e);
      }
      
      // If we have very few profiles, try to discover more from blockchain transactions
      let addressArray = Array.from(knownAddresses);
      
      // Always try to discover from blockchain if we have less than 10 profiles
      // This ensures new profiles are found even if RPC fails sometimes
      if (addressArray.length < 10) {
        console.log("[Explore] Few profiles found locally, discovering from blockchain...");
        try {
          const { discoverProfileAddresses } = await import('../utils/explorerAPI');
          const discoveredAddresses = await discoverProfileAddresses();
          if (discoveredAddresses.length > 0) {
            discoveredAddresses.forEach(addr => {
              knownAddresses.add(addr);
              if (!cacheData.has(addr)) {
                cacheData.set(addr, { createdAt: Date.now() });
              }
            });
            addressArray = Array.from(knownAddresses);
            console.log(`[Explore] Discovered ${discoveredAddresses.length} additional profiles from blockchain`);
          } else {
            console.log("[Explore] No additional profiles discovered from blockchain transactions");
          }
        } catch (e) {
          console.warn("[Explore] Failed to discover profiles from blockchain:", e);
        }
      }
      
      // Also check if we can get profiles from a shared seed list or known addresses
      // This helps when RPC is unavailable
      if (addressArray.length === 0) {
        console.log("[Explore] No profiles found. They will appear as users create them or when you search for them.");
      }
      
      // Fetch and verify all known profiles from blockchain
      console.log(`[Explore] Loading ${addressArray.length} known profiles from blockchain...`);
      
      // If no profiles found locally, try to discover from shared storage or seed list
      if (addressArray.length === 0) {
        console.log("[Explore] No cached profiles found. Profiles will appear as users create them.");
      }
      
      // Fetch profiles in parallel (with limit to avoid too many requests)
      const fetchPromises = addressArray.slice(0, 100).map(async (address) => {
        try {
          const chainProfile = await getProfileFromChain(address);
          if (chainProfile) {
            const profileName = chainProfile.name && chainProfile.name.trim() ? chainProfile.name : "Anonymous";
            const cacheInfo = cacheData.get(address);
            const creator: Creator = {
              id: address,
              name: profileName,
              handle: address.slice(0, 10) + "...",
              category: 'User' as const,
              avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${address}`,
              bio: chainProfile.bio || "",
              verified: false,
              color: 'white' as const
            };
            // Store creation date for sorting (attach to creator object)
            (creator as any).createdAt = cacheInfo?.createdAt || Date.now();
            return creator;
          }
          return null;
        } catch (e) {
          console.warn(`Failed to fetch profile for ${address}:`, e);
          return null;
        }
      });
      
      const results = await Promise.all(fetchPromises);
      // Filter out null values and ensure type safety
      for (const result of results) {
        if (result !== null) {
          profilesList.push(result);
        }
      }
    } catch (e) {
      console.warn("Failed to get cached profiles:", e);
    }
    // Sort by creation date (newest first), then by name
    return profilesList.sort((a, b) => {
      const aCreated = (a as any).createdAt || 0;
      const bCreated = (b as any).createdAt || 0;
      if (bCreated !== aCreated) {
        return bCreated - aCreated; // Newest first
      }
      return a.name.localeCompare(b.name); // Then alphabetically
    });
  };

  // Load all profiles on component mount and when profile is created
  useEffect(() => {
    const loadAllProfiles = async () => {
      setLoading(true);
      try {
        const profiles = await getAllCachedProfiles();
        setCreators(profiles);
        setIsSearchMode(false);
        
        // If we have very few profiles, try to discover more by checking if any profiles exist
        // that we haven't cached yet. This helps new users see existing profiles.
        if (profiles.length === 0) {
          console.log("[Explore] No profiles found. Profiles will appear as they are created or discovered.");
          console.log("[Explore] Tip: Search for a profile by address to add it to the list.");
        } else {
          console.log(`[Explore] Loaded ${profiles.length} profiles`);
        }
      } catch (e) {
        console.error("Failed to load profiles:", e);
      } finally {
        setLoading(false);
      }
    };
    
    // Always load all profiles on mount
    loadAllProfiles();

    // Listen for profile creation/update events
    const handleProfileUpdate = () => {
      loadAllProfiles();
    };
    window.addEventListener('profileUpdated', handleProfileUpdate);
    
    return () => {
      window.removeEventListener('profileUpdated', handleProfileUpdate);
    };
  }, []); // Only run on mount

  // Helper function to search profiles by name in cache
  const searchProfilesByName = (nameQuery: string): string[] => {
    const foundAddresses: string[] = [];
    try {
      const allKeys = Object.keys(localStorage);
      const cacheKeys = allKeys.filter(key => key.startsWith("tipzo_profile_cache_"));
      
      const queryLower = nameQuery.toLowerCase().trim();
      
      for (const key of cacheKeys) {
        try {
          const cached = localStorage.getItem(key);
          if (cached) {
            const profile = JSON.parse(cached);
            const profileName = (profile.name || "").toLowerCase();
            if (profileName.includes(queryLower)) {
              foundAddresses.push(profile.address);
            }
          }
        } catch (e) {
          console.warn("Failed to parse cached profile:", e);
        }
      }
    } catch (e) {
      console.warn("Failed to search cached profiles:", e);
    }
    return foundAddresses;
  };

  // Filter profiles based on search term (name or address)
  useEffect(() => {
    const filterProfiles = async () => {
      // Clear previous error
      setSearchError(null);
      
      const trimmedSearch = searchTerm.trim();
      
      // If search is empty, show all profiles (already loaded)
      if (!trimmedSearch) {
        setIsSearchMode(false);
        setSelectedCreatorForDonation(null);
        // Reload all profiles to ensure we have the latest
        setLoading(true);
        try {
          const profiles = await getAllCachedProfiles();
          setCreators(profiles);
        } catch (e) {
          console.error("Failed to load profiles:", e);
        } finally {
          setLoading(false);
        }
        return;
      }

      setIsSearchMode(true);
      setLoading(true);

      try {
        // First, get all profiles
        const allProfiles = await getAllCachedProfiles();
        
        // Check if it's an address search
        if (trimmedSearch.startsWith("aleo1") && trimmedSearch.length >= 10) {
          // If address is incomplete, show error
          if (trimmedSearch.length < 63) {
            setSearchError("Please enter a complete Aleo address (63 characters)");
            setLoading(false);
            return;
          }

          // Check if profile is already in the list
          const existingProfile = allProfiles.find(c => c.id === trimmedSearch);
          
          if (existingProfile) {
            // Profile already in list - filter to show only this one
            setCreators([existingProfile]);
            setSelectedCreatorForDonation(existingProfile);
            setSearchError(null);
            setLoading(false);
            return;
          }

          // Profile not in list - try to fetch it from chain
          const profile = await getProfileFromChain(trimmedSearch);
          
          if (profile) {
            // Cache the profile and add to known profiles (this automatically adds to global list)
            cacheProfile(trimmedSearch, profile);
            
            const profileName = profile.name && profile.name.trim() ? profile.name : "Anonymous";
            const newCreator: Creator = {
              id: trimmedSearch,
              name: profileName,
              handle: trimmedSearch.slice(0, 10) + "...",
              category: 'User',
              avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${trimmedSearch}`,
              bio: profile.bio || "",
              verified: false,
              color: 'white'
            };
            
            // Add to list and show only this one
            setCreators([newCreator]);
            setSelectedCreatorForDonation(newCreator);
            setSearchError(null);
            
            // Trigger profile list update so all users see this profile
            window.dispatchEvent(new CustomEvent('profileUpdated'));
          } else {
            // Profile doesn't exist on chain
            setCreators([]);
            setSelectedCreatorForDonation(null);
            setSearchError("Profile not found. This address hasn't created a profile yet.");
          }
        } else {
          // Search by nickname - first try searching in cache
          const foundAddresses = searchProfilesByName(trimmedSearch);
          
          if (foundAddresses.length > 0) {
            // Found profiles by name in cache - fetch them from chain
            const newCreators: Creator[] = [];
            
            for (const address of foundAddresses) {
              try {
                const profile = await getProfileFromChain(address);
                if (profile) {
                  // Cache profile (automatically adds to global list)
                  cacheProfile(address, profile);
                  
                  const profileName = profile.name && profile.name.trim() ? profile.name : "Anonymous";
                  newCreators.push({
                    id: address,
                    name: profileName,
                    handle: address.slice(0, 10) + "...",
                    category: 'User',
                    avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${address}`,
                    bio: profile.bio || "",
                    verified: false,
                    color: 'white'
                  });
                }
              } catch (e) {
                console.warn(`Failed to fetch profile for ${address}:`, e);
              }
            }
            
            if (newCreators.length > 0) {
              setCreators(newCreators);
              setSearchError(null);
            } else {
              setCreators([]);
              setSearchError("No profiles found matching your search.");
            }
          } else {
            // No profiles found in cache - try filtering already loaded profiles
            const queryLower = trimmedSearch.toLowerCase();
            const filtered = allProfiles.filter(creator => {
              const nameMatch = creator.name.toLowerCase().includes(queryLower);
              const addressMatch = creator.id.toLowerCase().includes(queryLower);
              return nameMatch || addressMatch;
            });
            
            if (filtered.length > 0) {
              setCreators(filtered);
              setSearchError(null);
            } else {
              setCreators([]);
              setSearchError("No profiles found matching your search. Try searching by Aleo address first.");
            }
          }
        }
      } catch (e) {
        console.error("Error filtering profiles", e);
        setSearchError("Error searching profiles. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(filterProfiles, 300);
    return () => clearTimeout(debounce);
  }, [searchTerm]);

  const handleDonate = async (creator: Creator) => {
    if (!wallet || !publicKey) {
        setShowWalletModal(true);
        return;
    }

    const adapter = wallet.adapter as any;
    if (!adapter) {
        alert("Wallet adapter not available");
        return;
    }

    try {
        const amountNum = parseFloat(donationAmount);
        if (isNaN(amountNum) || amountNum <= 0) {
            alert("Please enter a valid donation amount");
            return;
        }
        
        const amountMicro = Math.floor(amountNum * 1_000_000); // Convert to microcredits
        if (amountMicro <= 0 || !isFinite(amountMicro)) {
            alert("Invalid amount conversion");
            return;
        }
        
        // Validate creator.id
        if (!creator.id || typeof creator.id !== 'string' || !creator.id.startsWith('aleo1')) {
            throw new Error(`Invalid creator ID: ${creator.id}`);
        }
        
        // STEP 1: Transfer real tokens from sender to recipient
        console.log("💰 Step 1/2: Transferring tokens...");
        const transferTransaction = {
            address: String(publicKey),
            chainId: WalletAdapterNetwork.TestnetBeta,
            fee: 50000, // Fee for transfer
            transitions: [
                {
                    program: "credits.aleo",
                    functionName: "transfer_public",
                    inputs: [
                        String(creator.id), // recipient (public)
                        String(amountMicro) + "u64" // amount (public)
                    ]
                }
            ]
        };
        
        console.log("Transfer transaction:", JSON.stringify(transferTransaction, null, 2));
        
        const transferTxId = await requestTransactionWithRetry(adapter, transferTransaction, {
            timeout: 30000, // 30 seconds for transfer
            maxRetries: 3
        });
        if (!transferTxId) {
            throw new Error("Token transfer was rejected or failed");
        }
        
        console.log("✅ Transfer confirmed (transfer_public):", transferTxId);
        
        // Wait a bit for transfer to be processed
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // STEP 2: Create donation record (private)
        // send_donation(recipient, amount, message, timestamp) — contract order
        console.log("📝 Step 2/2: Creating donation record (send_donation)...");
        const messageField = stringToField(donationMessage || ""); // Use message from input
        const timestamp = Math.floor(Date.now() / 1000);
        
        const donationTransaction = {
            address: String(publicKey),
            chainId: WalletAdapterNetwork.TestnetBeta,
            fee: 50000, // Minimal fee for donation record
            transitions: [
                {
                    program: String(PROGRAM_ID),
                    functionName: "send_donation",
                    inputs: [
                        String(publicKey),       // sender (public)
                        String(creator.id),      // recipient (public)
                        String(amountMicro) + "u64",  // amount (private)
                        String(messageField),    // message (private)
                        String(timestamp) + "u64"     // timestamp (public)
                    ]
                }
            ]
        };
        
        console.log("Donation record transaction:", JSON.stringify(donationTransaction, null, 2));
        
        const donationTxId = await requestTransactionWithRetry(adapter, donationTransaction, {
            timeout: 30000, // 30 seconds for donation record
            maxRetries: 3
        });
        if (!donationTxId) {
            console.warn("Donation record creation failed, but tokens were transferred");
            alert(`Tokens transferred! Transaction: ${transferTxId}\nNote: Donation record creation failed.`);
            return;
        }
        
        console.log("✅ Donation record created:", donationTxId);
        alert(`Donation sent successfully!\n\nFunction: send_donation\nTransfer: ${transferTxId.slice(0, 8)}...\nRecord: ${donationTxId.slice(0, 8)}...`);
        
        // Clear message after successful donation
        setDonationMessage("");
        
    } catch (e) {
        console.error("Donation failed:", e);
        alert("Donation failed: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        <div>
           <h1 className="text-5xl font-black mb-2">EXPLORE</h1>
           <p className="text-xl font-medium text-gray-600">Discover & Support Creators Anonymously</p>
        </div>
        <div className="w-full md:w-1/3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black pointer-events-none" size={20} />
            <NeoInput 
              placeholder="Search by Aleo address or nickname..." 
              className="pl-10 pr-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-black" size={20} />}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {creators.map((creator) => (
          <NeoCard key={creator.id} color={creator.color} className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <img src={creator.avatar} alt={creator.name} className="w-16 h-16 border-2 border-black object-cover" />
                <div>
                  <Link 
                    to={`/profile/${creator.id}`}
                    className="text-xl font-bold flex items-center gap-1 hover:text-tipzo-orange transition-colors cursor-pointer"
                    title="View profile"
                  >
                    {creator.name}
                    {creator.verified && <span className="text-blue-600" title="Verified">✓</span>}
                  </Link>
                  <Link 
                    to={`/profile/${creator.id}`}
                    className="text-sm font-semibold opacity-70 break-all hover:text-tipzo-orange transition-colors cursor-pointer"
                    title="View profile"
                  >
                    {creator.id.slice(0, 10)}...{creator.id.slice(-4)}
                  </Link>
                </div>
              </div>
              <NeoBadge color="bg-white">{creator.category}</NeoBadge>
            </div>
            
            <p className="font-medium line-clamp-2">{creator.bio || "No bio"}</p>
            
            <div className="mt-auto pt-4">
              {/* Don't show donation buttons for own profile */}
              {creator.id !== publicKey && (
                <>
                  {isSearchMode && selectedCreatorForDonation?.id === creator.id ? (
                    // Show donation form only when this creator is selected
                    <div className="flex flex-col gap-3 relative">
                      <button
                        onClick={() => {
                          setSelectedCreatorForDonation(null);
                          setDonationAmount("1");
                          setDonationMessage("");
                        }}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-400 hover:bg-red-500 border-2 border-black flex items-center justify-center shadow-neo-sm transition-colors"
                        title="Close donation form"
                      >
                        <X size={14} className="text-white" />
                      </button>
                      <div className="space-y-2">
                        <label className="font-bold text-sm">Donation Amount (ALEO)</label>
                        <NeoInput 
                          type="number" 
                          step="0.01"
                          min="0.01"
                          value={donationAmount} 
                          onChange={(e) => setDonationAmount(e.target.value)}
                          placeholder="1.00"
                          className="w-full text-lg font-bold border-2 border-black"
                          autoFocus={false}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="font-bold text-sm">Message (Optional)</label>
                        <NeoInput 
                          type="text"
                          value={donationMessage} 
                          onChange={(e) => setDonationMessage(e.target.value)}
                          placeholder="Add a message..."
                          className="w-full border-2 border-black"
                          maxLength={30}
                        />
                        <p className="text-xs text-gray-500">Max 30 characters</p>
                      </div>
                      <NeoButton 
                        className="flex-1 flex items-center justify-center gap-2"
                        onClick={() => handleDonate(creator)}
                      >
                        <DollarSign size={18} /> Donate
                      </NeoButton>
                    </div>
                  ) : (
                    // Show view profile button in browse mode
                    <div className="flex gap-2">
                      <NeoButton 
                        className="flex-1 flex items-center justify-center gap-2"
                        variant="secondary"
                        onClick={() => {
                          // Navigate to profile page
                          navigate(`/profile/${creator.id}`);
                        }}
                      >
                        <User size={18} /> View Profile
                      </NeoButton>
                      <NeoButton 
                        className="flex items-center justify-center gap-2"
                        onClick={() => {
                          // Show donation form for this creator
                          setSelectedCreatorForDonation(creator);
                          setIsSearchMode(true);
                        }}
                      >
                        <DollarSign size={18} />
                      </NeoButton>
                    </div>
                  )}
                </>
              )}
              {/* For own profile, only show View Profile button */}
              {creator.id === publicKey && (
                <NeoButton 
                  className="w-full flex items-center justify-center gap-2"
                  variant="secondary"
                  onClick={() => {
                    navigate(`/profile/${creator.id}`);
                  }}
                >
                  <User size={18} /> View Profile
                </NeoButton>
              )}
            </div>
          </NeoCard>
        ))}
      </div>
      
      {creators.length === 0 && !loading && (
        <div className="text-center py-20">
          <h3 className="text-2xl font-bold text-gray-400 mb-2">
            {searchTerm ? (searchError || "No profile found for this address.") : "Search by Aleo address or nickname to discover creators."}
          </h3>
          {searchError && (
            <p className="text-sm text-gray-500 mt-2">{searchError}</p>
          )}
          {!searchTerm && (
            <p className="text-sm text-gray-500 mt-4">
              Enter an Aleo address (aleo1...) or search by nickname to find and support creators.
            </p>
          )}
        </div>
      )}
      
      <WalletRequiredModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onConnect={() => {
          setShowWalletModal(false);
          // Dispatch event to open wallet modal from navbar
          window.dispatchEvent(new CustomEvent('openWalletModal'));
        }}
        action="send donations"
      />
    </div>
  );
};

export default Explore;
