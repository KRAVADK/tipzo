program donatu_appv5.aleo {
    // Version 5: based on donatu_appv4.aleo
    // - Profiles: simple mapping profiles (no registry)
    // - Donations: private records + public indices for history
    // - Additionally: global_donation_index for easy selection of full history

    // Constructor
    @noupgrade
    async constructor() {}

    // Profile information struct
    struct ProfileInfo {
        name: field,
        bio: field,
    }

    // Record for the recipient (Received Donation)
    record RecipientDonation {
        owner: address,
        sender: address,
        amount: u64,
        message: field,
        timestamp: u64,
    }

    // Record for the sender (Sent Donation receipt)
    record SentDonation {
        owner: address,
        recipient: address,
        amount: u64,
        message: field,
        timestamp: u64,
    }
    
    // Donation metadata for indexing (public)
    struct DonationMeta {
        sender: address,
        recipient: address,
        amount: u64,
        message_hash: field,
        timestamp: u64,
    }

    // Profiles mapping
    mapping profiles: address => ProfileInfo;

    // Count of donations per recipient
    mapping donation_count: address => u64;

    // Donation index: key = hash(recipient, index) => DonationMeta
    mapping donation_index: field => DonationMeta;

    // Count of sent donations per sender
    mapping sent_donation_count: address => u64;

    // Sent donation index: key = hash(sender, index) => DonationMeta
    mapping sent_donation_index: field => DonationMeta;

    // Global count of all donations (for easy history scanning)
    // key = 0u64 => total number of donations
    mapping global_donation_count: u64 => u64;

    // Global donation index: key = 0,1,2,... => DonationMeta
    mapping global_donation_index: u64 => DonationMeta;

    // Create or update profile
    async transition create_profile(public name: field, public bio: field) -> Future {
        return finalize_create_profile(self.caller, name, bio);
    }

    async function finalize_create_profile(user: address, name: field, bio: field) {
        let info: ProfileInfo = ProfileInfo {
            name: name,
            bio: bio
        };
        Mapping::set(profiles, user, info);
    }

    // Update profile
    async transition update_profile(public name: field, public bio: field) -> Future {
        return finalize_update_profile(self.caller, name, bio);
    }

    async function finalize_update_profile(user: address, name: field, bio: field) {
        let info: ProfileInfo = ProfileInfo {
            name: name,
            bio: bio
        };
        Mapping::set(profiles, user, info);
    }

    // Send donation with encryption + public metadata indexing
    async transition send_donation(
        public sender: address,
        public recipient: address,
        private amount: u64,
        private message: field,
        public timestamp: u64
    ) -> (RecipientDonation, SentDonation, Future) {
        // Only the declared sender can call this transition
        assert_eq(self.caller, sender);
        
        // Create recipient donation record (owned by recipient)
        let recipient_donation: RecipientDonation = RecipientDonation {
            owner: recipient,
            sender: sender,
            amount: amount,
            message: message,
            timestamp: timestamp,
        };

        // Create sender donation record (owned by sender)
        let sender_donation: SentDonation = SentDonation {
            owner: sender,
            recipient: recipient,
            amount: amount,
            message: message,
            timestamp: timestamp,
        };

        // Hash message for indexing (privacy-preserving)
        let message_hash: field = BHP256::hash_to_field(message);
        
        // Pass metadata to finalize for indexing
        return (recipient_donation, sender_donation, finalize_send_donation(recipient, sender, amount, message_hash, timestamp));
    }

    async function finalize_send_donation(
        recipient: address,
        sender: address,
        amount: u64,
        message_hash: field,
        timestamp: u64
    ) {
        // Index for recipient (received donations)
        let recipient_count: u64 = Mapping::get_or_use(donation_count, recipient, 0u64);
        let recipient_field: field = BHP256::hash_to_field(recipient);
        let recipient_index_key: field = recipient_field + (recipient_count as field);
        
        let recipient_meta: DonationMeta = DonationMeta {
            sender: sender,
            recipient: recipient,
            amount: amount,
            message_hash: message_hash,
            timestamp: timestamp,
        };
        Mapping::set(donation_index, recipient_index_key, recipient_meta);
        Mapping::set(donation_count, recipient, recipient_count + 1u64);

        // Index for sender (sent donations)
        let sender_count: u64 = Mapping::get_or_use(sent_donation_count, sender, 0u64);
        let sender_field: field = BHP256::hash_to_field(sender);
        let sender_index_key: field = sender_field + (sender_count as field);
        
        let sender_meta: DonationMeta = DonationMeta {
            sender: sender,
            recipient: recipient,
            amount: amount,
            message_hash: message_hash,
            timestamp: timestamp,
        };
        Mapping::set(sent_donation_index, sender_index_key, sender_meta);
        Mapping::set(sent_donation_count, sender, sender_count + 1u64);

        // Global index for all donations (for easy scanning in frontend)
        let count_key: u64 = 0u64;
        let global_count: u64 = Mapping::get_or_use(global_donation_count, count_key, 0u64);

        let global_meta: DonationMeta = DonationMeta {
            sender: sender,
            recipient: recipient,
            amount: amount,
            message_hash: message_hash,
            timestamp: timestamp,
        };

        Mapping::set(global_donation_index, global_count, global_meta);
        Mapping::set(global_donation_count, count_key, global_count + 1u64);
    }
}
