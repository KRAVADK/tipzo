import React, { useState, useEffect } from 'react';
import { NeoCard, NeoButton, NeoInput, NeoTextArea, WalletRequiredModal } from '../components/NeoComponents';
import { UserProfile } from '../utils/explorerAPI';
import { Save, Wallet, Loader2, DollarSign, X } from 'lucide-react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { getProfileFromChain, cacheProfile } from '../utils/explorerAPI';
import { stringToField } from '../utils/aleo';
import { requestTransactionWithRetry } from '../utils/walletUtils';
import { WalletAdapterNetwork } from '@demox-labs/aleo-wallet-adapter-base';
import { PROGRAM_ID } from '../deployed_program';
import { useParams } from 'react-router-dom';

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
            
            const data = await getProfileFromChain(addressToFetch);
            if (data) {
                setProfile({
                    name: data.name,
                    bio: data.bio,
                    handle: addressToFetch
                });
                setExistsOnChain(true);
            } else {
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
        
        console.log("Profile data before conversion:", { name, bio, nameType: typeof name, bioType: typeof bio });
        
        const nameField = stringToField(name);
        const bioField = stringToField(bio); // Constraint: Field size
        
        // Validate field strings
        if (!nameField || !nameField.endsWith("field") || nameField.includes("NaN")) {
            throw new Error(`Invalid nameField: ${nameField}`);
        }
        if (!bioField || !bioField.endsWith("field") || bioField.includes("NaN")) {
            throw new Error(`Invalid bioField: ${bioField}`);
        }
        
        console.log("Converted fields:", { nameField, bioField });
        
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
        console.log("Profile transaction (full):", JSON.stringify(transaction, null, 2));
        console.log("Profile transaction (summary):", {
            address: transaction.address,
            addressType: typeof transaction.address,
            chainId: transaction.chainId,
            chainIdType: typeof transaction.chainId,
            chainIdValue: String(transaction.chainId),
            transitionsCount: transaction.transitions.length,
            program: transaction.transitions[0].program,
            programType: typeof transaction.transitions[0].program,
            functionName: transaction.transitions[0].functionName,
            functionNameType: typeof transaction.transitions[0].functionName,
            inputs: transaction.transitions[0].inputs,
            inputsCount: transaction.transitions[0].inputs.length,
            inputsTypes: transaction.transitions[0].inputs.map(i => typeof i),
            inputsValues: transaction.transitions[0].inputs,
            inputsStringified: transaction.transitions[0].inputs.map(i => String(i))
        });

        if (wallet.adapter && 'requestTransaction' in wallet.adapter) {
            // @ts-ignore
            await requestTransactionWithRetry(wallet.adapter, transaction);
            
            // Cache the profile immediately for nickname search (optimistic update)
            if (publicKey) {
                cacheProfile(publicKey, {
                    name: name,
                    bio: bio
                });
            }
            
            alert(`Profile ${existsOnChain ? 'updated' : 'created'} successfully!\n\nFunction: ${functionName}\nTransaction sent! It may take a few minutes to appear.`);
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
        
        // STEP 1: Transfer real tokens
        const transferTransaction = {
            address: String(publicKey),
            chainId: WalletAdapterNetwork.TestnetBeta,
            fee: 50000,
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
        
        const transferTxId = await requestTransactionWithRetry(adapter, transferTransaction);
        if (!transferTxId) {
            throw new Error("Token transfer was rejected or failed");
        }
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // STEP 2: Create donation record
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
                        String(publicKey),
                        String(profileAddress),
                        String(amountMicro) + "u64",
                        String(messageField),
                        String(timestamp) + "u64"
                    ]
                }
            ]
        };
        
        const donationTxId = await requestTransactionWithRetry(adapter, donationTransaction);
        if (!donationTxId) {
            console.warn("Donation record creation failed, but tokens were transferred");
            alert(`Tokens transferred! Transaction: ${transferTxId}\nNote: Donation record creation failed.`);
            return;
        }
        
        alert(`Donation sent successfully!\n\nFunction: send_donation\nTransfer: ${transferTxId.slice(0, 8)}...\nRecord: ${donationTxId.slice(0, 8)}...`);
        
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
      <h1 className="text-5xl font-black mb-8">{isViewingOtherProfile ? "PROFILE" : "EDIT PROFILE"}</h1>
      
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
            // Edit own profile
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
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;
