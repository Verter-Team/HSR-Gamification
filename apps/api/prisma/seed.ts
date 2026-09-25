import { createHash } from 'node:crypto';
import * as argon2 from 'argon2';
import { AttemptStatus, PrismaClient, VersionStatus } from '@prisma/client';
import { refreshUserProgress } from '../src/scoring/progress';

const prisma = new PrismaClient();

function demoUuid(value: string): string {
  const bytes = createHash('sha1').update(`hsr-gamification-demo:${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const achievementDefinitions = [
  { code: 'first-step', title: 'Первый шаг', description: 'Пройти первый сценарий', icon: 'footprints', tier: 1, rule: { attempts: { cmp: 'gte', value: 1 } } },
  { code: 'three-trainings', title: 'Вошёл в ритм', description: 'Пройти 3 сценария', icon: 'repeat', tier: 1, rule: { attempts: { cmp: 'gte', value: 3 } } },
  { code: 'five-trainings', title: 'Настойчивость', description: 'Пройти 5 сценариев', icon: 'medal', tier: 2, rule: { attempts: { cmp: 'gte', value: 5 } } },
  { code: 'ten-trainings', title: 'Ветеран тренировок', description: 'Пройти 10 сценариев', icon: 'star', tier: 3, rule: { attempts: { cmp: 'gte', value: 10 } } },
  { code: 'safe-choice', title: 'Приоритет безопасности', description: 'Достичь безопасности 70', icon: 'shield', tier: 1, rule: { metric: 'safety', cmp: 'gte', value: 70 } },
  { code: 'no-timeout', title: 'Без промедления', description: 'Завершить сценарий без тайм-аута', icon: 'clock', tier: 1, rule: { timeouts: { cmp: 'eq', value: 0 } } },
  { code: 'safe-and-calm', title: 'Уверенное решение', description: 'Сохранить безопасность 70 без тайм-аута', icon: 'shield-check', tier: 2, rule: { all: [{ metric: 'safety', cmp: 'gte', value: 70 }, { timeouts: { cmp: 'eq', value: 0 } }] } },
  { code: 'first-success', title: 'Зачёт', description: 'Успешно пройти сценарий', icon: 'check', tier: 1, rule: { passed: { cmp: 'gte', value: 1 } } },
  { code: 'three-successes', title: 'Надёжный проводник', description: 'Успешно пройти 3 сценария', icon: 'badge-check', tier: 2, rule: { passed: { cmp: 'gte', value: 3 } } },
  { code: 'five-successes', title: 'Мастер смены', description: 'Успешно пройти 5 сценариев', icon: 'award', tier: 3, rule: { passed: { cmp: 'gte', value: 5 } } },
  { code: 'high-score', title: 'Точный расчёт', description: 'Набрать 220 очков за сценарий', icon: 'target', tier: 2, rule: { score: { cmp: 'gte', value: 220 } } },
  { code: 'monthly-rhythm', title: 'Месяц практики', description: 'Пройти 5 сценариев за 30 дней', icon: 'calendar', tier: 2, rule: { attempts: { cmp: 'gte', value: 5 }, window: '30d' } },
] as const;

async function main(): Promise<void> {
  const depotNames = ['Депо Москва', 'Депо Тверь', 'Депо Санкт-Петербург'];
  const depots = [];
  for (const name of depotNames) {
    depots.push(await prisma.orgUnit.upsert({
      where: { name }, update: {}, create: { name },
    }));
  }
  const externalIds = ['4471', ...Array.from({ length: 29 }, (_, index) => String(4401 + index))];
  const users = [];
  const demoPasswordHash = await argon2.hash('demo');
  for (const [index, externalId] of externalIds.entries()) {
    const displayName = `Проводник №${externalId}`;
    const orgUnitId = depots[Math.floor(index / 10)].id;
    users.push(await prisma.user.upsert({
      where: { externalId },
      update: { displayName, orgUnitId, ...(index === 0 ? { passwordHash: demoPasswordHash } : {}) },
      create: { externalId, displayName, orgUnitId, ...(index === 0 ? { passwordHash: demoPasswordHash } : {}) },
    }));
  }
  const scenario = await prisma.scenario.upsert({
    where: { slug: 'demo-medical-incident' },
    update: { title: 'Медицинский инцидент - демо', isActive: true },
    create: { slug: 'demo-medical-incident', title: 'Медицинский инцидент - демо' },
  });
  const graph = {
    schemaVersion: 1,
    id: scenario.id,
    slug: scenario.slug,
    title: scenario.title,
    summary: 'Пассажиру стало плохо в пути.',
    audience: 'staff',
    role: 'проводник',
    difficulty: 1,
    estimatedMinutes: 1,
    tags: ['медицина'],
    metrics: [
      { id: 'safety', title: 'Безопасность', min: 0, max: 100, initial: 50, direction: 'higher-better', display: 'shield' },
      { id: 'loyalty', title: 'Лояльность пассажира', min: 0, max: 100, initial: 50, direction: 'higher-better', display: 'hearts' },
    ],
    tracks: [{ id: 'emergency', title: 'Действия в нештатных ситуациях' }],
    scoring: { base: 100, metricWeights: { safety: 1, loyalty: 1 }, timeoutPenalty: 10, passThreshold: 150 },
    entry: 'intro',
    nodes: {
      intro: { id: 'intro', kind: 'scene', text: 'Пассажир жалуется на боль в груди.', next: 'first_choice' },
      first_choice: {
        id: 'first_choice', kind: 'choice', prompt: 'Что сделать первым?',
        timer: { seconds: 10, onTimeout: { next: 'end_failure', effects: [{ op: 'metric', metric: 'safety', delta: -25 }] } },
        options: [
          { id: 'call_help', text: 'Позвать начальника поезда и запросить медицинскую помощь', effects: [{ op: 'metric', metric: 'safety', delta: 20 }, { op: 'track', track: 'emergency', amount: 15 }], next: 'end_success' },
          { id: 'wait', text: 'Подождать, пока пассажиру станет лучше', effects: [{ op: 'metric', metric: 'safety', delta: -20 }], next: 'end_failure' },
        ],
      },
      end_success: { id: 'end_success', kind: 'ending', outcome: 'success', title: 'Помощь вызвана', text: 'Вы быстро отреагировали.' },
      end_failure: { id: 'end_failure', kind: 'ending', outcome: 'failure', title: 'Помощь задержалась', text: 'Промедление создало риск.' },
    },
  };
  const version = await prisma.scenarioVersion.upsert({
    where: { scenarioId_version: { scenarioId: scenario.id, version: 1 } },
    update: { graph, status: VersionStatus.PUBLISHED, publishedAt: new Date() },
    create: { scenarioId: scenario.id, version: 1, status: VersionStatus.PUBLISHED, publishedAt: new Date(), graph },
  });

  for (const definition of achievementDefinitions) {
    await prisma.achievement.upsert({
      where: { code: definition.code },
      update: { title: definition.title, description: definition.description, icon: definition.icon, tier: definition.tier, rule: definition.rule },
      create: { ...definition },
    });
  }

  const days = [1, 8, 15, 24, 25];
  for (const [userIndex, user] of users.entries()) {
    await prisma.$transaction(async (tx) => {
      for (const [attemptIndex, day] of days.entries()) {
        const success = userIndex === 0 || (userIndex * 3 + attemptIndex * 7) % 5 !== 0;
        const attemptId = demoUuid(`${user.externalId}-${attemptIndex}`);
        const startedAt = new Date(Date.UTC(2026, 8, day, 9 + userIndex % 8, attemptIndex, 0));
        const submittedAt = new Date(startedAt.getTime() + 60_000);
        const scoredAt = new Date(submittedAt.getTime() + 2_000);
        const reactionMs = 1_500 + userIndex * 40 + attemptIndex * 150;
        const score = success ? 220 : 180;
        const data = {
          userId: user.id, scenarioVersionId: version.id,
          status: AttemptStatus.SCORED, outcome: success ? 'success' : 'failure',
          score, passed: success,
          metrics: { safety: success ? 70 : 30, loyalty: 50 },
          tracks: { emergency: success ? 15 : 0 },
          timeouts: 0, avgReactionMs: reactionMs, clientScore: score,
          startedAt, submittedAt, scoredAt,
        };
        await tx.attempt.upsert({ where: { id: attemptId }, update: data, create: { id: attemptId, ...data } });
        await tx.attemptEvent.upsert({
          where: { attemptId_seq: { attemptId, seq: 0 } },
          update: { nodeId: 'first_choice', optionId: success ? 'call_help' : 'wait', reactionMs },
          create: { attemptId, seq: 0, nodeId: 'first_choice', optionId: success ? 'call_help' : 'wait', reactionMs },
        });
        await tx.pointsLedger.deleteMany({ where: { attemptId, reason: 'attempt' } });
        if (success) await tx.pointsLedger.create({
          data: { userId: user.id, attemptId, track: 'emergency', amount: 15, reason: 'attempt', createdAt: scoredAt },
        });
      }
      await refreshUserProgress(tx, user.id);
    });
  }
  process.stdout.write(`Демо: userId=${users[0].id}, scenarioVersionId=${version.id}; ${depots.length} депо, ${users.length} сотрудников, ${achievementDefinitions.length} достижений, ${users.length * days.length} попыток\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
