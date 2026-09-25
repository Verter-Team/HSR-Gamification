# Модель сценария

Формат данных, который интерпретирует `packages/scenario-engine`. Это единственное
описание того, что такое «сценарий» в системе - его читают клиент (проигрывание),
воркер (пересчёт очков) и админка (редактирование).

## Принцип нейтральности

Кейс сформулирован в документах хакатона двояко - тренажёр для проводников либо
пассажирская игра с программой лояльности (см. CLAUDE.md). Модель спроектирована так,
чтобы обе трактовки были **контентом, а не разными системами**:

| Что могло бы быть захардкожено | Как сделано вместо этого |
| --- | --- |
| Шкалы `loyalty` и `safety` | `metrics[]` объявляются в самом сценарии |
| «Проводник» как роль игрока | `audience: 'staff' \| 'passenger'`, `role` - строка |
| «Очки компетенций» | `tracks[]` - произвольные категории начислений |
| Формула итогового счёта | `scoring` - часть данных сценария |

Смена трактовки задачи меняет JSON-файлы в `content/` и тексты в UI. Движок, схема БД,
API и логика начислений не меняются.

---

## Типы

```ts
// ───────────────────────── Сценарий ─────────────────────────

export interface ScenarioGraph {
  schemaVersion: 1;
  id: string;
  slug: string;                    // 'medical-incident-onboard'
  title: string;
  summary: string;

  audience: 'staff' | 'passenger';
  role?: string;                   // 'проводник', 'начальник поезда', 'пассажир'
  difficulty: 1 | 2 | 3 | 4 | 5;
  estimatedMinutes: number;
  tags: string[];                  // 'медицина', 'конфликт', 'безопасность'

  metrics: MetricDef[];
  tracks: TrackDef[];
  scoring: ScoringSpec;

  entry: NodeId;
  nodes: Record<NodeId, ScenarioNode>;
}

// Шкала. Для тренажёра - «лояльность пассажира» и «рейтинг безопасности».
// Для пассажирской игры - «удовлетворённость», «вовлечённость».
export interface MetricDef {
  id: string;
  title: string;
  description?: string;
  min: number;
  max: number;
  initial: number;
  direction: 'higher-better' | 'lower-better';
  display: 'bar' | 'hearts' | 'shield' | 'hidden';
  critical?: {                     // выход за порог обрывает сценарий
    below?: number;
    above?: number;
    goto: NodeId;                  // узел-провал
  };
}

// Категория начислений: компетенция сотрудника или тип бонусных баллов.
export interface TrackDef {
  id: string;                      // 'emergency' | 'communication' | 'loyalty_points'
  title: string;
  icon?: string;
  externalLedger?: string;         // ключ интеграции с системой лояльности
}

export interface ScoringSpec {
  base: number;
  metricWeights: Record<string, number>;   // metricId → вес в итоговом счёте
  timeBonus?: {
    maxPointsPerDecision: number;
    fullBonusWithinMs: number;             // быстрее - полный бонус
    zeroBonusAfterMs: number;              // медленнее - ноль, линейно между
  };
  timeoutPenalty: number;                  // штраф за каждое истечение таймера
  passThreshold: number;                   // ниже - сценарий не зачтён
}

// ───────────────────────── Узлы ─────────────────────────

export type NodeId = string;

export type ScenarioNode =
  | SceneNode
  | ChoiceNode
  | BranchNode
  | EffectNode
  | EndingNode;

interface NodeBase {
  id: NodeId;
  note?: string;                   // комментарий методолога, в UI не показывается
}

// Реплика или описание обстановки, без выбора.
export interface SceneNode extends NodeBase {
  kind: 'scene';
  speaker?: string;                // 'Пассажир 14А', 'Диспетчер', null - от автора
  text: string;
  media?: MediaRef;
  next: NodeId;
}

// Точка принятия решения - ядро механики.
export interface ChoiceNode extends NodeBase {
  kind: 'choice';
  prompt: string;
  speaker?: string;
  media?: MediaRef;
  timer?: TimerSpec;
  shuffleOptions?: boolean;        // против запоминания порядка при повторе
  options: Option[];
}

export interface Option {
  id: string;
  text: string;
  visibleIf?: Condition;           // вариант доступен не всегда
  effects?: Effect[];
  feedback?: FeedbackSpec;         // разбор: показать сразу или в финале
  next: NodeId;
}

export interface FeedbackSpec {
  verdict: 'correct' | 'acceptable' | 'wrong';
  text: string;
  reference?: string;              // пункт регламента, на который опирается оценка
  showImmediately: boolean;
}

export interface TimerSpec {
  seconds: number;
  onTimeout: {
    effects?: Effect[];
    feedback?: FeedbackSpec;
    next: NodeId;
  };
}

// Развилка без участия игрока - по накопленному состоянию.
export interface BranchNode extends NodeBase {
  kind: 'branch';
  cases: { when: Condition; next: NodeId }[];
  fallback: NodeId;
}

// Чистое изменение состояния (последствие, всплывшее позже).
export interface EffectNode extends NodeBase {
  kind: 'effect';
  effects: Effect[];
  next: NodeId;
}

export interface EndingNode extends NodeBase {
  kind: 'ending';
  outcome: 'success' | 'partial' | 'failure';
  title: string;
  text: string;
}

export interface MediaRef {
  kind: 'image' | 'audio' | 'video';
  assetId: string;                 // ключ в MinIO
  alt?: string;
}

// ───────────────────────── Условия и эффекты ─────────────────────────

export type Cmp = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'ne';

export type Condition =
  | { op: 'metric';  metric: string; cmp: Cmp; value: number }
  | { op: 'track';   track: string;  cmp: Cmp; value: number }
  | { op: 'flag';    flag: string;   is: boolean }
  | { op: 'visited'; node: NodeId }
  | { op: 'chose';   node: NodeId;   option: string }
  | { op: 'all'; of: Condition[] }
  | { op: 'any'; of: Condition[] }
  | { op: 'not'; of: Condition };

export type Effect =
  | { op: 'metric';     metric: string; delta: number }
  | { op: 'metric.set'; metric: string; value: number }
  | { op: 'track';      track: string;  amount: number; reason?: string }
  | { op: 'flag';       flag: string;   value: boolean };

// ───────────────────────── Состояние сессии ─────────────────────────

export interface SessionState {
  scenarioVersionId: string;
  currentNodeId: NodeId;
  metrics: Record<string, number>;
  tracks: Record<string, number>;
  flags: Record<string, boolean>;
  visited: NodeId[];
  events: DecisionEvent[];
  status: 'in_progress' | 'finished';
  startedAt: string;               // ISO
}

export interface DecisionEvent {
  seq: number;
  nodeId: NodeId;
  optionId: string | null;         // null - таймер истёк
  reactionMs: number;
}

export interface SessionSummary {
  outcome: 'success' | 'partial' | 'failure';
  score: number;
  passed: boolean;
  metrics: Record<string, number>;
  tracks: Record<string, number>;
  timeouts: number;
  avgReactionMs: number;
  mistakes: { nodeId: NodeId; optionId: string; feedback: FeedbackSpec }[];
}
```

## API движка

```ts
createSession(graph: ScenarioGraph, opts?: { seed?: number }): SessionState
currentNode(graph: ScenarioGraph, state: SessionState): ScenarioNode
availableOptions(graph: ScenarioGraph, state: SessionState): Option[]
applyChoice(graph, state, optionId: string, reactionMs: number): SessionState
applyTimeout(graph, state): SessionState
advance(graph, state): SessionState          // для scene / effect / branch
isFinished(state): boolean
summarize(graph, state): SessionSummary
replay(graph, events: DecisionEvent[]): SessionState   // ← серверный пересчёт
```

Все функции чистые: принимают состояние, возвращают новое. Ни сети, ни React, ни БД.

`replay` - то, чем воркер пересчитывает результат по логу решений. Это и есть причина,
по которой очки нельзя накрутить с клиента: сервер восстанавливает прохождение сам.

## Линтер графа

Запускается в админке при публикации версии и в CI. Публикация со статусом `error` блокируется.

| Проверка | Уровень |
| --- | --- |
| Ссылка на несуществующий `NodeId` | error |
| Узел недостижим из `entry` | error |
| `choice` без вариантов; `choice` с таймером без `onTimeout` | error |
| Нет ни одного достижимого `ending` | error |
| Ссылка на несуществующую метрику или трек в `Effect` / `Condition` | error |
| Цикл без изменения состояния - бесконечный проход | error |
| Все варианты выбора меняют метрики одинаково - выбор бессмысленный | warning |
| Ни один вариант не ухудшает ни одну метрику - нет цены решения | warning |
| Метрику невозможно довести до `critical` ни по одной ветке | warning |
| `choice` без `feedback` - нечего показать в разборе | warning |
| Оценка прохождения выходит за `estimatedMinutes` более чем вдвое | warning |

Две warning-проверки про «бессмысленный выбор» и «нет цены решения» важнее, чем кажется:
они ловят главную болезнь обучающих игр - когда правильный ответ очевиден и игра
превращается в тест.

## Баланс: метрики должны конфликтовать

Если решение, приятное пассажиру, всегда безопасно - две шкалы не нужны, достаточно одной.
Ценность механики именно в конфликте.

Правило для авторов контента: **в каждом сценарии минимум два узла, где варианты
разнонаправленно двигают метрики.** Проверяется линтером, выносится в дашборд методолога.

Пример такого узла: пассажир требует пересадить его в другой вагон из-за шумного соседа.
Пересадить - `loyalty +15`, но место в зоне аварийного выхода, `safety −10`. Отказать -
`loyalty −20`, `safety 0`. Предложить компромисс - `loyalty +5`, `safety 0`, но тратится
время, и следующий узел игрок встречает с меньшим таймером.

---

## Пример: сценарий для сотрудника

```json
{
  "schemaVersion": 1,
  "slug": "medical-incident-onboard",
  "title": "Медицинский инцидент в пути",
  "summary": "Пассажиру стало плохо на перегоне. До ближайшей станции 40 минут.",
  "audience": "staff",
  "role": "проводник",
  "difficulty": 4,
  "estimatedMinutes": 6,
  "tags": ["медицина", "нештатная ситуация"],

  "metrics": [
    {
      "id": "safety",
      "title": "Рейтинг безопасности",
      "min": 0, "max": 100, "initial": 70,
      "direction": "higher-better",
      "display": "shield",
      "critical": { "below": 20, "goto": "end_critical_failure" }
    },
    {
      "id": "loyalty",
      "title": "Лояльность пассажира",
      "min": 0, "max": 100, "initial": 60,
      "direction": "higher-better",
      "display": "hearts"
    }
  ],

  "tracks": [
    { "id": "emergency",     "title": "Действия в нештатных ситуациях" },
    { "id": "communication", "title": "Коммуникация с пассажирами" }
  ],

  "scoring": {
    "base": 100,
    "metricWeights": { "safety": 2.0, "loyalty": 1.0 },
    "timeBonus": {
      "maxPointsPerDecision": 10,
      "fullBonusWithinMs": 3000,
      "zeroBonusAfterMs": 12000
    },
    "timeoutPenalty": 25,
    "passThreshold": 180
  },

  "entry": "intro",

  "nodes": {
    "intro": {
      "id": "intro",
      "kind": "scene",
      "text": "Состав идёт на скорости 380 км/ч. Вы обходите вагон. Мужчина в кресле 14А побледнел, тяжело дышит и держится за грудь. Соседка машет вам рукой.",
      "media": { "kind": "image", "assetId": "coach-interior-14a", "alt": "Салон вагона" },
      "next": "first_reaction"
    },

    "first_reaction": {
      "id": "first_reaction",
      "kind": "choice",
      "prompt": "Ваше первое действие?",
      "timer": {
        "seconds": 10,
        "onTimeout": {
          "effects": [{ "op": "metric", "metric": "safety", "delta": -25 }],
          "feedback": {
            "verdict": "wrong",
            "text": "Промедление при подозрении на кардиологический эпизод критично: каждая минута снижает шансы на благополучный исход.",
            "showImmediately": true
          },
          "next": "deterioration"
        }
      },
      "options": [
        {
          "id": "call_medic",
          "text": "Сообщить начальнику поезда и запросить медицинскую помощь",
          "effects": [
            { "op": "metric", "metric": "safety",  "delta": 20 },
            { "op": "metric", "metric": "loyalty", "delta": 5 },
            { "op": "track",  "track": "emergency", "amount": 15 },
            { "op": "flag",   "flag": "medic_called", "value": true }
          ],
          "feedback": {
            "verdict": "correct",
            "text": "Верно. При симптомах кардиологического характера первично привлечение медицинской помощи, а не самостоятельные действия.",
            "reference": "Регламент действий при медицинском инциденте, п. 3.1",
            "showImmediately": false
          },
          "next": "while_waiting"
        },
        {
          "id": "give_water",
          "text": "Принести воды и попытаться успокоить пассажира",
          "effects": [
            { "op": "metric", "metric": "safety",  "delta": -20 },
            { "op": "metric", "metric": "loyalty", "delta": 10 },
            { "op": "track",  "track": "communication", "amount": 5 }
          ],
          "feedback": {
            "verdict": "wrong",
            "text": "Пассажир доволен вниманием, но симптомы указывали на состояние, требующее медицинской помощи. Вода не решает проблему и отнимает время.",
            "showImmediately": false
          },
          "next": "deterioration"
        },
        {
          "id": "ask_passengers",
          "text": "Обратиться к вагону: есть ли среди пассажиров медработник",
          "effects": [
            { "op": "metric", "metric": "safety",  "delta": 5 },
            { "op": "metric", "metric": "loyalty", "delta": -5 },
            { "op": "track",  "track": "emergency", "amount": 5 }
          ],
          "feedback": {
            "verdict": "acceptable",
            "text": "Допустимо как дополнительная мера, но не заменяет вызов штатной медицинской помощи и привлекает внимание к состоянию пассажира.",
            "showImmediately": false
          },
          "next": "while_waiting"
        }
      ]
    },

    "while_waiting": {
      "id": "while_waiting",
      "kind": "branch",
      "cases": [
        { "when": { "op": "flag", "flag": "medic_called", "is": true }, "next": "medic_arrives" }
      ],
      "fallback": "deterioration"
    },

    "medic_arrives":   { "id": "medic_arrives",   "kind": "scene", "text": "Через три минуты подходит начальник поезда с аптечкой. Состояние пассажира стабильно.", "next": "end_success" },
    "deterioration":   { "id": "deterioration",   "kind": "scene", "text": "Пассажиру становится хуже. Соседи начинают волноваться.", "next": "end_partial" },

    "end_success":          { "id": "end_success",          "kind": "ending", "outcome": "success", "title": "Ситуация под контролем", "text": "Вы действовали по регламенту. Пассажиру оказана помощь, остальные не были встревожены." },
    "end_partial":          { "id": "end_partial",          "kind": "ending", "outcome": "partial", "title": "Инцидент разрешён с потерями", "text": "Помощь оказана, но с задержкой. Часть пассажиров вагона была встревожена." },
    "end_critical_failure": { "id": "end_critical_failure", "kind": "ending", "outcome": "failure", "title": "Критическое нарушение", "text": "Действия не соответствовали регламенту, безопасность пассажира была поставлена под угрозу." }
  }
}
```

## Тот же формат для пассажирской трактовки

Если верна формулировка Приложения № 3, меняется только содержимое - структура та же:

```json
{
  "schemaVersion": 1,
  "slug": "first-trip-onboarding",
  "title": "Первая поездка на ВСМ",
  "audience": "passenger",
  "difficulty": 1,
  "metrics": [
    { "id": "comfort",   "title": "Комфорт поездки", "min": 0, "max": 100, "initial": 50, "direction": "higher-better", "display": "bar" },
    { "id": "awareness", "title": "Знание сервисов",  "min": 0, "max": 100, "initial": 0,  "direction": "higher-better", "display": "bar" }
  ],
  "tracks": [
    { "id": "loyalty_points", "title": "Бонусные баллы", "externalLedger": "vsm-loyalty" }
  ],
  "scoring": {
    "base": 0,
    "metricWeights": { "comfort": 1.0, "awareness": 1.5 },
    "timeoutPenalty": 0,
    "passThreshold": 50
  },
  "entry": "boarding"
}
```

`externalLedger` - точка интеграции с программой лояльности перевозчика: начисления
по этому треку уходят во внешнюю систему через адаптер, а не только в нашу БД.
Подробнее - `data-model.md`, таблица `points_ledger`.
