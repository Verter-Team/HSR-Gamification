# Запуск и развёртывание

## Локально через Docker Compose

Нужны Docker с Compose и свободные порты 3000 и 8080. Из корня репозитория:

```bash
cp infra/.env.example infra/.env
# Заполните POSTGRES_PASSWORD и JWT_SECRET в infra/.env.
# Для простого DATABASE_URL пароль Postgres используйте буквенно-цифровой.
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --build
docker compose --env-file infra/.env -f infra/docker-compose.yml exec api npm run db:seed
curl -fsS http://127.0.0.1:3000/health
```

Поднимаются три контейнера: `postgres`, `api` и `web`. `web` - nginx с приложением
проводника, он же проксирует `/api/` на сервер. Приложение: `http://localhost:8080`.

API сам применяет миграции при старте. Seed собирает граф из `content/`, создаёт
4 племени, 30 вымышленных сотрудников и проигрывает их историю движком, плюс
взаимные проверки, достижения и магазин. Seed можно запускать повторно: он пересоздаёт
демо-историю, поэтому перед показом жюри его стоит повторить.
Swagger - `http://127.0.0.1:3000/api/docs`. Демо-вход: проводник `4471`,
руководитель `1001`, пароль `demo`.

**Windows и кириллица в пути.** Если папка проекта лежит по пути с русскими буквами
(например, `Хакатон Московского транспорта`), сборка Docker падает с ошибкой
`header key "x-docker-expose-session-sharedkey" contains value with non-printable ASCII
characters`. Обход - ссылка на папку с латинским путём:

```powershell
New-Item -ItemType Junction -Path C:\vsm -Target (Get-Location).Path
cd C:\vsm
```

и дальше те же команды из `C:\vsm`.

## Без Docker для разработки

Нужны Node 22+ и Postgres. Из корня:

```bash
npm run install:all
# в apps/api/.env: DATABASE_URL=postgresql://..., JWT_SECRET=любая-строка
cd apps/api && npx prisma migrate deploy && npm run db:seed && npm run dev
# в другом окне
cd apps/pwa && npm run dev   # http://localhost:5173, /api проксируется на :3000
```

Если API на другом порту, задайте `API_PROXY=http://127.0.0.1:ПОРТ` перед `npm run dev`.

## Проверки

```bash
npm test                                   # движок + юнит-тесты сервера
cd apps/api
API_BASE=http://127.0.0.1:8080/api node --import tsx scripts/demo-smoke.ts
```

`demo-smoke` проходит весь путь демо через HTTP: вход, граф, прохождение медицины,
повышение уровня, открытие сценария, подделанный лог, взаимную проверку, магазин,
племена, аналитику руководителя. Он меняет данные - после него повторите seed.
Для остановки используйте `docker compose --env-file infra/.env -f infra/docker-compose.yml down`.
Том `postgres-data` сохраняет данные между запусками. Команда `down -v` удаляет их.

## Сервер с HTTPS

Понадобятся сервер с Docker Compose, домен, направленный на него, и действующий
TLS-сертификат. Скопируйте проект на сервер, создайте `infra/.env`, задайте
случайные разные значения `POSTGRES_PASSWORD`, `JWT_SECRET` и, если есть
получатель webhook, `WEBHOOK_SECRET`. Укажите `PUBLIC_BASE_URL=https://ваш-домен`.
Оба секрета должны содержать не менее 32 символов. Пример генерации:
`openssl rand -hex 32`.
Оставьте `API_BIND_ADDRESS=127.0.0.1`: API будет доступен только nginx на хосте,
а Postgres не публикует порт наружу. Для webhook укажите HTTPS-адрес
`WEBHOOK_URL`; оба параметра webhook задаются вместе.
Если API обслуживает браузерное приложение на другом домене, задайте его точный
адрес в `CORS_ORIGIN` (несколько адресов через запятую). По умолчанию CORS
выключен. Для nginx перед API задайте `TRUST_PROXY=1`, чтобы ограничение частоты
запросов учитывало IP клиента. При прямом доступе к API оставьте `TRUST_PROXY=0`.

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --build
docker compose --env-file infra/.env -f infra/docker-compose.yml ps
curl -fsS http://127.0.0.1:3000/health
```

Шаблон [nginx.conf](../infra/nginx.conf) проксирует весь API на localhost:3000.
В нём замените `example.org` на домен и пути сертификата на реальные, подключите
к nginx на хосте, проверьте `nginx -t` и перезагрузите nginx. Если на сервере
уже есть HTTPS-прокси, достаточно направить его на `127.0.0.1:3000`.
Проверьте `https://ваш-домен/health` и `/api/docs`. Для просмотра ошибок:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml logs --tail=100 api
```

Seed на публичном сервере запускайте только для демонстрационного стенда:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml exec api npm run db:seed
```

Для обновления кода повторите `up -d --build`; миграции применятся автоматически,
данные в томе сохранятся. Перед обновлением с реальными данными сделайте резервную
копию Postgres.

## Проверка с телефона

Телефон и компьютер в одной Wi-Fi сети: откройте `http://IP-компьютера:8080`
(по умолчанию `web` слушает все интерфейсы, см. `WEB_BIND_ADDRESS`). Приложение
работает и по HTTP в локальной сети, но установить его на домашний экран и включить
офлайн-кеш браузер разрешит только по HTTPS. Для показа жюри нужен сервер с доменом
и HTTPS: направьте HTTPS-прокси на порт 8080, и QR-код на адрес откроет приложение.

Локальный тест отправки webhook можно выполнить после сборки API и seed:

```bash
cd apps/api
DATABASE_URL='postgresql://...' node --import tsx scripts/smoke-webhook.ts
```

Скрипт создаёт локальный webhook-приёмник, один раз отвечает 500, затем 204 и
проверяет подпись, повторную доставку и результат через API. Прохождение
отправляется обычным `POST /attempts`, сервер пересчитывает его через `replay()`.
Скрипт рассчитан на свежую базу после seed.
