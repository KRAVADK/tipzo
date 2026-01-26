import React, { useState, useEffect } from 'react';
import { NeoCard, NeoButton, NeoInput, NeoBadge, WalletRequiredModal } from '../components/NeoComponents';
import { Creator } from '../types';
import { Search, DollarSign, Loader2, User, X } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { WalletAdapterNetwork } from "@demox-labs/aleo-wallet-adapter-base";
import { PROGRAM_ID } from '../deployed_program';
import { stringToField } from '../utils/aleo';
import { getProfileFromChain, cacheProfile, getAllRegisteredProfiles, addKnownProfileAddress, getKnownProfileAddresses } from '../utils/explorerAPI';
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

  // Load all profiles function - uses Provable API v2 directly from blockchain
  let isReloading = false;
  const loadAllProfiles = async () => {
    // Prevent multiple simultaneous reloads
    if (isReloading) {
      return;
    }
    
    isReloading = true;
    setLoading(true);
    try {
        const profilesList: Creator[] = [];
        
        // STEP 1: Get all registered profiles DIRECTLY from blockchain using Provable API v2
        // NO CACHE - all profiles come from blockchain
        console.log("[Explore] Fetching registered profiles directly from blockchain (Provable API v2)...");
        
        // Primary source: Scan blockchain for all profile transactions (create_profile/update_profile)
        const blockchainAddresses = await getAllRegisteredProfiles();
        console.log(`[Explore] Found ${blockchainAddresses.length} registered profiles from blockchain scan`);
        
        // Combine all addresses (no public registry fallback - pure blockchain)
        const registeredAddresses = Array.from(new Set(blockchainAddresses));
        console.log(`[Explore] Total unique profiles from blockchain: ${registeredAddresses.length}`);
        
        // Automatically add all discovered addresses to known profiles list
        if (blockchainAddresses.length > 0) {
            blockchainAddresses.forEach(addr => {
                addKnownProfileAddress(addr);
            });
            console.log(`[Explore] Added ${blockchainAddresses.length} addresses to known profiles list`);
        }
        
        // STEP 2: Use ONLY blockchain addresses (NO CACHE)
        // All profiles come directly from blockchain via Provable API v2
        const allAddresses = new Set<string>(registeredAddresses);
        const cacheData = new Map<string, { createdAt: number }>();
        
        // Set creation time for sorting (use current time as fallback)
        registeredAddresses.forEach(addr => {
          cacheData.set(addr, { createdAt: Date.now() });
        });
        
        const addressArray = Array.from(allAddresses);
        console.log(`[Explore] Total profiles to load from blockchain: ${addressArray.length}`);
        console.log(`[Explore] All addresses to load:`, addressArray.map(addr => addr.slice(0, 10) + '...'));
        
        // STEP 3: Load all profiles DIRECTLY from blockchain (NO CACHE)
        // All profiles come from Provable API v2 - fresh data every time
        const fetchPromises = addressArray.slice(0, 200).map(async (address) => {
          try {
            // Fetch DIRECTLY from blockchain - no cache
            const chainProfile = await getProfileFromChain(address);
            if (chainProfile) {
              const profileName = chainProfile.name && chainProfile.name.trim() ? chainProfile.name : "Anonymous";
              const profileBio = chainProfile.bio || "";
              console.log(`[Explore] Loaded from blockchain: ${profileName} (${address.slice(0, 10)}...)`);
              
              // Cache it for performance (but don't rely on it for display)
              if (profileName !== "Anonymous" || profileBio) {
                cacheProfile(address, { name: profileName, bio: profileBio }, undefined, true);
              }
              
              const cacheInfo = cacheData.get(address);
              const creator: Creator = {
                id: address,
                name: profileName || "Anonymous",
                handle: address.slice(0, 10) + "...",
                category: 'User' as const,
                avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${address}`,
                bio: profileBio || "",
                verified: false,
                color: 'white' as const
              };
              (creator as any).createdAt = cacheInfo?.createdAt || Date.now();
              
              console.log(`[Explore] ✅ Returning blockchain profile: ${creator.name} (${address.slice(0, 10)}...)`);
              return creator;
            } else {
              console.log(`[Explore] No profile data found for ${address.slice(0, 10)}...`);
              return null;
            }
          } catch (e) {
            console.warn(`[Explore] ❌ Failed to fetch profile for ${address}:`, e);
            return null;
          }
        });
        
        const results = await Promise.all(fetchPromises);
        const validResults: Creator[] = [];
        for (const result of results) {
          if (result !== null) {
            validResults.push(result);
            profilesList.push(result);
          }
        }
        
        console.log(`[Explore] Valid profiles after fetching: ${validResults.length}`);
        console.log(`[Explore] Profile addresses:`, validResults.map(c => `${c.name} (${c.id.slice(0, 10)}...)`));
        
        // Sort by creation date (newest first), then by name
        const sortedProfiles = profilesList.sort((a, b) => {
          const aCreated = (a as any).createdAt || 0;
          const bCreated = (b as any).createdAt || 0;
          if (bCreated !== aCreated) {
            return bCreated - aCreated; // Newest first
          }
          return a.name.localeCompare(b.name); // Then alphabetically
        });
        
        setCreators(sortedProfiles);
        setIsSearchMode(false);
        
        console.log(`[Explore] Final loaded profiles: ${sortedProfiles.length}`);
        console.log(`[Explore] Profile names:`, sortedProfiles.map(c => c.name));
      } catch (e) {
        console.error("Failed to load profiles:", e);
      } finally {
        setLoading(false);
        isReloading = false;
      }
  };
  
  // Load all profiles on component mount and when profile is created
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout | null = null;
    
    // Always load all profiles on mount
    loadAllProfiles();

    // Debounced handler for profile events (prevents too frequent reloads)
    const handleProfileEvent = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        loadAllProfiles();
      }, 500); // Wait 500ms before reloading
    };
    
    window.addEventListener('profileUpdated', handleProfileEvent);
    window.addEventListener('profileCached', handleProfileEvent);
    
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      window.removeEventListener('profileUpdated', handleProfileEvent);
      window.removeEventListener('profileCached', handleProfileEvent);
    };
  }, []); // Only run on mount

  // Filter profiles based on search term (name or address) - DIRECTLY FROM BLOCKCHAIN
  useEffect(() => {
    const filterProfiles = async () => {
      setSearchError(null);
      const trimmedSearch = searchTerm.trim();
      
      // If search is empty, reload all profiles from blockchain
      if (!trimmedSearch) {
        setIsSearchMode(false);
        setSelectedCreatorForDonation(null);
        loadAllProfiles();
        return;
      }

      setIsSearchMode(true);
      setLoading(true);

      try {
        // Search DIRECTLY in blockchain - NO CACHE
        console.log(`[Search] Searching blockchain for: "${trimmedSearch}" (NO CACHE)`);
        
        const queryLower = trimmedSearch.toLowerCase();
        const matchingProfiles: Creator[] = [];
        
        // Search by address first (if it's an address)
        if (trimmedSearch.startsWith("aleo1")) {
          // Direct address search - fetch profile directly from blockchain
          console.log(`[Search] Searching by address: ${trimmedSearch}`);
          const profile = await getProfileFromChain(trimmedSearch);
          if (profile) {
            const creator: Creator = {
              id: trimmedSearch,
              name: profile.name && profile.name.trim() ? profile.name : "Anonymous",
              handle: trimmedSearch.slice(0, 10) + "...",
              category: 'User' as const,
              avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${trimmedSearch}`,
              bio: profile.bio || "",
              verified: false,
              color: 'white' as const
            };
            matchingProfiles.push(creator);
            console.log(`[Search] ✅ Found by address: ${creator.name}`);
          }
        } else {
          // Search by name/bio - get ALL profiles from blockchain and filter
          console.log(`[Search] Searching by name/bio: "${trimmedSearch}"`);
          
          // Get all profile addresses from blockchain
          const allProfileAddresses = await getAllRegisteredProfiles();
          console.log(`[Search] Found ${allProfileAddresses.length} profile addresses on blockchain`);
          
          // Also check known addresses (in case they're not in registry yet)
          const knownAddresses = getKnownProfileAddresses();
          const allAddresses = new Set([...allProfileAddresses, ...knownAddresses]);
          console.log(`[Search] Total addresses to check: ${allAddresses.size}`);
          
          // Fetch profile data for all addresses and filter by name/bio
          const fetchPromises = Array.from(allAddresses).slice(0, 200).map(async (address) => {
            try {
              const profile = await getProfileFromChain(address);
              if (profile) {
                const nameLower = (profile.name || "").toLowerCase();
                const bioLower = (profile.bio || "").toLowerCase();
                const nameMatch = nameLower.includes(queryLower);
                const bioMatch = bioLower.includes(queryLower);
                
                if (nameMatch || bioMatch) {
                  console.log(`[Search] ✅ Match found: ${profile.name} (name: "${nameLower}", bio: "${bioLower}")`);
                  return {
                    id: address,
                    name: profile.name && profile.name.trim() ? profile.name : "Anonymous",
                    handle: address.slice(0, 10) + "...",
                    category: 'User' as const,
                    avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${address}`,
                    bio: profile.bio || "",
                    verified: false,
                    color: 'white' as const
                  } as Creator;
                }
              }
            } catch (e) {
              console.warn(`[Search] Failed to fetch profile for ${address}:`, e);
            }
            return null;
          });
          
          const results = await Promise.all(fetchPromises);
          matchingProfiles.push(...results.filter((p): p is Creator => p !== null));
        }
        
        console.log(`[Search] Found ${matchingProfiles.length} matching profiles from blockchain`);
        
        if (matchingProfiles.length > 0) {
          console.log(`[Search] ✅ Showing ${matchingProfiles.length} profiles from blockchain`);
          setCreators(matchingProfiles);
          setSelectedCreatorForDonation(matchingProfiles[0]);
          setSearchError(null);
        } else {
          console.log(`[Search] ❌ No profiles found in blockchain for "${trimmedSearch}"`);
          setCreators([]);
          setSearchError("No profiles found matching your search.");
        }
      } catch (e) {
        console.error("Error searching profiles", e);
        setSearchError("Error searching profiles.");
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
        // Note: sender is automatically self.caller in the contract, don't pass it
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
                        String(creator.id),      // recipient (private)
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

      {/* Grid - All profiles are PUBLIC and visible to everyone */}
      {/* No encryption, no privacy restrictions - all profile data is public */}
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
