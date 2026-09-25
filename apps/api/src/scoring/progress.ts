import { AttemptStatus, Prisma } from '@prisma/client';
import { evaluateAchievementRule, RuleAttempt } from '../achievements/rules';

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

// Вызывается после серверного скоринга; seed использует тот же пересчёт.
export async function refreshUserProgress(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const attempts = await tx.attempt.findMany({
    where: { userId, status: AttemptStatus.SCORED },
    select: { id: true, score: true, passed: true, metrics: true, timeouts: true, scoredAt: true },
    orderBy: [{ scoredAt: 'asc' }, { id: 'asc' }],
  });
  const lastAttemptAt = attempts.at(-1)?.scoredAt ?? null;
  const stats = {
    totalScore: attempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0),
    attemptsCount: attempts.length,
    passedCount: attempts.filter((attempt) => attempt.passed).length,
    avgSafety: average(attempts.map((attempt) => metric(attempt, 'safety'))),
    avgLoyalty: average(attempts.map((attempt) => metric(attempt, 'loyalty'))),
    streakDays: streakDays(attempts),
    lastAttemptAt,
    updatedAt: new Date(),
  };
  await tx.userStats.upsert({ where: { userId }, create: { userId, ...stats }, update: stats });

  const definitions = await tx.achievement.findMany({ where: { isActive: true }, select: { id: true, rule: true } });
  const earned = new Set((await tx.userAchievement.findMany({ where: { userId }, select: { achievementId: true } }))
    .map((achievement) => achievement.achievementId));
  const unlocks: { userId: string; achievementId: string; attemptId: string; unlockedAt: Date }[] = [];
  for (const definition of definitions) {
    if (earned.has(definition.id)) continue;
    for (let index = 0; index < attempts.length; index += 1) {
      if (evaluateAchievementRule(definition.rule, attempts.slice(0, index + 1))) {
        unlocks.push({
          userId,
          achievementId: definition.id,
          attemptId: attempts[index].id,
          unlockedAt: attempts[index].scoredAt ?? new Date(),
        });
        break;
      }
    }
  }
  if (unlocks.length > 0) await tx.userAchievement.createMany({ data: unlocks, skipDuplicates: true });
}
