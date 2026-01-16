program donatu_app_v5.aleo {
    // This is the constructor for the program.
    // It is called when the program is deployed.
    // Version 5: Fully private donations - no public mappings
    @noupgrade
    async constructor() {}

    // Profile information struct
    struct ProfileInfo {
        name: field,
        bio: field,
        is_public: bool,  // If true, profile is visible in explore/search
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
    async transition create_profile(public name: field, public bio: field) -> Future {
        return finalize_create_profile(self.caller, name, bio);
    }

    async function finalize_create_profile(user: address, name: field, bio: field) {
        let info: ProfileInfo = ProfileInfo {
            name: name,
            bio: bio,
            is_public: true  // Default: profile is public (visible in explore)
        };
        Mapping::set(profiles, user, info);
    }

    // Update profile
    async transition update_profile(public name: field, public bio: field) -> Future {
        return finalize_update_profile(self.caller, name, bio);
    }

    async function finalize_update_profile(user: address, name: field, bio: field) {
        // Preserve existing is_public setting
        let existing: ProfileInfo = Mapping::get(profiles, user);
        let info: ProfileInfo = ProfileInfo {
            name: name,
            bio: bio,
            is_public: existing.is_public  // Keep existing visibility setting
        };
        Mapping::set(profiles, user, info);
    }

    // Set profile visibility (public/private)
    // User can control if their profile appears in explore/search
    async transition set_profile_visibility(public is_public: bool) -> Future {
        return finalize_set_profile_visibility(self.caller, is_public);
    }

    async function finalize_set_profile_visibility(user: address, is_public: bool) {
        // Get existing profile to preserve name and bio
        let existing: ProfileInfo = Mapping::get(profiles, user);
        let info: ProfileInfo = ProfileInfo {
            name: existing.name,
            bio: existing.bio,
            is_public: is_public
        };
        Mapping::set(profiles, user, info);
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
}
