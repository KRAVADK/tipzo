import React, { useState, useEffect } from 'react';
import { NeoCard, NeoButton, NeoInput, NeoTextArea, WalletRequiredModal } from '../components/NeoComponents';
import { UserProfile } from '../utils/explorerAPI';
import { Save, Wallet, Loader2 } from 'lucide-react';
import { useWallet } from '@demox-labs/aleo-wallet-adapter-react';
import { getProfileFromChain } from '../utils/explorerAPI';
import { stringToField } from '../utils/aleo';
import { requestTransactionWithRetry } from '../utils/walletUtils';
import { WalletAdapterNetwork } from '@demox-labs/aleo-wallet-adapter-base';
import { PROGRAM_ID } from '../deployed_program';

const Profile: React.FC = () => {
  const { wallet, publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existsOnChain, setExistsOnChain] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  
  const [profile, setProfile] = useState<UserProfile & { handle: string }>({
    name: '',
    handle: '', // Not stored on chain, derived from address or just local
    bio: '',
  });

  useEffect(() => {
    const fetchProfile = async () => {
        if (!publicKey) return;
        
        setLoading(true);
        try {
            const data = await getProfileFromChain(publicKey);
            if (data) {
                setProfile({
                    name: data.name,
                    bio: data.bio,
                    handle: publicKey // Use address as handle
                });
                setExistsOnChain(true);
            } else {
                setProfile(prev => ({ ...prev, handle: publicKey }));
                setExistsOnChain(false);
            }
        } catch (e) {
            console.error("Error fetching profile", e);
        } finally {
            setLoading(false);
        }
    };

    fetchProfile();
  }, [publicKey]);

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
            alert(`Profile ${existsOnChain ? 'updated' : 'created'} successfully!\n\nFunction: ${functionName}\nTransaction sent! It may take a few minutes to appear.`);
        }

      } catch (e) {
          console.error("Profile save failed", e);
          alert("Failed to save profile.");
      } finally {
          setSaving(false);
      }
  };

  // Show modal when wallet is not connected
  useEffect(() => {
    if (!publicKey) {
      setShowWalletModal(true);
    } else {
      setShowWalletModal(false);
    }
  }, [publicKey]);

  if (!publicKey) {
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
      <h1 className="text-5xl font-black mb-8">EDIT PROFILE</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Sidebar / Preview */}
        <div className="md:col-span-1 space-y-6">
           <NeoCard color="yellow" className="flex flex-col items-center text-center">
             <div className="w-32 h-32 bg-white border-2 border-black mb-4 overflow-hidden">
               <img src={`https://api.dicebear.com/7.x/identicon/svg?seed=${publicKey}`} alt="Avatar" className="w-full h-full object-cover" />
             </div>
             <h2 className="text-2xl font-black">{profile.name || "Anonymous"}</h2>
             <NeoButton size="sm" variant="secondary" disabled className="mt-4">Change Avatar (Coming Soon)</NeoButton>
           </NeoCard>

           <NeoCard color="green" className="p-4">
              <h3 className="font-bold mb-2 flex items-center gap-2"><Wallet size={18}/> Wallet Connected</h3>
              <p className="text-xs font-mono break-all bg-white p-2 border border-black">{publicKey}</p>
           </NeoCard>
        </div>

        {/* Form */}
        <div className="md:col-span-2">
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

             {/* Removed Twitter/Github as contract doesn't support them */}

             <div className="pt-4 border-t-2 border-gray-200 flex justify-end">
               <NeoButton className="flex items-center gap-2" size="lg" onClick={handleSave} disabled={saving}>
                 {saving ? <Loader2 className="animate-spin" size={20}/> : <Save size={20} />} 
                 {existsOnChain ? "Update Profile" : "Create Profile"}
               </NeoButton>
             </div>
          </NeoCard>
        </div>
      </div>
    </div>
  );
};

export default Profile;
