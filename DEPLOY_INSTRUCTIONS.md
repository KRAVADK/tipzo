# Інструкції для деплою контракту

## Компіляція ✅
Контракт вже скомпільовано успішно!

## Деплой

Оскільки `leo deploy` потребує інтерактивного підтвердження, виконайте одну з наступних команд вручну:

### Варіант 1: Leo CLI (рекомендовано)
```bash
cd C:\Users\Leonid\Documents\trae_projects\donatu
leo deploy --private-key APrivateKey1zkp3CAcpd4QNiUhznYhou5A2wjiBgvfrbTR3i81XzZVqewa --network testnet --endpoint https://api.explorer.provable.com/v1 --broadcast
```

### Варіант 2: Через PowerShell скрипт
```powershell
cd C:\Users\Leonid\Documents\trae_projects\donatu
.\deploy.ps1
```

### Варіант 3: Через змінні середовища
```powershell
$env:LEO_PRIVATE_KEY="APrivateKey1zkp3CAcpd4QNiUhznYhou5A2wjiBgvfrbTR3i81XzZVqewa"
$env:NETWORK="testnet"
$env:ENDPOINT="https://api.explorer.provable.com/v1"
leo deploy --broadcast
```

## Після деплою

1. Скопіюйте Program ID з виводу команди (буде виглядати як `donatu_app.aleo`)
2. Оновіть `frontend/src/deployed_program.ts`:
   ```typescript
   export const PROGRAM_ID = "donatu_app.aleo"; // або повний ID з деплою
   ```

## Перевірка деплою

Після успішного деплою перевірте транзакцію на:
- https://testnet.aleoscan.io/
- https://testnet.explorer.provable.com/

## Програмний ID

Після деплою Program ID буде: `donatu_app.aleo` (або з додатковим суфіксом залежно від мережі)

