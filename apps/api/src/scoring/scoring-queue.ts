import { Injectable } from '@nestjs/common';
import type { ScoreOutcome } from './progress.service';
import { ScoringService } from './scoring.service';

// Точка выноса скоринга в отдельный воркер. Сейчас подсчёт идёт прямо в запросе,
// в проде сюда встаёт реализация на BullMQ, а код attempts не меняется.
export abstract class ScoringQueue {
  abstract enqueue(attemptId: string): Promise<ScoreOutcome>;
}

@Injectable()
export class InProcessScoringQueue extends ScoringQueue {
  constructor(private readonly scoring: ScoringService) {
    super();
  }

  enqueue(attemptId: string): Promise<ScoreOutcome> {
    return this.scoring.score(attemptId);
  }
}
