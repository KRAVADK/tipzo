# PowerShell deploy script for tipzo_app.aleo

$PRIVATE_KEY = "APrivateKey1zkp3CAcpd4QNiUhznYhou5A2wjiBgvfrbTR3i81XzZVqewa"
$NETWORK = "testnet"
$ENDPOINT = "https://api.explorer.provable.com/v1"

Write-Host "🚀 Deploying tipzo_app.aleo to $NETWORK..." -ForegroundColor Cyan

leo deploy `
  --private-key $PRIVATE_KEY `
  --network $NETWORK `
  --endpoint $ENDPOINT `
  --broadcast `
  --yes

Write-Host "✅ Deployment complete!" -ForegroundColor Green

