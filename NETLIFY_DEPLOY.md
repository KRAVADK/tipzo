# Інструкції для деплою на Netlify

## Варіант 1: Через Netlify CLI (рекомендовано)

### 1. Встановіть Netlify CLI глобально:
```bash
npm install -g netlify-cli
```

### 2. Перейдіть до папки frontend:
```bash
cd frontend
```

### 3. Увійдіть в Netlify:
```bash
netlify login
```

### 4. Ініціалізуйте проєкт:
```bash
netlify init
```

Під час ініціалізації:
- Оберіть "Create & configure a new site"
- Введіть назву сайту (або залиште порожнім для автоматичної генерації)
- Вкажіть build command: `npm run build`
- Вкажіть publish directory: `dist`

### 5. Деплой:
```bash
netlify deploy --prod
```

## Варіант 2: Через GitHub (автоматичний деплой)

### 1. Завантажте проєкт на GitHub

### 2. Перейдіть на [netlify.com](https://www.netlify.com) та увійдіть

### 3. Натисніть "Add new site" → "Import an existing project"

### 4. Оберіть GitHub репозиторій

### 5. Налаштуйте build settings:
- **Base directory:** `frontend`
- **Build command:** `npm run build`
- **Publish directory:** `frontend/dist`

### 6. Натисніть "Deploy site"

Після цього кожен push до main гілки буде автоматично деплоїти сайт.

## Варіант 3: Drag & Drop (швидкий тест)

### 1. Збілдіть проєкт локально:
```bash
cd frontend
npm install
npm run build
```

### 2. Перейдіть на [app.netlify.com/drop](https://app.netlify.com/drop)

### 3. Перетягніть папку `frontend/dist` на сторінку

**Примітка:** Цей метод не підтримує автоматичні оновлення, тільки для тестування.

## Важливі налаштування

### Environment Variables (якщо потрібні):
Якщо ваш проєкт потребує змінних оточення:
1. Перейдіть до Site settings → Environment variables
2. Додайте необхідні змінні

### Custom Domain:
1. Перейдіть до Site settings → Domain management
2. Додайте свій домен

## Перевірка після деплою

Після успішного деплою перевірте:
- ✅ Сайт відкривається
- ✅ React Router працює (перевірте навігацію)
- ✅ Всі API запити працюють
- ✅ Wallet підключення працює

