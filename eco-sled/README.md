# Эко-След

Гид по осознанному потреблению. Человек коротко описывает привычки, получает Eco Score и одно следующее действие: с оценкой CO₂ и евро, а не с абстрактным советом «жить экологичнее».

Это MVP первой петли: аккаунт, онбординг, расчёт `eco-1.0.0`, главная, след, советы, челленджи, привычки, очки и удаление данных.

## Запуск

Нужен Node.js 22 или новее.

```bash
cd eco-sled
npm install
npm start
```

Откройте <http://localhost:4173>. Кнопка «Посмотреть пример» создаёт демонстрационный профиль без своей регистрации.

```bash
npm test
npm run typecheck
```

Порт и база:

```bash
PORT=4173
ECO_DB_PATH=data/eco.db
ECO_JWT_SECRET=длинная-случайная-строка
```

В `NODE_ENV=production` сервер не стартует без `ECO_JWT_SECRET` длиной от 16 символов.

## Что внутри

```
apps/web                 интерфейс
apps/api                 HTTP API
packages/calculations    формула, советы, каталог
packages/types           общие типы
packages/validation      JSON Schema
database/migrations      схема PostgreSQL
database/seeds           справочники PostgreSQL
docs/api/openapi.yaml    контракт API
```

Запущенное приложение хранит данные в SQLite. Файл `database/migrations/001_init.sql` — схема для PostgreSQL, когда понадобится отдельная база. Набор таблиц тот же.

Формула — оценка порядка величин, не сертифицированный углеродный отчёт. Коэффициенты и версия лежат в `packages/calculations/src/engine.ts`. Старые оценки сохраняют версию, с которой были посчитаны.

## Docker

```bash
docker build -t eco-sled eco-sled
docker run --rm -p 4173:4173 -e ECO_JWT_SECRET=замените-на-длинный-секрет eco-sled
```

Команду запускайте из корня репозитория.
