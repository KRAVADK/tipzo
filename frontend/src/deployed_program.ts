// Deployed program: tipzo_app_v7.aleo (build/main.leo)
// Compatible with: profiles mapping, create_profile, update_profile, send_donation
// Transitions: create_profile(name, bio), update_profile(name, bio), send_donation(recipient, amount, message, timestamp)
// Mappings: 
//   - profiles (address -> ProfileInfo)
//   - active_profiles (u64 -> address) - public registry of all profiles
//   - profile_count (u64 -> u64) - total number of registered profiles
//   - is_registered (address -> bool) - track registered addresses
// Version 7: Removed @noupgrade to allow future upgrades, update_profile now also registers profiles

export const PROGRAM_ID = "tipzo_app_v7.aleo";
