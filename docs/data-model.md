# Схема данных

PostgreSQL 16, Prisma. DDL ниже описывает модель; источником для MVP служат
`apps/api/prisma/schema.prisma` и миграции Prisma.

Схема нейтральна к трактовке кейса: одни и те же таблицы обслуживают и тренажёр
для сотрудников, и пассажирскую игру с программой лояльности. Различает их поле
`scenario_versions.audience` и содержимое `points_ledger.track`.

---

## Участники

```sql
CREATE TYPE user_kind AS ENUM ('staff', 'passenger');
CREATE TYPE user_role AS ENUM ('player', 'methodologist', 'supervisor', 'admin');

CREATE TABLE org_units (            -- депо, бригада, маршрут; для пассажиров не заполняется
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  region      text,
  parent_id   uuid REFERENCES org_units(id)
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          user_kind NOT NULL DEFAULT 'staff',
  role          user_role NOT NULL DEFAULT 'player',
  external_id   text UNIQUE,        -- табельный номер или id в системе лояльности
  display_name  text NOT NULL,
  org_unit_id   uuid REFERENCES org_units(id),
  password_hash text,               -- argon2; NULL если вход через внешний SSO
  profile       jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz
);

CREATE INDEX users_org_unit_idx ON users (org_unit_id) WHERE org_unit_id IS NOT NULL;
```

`external_id` вместо ФИО как ключа - сознательно. Табельный номер не является персональными
данными в том же смысле, что паспортные, и позволяет обезличить демо: на питче показываем
«Проводник №4471», а не реального человека. Учитывая 152-ФЗ и п. 9.2 Положения (запрет
на персональные данные третьих лиц без основания) - это не перестраховка.

## Сценарии и версии

```sql
CREATE TYPE scenario_audience AS ENUM ('staff', 'passenger');
CREATE TYPE version_status AS ENUM ('draft', 'published', 'archived');

CREATE TABLE scenarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  title       text NOT NULL,
  audience    scenario_audience NOT NULL,
  category    text,
  tags        text[] NOT NULL DEFAULT '{}',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE scenario_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id  uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  version      integer NOT NULL,
  status       version_status NOT NULL DEFAULT 'draft',
  graph        jsonb NOT NULL,      -- ScenarioGraph целиком
  lint_report  jsonb,               -- результат линтера на момент публикации
  author_id    uuid REFERENCES users(id),
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, version)
);

-- Опубликованная версия у сценария только одна
CREATE UNIQUE INDEX scenario_single_published_idx
  ON scenario_versions (scenario_id)
  WHERE status = 'published';
```

Попытка всегда ссылается на **версию**, не на сценарий. Методолог правит контент -
история прохождений остаётся воспроизводимой, и результат двухнедельной давности
можно пересчитать тем же графом, по которому он был получен.

`lint_report` хранится вместе с версией: видно, с какими предупреждениями её опубликовали.

## Прохождения

```sql
CREATE TYPE attempt_status AS ENUM ('in_progress', 'submitted', 'scored', 'invalid');

CREATE TABLE attempts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_version_id uuid NOT NULL REFERENCES scenario_versions(id),
  status              attempt_status NOT NULL DEFAULT 'in_progress',
  outcome             text,          -- success | partial | failure
  score               integer,
  passed              boolean,
  metrics             jsonb,         -- итоговые значения шкал
  tracks              jsonb,         -- начисления по трекам
  timeouts            integer NOT NULL DEFAULT 0,
  avg_reaction_ms     integer,
  client_score        integer,       -- что показал клиент; расхождение = сигнал
  started_at          timestamptz NOT NULL,
  submitted_at        timestamptz,
  scored_at           timestamptz
);

CREATE INDEX attempts_user_idx    ON attempts (user_id, scored_at DESC);
CREATE INDEX attempts_version_idx ON attempts (scenario_version_id);

CREATE TABLE attempt_events (
  id          bigserial PRIMARY KEY,
  attempt_id  uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  seq         integer NOT NULL,
  node_id     text NOT NULL,
  option_id   text,                  -- NULL = истёк таймер
  reaction_ms integer NOT NULL,
  UNIQUE (attempt_id, seq)
);

CREATE INDEX attempt_events_node_idx ON attempt_events (node_id);
```

`client_score` рядом с `score` - дешёвая антифрод-проверка: если клиентский и серверный
расчёт расходятся, попытка помечается `invalid` и не идёт в лидерборд. На демо это
отдельный слайд - «почему нашему рейтингу можно верить».

`attempt_events` с индексом по `node_id` - источник аналитики: на каком узле люди чаще
всего ошибаются. Это тот самый экран руководителя, который превращает игру в инструмент.

## Начисления

```sql
CREATE TABLE points_ledger (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track         text NOT NULL,        -- 'emergency' | 'communication' | 'loyalty_points'
  amount        integer NOT NULL,     -- может быть отрицательным
  reason        text NOT NULL,        -- 'attempt' | 'achievement' | 'manual' | 'external'
  attempt_id    uuid REFERENCES attempts(id) ON DELETE SET NULL,
  external_ref  text,                 -- id транзакции во внешней системе лояльности
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX points_ledger_user_idx  ON points_ledger (user_id, created_at DESC);
CREATE INDEX points_ledger_track_idx ON points_ledger (track, created_at DESC);
```

Все начисления - записи в журнале, а не поле «баланс». Причины:

- любой балл объясним - видно, за что начислен и когда;
- ошибочное начисление откатывается сторнирующей записью, а не правкой числа;
- **сюда же ложится интеграция с программой лояльности**: трек с `externalLedger`
  в сценарии порождает запись с `reason = 'external'` и `external_ref`, а адаптер
  синхронизирует её с внешней системой.

Последний пункт - то, что закрывает формулировку из Приложения № 3 без переделки схемы.

## Достижения

```sql
CREATE TABLE achievements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL,
  title       text NOT NULL,
  description text NOT NULL,
  icon        text NOT NULL,
  tier        smallint NOT NULL DEFAULT 1,   -- бронза/серебро/золото
  rule        jsonb NOT NULL,                -- декларативное условие
  is_secret   boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE user_achievements (
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at    timestamptz NOT NULL DEFAULT now(),
  attempt_id     uuid REFERENCES attempts(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, achievement_id)
);
```

Правила ачивок - тоже данные, интерпретируются воркером:

```json
{ "all": [
  { "metric": "safety", "cmp": "gte", "value": 90 },
  { "attempts": { "cmp": "gte", "value": 5 }, "window": "30d" },
  { "timeouts": { "cmp": "eq", "value": 0 } }
]}
```

Новая ачивка добавляется методологом через админку, без релиза. На питче это
демонстрируется вживую - сильнее любого слайда про расширяемость.

## Статистика и лидерборд

```sql
CREATE TABLE user_stats (
  user_id        uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_score    integer NOT NULL DEFAULT 0,
  attempts_count integer NOT NULL DEFAULT 0,
  passed_count   integer NOT NULL DEFAULT 0,
  avg_safety     numeric(5,2),
  avg_loyalty    numeric(5,2),
  streak_days    integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE MATERIALIZED VIEW leaderboard_global AS
SELECT
  u.id AS user_id,
  u.display_name,
  u.org_unit_id,
  s.total_score,
  s.attempts_count,
  RANK() OVER (ORDER BY s.total_score DESC, s.attempts_count ASC) AS rank
FROM user_stats s
JOIN users u ON u.id = s.user_id
WHERE u.role = 'player';

CREATE UNIQUE INDEX leaderboard_global_user_idx ON leaderboard_global (user_id);
CREATE INDEX        leaderboard_global_rank_idx ON leaderboard_global (rank);
```

Материализованная вьюха и Redis - целевой вариант для большой нагрузки. В MVP рейтинг
читается из `user_stats` в PostgreSQL после обновления статистики при скоринге.

Рейтинг по депо - та же вьюха с `PARTITION BY org_unit_id`. Локальный лидерборд
мотивирует сильнее глобального: соревноваться со своей бригадой понятнее, чем
с тысячей незнакомых людей.

---

## Поток начисления

```
mobile  ──POST /attempts──▶ api ──▶ attempts (submitted) + attempt_events
                            │
                            └── replay(graph, events) после подключения движка
                                └── одна транзакция:
                                    attempts → scored
                                    points_ledger, user_achievements, user_stats
                                    webhook_events → pending
                                        └── POST attempt.scored → LMS
```

`webhook_events` - Postgres outbox: `attempt_id` уникален, `payload` содержит
событие и xAPI, `status` хранит `pending/sending/delivered/failed`, `attempts`
и `next_attempt_at` управляют повторной доставкой. При перезапуске API событие
остаётся в БД. Клиент узнаёт подтверждённый результат через `GET /attempts/:id`.
Пока `replay()` не подключён, новые попытки остаются `submitted`.

## Демо-данные

Скрипт `seed` заполняет: 3 депо, 30 сотрудников с историей попыток за месяц,
1 опубликованный демо-сценарий, 12 достижений и заполненный лидерборд. Ещё два
сценария будут добавлены после подготовки контента.

Все имена в сиде вымышленные, формат «Проводник №4471». Реальных персональных данных
в демо нет - п. 9.2 Положения.
