import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { STAFF_ROLES } from '../gamification/constants';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@ApiTags('Аналитика')
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Сводка для руководителя: сложные шаги, сценарии, депо' })
  @ApiOkResponse({
    description: 'Агрегаты по зачтённым попыткам игроков',
    schema: { example: {
      totals: { players: 30, attempts: 142, passRate: 68, avgSafety: 71.4, avgLoyalty: 63.2, timeouts: 37, reviewsDone: 41, reviewsPending: 6 },
      scenarios: [{ slug: 'emergency-stop', title: 'Задымление в вагоне', attempts: 21, passRate: 52, avgScore: 212 }],
      hardestSteps: [{ scenarioSlug: 'medical-incident', scenarioTitle: '...', nodeId: 'q3', prompt: 'Нормального дыхания нет. Что делать?', answers: 34, errorRate: 47, timeoutRate: 12, commonMistake: { text: 'Уложить в устойчивое боковое положение и ждать', count: 9 } }],
      depots: [{ id: 'uuid', name: 'Депо Москва', attempts: 48, passRate: 71, avgSafety: 73, avgLoyalty: 64 }],
    } },
  })
  @ApiResponse({ status: 403, description: 'Только для руководителя, методолога или администратора' })
  overview(@CurrentUser() user: AuthUser) {
    if (!STAFF_ROLES.includes(user.role)) throw new ForbiddenException('Аналитика доступна руководителю и методологу');
    return this.analytics.overview();
  }
}
