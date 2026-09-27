import { Module } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { InProcessScoringQueue, ScoringQueue } from './scoring-queue';
import { ScoringService } from './scoring.service';

@Module({
  providers: [ProgressService, ScoringService, { provide: ScoringQueue, useClass: InProcessScoringQueue }],
  exports: [ProgressService, ScoringQueue],
})
export class ScoringModule {}
