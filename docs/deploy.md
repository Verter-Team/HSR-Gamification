# Запуск и развёртывание

## Локально через Docker Compose

Нужны Docker с Compose и свободный порт 3000. Из корня репозитория:

```bash
cp infra/.env.example infra/.env
# Заполните POSTGRES_PASSWORD и JWT_SECRET в infra/.env.
# Для простого DATABASE_URL пароль Postgres используйте буквенно-цифровой.
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --build
docker compose --env-file infra/.env -f infra/docker-compose.yml exec api npm run db:seed
curl -fsS http://127.0.0.1:3000/health
```

API сам применяет миграции при старте. Seed запускайте один раз для демо:
он создаёт 30 вымышленных сотрудников, историю попыток, достижения и рейтинг.
Swagger - `http://127.0.0.1:3000/api/docs`. Демо-вход: `4471` / `demo`.
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

Откройте с телефона `https://ваш-домен/api/docs`. Для проверки в одной локальной
сети можно выставить `API_BIND_ADDRESS=0.0.0.0` в `infra/.env`, перезапустить
Compose и открыть `http://IP-компьютера:3000/api/docs`. Для публичного адреса
используйте только HTTPS.

В Swagger выполните `POST /auth/login` с `{"externalId":"4471","password":"demo"}`.
Нажмите Authorize и вставьте `accessToken`. Затем вызовите `GET /scenarios`,
скопируйте `versionId` первого сценария и отправьте `POST /attempts`:

```json
{
  "attemptId": "5c590082-8e61-44b4-8c2c-6e6d5d7f9451",
  "scenarioVersionId": "ВСТАВЬТЕ-versionId-ИЗ-ОТВЕТА",
  "startedAt": "2026-09-25T12:00:00.000Z",
  "events": [
    { "seq": 0, "nodeId": "first_choice", "optionId": "call_help", "reactionMs": 1800 }
  ]
}
```

Для каждой новой проверки меняйте `attemptId` на новый UUID и время начала на
текущее. Ответ 202 подтверждает сохранение. `GET /attempts/:id` должен вернуть
тот же ID и `submitted`. `GET /users/:id/stats`, `/achievements` и `/leaderboard`
покажут демо-данные seed. Переход `submitted` -> `scored` и отправка webhook
после обычного POST зависят от подключения `replay()` общего движка; пока его
нет, проверить на телефоне эту часть нельзя. Локальный тест отправки webhook
можно выполнить после сборки API и seed:

```bash
cd apps/api
DATABASE_URL='postgresql://...' node --import tsx scripts/smoke-webhook.ts
```

Скрипт создаёт локальный webhook-приёмник, один раз отвечает 500, затем 204 и
проверяет подпись, повторную доставку и результат через API. Он использует
тестовый канонический результат демо-сценария; в обычном API этот результат
должен приходить из `replay()`.
