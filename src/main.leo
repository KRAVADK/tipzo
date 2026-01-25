program tipzo_app_v6.aleo {
    // This is the constructor for the program.
    // It is called when the program is deployed.
    // Version 6: Public profile registry - profiles are automatically registered and discoverable
    @noupgrade
    async constructor() {}

    // Profile information struct
    struct ProfileInfo {
        name: field,
        bio: field,
    }

    // Record for the recipient (Received Donation) - PRIVATE
    // Only the recipient can see: sender address, amount, message
    record RecipientDonation {
        owner: address,
        sender: address,
        amount: u64,
        message: field,
        timestamp: u64,
    }

    // Record for the sender (Sent Donation receipt) - PRIVATE
    // Only the sender can see: recipient address, amount, message
    record SentDonation {
        owner: address,
        recipient: address,
        amount: u64,
        message: field,
        timestamp: u64,
    }

    // Profiles mapping (public - only nickname/bio, no donation info)
    mapping profiles: address => ProfileInfo;
    
    // Public registry of active profiles - indexed list for discovery
    mapping active_profiles: u64 => address;
    
    // Counter for total number of registered profiles
    mapping profile_count: u64 => u64;
    
    // Track which addresses are already registered (to avoid duplicates)
    mapping is_registered: address => bool;

    // Send donation - FULLY PRIVATE transition
    // No public parameters except timestamp (for ordering)
    // No finalize function - no public mappings
    // All donation data is stored ONLY in private records
    transition send_donation(
        private recipient: address,
        private amount: u64,
        private message: field,
        public timestamp: u64
    ) -> (RecipientDonation, SentDonation) {
        let sender: address = self.caller;
        
        // Create recipient donation record (owned by recipient)
        // Only recipient can decrypt and see: sender, amount, message
        let recipient_donation: RecipientDonation = RecipientDonation {
            owner: recipient,
            sender: sender,
            amount: amount,
            message: message,
            timestamp: timestamp,
        };

        // Create sender donation record (owned by sender)
        // Only sender can decrypt and see: recipient, amount, message
        let sender_donation: SentDonation = SentDonation {
            owner: sender,
            recipient: recipient,
            amount: amount,
            message: message,
            timestamp: timestamp,
        };

        // Return both records - NO FINALIZE, NO PUBLIC MAPPINGS
        // All donation data is private and encrypted
        return (recipient_donation, sender_donation);
    }

    // Create or update profile
    // Automatically registers profile in public registry if it's new
    async transition create_profile(public name: field, public bio: field) -> Future {
        return finalize_create_profile(self.caller, name, bio);
    }

    async function finalize_create_profile(user: address, name: field, bio: field) {
        let info: ProfileInfo = ProfileInfo {
            name: name,
            bio: bio
        };
        Mapping::set(profiles, user, info);
        
        // Check if profile is already registered
        let registered: bool = Mapping::get(is_registered, user);
        
        // Only register in public list if not already registered
        if (!registered) {
            // Get current profile count
            let count_key: u64 = 0u64;
            let current_count: u64 = Mapping::get(profile_count, count_key);
            
            // Add user to active_profiles at index = current_count
            Mapping::set(active_profiles, current_count, user);
            
            // Mark as registered
            Mapping::set(is_registered, user, true);
            
            // Increment profile count
            Mapping::set(profile_count, count_key, current_count + 1u64);
        }
    }

    // Update profile
    // Updates existing profile (doesn't add to registry if already exists)
    async transition update_profile(public name: field, public bio: field) -> Future {
        return finalize_update_profile(self.caller, name, bio);
    }

    async function finalize_update_profile(user: address, name: field, bio: field) {
        let info: ProfileInfo = ProfileInfo {
            name: name,
            bio: bio
        };
        Mapping::set(profiles, user, info);
        // Profile is already in registry from create_profile, so no need to add again
    }

    // View function to read profile from mapping (public, async for mapping access)
    async transition get_profile(public user_address: address) -> Future {
        return finalize_get_profile(user_address);
    }

    async function finalize_get_profile(user_address: address) {
        let profile: ProfileInfo = Mapping::get(profiles, user_address);
        // Note: In Leo, we can't directly return from finalize, but the profile is accessible
        // The frontend will need to read it from the transaction output
    }
    
    // View function to get total number of registered profiles
    async transition get_profile_count() -> Future {
        return finalize_get_profile_count();
    }
    
    async function finalize_get_profile_count() {
        let count_key: u64 = 0u64;
        let count: u64 = Mapping::get(profile_count, count_key);
        // Count is accessible via transaction output
    }
    
    // View function to get profile address by index
    async transition get_profile_at_index(public index: u64) -> Future {
        return finalize_get_profile_at_index(index);
    }
    
    async function finalize_get_profile_at_index(index: u64) {
        let profile_address: address = Mapping::get(active_profiles, index);
        // Address is accessible via transaction output
    }
}
