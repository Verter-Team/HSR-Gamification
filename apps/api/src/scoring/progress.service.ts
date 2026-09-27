import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, Prisma, VersionStatus } from '@prisma/client';
import { attemptRewards, levelInfo } from '@vsm/scenario-engine';
import { PrismaService } from '../prisma/prisma.service';
import { buildAttemptScoredPayload } from '../integration/attempt-scored.payload';
import { TRACK_COINS, TRACK_XP } from '../gamification/constants';
import { refreshUserProgress } from './progress';

export interface CanonicalResult {
  outcome: 'success' | 'partial' | 'failure';
  score: number;
  passed: boolean;
  metrics: Record<string, number>;
  tracks: Record<string, number>;
  timeouts: number;
  avgReactionMs: number;
}

export interface AttemptRewards {
  xp: number;
  coins: number;
  firstPass: boolean;
  xpTotal: number;
  levelBefore: number;
  levelAfter: number;
  rank: string;
  newAchievements: { code: string; title: string; icon: string; tier: number }[];
  unlockedScenarios: { slug: string; title: string }[];
}

export interface ScoreOutcome {
  status: 'scored' | 'invalid';
  rewards?: AttemptRewards;
  reason?: string;
}

async function currentStatus(tx: Prisma.TransactionClient, attemptId: string): Promise<ScoreOutcome> {
  const attempt = await tx.attempt.findUnique({ where: { id: attemptId }, select: { status: true } });
  if (attempt?.status === AttemptStatus.SCORED) return { status: 'scored' };
  if (attempt?.status === AttemptStatus.INVALID) return { status: 'invalid' };
  throw new ConflictException('Попытка обрабатывается');
}

// Фиксирует канонический результат, начисляет опыт и коины, пересчитывает прогресс.
// Вызывать только с результатом replay() общего движка, не с данными клиента.
// Seed вызывает эту же функцию, чтобы демо-история считалась по тем же правилам.
export async function recordScoredAttemptTx(
  tx: Prisma.TransactionClient,
  attemptId: string,
  result: CanonicalResult,
  scoredAt: Date = new Date(),
): Promise<ScoreOutcome> {
  const attempt = await tx.attempt.findUnique({
    where: { id: attemptId },
    include: {
      user: { select: { externalId: true } },
      scenarioVersion: { select: { scenario: { select: { id: true, slug: true, title: true, xpReward: true } } } },
    },
  });
  if (!attempt) throw new NotFoundException('Попытка не найдена');
  if (attempt.status === AttemptStatus.SCORED) return { status: 'scored' };
  if (attempt.status === AttemptStatus.INVALID) return { status: 'invalid' };
  if (attempt.status !== AttemptStatus.SUBMITTED) throw new ConflictException('Попытка ещё не отправлена');

  if (attempt.clientScore !== null && attempt.clientScore !== result.score) {
    const claim = await tx.attempt.updateMany({
      where: { id: attemptId, status: AttemptStatus.SUBMITTED },
      data: { status: AttemptStatus.INVALID, scoredAt },
    });
    if (claim.count === 0) return currentStatus(tx, attemptId);
    return { status: 'invalid', reason: 'Результат на устройстве не совпал с пересчётом на сервере' };
  }

  const scenario = attempt.scenarioVersion.scenario;
  const passedBefore = await tx.attempt.findMany({
    where: { userId: attempt.userId, status: AttemptStatus.SCORED, passed: true },
    select: { scenarioVersion: { select: { scenario: { select: { slug: true } } } } },
  });
  const passedSlugs = new Set(passedBefore.map((item) => item.scenarioVersion.scenario.slug));
  const firstPass = result.passed && !passedSlugs.has(scenario.slug);
  const xpBefore = (await tx.userStats.findUnique({ where: { userId: attempt.userId }, select: { xp: true } }))?.xp ?? 0;

  const claim = await tx.attempt.updateMany({
    where: { id: attemptId, status: AttemptStatus.SUBMITTED },
    data: {
      status: AttemptStatus.SCORED,
      outcome: result.outcome,
      score: result.score,
      passed: result.passed,
      metrics: result.metrics,
      tracks: result.tracks,
      timeouts: result.timeouts,
      avgReactionMs: result.avgReactionMs,
      scoredAt,
    },
  });
  if (claim.count === 0) return currentStatus(tx, attemptId);

  const reward = attemptRewards({ xpReward: scenario.xpReward, outcome: result.outcome, passed: result.passed, firstPass });
  const entries = Object.entries(result.tracks)
    .filter(([, amount]) => Number.isInteger(amount) && amount !== 0)
    .map(([track, amount]) => ({ userId: attempt.userId, attemptId, track, amount, reason: 'attempt', createdAt: scoredAt }));
  if (reward.xp) entries.push({ userId: attempt.userId, attemptId, track: TRACK_XP, amount: reward.xp, reason: 'attempt', createdAt: scoredAt });
  if (reward.coins) entries.push({ userId: attempt.userId, attemptId, track: TRACK_COINS, amount: reward.coins, reason: 'attempt', createdAt: scoredAt });
  if (entries.length > 0) await tx.pointsLedger.createMany({ data: entries });

  const newCodes = await refreshUserProgress(tx, attempt.userId);
  const newAchievements = newCodes.length
    ? await tx.achievement.findMany({ where: { code: { in: newCodes } }, select: { code: true, title: true, icon: true, tier: true } })
    : [];

  let unlockedScenarios: { slug: string; title: string }[] = [];
  if (firstPass) {
    const nowPassed = new Set([...passedSlugs, scenario.slug]);
    const candidates = await tx.scenario.findMany({
      where: { isActive: true, requires: { has: scenario.slug }, versions: { some: { status: VersionStatus.PUBLISHED } } },
      select: { slug: true, title: true, requires: true },
    });
    unlockedScenarios = candidates
      .filter((candidate) => candidate.requires.every((slug) => nowPassed.has(slug)))
      .map(({ slug, title }) => ({ slug, title }));
  }

  await tx.webhookEvent.create({
    data: { attemptId, payload: buildAttemptScoredPayload(attempt, result, scoredAt) },
  });

  const xpTotal = xpBefore + reward.xp;
  const after = levelInfo(xpTotal);
  return {
    status: 'scored',
    rewards: {
      xp: reward.xp,
      coins: reward.coins,
      firstPass,
      xpTotal,
      levelBefore: levelInfo(xpBefore).level,
      levelAfter: after.level,
      rank: after.rank,
      newAchievements,
      unlockedScenarios,
    },
  };
}

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  recordScoredAttempt(attemptId: string, result: CanonicalResult): Promise<ScoreOutcome> {
    return this.prisma.$transaction((tx) => recordScoredAttemptTx(tx, attemptId, result));
  }
}
