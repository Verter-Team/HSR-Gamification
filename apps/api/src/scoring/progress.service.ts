import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildAttemptScoredPayload } from '../integration/attempt-scored.payload';
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

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  // Вызывать только с результатом replay() общего движка, не с данными клиента.
  async recordScoredAttempt(attemptId: string, result: CanonicalResult): Promise<'scored' | 'invalid'> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.attempt.findUnique({
        where: { id: attemptId },
        include: { user: { select: { externalId: true } }, scenarioVersion: { select: { scenario: { select: { slug: true } } } } },
      });
      if (!attempt) throw new NotFoundException('Попытка не найдена');
      if (attempt.status === AttemptStatus.SCORED) return 'scored';
      if (attempt.status === AttemptStatus.INVALID) return 'invalid';
      if (attempt.status !== AttemptStatus.SUBMITTED) throw new ConflictException('Попытка ещё не отправлена');

      if (attempt.clientScore !== null && attempt.clientScore !== result.score) {
        const claim = await tx.attempt.updateMany({
          where: { id: attemptId, status: AttemptStatus.SUBMITTED },
          data: { status: AttemptStatus.INVALID, scoredAt: new Date() },
        });
        if (claim.count === 0) return this.currentStatus(tx, attemptId);
        return 'invalid';
      }

      const scoredAt = new Date();
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
      if (claim.count === 0) return this.currentStatus(tx, attemptId);
      const entries = Object.entries(result.tracks)
        .filter(([, amount]) => Number.isInteger(amount) && amount !== 0)
        .map(([track, amount]) => ({ userId: attempt.userId, attemptId, track, amount, reason: 'attempt' }));
      if (entries.length > 0) await tx.pointsLedger.createMany({ data: entries });
      await refreshUserProgress(tx, attempt.userId);
      await tx.webhookEvent.create({
        data: {
          attemptId,
          payload: buildAttemptScoredPayload(attempt, result, scoredAt),
        },
      });
      return 'scored';
    });
  }

  private async currentStatus(tx: Prisma.TransactionClient, attemptId: string): Promise<'scored' | 'invalid'> {
    const attempt = await tx.attempt.findUnique({ where: { id: attemptId }, select: { status: true } });
    if (attempt?.status === AttemptStatus.SCORED) return 'scored';
    if (attempt?.status === AttemptStatus.INVALID) return 'invalid';
    throw new ConflictException('Попытка обрабатывается');
  }
}
