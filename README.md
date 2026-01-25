# TipZo - Private Donations on Aleo

A fully-featured decentralized application for private donations on the Aleo blockchain (testnet) using Leo smart contracts. TipZo leverages zero-knowledge proofs to ensure complete privacy for all donation transactions.

## Features

- 🔒 **Fully Encrypted Donations** - Uses Aleo's zero-knowledge proofs for complete privacy
- 👤 **Profile System** - Create and update profiles with nickname and bio
- 🔍 **User Search** - Search users by address or nickname
- 💰 **Donations** - Send donations through profiles or quick donation popup
- 📜 **Transaction History** - View sent and received donations
- 🎨 **Modern Design** - Dark theme with glassmorphism effects and gradients

## How It Works

TipZo is built on Aleo's privacy-first blockchain architecture:

1. **Private Records**: All donation data (amount, message, sender/recipient) is stored in encrypted private records that only the owner can decrypt
2. **Zero-Knowledge Proofs**: Transactions are verified without revealing sensitive information
3. **Public Profiles**: Only profile information (nickname, bio) is stored publicly for discoverability
4. **Wallet Integration**: Seamless integration with Leo Wallet and Puzzle Wallet for transaction signing

### Smart Contract Architecture

The Leo smart contract (`src/main.leo`) implements:

- **Profile Management**: Public mapping for user profiles (name, bio)
- **Private Donations**: Two private records created per donation:
  - `RecipientDonation`: Owned by recipient, contains sender address, amount, message
  - `SentDonation`: Owned by sender, contains recipient address, amount, message
- **No Public Mappings**: Donation data is never stored in public mappings, ensuring complete privacy

## Technologies

- **Frontend**: React 18 + TypeScript + Vite
- **Blockchain**: Aleo Testnet
- **Smart Contracts**: Leo programming language
- **Wallet Integration**: Leo Wallet & Puzzle Wallet adapters
- **Styling**: CSS with glassmorphism effects
- **Routing**: React Router

## Installation

### Prerequisites

- Node.js 18+ and npm
- Leo CLI ([Installation Guide](https://developer.aleo.org/getting_started/installation))
- Leo Wallet browser extension

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The application will be available at `http://localhost:5173`

### Smart Contract Setup

```bash
# Compile the contract
leo build

# Deploy to testnet
leo deploy
```

After deployment, update `frontend/src/deployed_program.ts` with your program ID:

```typescript
export const PROGRAM_ID = "tipzo_app_v5.aleo";
```

## Project Structure

```
tipzo/
├── src/
│   └── main.leo              # Leo smart contract
├── frontend/
│   ├── src/
│   │   ├── components/        # React components (Header, Toast, etc.)
│   │   ├── pages/            # Application pages (Home, Profile, Search, History)
│   │   ├── hooks/            # Custom React hooks
│   │   ├── utils/            # Utilities (Aleo helpers, wallet utils)
│   │   └── App.tsx           # Main application component
│   └── package.json
├── build/                     # Compiled Leo program
├── deploy_output/            # Deployment artifacts
└── README.md
```

## Usage

1. **Connect Wallet**: Install Leo Wallet extension and connect your wallet
2. **Create Profile** (optional): Set up your profile with a nickname and bio
3. **Find Users**: Search for users by address or nickname
4. **Send Donation**: Navigate to a user's profile or use the quick donation feature
5. **View History**: Check your transaction history for sent and received donations

## Development

### Smart Contract Functions

- `create_profile(name, bio)` - Create or update user profile
- `update_profile(name, bio)` - Update existing profile
- `send_donation(recipient, amount, message, timestamp)` - Send private donation
- `get_profile(user_address)` - Retrieve user profile

### Frontend Components

- `Header` - Navigation and wallet connection
- `Home` - Main page with quick donation feature
- `Profile` - User profile page with donation functionality
- `Search` - User search interface
- `History` - Transaction history viewer

### Key Utilities

- `aleo.ts` - Aleo data conversion utilities
- `walletUtils.ts` - Wallet interaction helpers
- `walletRecords.ts` - Record fetching and parsing
- `txCache.ts` - Transaction caching

## Deployment

The contract is currently deployed on Aleo Testnet:
- **Program ID**: `tipzo_app_v5.aleo`
- **Network**: Testnet
- **Explorers**: 
  - [AleoScan](https://testnet.aleoscan.io/)
  - [Provable Explorer](https://testnet.explorer.provable.com/)

## Privacy & Security

- All donation amounts and messages are encrypted in private records
- Only the sender and recipient can decrypt their respective records
- Profile information (nickname, bio) is public for discoverability
- No donation data is stored in public blockchain state
- Zero-knowledge proofs ensure transaction validity without revealing details

## License

MIT
