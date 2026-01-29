# TipZo — Private Donations on Aleo

Decentralized app for private donations on Aleo (testnet). Uses a Leo smart contract and zero-knowledge to keep donation amounts and message text private.

---

## Program Name and Deploy

- **Program name:** `donatu_appv5.aleo`
- **Contract file:** `src/main.leo`
- **Metadata:** `program.json` (program: `donatu_appv5.aleo`)

### Deploy Commands

**Before deploy:** install [Leo CLI](https://developer.aleo.org/getting_started/installation) and ensure `program.json` and a built contract exist in the project root.

```bash
# Build
leo build

# Deploy to testnet (Provable)
leo deploy --private-key <YOUR_PRIVATE_KEY> --network testnet --endpoint https://api.explorer.provable.com/v1 --broadcast --yes
```

**PowerShell (Windows):** use `deploy.ps1` — set `$PRIVATE_KEY` to your key and run:

```powershell
.\deploy.ps1
```

**Bash (Linux/macOS):** use `deploy.sh`:

```bash
chmod +x deploy.sh
# Edit PRIVATE_KEY in the file
./deploy.sh
```

After deploy, update `frontend/src/deployed_program.ts`: `PROGRAM_ID` must match the deployed program id (e.g. `donatu_appv5.aleo` or a new name if you changed it).

---

## Smart Contract: Main Functions and Logic

The `donatu_appv5.aleo` contract provides:

1. **Profiles** — public storage of name and bio per address.
2. **Donations** — creation of **private records** for recipient and sender plus **public indices** for history (no message text on-chain).

### Transitions

| Function | Description |
|----------|-------------|
| `create_profile(name, bio)` | Create profile. Parameters are public. Writes to mapping `profiles[caller]`. |
| `update_profile(name, bio)` | Update profile for the same user. Same public `name`, `bio`. |
| `send_donation(sender, recipient, amount, message, timestamp)` | Send donation. `sender` and `recipient` are public; `amount` and `message` are **private**. Only `sender` may call (`assert_eq(self.caller, sender)`). |

### What Happens on Donation

1. Two **private records** are created:
   - **RecipientDonation** — owner `recipient`: sender, amount, message, timestamp.
   - **SentDonation** — owner `sender`: recipient, amount, message, timestamp.
2. Message text is **not** stored in public state: `message_hash = BHP256::hash_to_field(message)` is computed.
3. In **finalize**, public mappings are updated:
   - for recipient: `donation_count`, `donation_index`;
   - for sender: `sent_donation_count`, `sent_donation_index`;
   - global history: `global_donation_count`, `global_donation_index`.

So **on-chain publicly** only donation metadata (addresses, amount, message hash, time) is stored; the **actual message text and amount inside records** are visible only to record owners (via Aleo records).

---

## Public vs Private (Encrypted) Data

### Public Data (on-chain, no Aleo encryption)

- **Profiles** — mapping `profiles: address => ProfileInfo`:
  - `name`, `bio` (field) — visible to everyone.
- **Donation metadata** — struct `DonationMeta` in mappings:
  - `sender`, `recipient` (address),
  - `amount` (u64),
  - `message_hash` (field) — hash of message, not the text,
  - `timestamp` (u64).
- Mappings with this metadata:
  - `donation_index`, `sent_donation_index`, `global_donation_index`,
  - counters: `donation_count`, `sent_donation_count`, `global_donation_count`.

So publicly visible: who, to whom, amount, when, and message hash — **not** the message text.

### Private Data (Aleo encryption / records)

- **RecipientDonation** — record owned by recipient:
  - owner, sender, **amount**, **message**, timestamp.
- **SentDonation** — record owned by sender:
  - owner, recipient, **amount**, **message**, timestamp.

Only the owner’s wallet (e.g. Leo Wallet) can decrypt these records. The `message` text and amount in these records do not leak into the contract’s public state.

**Summary:**

- Public: profiles (name, bio), party addresses, donation amount, timestamp, message hash.
- Private (Aleo records): full message text and amount inside records, visible only to record owners.

---

## How to Install and Configure the Frontend (So Everything Works)

Follow these steps to run the TipZo frontend locally and have it work with your deployed contract and Leo Wallet.

### Requirements

- **Node.js 18+** and npm (or yarn)
- **Leo Wallet** browser extension ([install](https://www.leowallet.io/)) — used for signing transactions and decrypting records
- The contract **deployed** on Aleo testnet (see [Program Name and Deploy](#program-name-and-deploy))

No `.env` file is required; API URLs and network are set in code.

---

### Step 1 — Clone and go to frontend

```bash
git clone https://github.com/barbos001/tipzo.git
cd tipzo/frontend
```

(Or `cd tipzo/frontend` if you already have the repo.)

---

### Step 2 — Install dependencies

```bash
npm install
```

If you see errors, try `npm ci` or ensure Node.js is 18+ (`node -v`).

---

### Step 3 — Set the program ID (required)

The frontend must use the **same program id** as the deployed contract.

1. Open **`frontend/src/deployed_program.ts`**.
2. Set `PROGRAM_ID` to your deployed program id:

```typescript
export const PROGRAM_ID = "donatu_appv5.aleo";
```

If you deployed with another name (e.g. `donatu_app.aleo`), use that exact string. This value is used for:
- Contract calls (create_profile, update_profile, send_donation)
- Provable API requests (mappings, global donation history)

Wrong or outdated `PROGRAM_ID` will cause "program not found", empty profiles, or failed transactions.

---

### Step 4 — Run the app

```bash
npm run dev
```

The app will be at **`http://localhost:5173`** (or the port Vite prints).

---

### Step 5 — Connect wallet and network

1. Install **Leo Wallet** and create/import a testnet account.
2. In the app, click **Connect Wallet** and approve the connection.
3. When connecting, allow **OnChainHistory** and the program id so the app can request records for donation history.
4. Ensure the wallet is on **Testnet** (same network as the deployed contract). Wrong network will cause failed transactions and empty data.

---

### Optional — Public profiles list (Explore page)

The **Explore** page shows profiles. It loads addresses from:

1. **`frontend/public/public-profiles.json`** — local file (array of Aleo addresses).
2. **GitHub / Netlify** — URLs in `frontend/src/utils/explorerAPI.ts` (`PUBLIC_PROFILES_REGISTRY_URL`, `PUBLIC_PROFILES_REGISTRY_FALLBACK`).

To use a custom list locally, create `frontend/public/public-profiles.json`:

```json
[
  "aleo1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "aleo1yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
]
```

If the file is missing, the app can still discover some profiles via the Provable API. To change the remote URLs, edit `explorerAPI.ts`.

---

### Production build

```bash
npm run build
```

Output is in **`frontend/dist`**. Deploy that folder to any static host. For **Vercel** or **Netlify**, use project root `frontend`, build command `npm run build` (see existing `vercel.json` and `netlify.toml`).

---

### Checklist — everything works when:

| Check | What to do |
|-------|------------|
| **PROGRAM_ID** | Matches the deployed program id in `frontend/src/deployed_program.ts`. |
| **Leo Wallet** | Installed, connected, and set to **Testnet**. |
| **Contract** | Deployed on testnet (e.g. Provable) so mappings and history API return data. |
| **Explore page** | Optional: add `frontend/public/public-profiles.json` or rely on API discovery. |

If profiles or history are empty, verify `PROGRAM_ID` and that the contract is deployed on the same network as the wallet. If transactions fail, check wallet network and balance.

---

## Project Structure

```
tipzo/
├── src/
│   └── main.leo                 # Smart contract donatu_appv5.aleo
├── program.json                 # Program metadata (name, version)
├── deploy.ps1                   # Deploy (Windows)
├── deploy.sh                    # Deploy (Linux/macOS)
├── deploy_output/               # Deploy artifacts (if any)
├── public-profiles.json         # Profile addresses (root)
├── frontend/
│   ├── public/
│   │   └── public-profiles.json # Registry for frontend
│   ├── src/
│   │   ├── deployed_program.ts # PROGRAM_ID — configure this
│   │   ├── utils/
│   │   │   ├── aleo.ts          # Field/string helpers
│   │   │   └── explorerAPI.ts   # Provable API, profiles, donation history
│   │   ├── views/               # Landing, Profile, History, Explore, QuickDonate
│   │   └── hooks/               # useDonationHistory, useWalletRecords, etc.
│   ├── package.json
│   ├── vercel.json
│   └── netlify.toml
└── README.md
```

---

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Chain:** Aleo Testnet (Provable)
- **Contract:** Leo
- **Wallet:** Leo Wallet (via @demox-labs/aleo-wallet-adapter-*)
- **API:** Provable Explorer (mappings, blocks, transactions)

---

## License

MIT © 2026
