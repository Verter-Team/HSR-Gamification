import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { LeaderboardResponse } from '../common/swagger-responses';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
@ApiTags('Рейтинг')
@ApiBearerAuth()
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get()
  @ApiOperation({ summary: 'Общий рейтинг или рейтинг депо' })
  @ApiQuery({ name: 'depotId', required: false, format: 'uuid' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: 'От 1 до 100' })
  @ApiResponse({ status: 200, description: 'Ранжированный список сотрудников', type: LeaderboardResponse })
  list(@Query('depotId') depotId?: string, @Query('limit') rawLimit?: string) {
    if (depotId && !isUUID(depotId)) throw new BadRequestException('depotId должен быть UUID');
    const limit = rawLimit === undefined ? 20 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('limit должен быть от 1 до 100');
    return this.leaderboard.list(depotId, limit);
  }
}
