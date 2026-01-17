# Deployment Instructions

## Compilation ✅
The contract has been successfully compiled!

## Deployment

Since `leo deploy` requires interactive confirmation, execute one of the following commands manually:

### Option 1: Leo CLI (Recommended)
```bash
cd C:\Users\Leonid\Documents\trae_projects\donatu
leo deploy --private-key APrivateKey1zkp3CAcpd4QNiUhznYhou5A2wjiBgvfrbTR3i81XzZVqewa --network testnet --endpoint https://api.explorer.provable.com/v1 --broadcast
```

### Option 2: Via PowerShell Script
```powershell
cd C:\Users\Leonid\Documents\trae_projects\donatu
.\deploy.ps1
```

### Option 3: Via Environment Variables
```powershell
$env:LEO_PRIVATE_KEY="APrivateKey1zkp3CAcpd4QNiUhznYhou5A2wjiBgvfrbTR3i81XzZVqewa"
$env:NETWORK="testnet"
$env:ENDPOINT="https://api.explorer.provable.com/v1"
leo deploy --broadcast
```

## After Deployment

1. Copy the Program ID from the command output (will look like `tipzo_app_v5.aleo`)
2. Update `frontend/src/deployed_program.ts`:
   ```typescript
   export const PROGRAM_ID = "tipzo_app_v5.aleo"; // or full ID from deployment
   ```

## Verify Deployment

After successful deployment, verify the transaction on:
- https://testnet.aleoscan.io/
- https://testnet.explorer.provable.com/

## Program ID

After deployment, the Program ID will be: `tipzo_app_v5.aleo` (or with additional suffix depending on network)
