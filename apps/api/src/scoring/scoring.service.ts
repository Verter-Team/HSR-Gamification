import { Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus } from '@prisma/client';
import { parseGraph, replay, summarize } from '@vsm/scenario-engine';
import { PrismaService } from '../prisma/prisma.service';
import { CanonicalResult, ProgressService, ScoreOutcome } from './progress.service';

// Пересчитывает попытку на сервере тем же движком, что работает в приложении.
// Клиент присылает только лог решений, очки считаются здесь.
@Injectable()
export class ScoringService {
  constructor(private readonly prisma: PrismaService, private readonly progress: ProgressService) {}

  async score(attemptId: string): Promise<ScoreOutcome> {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      select: {
        status: true,
        events: { orderBy: { seq: 'asc' }, select: { nodeId: true, optionId: true, reactionMs: true } },
        scenarioVersion: { select: { graph: true } },
      },
    });
    if (!attempt) throw new NotFoundException('Попытка не найдена');
    if (attempt.status === AttemptStatus.SCORED) return { status: 'scored' };
    if (attempt.status === AttemptStatus.INVALID) return { status: 'invalid' };

    let result: CanonicalResult;
    try {
      const graph = parseGraph(attempt.scenarioVersion.graph);
      const summary = summarize(graph, replay(graph, attempt.events));
      result = {
        outcome: summary.outcome,
        score: summary.score,
        passed: summary.passed,
        metrics: summary.metrics,
        tracks: summary.tracks,
        timeouts: summary.timeouts,
        avgReactionMs: summary.avgReactionMs,
      };
    } catch (error) {
      // Лог не сходится с графом: подделка или устаревший клиент. В рейтинг не идёт.
      await this.prisma.attempt.updateMany({
        where: { id: attemptId, status: AttemptStatus.SUBMITTED },
        data: { status: AttemptStatus.INVALID, scoredAt: new Date() },
      });
      return { status: 'invalid', reason: error instanceof Error ? error.message : String(error) };
    }
    return this.progress.recordScoredAttempt(attemptId, result);
  }
}
