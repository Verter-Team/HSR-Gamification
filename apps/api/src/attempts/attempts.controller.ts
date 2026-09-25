import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { AttemptAcceptedResponse, AttemptResultResponse } from '../common/swagger-responses';
import { AttemptsService } from './attempts.service';
import { CreateAttemptDto } from './dto/create-attempt.dto';

@Controller('attempts')
@ApiTags('Прохождения')
@ApiBearerAuth()
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Отправить завершённое прохождение' })
  @ApiResponse({ status: 202, description: 'Попытка сохранена и ожидает подсчёта', type: AttemptAcceptedResponse })
  @ApiResponse({ status: 409, description: 'attemptId уже использован с другим содержимым' })
  create(@Body() body: CreateAttemptDto, @CurrentUser() user: AuthUser) {
    return this.attempts.submit(body, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить результат своего прохождения' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Текущий статус и подтверждённый результат', type: AttemptResultResponse })
  @ApiResponse({ status: 404, description: 'Попытка не найдена или принадлежит другому сотруднику' })
  getResult(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser) {
    return this.attempts.getResult(id, user.id);
  }
}
