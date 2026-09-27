// Демо-данные для стенда: 30 проводников с историей, 4 племени, граф сценариев, взаимные проверки.
// История не рисуется руками: каждое прохождение проигрывается движком, очки считаются
// той же функцией, что и в API. Поэтому аналитика и рейтинг на демо правдоподобны.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as argon2 from 'argon2';
import { AttemptStatus, Prisma, PrismaClient, ReviewStatus, UserRole, VersionStatus } from '@prisma/client';
import {
  advance, applyChoice, applyTimeout, availableOptions, currentNode, createSession, ECONOMY,
  isFinished, lintGraph, parseGraph, ScenarioGraph, SessionState, summarize,
} from '@vsm/scenario-engine';
import { TRACK_COINS, TRACK_REVIEW_POINTS, TRACK_XP } from '../src/gamification/constants';
import { refreshUserProgress } from '../src/scoring/progress';
import { recordScoredAttemptTx } from '../src/scoring/progress.service';

const prisma = new PrismaClient();
const CONTENT_DIR = process.env.CONTENT_DIR ?? resolve(__dirname, '../../../content');
const NOW = Date.now();
const DAY = 86_400_000;
const HOUR = 3_600_000;

function demoUuid(value: string): string {
  const bytes = createHash('sha1').update(`hsr-gamification-demo:${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Детерминированный генератор, чтобы seed всегда давал одну и ту же картину
function rng(seed: string): () => number {
  let state = createHash('sha1').update(seed).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const TRIBES = [
  { slug: 'neva', name: 'Нева', color: '#4EA8FF', motto: 'Спокойствие на любой скорости' },
  { slug: 'volga', name: 'Волга', color: '#2FD4A7', motto: 'Сильное течение, мягкий сервис' },
  { slug: 'valdai', name: 'Валдай', color: '#FFB547', motto: 'Высота - это привычка' },
  { slug: 'ilmen', name: 'Ильмень', color: '#FF6B81', motto: 'Глубоко знаем своё дело' },
];

const DEPOTS = ['Депо Москва', 'Депо Тверь', 'Депо Санкт-Петербург'];

// Вымышленные имена: имя и первая буква фамилии
const NAMES = [
  'Мария Л.', 'Дмитрий К.', 'Анна В.', 'Игорь П.', 'Екатерина Н.', 'Сергей М.', 'Ольга Р.', 'Павел Т.',
  'Наталья Б.', 'Андрей Ж.', 'Юлия Ф.', 'Михаил Г.', 'Светлана Д.', 'Артём Е.', 'Ирина З.', 'Роман И.',
  'Татьяна О.', 'Кирилл У.', 'Елена Ч.', 'Максим Ш.', 'Виктория Щ.', 'Никита Э.', 'Дарья Ю.', 'Владимир Я.',
  'Ксения А.', 'Григорий Л.', 'Полина С.', 'Денис Х.', 'Алина Ц.',
];

const ACHIEVEMENTS = [
  { code: 'first-step', title: 'Первый шаг', description: 'Пройти первый сценарий', icon: 'footprints', tier: 1, rule: { attempts: { cmp: 'gte', value: 1 } } },
  { code: 'intensive', title: 'Интенсив пройден', description: 'Зачесть «Первую смену»', icon: 'graduation-cap', tier: 1, rule: { passedScenario: 'first-shift' } },
  { code: 'first-success', title: 'Зачёт', description: 'Успешно пройти сценарий', icon: 'check', tier: 1, rule: { passed: { cmp: 'gte', value: 1 } } },
  { code: 'no-timeout', title: 'Без промедления', description: 'Завершить сценарий без тайм-аута', icon: 'clock', tier: 1, rule: { timeouts: { cmp: 'eq', value: 0 } } },
  { code: 'safe-choice', title: 'Приоритет безопасности', description: 'Закончить сценарий с безопасностью 70+', icon: 'shield', tier: 1, rule: { metric: 'safety', cmp: 'gte', value: 70 } },
  { code: 'first-review', title: 'Первая проверка', description: 'Проверить ответ коллеги', icon: 'message-square', tier: 1, rule: { reviewsGiven: { cmp: 'gte', value: 1 } } },
  { code: 'three-trainings', title: 'Вошёл в ритм', description: 'Пройти 3 сценария', icon: 'repeat', tier: 1, rule: { attempts: { cmp: 'gte', value: 3 } } },
  { code: 'level-3', title: 'Третий уровень', description: 'Набрать 900 XP', icon: 'trending-up', tier: 1, rule: { level: { cmp: 'gte', value: 3 } } },
  { code: 'safe-and-calm', title: 'Уверенное решение', description: 'Безопасность 70+ и ни одного тайм-аута', icon: 'shield-check', tier: 2, rule: { all: [{ metric: 'safety', cmp: 'gte', value: 70 }, { timeouts: { cmp: 'eq', value: 0 } }] } },
  { code: 'high-score', title: 'Точный расчёт', description: 'Набрать 280 очков за сценарий', icon: 'target', tier: 2, rule: { score: { cmp: 'gte', value: 280 } } },
  { code: 'three-successes', title: 'Надёжный проводник', description: 'Успешно пройти 3 сценария', icon: 'badge-check', tier: 2, rule: { passed: { cmp: 'gte', value: 3 } } },
  { code: 'peer-mentor', title: 'Наставник', description: 'Проверить 5 ответов коллег', icon: 'users', tier: 2, rule: { reviewsGiven: { cmp: 'gte', value: 5 } } },
  { code: 'monthly-rhythm', title: 'Месяц практики', description: 'Пройти 5 сценариев за 30 дней', icon: 'calendar', tier: 2, rule: { attempts: { cmp: 'gte', value: 5 }, window: '30d' } },
  { code: 'lifesaver', title: 'Спасатель', description: 'Медицинский сценарий с безопасностью 90+', icon: 'heart-pulse', tier: 3, rule: { all: [{ scenario: 'medical-incident' }, { metric: 'safety', cmp: 'gte', value: 90 }] } },
  { code: 'cool-head', title: 'Холодная голова', description: 'Задымление без единого тайм-аута и с зачётом', icon: 'flame', tier: 3, rule: { all: [{ scenario: 'emergency-stop' }, { timeouts: { cmp: 'eq', value: 0 } }, { score: { cmp: 'gte', value: 150 } }] } },
  { code: 'wide-profile', title: 'Широкий профиль', description: 'Зачесть сценарии во всех ветках графа', icon: 'network', tier: 3, rule: { distinctPassed: { cmp: 'gte', value: 4 } } },
  { code: 'senior', title: 'Старший проводник', description: 'Достичь 5 уровня', icon: 'crown', tier: 3, rule: { level: { cmp: 'gte', value: 5 } } },
  { code: 'five-successes', title: 'Мастер смены', description: 'Успешно пройти 5 сценариев', icon: 'award', tier: 3, rule: { passed: { cmp: 'gte', value: 5 } } },
];

const SHOP = [
  { code: 'sticker', title: 'Наклейки ВСМ', description: 'Набор наклеек с символикой магистрали', icon: 'sticker', price: 30 },
  { code: 'pin', title: 'Значок «Наставник смены»', description: 'Металлический значок на форму', icon: 'badge', price: 50 },
  { code: 'mug', title: 'Термокружка ВСМ', description: 'Для длинных смен Москва - Петербург', icon: 'coffee', price: 60 },
  { code: 'mentor-session', title: 'Разбор с наставником', description: '30 минут один на один с опытным проводником', icon: 'user-check', price: 80 },
  { code: 'shift-priority', title: 'Приоритет при выборе смены', description: 'Выбираете смены раньше остальных в следующем месяце', icon: 'calendar-check', price: 150 },
  { code: 'day-off', title: 'Дополнительный выходной', description: 'По согласованию с руководителем депо', icon: 'palmtree', price: 400 },
];

// Примеры ответов для взаимной проверки: по два варианта сильного, среднего и слабого
const ANSWERS: Record<string, string[][]> = {
  'first-shift': [
    [
      'Понимаю, у окна ехать приятнее. Ваше место закреплено за билетом, и на следующей станции свободные места могут продать. Я уточню у начальника поезда, можно ли вас пересадить, и вернусь с ответом минут через пять.',
      'Хорошая идея, но пересесть самому не получится: места в соседнем вагоне могут занять в Твери. Давайте я спрошу у начальника поезда и через пару минут скажу, есть ли вариант у окна.',
    ],
    [
      'Извините, пересаживаться в другой вагон нельзя, так положено по правилам. Если хотите, могу принести плед или воду, чтобы было удобнее.',
      'К сожалению, нельзя, у вас место по билету. Но я попробую что-нибудь придумать, подождите.',
    ],
    [
      'Нет, нельзя. Места по билетам, садитесь на своё и не создавайте проблем.',
      'Не положено. Все хотят к окну, я не могу каждого пересаживать.',
    ],
  ],
  'passenger-conflict': [
    [
      'Меня зовут Анна, я проводник этого вагона. Обращение можно оставить на сайте перевозчика или через начальника поезда, я помогу его оформить. Данные других пассажиров я назвать не могу. Снимать вы вправе, давайте спокойно решим ситуацию.',
      'Проводник Сергей, пятый вагон. Вы можете написать обращение, я подскажу как: через начальника поезда или на сайте. Фамилии соседей назвать не могу. Видео удалять не нужно. Давайте сначала решим вопрос с шумом.',
    ],
    [
      'Проводник Иванова. Жалобу можно написать начальнику поезда, он в третьем вагоне. Уберите, пожалуйста, телефон, это мешает работать.',
      'Пишите, конечно, это ваше право. Начальник поезда в третьем вагоне. Но я правда старалась вам помочь.',
    ],
    [
      'Пишите что хотите, я действовала по инструкции. И удалите видео, снимать меня нельзя.',
      'Если будете снимать, я вызову полицию. Фамилию не скажу.',
    ],
  ],
  'medical-incident': [
    [
      'Мужчина около 55 лет. В 14:10 пожаловался на давящую боль в груди, побледнел. В 14:18 потерял сознание, нормального дыхания не было. Сразу начали СЛР 30:2, в 14:20 подключили АНД, был один разряд. Лекарств не давали. Сейчас дышит сам.',
      'Женщина, 14А, около 60 лет. Боль в груди и одышка с 11:40, в 11:52 потеряла сознание. СЛР начали сразу, АНД через две минуты, разряд не рекомендован. Лекарств не давали, аллергии не знаем.',
    ],
    [
      'Пассажиру стало плохо с сердцем минут двадцать назад, потом он отключился. Делали массаж сердца и подключили дефибриллятор. Вроде ничего не давали.',
      'Ему стало плохо, потом потерял сознание. Мы делали СЛР, дефибриллятор тоже был. Время точно не скажу.',
    ],
    [
      'Ему плохо, похоже инфаркт. Мы делали что могли, дальше вы.',
      'Сердечный приступ, наверное. Соседка давала ему свои таблетки, какие не знаю.',
    ],
  ],
  'emergency-stop': [
    [
      'Задымление в служебной зоне вагона 5, из-под панели шёл дым, потом небольшое пламя. Огнетушитель применил, пламя сбито. 18 пассажиров переведены в вагон 6, пересчитаны, пропавших и пострадавших нет. Дверь между 5 и 6 закрыта, служебная зона закрыта.',
      'Вагон 3, дым из-под щитка в служебке, открытого огня не видел. Людей увели в вагон 4, 22 человека, все на месте, пострадавших нет. Межвагонная дверь закрыта, зона перекрыта.',
    ],
    [
      'В пятом вагоне был дым из панели, людей перевели в шестой вагон. Вроде все на месте, пострадавших не видел.',
      'Дымило из панели, огнетушитель применили. Пассажиров вывели в соседний вагон, двери закрыли.',
    ],
    [
      'Там был пожар, я всех вывел. Разбирайтесь.',
      'Дым был, сейчас вроде нет. Пассажиры где-то в соседних вагонах.',
    ],
  ],
};

const COMMENTS = [
  ['Отличный ответ: спокойно, по делу, с понятным следующим шагом. Взял себе пару формулировок.', 'Всё по чек-листу. Хорошо, что назвали конкретный срок.'],
  ['Суть верная, но не хватает объяснения причины. Пассажиру важно понимать, почему нельзя.', 'Неплохо, но тон немного резкий. Можно мягче в начале.'],
  ['Слишком коротко и резко. Нет ни объяснения, ни альтернативы для пассажира.', 'Так пассажир скорее напишет жалобу. Попробуйте начать с того, что вы его услышали.'],
];

// Прохождение сценария условным проводником с уровнем подготовки skill (0..1)
function simulate(graph: ScenarioGraph, random: () => number, skill: number): SessionState {
  let state = createSession(graph);
  for (;;) {
    while (!isFinished(state) && currentNode(graph, state).kind === 'scene') state = advance(graph, state);
    if (isFinished(state)) return state;
    const node = currentNode(graph, state);
    if (node.kind !== 'choice') throw new Error(`Неожиданный узел ${node.id}`);
    if (node.timer && random() < (1 - skill) * 0.22) {
      state = applyTimeout(graph, state);
      continue;
    }
    const options = availableOptions(graph, state);
    const correct = options.filter((option) => option.feedback?.verdict === 'correct');
    const others = options.filter((option) => option.feedback?.verdict !== 'correct');
    const pick = random() < skill || others.length === 0
      ? (correct[0] ?? options[0])
      : others[Math.floor(random() * others.length)];
    const limit = node.timer ? node.timer.seconds * 1000 : 12_000;
    const reactionMs = Math.round(1200 + random() * limit * 0.75 * (1.25 - skill));
    state = applyChoice(graph, state, pick.id, Math.min(reactionMs, limit));
  }
}

function play(graph: ScenarioGraph, choices: (string | null)[], reactionMs = 2400): SessionState {
  let state = createSession(graph);
  for (const choice of choices) {
    while (!isFinished(state) && currentNode(graph, state).kind === 'scene') state = advance(graph, state);
    state = choice === null ? applyTimeout(graph, state) : applyChoice(graph, state, choice, reactionMs);
  }
  while (!isFinished(state) && currentNode(graph, state).kind === 'scene') state = advance(graph, state);
  if (!isFinished(state)) throw new Error('Демо-прохождение не доведено до финала');
  return state;
}

interface Planned {
  userIndex: number;
  slug: string;
  state: SessionState;
  at: number;
}

type Tx = Prisma.TransactionClient;

async function recordAttempt(tx: Tx, userId: string, versionId: string, graph: ScenarioGraph, plan: Planned, key: string) {
  const summary = summarize(graph, plan.state);
  const id = demoUuid(key);
  const startedAt = new Date(plan.at - graph.estimatedMinutes * 60_000);
  await tx.attempt.create({
    data: {
      id, userId, scenarioVersionId: versionId, status: AttemptStatus.SUBMITTED,
      startedAt, submittedAt: new Date(plan.at), clientScore: summary.score,
      events: { create: plan.state.events.map((event) => ({ seq: event.seq, nodeId: event.nodeId, optionId: event.optionId, reactionMs: event.reactionMs })) },
    },
  });
  await recordScoredAttemptTx(tx, id, {
    outcome: summary.outcome, score: summary.score, passed: summary.passed, metrics: summary.metrics,
    tracks: summary.tracks, timeouts: summary.timeouts, avgReactionMs: summary.avgReactionMs,
  }, new Date(plan.at));
  return { id, passed: summary.passed, at: plan.at };
}

async function main(): Promise<void> {
  const catalog = JSON.parse(readFileSync(join(CONTENT_DIR, 'catalog.json'), 'utf8')) as {
    scenarios: { slug: string; title: string; summary: string; branch: string; tier: number; difficulty: number; estimatedMinutes: number; xp: number; requires: string[]; skills: string[] }[];
    upcoming: { slug: string; title: string; summary: string; branch: string; tier: number; xp: number; requires: string[] }[];
  };

  // Справочники
  const tribes = [];
  for (const tribe of TRIBES) tribes.push(await prisma.tribe.upsert({ where: { slug: tribe.slug }, update: tribe, create: tribe }));
  const depots = [];
  for (const name of DEPOTS) depots.push(await prisma.orgUnit.upsert({ where: { name }, update: {}, create: { name } }));

  const demoHash = await argon2.hash('demo');
  const people = [{ externalId: '4471', displayName: 'Алексей С.' }, ...NAMES.map((displayName, index) => ({ externalId: String(4401 + index), displayName }))];
  const users = [];
  for (const [index, person] of people.entries()) {
    const data = {
      displayName: person.displayName,
      orgUnitId: depots[Math.floor(index / 10)].id,
      tribeId: tribes[index % tribes.length].id,
      role: UserRole.PLAYER,
      ...(index === 0 ? { passwordHash: demoHash } : {}),
    };
    users.push(await prisma.user.upsert({ where: { externalId: person.externalId }, update: data, create: { externalId: person.externalId, ...data } }));
  }
  const supervisor = await prisma.user.upsert({
    where: { externalId: '1001' },
    update: { displayName: 'Руководитель депо Москва', role: UserRole.SUPERVISOR, orgUnitId: depots[0].id, passwordHash: demoHash },
    create: { externalId: '1001', displayName: 'Руководитель депо Москва', role: UserRole.SUPERVISOR, orgUnitId: depots[0].id, passwordHash: demoHash },
  });

  for (const achievement of ACHIEVEMENTS) {
    await prisma.achievement.upsert({ where: { code: achievement.code }, update: { ...achievement, isActive: true }, create: achievement });
  }
  await prisma.achievement.updateMany({ where: { code: { notIn: ACHIEVEMENTS.map((item) => item.code) } }, data: { isActive: false } });
  for (const [sortOrder, item] of SHOP.entries()) {
    await prisma.shopItem.upsert({ where: { code: item.code }, update: { ...item, sortOrder, isActive: true }, create: { ...item, sortOrder } });
  }

  // Сценарии и версии. Изменился граф - новая версия, старая уходит в архив.
  await prisma.scenario.updateMany({ where: { slug: 'demo-medical-incident' }, data: { isActive: false } });
  const graphs = new Map<string, { graph: ScenarioGraph; versionId: string }>();
  for (const entry of catalog.scenarios) {
    const graph = parseGraph(JSON.parse(readFileSync(join(CONTENT_DIR, 'scenarios', `${entry.slug}.json`), 'utf8')));
    const lint = lintGraph(graph);
    if (!lint.ok) throw new Error(`Сценарий ${entry.slug} не прошёл проверку: ${lint.errors.map((issue) => issue.message).join('; ')}`);
    const meta = {
      title: entry.title, summary: entry.summary, branch: entry.branch, tier: entry.tier, xpReward: entry.xp,
      requires: entry.requires, skills: entry.skills, difficulty: entry.difficulty, estimatedMinutes: entry.estimatedMinutes, isActive: true,
    };
    const scenario = await prisma.scenario.upsert({ where: { slug: entry.slug }, update: meta, create: { slug: entry.slug, ...meta } });
    const latest = await prisma.scenarioVersion.findFirst({ where: { scenarioId: scenario.id }, orderBy: { version: 'desc' } });
    let versionId: string;
    const lintReport = { errors: lint.errors, warnings: lint.warnings } as unknown as Prisma.InputJsonValue;
    const graphJson = graph as unknown as Prisma.InputJsonValue;
    if (latest && stable(latest.graph) === stable(graph)) {
      versionId = latest.id;
      if (latest.status !== VersionStatus.PUBLISHED) {
        await prisma.scenarioVersion.update({ where: { id: latest.id }, data: { status: VersionStatus.PUBLISHED, publishedAt: new Date() } });
      }
    } else {
      await prisma.scenarioVersion.updateMany({ where: { scenarioId: scenario.id, status: VersionStatus.PUBLISHED }, data: { status: VersionStatus.ARCHIVED } });
      const created = await prisma.scenarioVersion.create({
        data: { scenarioId: scenario.id, version: (latest?.version ?? 0) + 1, status: VersionStatus.PUBLISHED, publishedAt: new Date(), graph: graphJson, lintReport },
      });
      versionId = created.id;
    }
    graphs.set(entry.slug, { graph, versionId });
  }
  for (const entry of catalog.upcoming) {
    const meta = { title: entry.title, summary: entry.summary, branch: entry.branch, tier: entry.tier, xpReward: entry.xp, requires: entry.requires, isActive: true };
    await prisma.scenario.upsert({ where: { slug: entry.slug }, update: meta, create: { slug: entry.slug, ...meta } });
  }

  // Чистим прошлую демо-историю, чтобы seed можно было запускать повторно
  const seededIds = [...users.map((user) => user.id), supervisor.id];
  await prisma.peerReview.deleteMany({ where: { OR: [{ authorId: { in: seededIds } }, { reviewerId: { in: seededIds } }] } });
  await prisma.purchase.deleteMany({ where: { userId: { in: seededIds } } });
  await prisma.pointsLedger.deleteMany({ where: { userId: { in: seededIds } } });
  await prisma.userAchievement.deleteMany({ where: { userId: { in: seededIds } } });
  await prisma.attempt.deleteMany({ where: { userId: { in: seededIds } } });
  await prisma.userStats.deleteMany({ where: { userId: { in: seededIds } } });

  // Стартовые баллы проверки у всех, как в Школе 21
  const joined = NOW - 50 * DAY;
  await prisma.pointsLedger.createMany({
    data: users.map((user) => ({ userId: user.id, track: TRACK_REVIEW_POINTS, amount: ECONOMY.startReviewPoints, reason: 'start', createdAt: new Date(joined) })),
  });

  const get = (slug: string) => {
    const found = graphs.get(slug);
    if (!found) throw new Error(`Нет сценария ${slug}`);
    return found;
  };

  // История прохождений
  const firstPasses: { userIndex: number; slug: string; attemptId: string; at: number; skill: number }[] = [];
  const attemptIds: string[] = [];
  for (const [userIndex, user] of users.entries()) {
    const random = rng(`user-${user.externalId}`);
    const skill = userIndex === 0 ? 0.8 : 0.42 + random() * 0.55;
    const plans: Planned[] = [];
    if (userIndex === 0) {
      // Демо-сотрудник: интенсив сдан давно и пора освежить, конфликт сдан, медицина провалена
      plans.push({ userIndex, slug: 'first-shift', state: play(get('first-shift').graph, ['a', 'a', 'b', 'a']), at: NOW - 34 * DAY });
      plans.push({ userIndex, slug: 'passenger-conflict', state: play(get('passenger-conflict').graph, ['a', 'a', 'a']), at: NOW - 12 * DAY });
      plans.push({ userIndex, slug: 'medical-incident', state: play(get('medical-incident').graph, [null, 'b'], 3000), at: NOW - 3 * DAY });
    } else {
      let at = NOW - (22 + random() * 24) * DAY;
      const passed = new Set<string>();
      const step = () => { at += (0.6 + random() * 4.5) * DAY; return at < NOW - 2 * HOUR; };
      const tryScenario = (slug: string, tries: number) => {
        for (let attempt = 0; attempt < tries && !passed.has(slug); attempt += 1) {
          if (!step()) return;
          const state = simulate(get(slug).graph, random, Math.min(0.97, skill + attempt * 0.12));
          plans.push({ userIndex, slug, state, at });
          if (summarize(get(slug).graph, state).passed) passed.add(slug);
        }
      };
      tryScenario('first-shift', 3);
      if (passed.has('first-shift')) {
        const order = random() < 0.5 ? ['passenger-conflict', 'medical-incident'] : ['medical-incident', 'passenger-conflict'];
        for (const slug of order) if (random() < 0.9) tryScenario(slug, 2);
        if (passed.has('medical-incident') && random() < 0.75) tryScenario('emergency-stop', 2);
        if (random() < 0.3 && step()) plans.push({ userIndex, slug: 'first-shift', state: simulate(get('first-shift').graph, random, Math.min(0.97, skill + 0.2)), at });
      }
    }
    await prisma.$transaction(async (tx) => {
      const seen = new Set<string>();
      for (const [index, plan] of plans.entries()) {
        const { graph, versionId } = get(plan.slug);
        const saved = await recordAttempt(tx, user.id, versionId, graph, plan, `${user.externalId}-${index}`);
        attemptIds.push(saved.id);
        if (saved.passed && !seen.has(plan.slug)) {
          seen.add(plan.slug);
          firstPasses.push({ userIndex, slug: plan.slug, attemptId: saved.id, at: saved.at, skill });
        }
      }
    }, { timeout: 120_000 });
  }

  // Взаимные проверки в хронологическом порядке, чтобы баллы проверки не уходили в минус
  const reviewRandom = rng('reviews');
  const points = new Map<number, number>(users.map((_, index) => [index, ECONOMY.startReviewPoints]));
  const passedAt = (userIndex: number, slug: string) => firstPasses.find((item) => item.userIndex === userIndex && item.slug === slug)?.at;
  const scenarioIds = new Map<string, string>();
  for (const slug of graphs.keys()) scenarioIds.set(slug, (await prisma.scenario.findUniqueOrThrow({ where: { slug } })).id);
  const ledger: Prisma.PointsLedgerCreateManyInput[] = [];
  const reviews: Prisma.PeerReviewCreateManyInput[] = [];
  const quality = (skill: number, random: () => number) => (random() < skill * 0.9 ? 0 : random() < 0.6 ? 1 : 2);
  const checksFor = (variant: number, checklist: { id: string }[], random: () => number) => {
    const count = variant === 0 ? (random() < 0.7 ? checklist.length : checklist.length - 1) : variant === 1 ? 2 : random() < 0.5 ? 1 : 0;
    return checklist.slice(0, count).map((item) => item.id);
  };

  const submissions = firstPasses
    .filter((item) => item.userIndex !== 0)
    .sort((a, b) => a.at - b.at);
  // Самые свежие ответы по трём сценариям остаются в очереди - их проверит демо-сотрудник на показе
  const keepPending = new Set<string>();
  for (const slug of ['first-shift', 'passenger-conflict', 'medical-incident']) {
    submissions.filter((item) => item.slug === slug).slice(-2).forEach((item) => keepPending.add(item.attemptId));
  }
  const demoGiven: string[] = [];
  for (const submission of submissions) {
    const author = users[submission.userIndex];
    const task = get(submission.slug).graph.peerTask;
    const pendingOnDemo = keepPending.has(submission.attemptId);
    if (!task || (points.get(submission.userIndex) ?? 0) < ECONOMY.reviewCost || (!pendingOnDemo && reviewRandom() > 0.65)) continue;
    const variant = quality(submission.skill, reviewRandom);
    const createdAt = new Date(pendingOnDemo
      ? Math.max(submission.at + 0.2 * HOUR, NOW - (6 + reviewRandom() * 40) * HOUR)
      : submission.at + (0.2 + reviewRandom() * 6) * HOUR);
    points.set(submission.userIndex, (points.get(submission.userIndex) ?? 0) - ECONOMY.reviewCost);
    ledger.push({ userId: author.id, track: TRACK_REVIEW_POINTS, amount: -ECONOMY.reviewCost, reason: 'review_submitted', createdAt });
    const review: Prisma.PeerReviewCreateManyInput = {
      id: demoUuid(`review-${submission.attemptId}`), attemptId: submission.attemptId, authorId: author.id,
      scenarioId: scenarioIds.get(submission.slug)!, prompt: task.prompt, checklist: task.checklist,
      answer: ANSWERS[submission.slug][variant][submission.userIndex % 2], createdAt,
    };
    // Свежие ответы оставляем в очереди - их проверит демо-пользователь на показе
    const reviewAt = createdAt.getTime() + (0.3 + reviewRandom() * 2.5) * DAY;
    const demoCanReview = ['first-shift', 'passenger-conflict'].includes(submission.slug)
      && (passedAt(0, submission.slug) ?? Infinity) < reviewAt && reviewAt < NOW - 2 * DAY;
    if (!pendingOnDemo && reviewAt < NOW - HOUR) {
      let reviewerIndex: number | undefined;
      if (demoCanReview && demoGiven.length < 2 && reviewRandom() < 0.5) reviewerIndex = 0;
      else {
        const candidates = firstPasses.filter((item) => item.slug === submission.slug && item.userIndex !== submission.userIndex && item.userIndex !== 0 && item.at < reviewAt);
        if (candidates.length > 0) reviewerIndex = candidates[Math.floor(reviewRandom() * candidates.length)].userIndex;
      }
      if (reviewerIndex !== undefined) {
        const reviewer = users[reviewerIndex];
        const checks = checksFor(variant, task.checklist, reviewRandom);
        const reviewedAt = new Date(reviewAt);
        Object.assign(review, {
          status: ReviewStatus.REVIEWED, reviewerId: reviewer.id, checks,
          comment: COMMENTS[variant][Math.floor(reviewRandom() * 2)], reviewedAt,
          helpful: reviewRandom() < 0.8 ? true : reviewRandom() < 0.5 ? false : null,
        });
        if (review.helpful !== null) review.ratedAt = new Date(reviewAt + 3 * HOUR);
        if (reviewerIndex === 0) demoGiven.push(review.id!);
        points.set(reviewerIndex, (points.get(reviewerIndex) ?? 0) + ECONOMY.reviewReward);
        ledger.push(
          { userId: reviewer.id, track: TRACK_REVIEW_POINTS, amount: ECONOMY.reviewReward, reason: 'review_given', createdAt: reviewedAt },
          { userId: reviewer.id, track: TRACK_XP, amount: ECONOMY.reviewerXp, reason: 'review_given', createdAt: reviewedAt },
          { userId: reviewer.id, track: TRACK_COINS, amount: ECONOMY.reviewerCoins, reason: 'review_given', createdAt: reviewedAt },
        );
        if (checks.length) ledger.push({ userId: author.id, track: TRACK_XP, amount: checks.length * ECONOMY.xpPerChecklistItem, reason: 'review_received', createdAt: reviewedAt });
        if (review.helpful) ledger.push({ userId: reviewer.id, track: TRACK_COINS, amount: ECONOMY.helpfulReviewCoins, reason: 'review_helpful', createdAt: review.ratedAt as Date });
      }
    }
    reviews.push(review);
  }

  // Ответ демо-сотрудника по конфликту: проверен коллегой, но ещё не оценён - будет уведомление
  const demoConflict = firstPasses.find((item) => item.userIndex === 0 && item.slug === 'passenger-conflict');
  if (demoConflict) {
    const task = get('passenger-conflict').graph.peerTask!;
    const createdAt = new Date(demoConflict.at + HOUR);
    const reviewedAt = new Date(NOW - 20 * HOUR);
    const reviewer = users[1];
    reviews.push({
      id: demoUuid('review-demo-conflict'), attemptId: demoConflict.attemptId, authorId: users[0].id,
      scenarioId: scenarioIds.get('passenger-conflict')!, prompt: task.prompt, checklist: task.checklist,
      answer: 'Меня зовут Алексей, я проводник этого вагона. Обращение можно оставить через начальника поезда или на сайте, я подскажу как. Данные других пассажиров сообщить не могу. Давайте я сначала помогу решить вопрос с местом.',
      createdAt, status: ReviewStatus.REVIEWED, reviewerId: reviewer.id, reviewedAt,
      checks: ['calm', 'channel', 'privacy'],
      comment: 'Спокойно и по делу, данные соседей не раскрыты. Не хватило одного: прямо сказать, что снимать можно и видео удалять не нужно.',
    });
    ledger.push(
      { userId: users[0].id, track: TRACK_REVIEW_POINTS, amount: -ECONOMY.reviewCost, reason: 'review_submitted', createdAt },
      { userId: reviewer.id, track: TRACK_REVIEW_POINTS, amount: ECONOMY.reviewReward, reason: 'review_given', createdAt: reviewedAt },
      { userId: reviewer.id, track: TRACK_XP, amount: ECONOMY.reviewerXp, reason: 'review_given', createdAt: reviewedAt },
      { userId: reviewer.id, track: TRACK_COINS, amount: ECONOMY.reviewerCoins, reason: 'review_given', createdAt: reviewedAt },
      { userId: users[0].id, track: TRACK_XP, amount: 3 * ECONOMY.xpPerChecklistItem, reason: 'review_received', createdAt: reviewedAt },
    );
  }

  await prisma.peerReview.createMany({ data: reviews });
  await prisma.pointsLedger.createMany({ data: ledger });
  for (const user of [...users, supervisor]) {
    await prisma.$transaction((tx) => refreshUserProgress(tx, user.id).then(() => undefined), { timeout: 60_000 });
  }
  // Демо-история не должна улетать во внешние системы при включённом webhook
  await prisma.webhookEvent.deleteMany({ where: { attemptId: { in: attemptIds } } });

  const demoStats = await prisma.userStats.findUniqueOrThrow({ where: { userId: users[0].id } });
  const pending = reviews.filter((review) => review.status === undefined).length;
  process.stdout.write([
    `Сценарии: ${graphs.size} опубликовано, ${catalog.upcoming.length} в графе как "скоро"`,
    `Сотрудники: ${users.length} в ${tribes.length} племенах и ${depots.length} депо, руководитель 1001`,
    `Прохождения: ${attemptIds.length}, взаимные проверки: ${reviews.length} (ждут проверки ${pending})`,
    `Демо 4471/demo: ${demoStats.xp} XP, уровень ${demoStats.level}, коины ${demoStats.coins}, баллы проверки ${demoStats.reviewPoints}`,
    '',
  ].join('\n'));
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
