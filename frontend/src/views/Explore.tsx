import React, { useState, useEffect } from 'react';
import { NeoCard, NeoButton, NeoInput, NeoBadge, WalletRequiredModal } from '../components/NeoComponents';
import { Creator } from '../types';
import { Search, DollarSign, Loader2 } from 'lucide-react';
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { WalletAdapterNetwork } from "@demox-labs/aleo-wallet-adapter-base";
import { PROGRAM_ID } from '../deployed_program';
import { stringToField } from '../utils/aleo';
import { getProfileFromChain } from '../utils/explorerAPI';
import { requestTransactionWithRetry } from '../utils/walletUtils';

const Explore: React.FC = () => {
  const { wallet, publicKey } = useWallet();
  const [searchTerm, setSearchTerm] = useState('');
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(false);
  const [donationAmount, setDonationAmount] = useState<string>("1");
  const [donationMessage, setDonationMessage] = useState<string>("");
  const [showWalletModal, setShowWalletModal] = useState(false);

  const [searchError, setSearchError] = useState<string | null>(null);

  // Helper function to cache profile in localStorage
  const cacheProfile = (address: string, profile: { name: string; bio: string }) => {
    try {
      const cacheKey = `tipzo_profile_cache_${address}`;
      localStorage.setItem(cacheKey, JSON.stringify({
        address,
        name: profile.name,
        bio: profile.bio,
        cachedAt: Date.now()
      }));
    } catch (e) {
      console.warn("Failed to cache profile:", e);
    }
  };

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

  // Search for profile when searchTerm looks like an address or nickname
  useEffect(() => {
    const searchProfile = async () => {
      // Clear previous error
      setSearchError(null);
      
      // Check if search term looks like an Aleo address
      const trimmedSearch = searchTerm.trim();
      if (!trimmedSearch) {
        setCreators([]);
        return;
      }

      // Check if it's an address search
      if (trimmedSearch.startsWith("aleo1") && trimmedSearch.length >= 10) {
        setLoading(true);
        try {
            // Normalize address - if partial, try to find full address
            let addressToSearch = trimmedSearch;
            
            // If address is incomplete, we can't search
            if (trimmedSearch.length < 63) {
                setLoading(false);
                setSearchError("Please enter a complete Aleo address (63 characters)");
                return;
            }

            // Check if already in list
            if (creators.some(c => c.id === addressToSearch)) {
                setLoading(false);
                return;
            }

            const profile = await getProfileFromChain(addressToSearch);
            console.log("Search result for", addressToSearch, ":", profile);
            
            if (profile) {
                // Cache the profile for future name searches
                cacheProfile(addressToSearch, profile);
                
                // Profile exists - show it even if name is empty
                const profileName = profile.name && profile.name.trim() ? profile.name : "Anonymous";
                const newCreator: Creator = {
                    id: addressToSearch,
                    name: profileName,
                    handle: addressToSearch.slice(0, 10) + "...",
                    category: 'User',
                    avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${addressToSearch}`,
                    bio: profile.bio || "",
                    verified: false,
                    color: 'white'
                };
                setCreators([newCreator]); // Replace list with found profile
                setSearchError(null);
            } else {
                // Profile doesn't exist on chain
                setCreators([]);
                setSearchError("Profile not found. This address hasn't created a profile yet. Make sure the profile was successfully saved to the blockchain.");
            }
        } catch (e) {
            console.error("Error searching profile", e);
            setCreators([]);
            setSearchError("Error searching profile. Please check the address and try again.");
        } finally {
            setLoading(false);
        }
      } else if (trimmedSearch.length > 0) {
        // Try searching by nickname in cache
        setLoading(true);
        try {
          const foundAddresses = searchProfilesByName(trimmedSearch);
          
          if (foundAddresses.length > 0) {
            // Found profiles by name - fetch them from chain
            const creatorsList: Creator[] = [];
            
            for (const address of foundAddresses) {
              try {
                const profile = await getProfileFromChain(address);
                if (profile) {
                  // Update cache
                  cacheProfile(address, profile);
                  
                  const profileName = profile.name && profile.name.trim() ? profile.name : "Anonymous";
                  creatorsList.push({
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
                console.warn("Failed to fetch profile for", address, e);
              }
            }
            
            if (creatorsList.length > 0) {
              setCreators(creatorsList);
              setSearchError(null);
            } else {
              setCreators([]);
              setSearchError("No profiles found with this nickname. Try searching by Aleo address first to add profiles to cache.");
            }
          } else {
            // No profiles found by name
            setCreators([]);
            setSearchError("No profiles found with this nickname. Try searching by Aleo address (starts with 'aleo1') or search for a profile by address first to add it to cache.");
          }
        } catch (e) {
          console.error("Error searching by nickname", e);
          setCreators([]);
          setSearchError("Error searching by nickname. Please try again.");
        } finally {
          setLoading(false);
        }
      } else {
        setCreators([]);
      }
    };

    const debounce = setTimeout(searchProfile, 500);
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
        
        const transferTxId = await requestTransactionWithRetry(adapter, transferTransaction);
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
        
        const donationTxId = await requestTransactionWithRetry(adapter, donationTransaction);
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
                  <h3 className="text-xl font-bold flex items-center gap-1">
                    {creator.name}
                    {creator.verified && <span className="text-blue-600" title="Verified">✓</span>}
                  </h3>
                  <p className="text-sm font-semibold opacity-70 break-all">{creator.id.slice(0, 10)}...{creator.id.slice(-4)}</p>
                </div>
              </div>
              <NeoBadge color="bg-white">{creator.category}</NeoBadge>
            </div>
            
            <p className="font-medium line-clamp-2">{creator.bio}</p>
            
            <div className="mt-auto pt-4 flex flex-col gap-3">
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
          </NeoCard>
        ))}
      </div>
      
      {creators.length === 0 && !loading && (
        <div className="text-center py-20">
          <h3 className="text-2xl font-bold text-gray-400 mb-2">
            {searchTerm ? (searchError || "No profile found for this address.") : "Search an Aleo address to find creators."}
          </h3>
          {searchError && (
            <p className="text-sm text-gray-500 mt-2">{searchError}</p>
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
