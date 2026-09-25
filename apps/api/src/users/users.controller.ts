import { Controller, ForbiddenException, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { UserStatsResponse } from '../common/swagger-responses';
import { UsersService } from './users.service';

@Controller('users')
@ApiTags('Профиль')
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':id/stats')
  @ApiOperation({ summary: 'Статистика своего профиля' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Очки, попытки, средние шкалы и серия тренировок', type: UserStatsResponse })
  @ApiResponse({ status: 403, description: 'Чужой профиль' })
  getStats(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser) {
    if (user.id !== id) throw new ForbiddenException('Чужой профиль');
    return this.users.getStats(id);
  }
}
