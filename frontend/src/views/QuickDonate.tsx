import React, { useState, useEffect } from 'react';
import { NeoCard, NeoButton, NeoInput, NeoBadge, WalletRequiredModal } from '../components/NeoComponents';
import { Creator } from '../types';
import { Search, DollarSign, Loader2, User, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { WalletAdapterNetwork } from "@demox-labs/aleo-wallet-adapter-base";
import { PROGRAM_ID } from '../deployed_program';
import { stringToField } from '../utils/aleo';
import { getProfileFromChain, getAllRegisteredProfiles, getKnownProfileAddresses } from '../utils/explorerAPI';
import { requestTransactionWithRetry } from '../utils/walletUtils';
import { logger } from '../utils/logger';

const QuickDonate: React.FC = () => {
  const { wallet, publicKey } = useWallet();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(false);
  const [donationAmount, setDonationAmount] = useState<string>("1");
  const [donationMessage, setDonationMessage] = useState<string>("");
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [selectedCreatorForDonation, setSelectedCreatorForDonation] = useState<Creator | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Search-based only: no automatic loading of all profiles
  useEffect(() => {
    const filterProfiles = async () => {
      setSearchError(null);
      const trimmedSearch = searchTerm.trim();

      // If search is empty, clear results
      if (!trimmedSearch) {
        setCreators([]);
        setSelectedCreatorForDonation(null);
        return;
      }

      setLoading(true);

      try {
        logger.debug(`[QuickDonate] Searching for: "${trimmedSearch}"`);

        const queryLower = trimmedSearch.toLowerCase();
        const matchingProfiles: Creator[] = [];

        if (trimmedSearch.startsWith("aleo1")) {
          // Direct address search
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
          }
        } else {
          // Search by nickname / bio
          const allProfileAddresses = await getAllRegisteredProfiles();
          const knownAddresses = getKnownProfileAddresses();
          const allAddresses = new Set([...allProfileAddresses, ...knownAddresses]);

          const fetchPromises = Array.from(allAddresses).slice(0, 200).map(async (address) => {
            try {
              const profile = await getProfileFromChain(address);
              if (profile) {
                const nameLower = (profile.name || "").toLowerCase();
                const bioLower = (profile.bio || "").toLowerCase();
                const nameMatch = nameLower.includes(queryLower);
                const bioMatch = bioLower.includes(queryLower);

                if (nameMatch || bioMatch) {
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
              console.error(`[QuickDonate] Failed to fetch profile for ${address}:`, e);
            }
            return null;
          });

          const results = await Promise.all(fetchPromises);
          matchingProfiles.push(...results.filter((p): p is Creator => p !== null));
        }

        if (matchingProfiles.length > 0) {
          setCreators(matchingProfiles);
          setSelectedCreatorForDonation(matchingProfiles[0]);
          setSearchError(null);
        } else {
          setCreators([]);
          setSearchError("No profiles found matching your search.");
        }
      } catch (e) {
        console.error("[QuickDonate] Error searching profiles", e);
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

      const amountMicro = Math.floor(amountNum * 1_000_000);
      if (amountMicro <= 0 || !isFinite(amountMicro)) {
        alert("Invalid amount conversion");
        return;
      }

      if (!creator.id || typeof creator.id !== 'string' || !creator.id.startsWith('aleo1')) {
        throw new Error(`Invalid creator ID: ${creator.id}`);
      }

      logger.debug("[QuickDonate] Transferring tokens...");
      const transferTransaction = {
        address: String(publicKey),
        chainId: WalletAdapterNetwork.TestnetBeta,
        fee: 50000,
        transitions: [
          {
            program: "credits.aleo",
            functionName: "transfer_public",
            inputs: [
              String(creator.id),
              String(amountMicro) + "u64"
            ]
          }
        ]
      };

      const adapterAny = wallet.adapter as any;
      const transferTxId = await requestTransactionWithRetry(adapterAny, transferTransaction, {
        timeout: 30000,
        maxRetries: 3
      });
      if (!transferTxId) {
        throw new Error("Token transfer was rejected or failed");
      }

      logger.debug("[QuickDonate] Transfer confirmed:", transferTxId);
      await new Promise(resolve => setTimeout(resolve, 1500));

      logger.debug("[QuickDonate] Creating donation record...");
      const messageField = stringToField(donationMessage || "");
      const timestamp = Math.floor(Date.now() / 1000);

      const donationTransaction = {
        address: String(publicKey),
        chainId: WalletAdapterNetwork.TestnetBeta,
        fee: 50000,
        transitions: [
          {
            program: String(PROGRAM_ID),
            functionName: "send_donation",
            inputs: [
              String(creator.id),
              String(amountMicro) + "u64",
              String(messageField),
              String(timestamp) + "u64"
            ]
          }
        ]
      };

      const donationTxId = await requestTransactionWithRetry(adapterAny, donationTransaction, {
        timeout: 30000,
        maxRetries: 3
      });
      if (!donationTxId) {
        console.warn("[QuickDonate] Donation record creation failed, but tokens were transferred");
        alert(`Tokens transferred! Transaction: ${transferTxId}\nNote: Donation record creation failed.`);
        return;
      }

      logger.donation.sent(donationTxId);
      alert(`Donation sent successfully!\n\nFunction: send_donation\nTransfer: ${transferTxId.slice(0, 8)}...\nRecord: ${donationTxId.slice(0, 8)}...`);
      setDonationMessage("");
    } catch (e) {
      console.error("[QuickDonate] Donation failed:", e);
      alert("Donation failed: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        <div>
          <h1 className="text-5xl font-black mb-2">QUICK DONATE</h1>
          <p className="text-xl font-medium text-gray-600">Find a creator and send a tip instantly.</p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {creators.map((creator) => (
          <NeoCard key={creator.id} color={creator.color} className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <img src={creator.avatar} alt={creator.name} className="w-16 h-16 border-2 border-black object-cover" />
                <div>
                  <button
                    onClick={() => navigate(`/profile/${creator.id}`)}
                    className="text-xl font-bold flex items-center gap-1 hover:text-tipzo-orange transition-colors cursor-pointer"
                    title="View profile"
                  >
                    {creator.name}
                    {creator.verified && <span className="text-blue-600" title="Verified">✓</span>}
                  </button>
                  <button
                    onClick={() => navigate(`/profile/${creator.id}`)}
                    className="text-sm font-semibold opacity-70 break-all hover:text-tipzo-orange transition-colors cursor-pointer"
                    title="View profile"
                  >
                    {creator.id.slice(0, 10)}...{creator.id.slice(-4)}
                  </button>
                </div>
              </div>
              <NeoBadge color="bg-white">User</NeoBadge>
            </div>

            <p className="font-medium line-clamp-2">{creator.bio || "No bio"}</p>

            <div className="mt-auto pt-4">
              {creator.id !== publicKey && (
                <>
                  {selectedCreatorForDonation?.id === creator.id ? (
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
                    <NeoButton
                      className="w-full flex items-center justify-center gap-2"
                      onClick={() => {
                        setSelectedCreatorForDonation(creator);
                      }}
                    >
                      <DollarSign size={18} /> Donate
                    </NeoButton>
                  )}
                </>
              )}
              {creator.id === publicKey && (
                <NeoButton
                  className="w-full flex items-center justify-center gap-2"
                  variant="secondary"
                  onClick={() => navigate(`/profile/${creator.id}`)}
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
            {searchTerm ? (searchError || "No profile found for this query.") : "Start by searching for an Aleo address or nickname."}
          </h3>
          {searchError && (
            <p className="text-sm text-gray-500 mt-2">{searchError}</p>
          )}
          {!searchTerm && (
            <p className="text-sm text-gray-500 mt-4">
              Enter an Aleo address (aleo1...) or a profile name to quickly send a donation.
            </p>
          )}
        </div>
      )}

      <WalletRequiredModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onConnect={() => {
          setShowWalletModal(false);
          window.dispatchEvent(new CustomEvent('openWalletModal'));
        }}
        action="send donations"
      />
    </div>
  );
};

export default QuickDonate;

