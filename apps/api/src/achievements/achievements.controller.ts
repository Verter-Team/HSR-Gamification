import { Controller, ForbiddenException, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { AchievementResponse, UserAchievementResponse } from '../common/swagger-responses';
import { AchievementsService } from './achievements.service';

@Controller()
@ApiTags('Достижения')
@ApiBearerAuth()
export class AchievementsController {
  constructor(private readonly achievements: AchievementsService) {}

  @Get('achievements')
  @ApiOperation({ summary: 'Каталог достижений' })
  @ApiResponse({ status: 200, description: 'Активные достижения', type: [AchievementResponse] })
  list() {
    return this.achievements.listCatalog();
  }

  @Get('users/:userId/achievements')
  @ApiOperation({ summary: 'Достижения своего профиля' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Каталог с датами получения', type: [UserAchievementResponse] })
  @ApiResponse({ status: 403, description: 'Чужой профиль' })
  listForUser(@Param('userId', new ParseUUIDPipe()) userId: string, @CurrentUser() user: AuthUser) {
    if (user.id !== userId) throw new ForbiddenException('Чужой профиль');
    return this.achievements.listForUser(userId);
  }
}
