import React, { useState, useEffect } from 'react';
import { NeoCard, NeoButton, NeoInput, NeoBadge, WalletRequiredModal } from '../components/NeoComponents';
import { Creator } from '../types';
import { Search, DollarSign, Loader2, User, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { WalletAdapterNetwork } from "@demox-labs/aleo-wallet-adapter-base";
import { PROGRAM_ID } from '../deployed_program';
import { stringToField, formatAddress } from '../utils/aleo';
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
  const [donatingToId, setDonatingToId] = useState<string | null>(null);
  const [recentRecipients, setRecentRecipients] = useState<{ address: string; name: string }[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Load profile-level defaults for donation form
  useEffect(() => {
    try {
      if (publicKey && !settingsLoaded) {
        const raw = localStorage.getItem(`tipzo_profile_settings_${publicKey}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.defaultDonationAmount) {
            setDonationAmount(parsed.defaultDonationAmount);
          }
          if (parsed.autoFillQuickDonate && parsed.defaultDonationMessage) {
            setDonationMessage(parsed.defaultDonationMessage);
          }
        }
        setSettingsLoaded(true);
      }
    } catch (e) {
      console.warn("[QuickDonate] Failed to apply profile settings", e);
    }
  }, [publicKey, settingsLoaded]);

  // Load recently tipped recipients from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('tipzo_quick_recent_recipients');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setRecentRecipients(parsed.slice(0, 5));
        }
      }
    } catch (e) {
      console.warn("[QuickDonate] Failed to load recent recipients", e);
    }
  }, []);

  const rememberRecipient = (address: string, name: string) => {
    try {
      const normalizedName = name && name.trim() ? name : "Anonymous";
      const existingRaw = localStorage.getItem('tipzo_quick_recent_recipients');
      let list: { address: string; name: string }[] = [];
      if (existingRaw) {
        const parsed = JSON.parse(existingRaw);
        if (Array.isArray(parsed)) {
          list = parsed;
        }
      }
      // Remove if already present
      list = list.filter(item => item.address !== address);
      // Add to front
      list.unshift({ address, name: normalizedName });
      // Keep max 5
      list = list.slice(0, 5);
      localStorage.setItem('tipzo_quick_recent_recipients', JSON.stringify(list));
      setRecentRecipients(list);
    } catch (e) {
      console.warn("[QuickDonate] Failed to remember recipient", e);
    }
  };

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
          // Direct address search – allow donation even if profile does not exist on-chain
          const profile = await getProfileFromChain(trimmedSearch);

          const creator: Creator = {
            id: trimmedSearch,
            name: profile && profile.name && profile.name.trim() ? profile.name : "Anonymous",
            handle: trimmedSearch.slice(0, 10) + "...",
            category: 'User' as const,
            avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${trimmedSearch}`,
            bio: profile?.bio || "",
            verified: false,
            color: 'white' as const
          };
          matchingProfiles.push(creator);
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
      setDonatingToId(creator.id);
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

      const adapterAny = wallet.adapter as any;
      const messageField = stringToField(donationMessage || "");
      const timestamp = Math.floor(Date.now() / 1000);

      // Single transaction with two transitions for reliability:
      // 1) credits.aleo::transfer_public
      // 2) donatu_appv5.aleo::send_donation(sender, recipient, amount, message, timestamp)
      const donationTransaction = {
        address: String(publicKey),
        chainId: WalletAdapterNetwork.TestnetBeta,
        fee: 50000, // ~0.05 ALEO combined fee (as previously worked stably)
        transitions: [
          {
            program: "credits.aleo",
            functionName: "transfer_public",
            inputs: [
              String(creator.id),
              String(amountMicro) + "u64"
            ]
          },
          {
            program: String(PROGRAM_ID),
            functionName: "send_donation",
            inputs: [
              String(publicKey),                 // sender (public)
              String(creator.id),                // recipient (public)
              String(amountMicro) + "u64",       // amount (private)
              String(messageField),              // message (private)
              String(timestamp) + "u64"          // timestamp (public)
            ]
          }
        ]
      };

      const donationTxId = await requestTransactionWithRetry(adapterAny, donationTransaction, {
        timeout: 30000,
        maxRetries: 3
      });
      if (!donationTxId) {
        console.warn("[QuickDonate] Donation transaction failed");
        alert("Donation transaction failed or was rejected.");
        return;
      }

      logger.donation.sent(donationTxId);
      // Fire global notification for navbar
      window.dispatchEvent(new CustomEvent('tipzo-notification', {
        detail: {
          id: donationTxId,
          type: 'sent',
          message: `Sent ${amountNum} ALEO to ${formatAddress(creator.id)}`,
          timestamp: Date.now(),
        }
      }));
      alert(`Donation sent successfully!\n\nTransaction: ${donationTxId.slice(0, 8)}...\nIncludes: transfer_public + send_donation`);
      setDonationMessage("");
    } catch (e) {
      console.error("[QuickDonate] Donation failed:", e);
      alert("Donation failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDonatingToId(null);
      // Remember successful recipient for quick access
      rememberRecipient(creator.id, creator.name);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        <div className="space-y-2">
          <h1 className="text-5xl font-black mb-1 inline-block bg-white px-4 py-1 border-2 border-black shadow-neo-sm">
            QUICK DONATE
          </h1>
          <p className="text-xl font-medium text-gray-600">
            Find a creator and send a tip instantly. Fully private sender, public profile.
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1 border-2 border-black bg-white shadow-neo-sm text-sm font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{publicKey ? "Wallet connected – ready to tip." : "Connect wallet to send a private donation."}</span>
          </div>
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

      {/* Recent recipients strip */}
      {recentRecipients.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-black mr-1">Recent tips:</span>
          {recentRecipients.map((item) => (
            <button
              key={item.address}
              onClick={() => {
                // Always search by full Aleo address so that
                // direct-address search logic works and donation
                // is possible even without an on-chain profile.
                setSearchTerm(item.address);
              }}
              className="text-xs md:text-sm px-3 py-1 border-2 border-black bg-white hover:bg-tipzo-yellow transition-colors shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            >
              {item.name} · {item.address.slice(0, 6)}...{item.address.slice(-4)}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Skeleton cards when loading initial search */}
        {loading && creators.length === 0 && (
          <>
            {[0, 1, 2].map((i) => (
              <NeoCard key={`skeleton-${i}`} color="yellow" className="flex flex-col gap-4 animate-pulse">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 border-2 border-black bg-gray-200" />
                    <div className="space-y-2">
                      <div className="h-4 w-32 bg-gray-200 border-2 border-black" />
                      <div className="h-3 w-40 bg-gray-200 border-2 border-black" />
                    </div>
                  </div>
                  <NeoBadge color="bg-gray-200">...</NeoBadge>
                </div>
                <div className="h-3 w-full bg-gray-200 border-2 border-black" />
                <div className="mt-auto pt-4">
                  <div className="h-9 w-full bg-gray-200 border-2 border-black" />
                </div>
              </NeoCard>
            ))}
          </>
        )}

        {creators.map((creator) => (
          <NeoCard 
            key={creator.id} 
            color={creator.color} 
            className="flex flex-col gap-4 transition-transform duration-200 hover:-translate-y-1 hover:shadow-neo"
          >
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
                        <div className="flex flex-wrap gap-2 text-xs font-semibold mt-1">
                          <span className="text-gray-500 mr-1">Quick amounts:</span>
                          {["1", "2", "5"].map((amt) => (
                            <NeoButton
                              key={amt}
                              size="sm"
                              variant={donationAmount === amt ? "accent" : "secondary"}
                              className="px-2 py-0 text-xs"
                              onClick={() => setDonationAmount(amt)}
                            >
                              {amt} ALEO
                            </NeoButton>
                          ))}
                        </div>
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
                        disabled={donatingToId === creator.id}
                      >
                        {donatingToId === creator.id ? (
                          <>
                            <Loader2 size={18} className="animate-spin" /> Sending...
                          </>
                        ) : (
                          <>
                            <DollarSign size={18} /> Donate
                          </>
                        )}
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
          <div className="inline-block bg-white px-6 py-4 border-2 border-black shadow-neo-sm">
            <h3 className="text-2xl font-bold text-gray-800 mb-2">
              {searchTerm ? (searchError || "No profile found for this query.") : "Start by searching for an Aleo address or nickname."}
            </h3>
            {searchError && (
              <p className="text-sm text-gray-600 mt-2">{searchError}</p>
            )}
            {!searchTerm && (
              <p className="text-sm text-gray-800 mt-4">
                Enter an Aleo address (aleo1...) or a profile name to quickly send a donation.
              </p>
            )}
          </div>
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

