import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ScenariosModule } from './scenarios/scenarios.module';
import { AttemptsModule } from './attempts/attempts.module';
import { AchievementsModule } from './achievements/achievements.module';
import { UsersModule } from './users/users.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { ScoringModule } from './scoring/scoring.module';
import { AuthModule } from './auth/auth.module';
import { IntegrationModule } from './integration/integration.module';
import { GamificationModule } from './gamification/gamification.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ShopModule } from './shop/shop.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    PrismaModule, AuthModule, ScenariosModule, AttemptsModule, AchievementsModule, UsersModule,
    LeaderboardModule, ScoringModule, IntegrationModule, GamificationModule, ReviewsModule, ShopModule, AnalyticsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
