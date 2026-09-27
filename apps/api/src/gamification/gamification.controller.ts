import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { GamificationService } from './gamification.service';

@Controller()
@ApiTags('Прогресс')
@ApiBearerAuth()
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}

  @Get('me')
  @ApiOperation({ summary: 'Профиль: уровень, звание, коины, баллы проверки, радар навыков' })
  @ApiOkResponse({
    description: 'Сводка профиля текущего сотрудника',
    schema: { example: {
      user: { id: 'uuid', externalId: '4471', displayName: 'Алексей С.', role: 'player' },
      depot: { id: 'uuid', name: 'Депо Москва' },
      tribe: { slug: 'neva', name: 'Нева', color: '#4EA8FF', motto: 'Спокойствие на любой скорости' },
      level: { level: 2, xp: 600, levelStartXp: 500, nextLevelXp: 900, progress: 0.33, rank: 'Проводник' },
      coins: 40, reviewPoints: 3,
      stats: { attemptsCount: 4, passedCount: 3, scenariosPassed: 2, avgSafety: 71.5, avgLoyalty: 66, streakDays: 1, reviewsGiven: 2, totalScore: 900 },
      skills: [{ id: 'service', title: 'Сервис', value: 25, max: 45, percent: 56, lastPassedAt: '2026-08-25T09:00:00Z', daysLeft: -3 }],
      achievements: { unlocked: 6, total: 18 },
      season: { title: 'Осенний сезон', endsAt: '2026-12-01T00:00:00Z' },
    } },
  })
  me(@CurrentUser() user: AuthUser) {
    return this.gamification.getMe(user.id);
  }

  @Get('me/map')
  @ApiOperation({ summary: 'Граф сценариев с прогрессом: закрыт, доступен, в процессе, зачтён, скоро' })
  @ApiOkResponse({
    description: 'Ветки и узлы графа',
    schema: { example: {
      branches: [{ id: 'medicine', title: 'Медицина', color: '#FF6B81' }],
      nodes: [{
        slug: 'medical-incident', title: 'Медицинский инцидент в пути', branch: 'medicine', tier: 1, xpReward: 500,
        requires: ['first-shift'], requiresTitles: ['Первая смена'], skills: ['first_aid'], status: 'available',
        versionId: 'uuid', attempts: 0, bestScore: null, lastPassedAt: null, freshnessDaysLeft: null,
      }],
    } },
  })
  map(@CurrentUser() user: AuthUser) {
    return this.gamification.getMap(user.id);
  }

  @Get('me/notifications')
  @ApiOperation({ summary: 'Уведомления: проверки, свежесть навыков, достижения, племя' })
  @ApiOkResponse({
    description: 'Список уведомлений, важные сверху',
    schema: { example: [{ id: 'queue', type: 'review_queue', title: 'Ответы коллег ждут проверки: 3', text: '...', link: '/reviews', createdAt: '2026-09-27T12:00:00Z' }] },
  })
  notifications(@CurrentUser() user: AuthUser) {
    return this.gamification.getNotifications(user.id);
  }

  @Get('tribes')
  @ApiOperation({ summary: 'Рейтинг племён в текущем сезоне' })
  @ApiOkResponse({
    description: 'Племена по опыту, заработанному участниками в сезоне',
    schema: { example: {
      season: { title: 'Осенний сезон', startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-12-01T00:00:00Z', daysLeft: 65 },
      tribes: [{ slug: 'neva', name: 'Нева', color: '#4EA8FF', motto: '...', members: 8, points: 4200, rank: 1, isMine: true, top: [{ displayName: 'Мария Л.', points: 1100 }] }],
      myTribe: 'neva', myContribution: 600,
    } },
  })
  tribes(@CurrentUser() user: AuthUser) {
    return this.gamification.getTribes(user.id);
  }
}
