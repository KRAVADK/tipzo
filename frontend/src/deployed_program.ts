// Deployed program: donatu_appv5.aleo (src/main.leo)
// Compatible with: profiles mapping, create_profile, update_profile, send_donation
// Transitions:
//   - create_profile(name, bio)
//   - update_profile(name, bio)
//   - send_donation(sender, recipient, amount, message, timestamp)
// Mappings:
//   - profiles (address -> ProfileInfo)
//   - donation_count (address -> u64)
//   - donation_index (field -> DonationMeta)
//   - sent_donation_count (address -> u64)
//   - sent_donation_index (field -> DonationMeta)
//   - global_donation_count (u64 -> u64)  // total donations (under key 0)
//   - global_donation_index (u64 -> DonationMeta) // 0..N-1 => all donations

export const PROGRAM_ID = "donatu_appv5.aleo";
