# Donatu Frontend

Frontend застосунок для приватних донатів на Aleo.

## Встановлення

```bash
npm install
```

## Запуск

```bash
npm run dev
```

Застосунок буде доступний на `http://localhost:5173`

## Збірка

```bash
npm run build
```

## Структура

- `src/components/` - React компоненти (Header, тощо)
- `src/pages/` - Сторінки застосунку (Home, Profile, Search, History)
- `src/utils/` - Утиліти для роботи з Aleo (конвертація даних, кеш транзакцій)
- `src/deployed_program.ts` - ID деплойованого контракту

## Налаштування

В `src/deployed_program.ts` вкажіть ID вашого деплойованого контракту:

```typescript
export const PROGRAM_ID = "donatu_app.aleo";
```

## Використання

1. Встановіть Leo Wallet extension в браузер
2. Підключіть гаманець
3. Переконайтеся, що гаманець підключений до Aleo Testnet
4. Створіть профіль або почніть донатити

## Технології

- React 18
- TypeScript
- Vite
- Aleo Wallet Adapter
- React Router

