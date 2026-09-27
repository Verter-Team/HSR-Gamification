import { AttemptStatus, Prisma, ReviewStatus } from '@prisma/client';
import { levelInfo } from '@vsm/scenario-engine';
import { evaluateAchievementRule, RuleAttempt } from '../achievements/rules';
import { TRACK_COINS, TRACK_REVIEW_POINTS, TRACK_XP } from '../gamification/constants';

function metric(attempt: RuleAttempt, name: string): number | null {
  const metrics = attempt.metrics;
  if (typeof metrics !== 'object' || metrics === null || Array.isArray(metrics)) return null;
  const value = (metrics as Record<string, unknown>)[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function average(values: (number | null)[]): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  if (numbers.length === 0) return null;
  return Math.round(numbers.reduce((sum, value) => sum + value, 0) * 100 / numbers.length) / 100;
}

function streakDays(attempts: RuleAttempt[]): number {
  const days = new Set(attempts.filter((attempt) => attempt.scoredAt).map((attempt) => attempt.scoredAt!.toISOString().slice(0, 10)));
  if (days.size === 0) return 0;
  let day = new Date(`${[...days].sort().at(-1)}T00:00:00.000Z`);
  let streak = 0;
  while (days.has(day.toISOString().slice(0, 10))) {
    streak += 1;
    day = new Date(day.getTime() - 86_400_000);
  }
  return streak;
}

export async function ledgerBalances(tx: Prisma.TransactionClient, userId: string): Promise<Record<string, number>> {
  const sums = await tx.pointsLedger.groupBy({
    by: ['track'],
    where: { userId, track: { in: [TRACK_XP, TRACK_COINS, TRACK_REVIEW_POINTS] } },
    _sum: { amount: true },
  });
  return Object.fromEntries(sums.map((row) => [row.track, row._sum.amount ?? 0]));
}

// Вызывается после серверного скоринга, проверки коллеги и покупки; seed использует тот же пересчёт.
// Возвращает коды достижений, полученных при этом пересчёте.
export async function refreshUserProgress(tx: Prisma.TransactionClient, userId: string): Promise<string[]> {
  const rows = await tx.attempt.findMany({
    where: { userId, status: AttemptStatus.SCORED },
    select: {
      id: true, score: true, passed: true, metrics: true, timeouts: true, scoredAt: true,
      scenarioVersion: { select: { scenario: { select: { slug: true } } } },
    },
    orderBy: [{ scoredAt: 'asc' }, { id: 'asc' }],
  });
  const attempts: RuleAttempt[] = rows.map(({ scenarioVersion, ...attempt }) => ({ ...attempt, scenarioSlug: scenarioVersion.scenario.slug }));
  const balances = await ledgerBalances(tx, userId);
  const reviewsGiven = await tx.peerReview.count({ where: { reviewerId: userId, status: ReviewStatus.REVIEWED } });
  const xp = balances[TRACK_XP] ?? 0;
  const level = levelInfo(xp).level;
  const lastAttemptAt = attempts.at(-1)?.scoredAt ?? null;
  const stats = {
    totalScore: attempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0),
    attemptsCount: attempts.length,
    passedCount: attempts.filter((attempt) => attempt.passed).length,
    avgSafety: average(attempts.map((attempt) => metric(attempt, 'safety'))),
    avgLoyalty: average(attempts.map((attempt) => metric(attempt, 'loyalty'))),
    streakDays: streakDays(attempts),
    lastAttemptAt,
    xp,
    level,
    coins: balances[TRACK_COINS] ?? 0,
    reviewPoints: balances[TRACK_REVIEW_POINTS] ?? 0,
    reviewsGiven,
    updatedAt: new Date(),
  };
  await tx.userStats.upsert({ where: { userId }, create: { userId, ...stats }, update: stats });

  const definitions = await tx.achievement.findMany({ where: { isActive: true }, select: { id: true, code: true, rule: true } });
  const earned = new Set((await tx.userAchievement.findMany({ where: { userId }, select: { achievementId: true } }))
    .map((achievement) => achievement.achievementId));
  const context = { level, reviewsGiven };
  const unlocks: { userId: string; achievementId: string; attemptId: string | null; unlockedAt: Date }[] = [];
  const codes: string[] = [];
  for (const definition of definitions) {
    if (earned.has(definition.id)) continue;
    let unlocked = false;
    if (evaluateAchievementRule(definition.rule, [], context)) {
      // Правило про уровень или проверки коллег - выполнено сейчас, без привязки к попытке
      unlocks.push({ userId, achievementId: definition.id, attemptId: null, unlockedAt: new Date() });
      unlocked = true;
    } else {
      // Ищем попытку, на которой правило выполнилось впервые, чтобы дата была честной
      for (let index = 0; index < attempts.length; index += 1) {
        if (evaluateAchievementRule(definition.rule, attempts.slice(0, index + 1), context)) {
          unlocks.push({ userId, achievementId: definition.id, attemptId: attempts[index].id, unlockedAt: attempts[index].scoredAt ?? new Date() });
          unlocked = true;
          break;
        }
      }
    }
    if (unlocked) codes.push(definition.code);
  }
  if (unlocks.length > 0) await tx.userAchievement.createMany({ data: unlocks, skipDuplicates: true });
  return codes;
}
