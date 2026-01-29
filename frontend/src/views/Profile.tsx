import React, { useState, useEffect } from 'react';
import { NeoCard, NeoButton, NeoInput, NeoTextArea, WalletRequiredModal } from '../components/NeoComponents';
import { UserProfile } from '../utils/explorerAPI';
import { Save, Wallet, Loader2, DollarSign, X, Twitter } from 'lucide-react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { getProfileFromChain, addKnownProfileAddress } from '../utils/explorerAPI';
import { stringToField, formatAddress } from '../utils/aleo';
import { requestTransactionWithRetry } from '../utils/walletUtils';
import { WalletAdapterNetwork } from '@demox-labs/aleo-wallet-adapter-base';
import { PROGRAM_ID } from '../deployed_program';
import { useParams } from 'react-router-dom';
import { logger, _refreshLoggerSettings } from '../utils/logger';

const Profile: React.FC = () => {
  const { address: urlAddress } = useParams<{ address?: string }>();
  const { wallet, publicKey } = useWallet();
  const isViewingOtherProfile = urlAddress && urlAddress !== publicKey;
  const profileAddress = isViewingOtherProfile ? urlAddress : publicKey;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existsOnChain, setExistsOnChain] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showDonationForm, setShowDonationForm] = useState(false);
  const [donationAmount, setDonationAmount] = useState<string>("1");
  const [donationMessage, setDonationMessage] = useState<string>("");
  const [profileSettings, setProfileSettings] = useState<{
    defaultDonationAmount: string;
    defaultDonationMessage: string;
    autoFillQuickDonate: boolean;
    enableAnimations: boolean;
    enableDebugLogs: boolean;
  }>({
    defaultDonationAmount: "1",
    defaultDonationMessage: "",
    autoFillQuickDonate: true,
    enableAnimations: true,
    enableDebugLogs: false,
  });

  // Load profile & app settings from localStorage
  useEffect(() => {
    const key = profileAddress || publicKey;
    try {
      if (key) {
        const raw = localStorage.getItem(`tipzo_profile_settings_${key}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          setProfileSettings(prev => ({ ...prev, ...parsed }));
        }
      }
      const appRaw = localStorage.getItem('tipzo_app_settings');
      if (appRaw) {
        const appParsed = JSON.parse(appRaw);
        setProfileSettings(prev => ({
          ...prev,
          enableAnimations: appParsed.enableAnimations ?? prev.enableAnimations,
          enableDebugLogs: appParsed.enableDebugLogs ?? prev.enableDebugLogs,
        }));
        if (appParsed.enableAnimations === false) {
          document.body.classList.add('tipzo-animations-off');
        } else {
          document.body.classList.remove('tipzo-animations-off');
        }
      }
    } catch (e) {
      console.warn("[Profile] Failed to load settings", e);
    }
  }, [profileAddress, publicKey]);

  const persistSettings = (updated: typeof profileSettings) => {
    const key = profileAddress || publicKey;
    try {
      if (key) {
        localStorage.setItem(`tipzo_profile_settings_${key}`, JSON.stringify(updated));
      }
      const appSettings = {
        enableAnimations: updated.enableAnimations,
        enableDebugLogs: updated.enableDebugLogs,
      };
      localStorage.setItem('tipzo_app_settings', JSON.stringify(appSettings));
      // Let logger re-read updated settings
      _refreshLoggerSettings();
      if (updated.enableAnimations === false) {
        document.body.classList.add('tipzo-animations-off');
      } else {
        document.body.classList.remove('tipzo-animations-off');
      }
    } catch (e) {
      console.warn("[Profile] Failed to save settings", e);
    }
  };

  // Apply default donation settings to profile donation form (for sending from this wallet)
  useEffect(() => {
    try {
      if (publicKey) {
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
      }
    } catch (e) {
      console.warn("[Profile] Failed to apply default donation settings", e);
    }
  }, [publicKey]);
  
  const [profile, setProfile] = useState<UserProfile & { handle: string }>({
    name: '',
    handle: '', // Not stored on chain, derived from address or just local
    bio: '',
  });

  useEffect(() => {
    const fetchProfile = async () => {
        if (!profileAddress) {
          if (isViewingOtherProfile) {
            // Viewing other profile but no address in URL
            return;
          }
          if (!publicKey) return;
        }
        
        setLoading(true);
        try {
            const addressToFetch = profileAddress || publicKey;
            if (!addressToFetch) return;
            
            // Fetch directly from blockchain (no cache)
            const data = await getProfileFromChain(addressToFetch);
            if (data) {
                logger.debug("[Profile] Loaded from chain:", addressToFetch);
                setProfile({
                    name: data.name,
                    bio: data.bio,
                    handle: addressToFetch
                });
                setExistsOnChain(true);
            } else {
                // No data from chain
                setProfile(prev => ({ ...prev, handle: addressToFetch || '' }));
                setExistsOnChain(false);
            }
        } catch (e) {
            console.error("Error fetching profile", e);
        } finally {
            setLoading(false);
        }
    };

    fetchProfile();
  }, [profileAddress, publicKey, isViewingOtherProfile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
      if (!wallet || !publicKey) return;

      setSaving(true);
      try {
        // Ensure name and bio are strings and handle undefined/null
        const name = (profile.name || "").toString().slice(0, 30);
        const bio = (profile.bio || "").toString().slice(0, 30);
        
        logger.debug("Profile data before conversion:", { name, bio });
        
        const nameField = stringToField(name);
        const bioField = stringToField(bio); // Constraint: Field size
        
        // Validate field strings
        if (!nameField || !nameField.endsWith("field") || nameField.includes("NaN")) {
            throw new Error(`Invalid nameField: ${nameField}`);
        }
        if (!bioField || !bioField.endsWith("field") || bioField.includes("NaN")) {
            throw new Error(`Invalid bioField: ${bioField}`);
        }
        
        logger.debug("Converted fields:", { nameField, bioField });
        
        const functionName = existsOnChain ? "update_profile" : "create_profile";

        // Ensure inputs are strings (not numbers or other types)
        const inputs = [
            String(nameField),
            String(bioField)
        ];
        
        // Validate inputs don't contain NaN
        if (inputs.some(inp => inp.includes("NaN") || inp === "undefined" || inp === "null")) {
            throw new Error(`Invalid inputs detected: ${JSON.stringify(inputs)}`);
        }
        
        const transaction = {
            address: String(publicKey),
            chainId: WalletAdapterNetwork.TestnetBeta,
            fee: 50000, // Minimal fee for profile update (0.05 ALEO in microcredits)
            transitions: [
                {
                    program: String(PROGRAM_ID),
                    functionName: String(functionName),
                    inputs: inputs
                }
            ]
        };

        // Validate transaction before sending
        logger.debug("Profile transaction:", functionName);

        if (wallet.adapter && 'requestTransaction' in wallet.adapter) {
            // @ts-ignore
            const txId = await requestTransactionWithRetry(wallet.adapter, transaction, {
                timeout: 30000, // 30 seconds for profile creation
                maxRetries: 3
            });
            
            if (txId) {
                // Update local state immediately
                setProfile(prev => ({
                    ...prev,
                    name: name,
                    bio: bio
                }));
                setExistsOnChain(true);
                
                // Add to known profiles list (for blockchain scanning)
                if (publicKey) {
                    addKnownProfileAddress(publicKey);
                    logger.debug("[Profile] Profile saved:", publicKey);
                    
                    if (existsOnChain) {
                        logger.profile.updated(name);
                    } else {
                        logger.profile.created(publicKey);
                    }
                    
                    // CRITICAL: Dispatch profileUpdated event to refresh Explore
                    // This ensures the updated profile appears in Explore immediately
                    window.dispatchEvent(new CustomEvent('profileUpdated'));
                }
                
                alert(`Profile ${existsOnChain ? 'updated' : 'created'} successfully!`);
            }
        }

      } catch (e) {
          console.error("Profile save failed", e);
          alert("Failed to save profile.");
      } finally {
          setSaving(false);
      }
  };

  // Show modal when wallet is not connected (only for own profile)
  useEffect(() => {
    if (!isViewingOtherProfile && !publicKey) {
      setShowWalletModal(true);
    } else {
      setShowWalletModal(false);
    }
  }, [publicKey, isViewingOtherProfile]);

  // Handle donation for other user's profile
  const handleDonateToProfile = async () => {
    if (!wallet || !publicKey || !profileAddress || !isViewingOtherProfile) {
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
        
        if (!profileAddress || typeof profileAddress !== 'string' || !profileAddress.startsWith('aleo1')) {
            throw new Error(`Invalid recipient address: ${profileAddress}`);
        }
        
        // Two-step flow:
        // 1) credits.aleo::transfer_public
        // 2) donatu_appv5.aleo::send_donation(sender, recipient, amount, message, timestamp)
        
        const transferTransaction = {
            address: String(publicKey),
            chainId: WalletAdapterNetwork.TestnetBeta,
            fee: 10_000,
            transitions: [
                {
                    program: "credits.aleo",
                    functionName: "transfer_public",
                    inputs: [
                        String(profileAddress),
                        String(amountMicro) + "u64"
                    ]
                }
            ]
        };

        const transferTxId = await requestTransactionWithRetry(adapter, transferTransaction, {
            timeout: 30000, // 30 seconds for transfer
            maxRetries: 3
        });
        if (!transferTxId) {
            throw new Error("Token transfer was rejected or failed");
        }

        const messageField = stringToField(donationMessage || "");
        const timestamp = Math.floor(Date.now() / 1000);

        const donationTransaction = {
            address: String(publicKey),
            chainId: WalletAdapterNetwork.TestnetBeta,
            fee: 10_000,
            transitions: [
                {
                    program: String(PROGRAM_ID),
                    functionName: "send_donation",
                    inputs: [
                        String(publicKey),               // sender (public)
                        String(profileAddress),          // recipient (public)
                        String(amountMicro) + "u64",     // amount (private)
                        String(messageField),            // message (private)
                        String(timestamp) + "u64"        // timestamp (public)
                    ]
                }
            ]
        };

        const donationTxId = await requestTransactionWithRetry(adapter, donationTransaction, {
            timeout: 30000, // 30 seconds for donation record
            maxRetries: 3
        });
        if (!donationTxId) {
            console.warn("Donation transaction failed");
            alert("Donation transaction failed or was rejected.");
            return;
        }
        
        logger.donation.sent(donationTxId);
        window.dispatchEvent(new CustomEvent('tipzo-notification', {
          detail: {
            id: donationTxId,
            type: 'sent',
            message: `Sent ${amountNum} ALEO to ${formatAddress(profileAddress)}`,
            timestamp: Date.now(),
          }
        }));
        alert(
          `Donation sent successfully!\n\n` +
          `Transfer tx: ${transferTxId.slice(0, 8)}...\n` +
          `Record tx (send_donation): ${donationTxId.slice(0, 8)}...`
        );
        
        // Clear donation form
        setDonationAmount("1");
        setDonationMessage("");
        setShowDonationForm(false);
        
    } catch (e) {
        console.error("Donation failed:", e);
        alert("Donation failed: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  if (!isViewingOtherProfile && !publicKey) {
      return (
        <>
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <h2 className="text-3xl font-black mb-4">Profile</h2>
            <p className="text-xl text-gray-600">Connect your wallet to view and edit your profile.</p>
          </div>
          <WalletRequiredModal
            isOpen={showWalletModal}
            onClose={() => setShowWalletModal(false)}
            onConnect={() => {
              setShowWalletModal(false);
              // Dispatch event to open wallet modal from navbar
              window.dispatchEvent(new CustomEvent('openWalletModal'));
            }}
            action="view and edit your profile"
          />
        </>
      );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-5xl font-black mb-8 inline-block bg-white px-4 py-1 border-2 border-black shadow-neo-sm">
        {isViewingOtherProfile ? "PROFILE" : "EDIT PROFILE"}
      </h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Sidebar / Preview */}
        <div className="md:col-span-1 space-y-6">
           <NeoCard color="yellow" className="flex flex-col items-center text-center">
             <div className="w-32 h-32 bg-white border-2 border-black mb-4 overflow-hidden">
               <img src={`https://api.dicebear.com/7.x/identicon/svg?seed=${profileAddress || publicKey || ''}`} alt="Avatar" className="w-full h-full object-cover" />
             </div>
             <h2 className="text-2xl font-black">{profile.name || "Anonymous"}</h2>
             {!isViewingOtherProfile && (
               <NeoButton size="sm" variant="secondary" disabled className="mt-4">Change Avatar (Coming Soon)</NeoButton>
             )}
           </NeoCard>

           <NeoCard color="green" className="p-4">
              <h3 className="font-bold mb-2 flex items-center gap-2">
                <Wallet size={18}/> {isViewingOtherProfile ? "Wallet Address" : "Wallet Connected"}
              </h3>
              <p className="text-xs font-mono break-all bg-white p-2 border border-black">{profileAddress || publicKey || 'N/A'}</p>
           </NeoCard>

           {/* Social connections (disabled placeholder, like Explore) */}
           <NeoCard color="white" className="p-4 space-y-3">
             <h3 className="font-bold text-sm flex items-center gap-2 text-gray-500">
               <span className="w-2 h-2 rounded-full bg-gray-400" />
               Social connections (coming soon)
             </h3>
             <div className="flex flex-col gap-2">
               <button
                 type="button"
                 disabled
                 className="flex items-center justify-between px-3 py-2 border-2 border-dashed border-gray-400 bg-gray-100 text-gray-400 font-semibold text-sm cursor-not-allowed"
               >
                 <span className="flex items-center gap-2">
                   <Twitter size={16} />
                   Connect Twitter
                 </span>
                 <span className="text-[10px] uppercase tracking-wide">Soon</span>
               </button>
               <button
                 type="button"
                 disabled
                 className="flex items-center justify-between px-3 py-2 border-2 border-dashed border-gray-400 bg-gray-100 text-gray-400 font-semibold text-sm cursor-not-allowed"
               >
                 <span className="flex items-center gap-2">
                   <span className="w-4 h-4 rounded-full border-2 border-gray-400 flex items-center justify-center text-[9px]">D</span>
                   Connect Discord
                 </span>
                 <span className="text-[10px] uppercase tracking-wide">Soon</span>
               </button>
               <p className="text-[11px] text-gray-500">
                 Basic linking flow is prepared under the hood, but integrations are disabled until a future release.
               </p>
             </div>
           </NeoCard>

           {isViewingOtherProfile && (
             <NeoCard color="white" className="p-4">
               <p className="font-medium text-sm mb-2">{profile.bio || "No bio"}</p>
             </NeoCard>
           )}
        </div>

        {/* Form or Donation */}
        <div className="md:col-span-2">
          {isViewingOtherProfile ? (
            // View other user's profile - show donation form
            <NeoCard color="white" className="space-y-6">
              {loading && <div className="text-center"><Loader2 className="animate-spin inline"/> Loading profile...</div>}
              
              {!showDonationForm ? (
                <div className="text-center py-8">
                  <NeoButton 
                    className="flex items-center justify-center gap-2 mx-auto" 
                    size="lg"
                    onClick={() => setShowDonationForm(true)}
                  >
                    <DollarSign size={20} /> Donate to {profile.name || "this user"}
                  </NeoButton>
                </div>
              ) : (
                <div className="space-y-4 relative">
                  <button
                    onClick={() => {
                      setShowDonationForm(false);
                      setDonationAmount("1");
                      setDonationMessage("");
                    }}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-400 hover:bg-red-500 border-2 border-black flex items-center justify-center shadow-neo-sm transition-colors"
                    title="Close donation form"
                  >
                    <X size={14} className="text-white" />
                  </button>
                  
                  <div className="space-y-2">
                    <label className="font-bold text-lg">Donation Amount (ALEO)</label>
                    <NeoInput 
                      type="number" 
                      step="0.01"
                      min="0.01"
                      value={donationAmount} 
                      onChange={(e) => setDonationAmount(e.target.value)}
                      placeholder="1.00"
                      className="w-full text-lg font-bold border-2 border-black"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="font-bold text-lg">Message (Optional)</label>
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
                    className="w-full flex items-center justify-center gap-2" 
                    size="lg"
                    onClick={handleDonateToProfile}
                  >
                    <DollarSign size={20} /> Send Donation
                  </NeoButton>
                </div>
              )}
            </NeoCard>
          ) : (
            // Edit own profile + settings
            <div className="space-y-6">
              <NeoCard color="white" className="space-y-6">
                 {loading && <div className="text-center"><Loader2 className="animate-spin inline"/> Loading profile...</div>}
                 
                 <div className="space-y-2">
                   <label className="font-bold text-lg">Display Name (Max 30 chars)</label>
                   <NeoInput name="name" value={profile.name} onChange={handleChange} maxLength={30} />
                 </div>

                 <div className="space-y-2">
                   <label className="font-bold text-lg">Bio (Max 30 chars)</label>
                   <NeoTextArea name="bio" value={profile.bio} onChange={handleChange} rows={2} maxLength={30} />
                   <p className="text-xs text-gray-500">Note: Aleo 'field' type limits text length. Future updates will support longer bios.</p>
                 </div>

                 <div className="pt-4 border-t-2 border-gray-200 flex justify-end">
                   <NeoButton className="flex items-center gap-2" size="lg" onClick={handleSave} disabled={saving}>
                     {saving ? <Loader2 className="animate-spin" size={20}/> : <Save size={20} />} 
                     {existsOnChain ? "Update Profile" : "Create Profile"}
                   </NeoButton>
                 </div>
              </NeoCard>

              {/* Profile-level donation preferences */}
              <NeoCard color="white" className="space-y-4">
                <h2 className="text-xl font-black">Profile Donation Preferences</h2>
                <p className="text-sm text-gray-700">
                  These settings are stored locally in your browser and help pre-fill donation forms.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="font-bold text-sm">Default Donation Amount (ALEO)</label>
                    <NeoInput
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={profileSettings.defaultDonationAmount}
                      onChange={(e) => {
                        const updated = { ...profileSettings, defaultDonationAmount: e.target.value };
                        setProfileSettings(updated);
                        persistSettings(updated);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="font-bold text-sm">Default Donation Message</label>
                    <NeoInput
                      type="text"
                      maxLength={30}
                      value={profileSettings.defaultDonationMessage}
                      onChange={(e) => {
                        const updated = { ...profileSettings, defaultDonationMessage: e.target.value };
                        setProfileSettings(updated);
                        persistSettings(updated);
                      }}
                      placeholder="Thanks for supporting my work!"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-3 mt-2 text-sm font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 border-2 border-black"
                    checked={profileSettings.autoFillQuickDonate}
                    onChange={(e) => {
                      const updated = { ...profileSettings, autoFillQuickDonate: e.target.checked };
                      setProfileSettings(updated);
                      persistSettings(updated);
                    }}
                  />
                  <span>Auto-fill Quick Donate with my defaults</span>
                </label>
              </NeoCard>

              {/* App-wide settings */}
              <NeoCard color="white" className="space-y-4">
                <h2 className="text-xl font-black">App Settings</h2>
                <p className="text-sm text-gray-700">
                  These settings affect how TipZo behaves on this device.
                </p>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 border-2 border-black"
                      checked={profileSettings.enableAnimations}
                      onChange={(e) => {
                        const updated = { ...profileSettings, enableAnimations: e.target.checked };
                        setProfileSettings(updated);
                        persistSettings(updated);
                      }}
                    />
                    <span>Enable animations and motion effects</span>
                  </label>
                  <label className="flex items-center gap-3 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 border-2 border-black"
                      checked={profileSettings.enableDebugLogs}
                      onChange={(e) => {
                        const updated = { ...profileSettings, enableDebugLogs: e.target.checked };
                        setProfileSettings(updated);
                        persistSettings(updated);
                      }}
                    />
                    <span>Show extra debug logs in browser console</span>
                  </label>
                </div>
              </NeoCard>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;
