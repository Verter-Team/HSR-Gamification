import { Module } from '@nestjs/common';
import { ScoringModule } from '../scoring/scoring.module';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';

@Module({ imports: [ScoringModule], controllers: [AttemptsController], providers: [AttemptsService] })
export class AttemptsModule {}
