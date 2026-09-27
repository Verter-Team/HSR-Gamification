import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { EvaluateReviewDto, RateReviewDto, SubmitReviewDto } from './dto';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
@ApiTags('Взаимная проверка')
@ApiBearerAuth()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Сдать ответ на открытый вопрос сценария. Стоит 1 балл проверки.' })
  @ApiResponse({ status: 201, description: 'Ответ в очереди на проверку', schema: { example: { id: 'uuid', status: 'pending', createdAt: '2026-09-27T12:00:00Z', reviewPoints: 2 } } })
  @ApiResponse({ status: 409, description: 'Нет баллов проверки или ответ уже отправлен' })
  submit(@Body() body: SubmitReviewDto, @CurrentUser() user: AuthUser) {
    return this.reviews.submit(user.id, body.attemptId, body.answer);
  }

  @Get('queue')
  @ApiOperation({ summary: 'Ответы коллег, которые можно проверить (по сценариям, зачтённым проверяющим)' })
  @ApiOkResponse({ description: 'Очередь, старые ответы сверху. Автор скрыт, видны только уровень и племя.' })
  queue(@CurrentUser() user: AuthUser) {
    return this.reviews.queue(user.id);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Мои ответы и проведённые проверки' })
  @ApiOkResponse({ description: 'Статусы моих ответов, чек-листы и комментарии проверяющих' })
  mine(@CurrentUser() user: AuthUser) {
    return this.reviews.mine(user.id);
  }

  @Post(':id/evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Проверить ответ коллеги по чек-листу. Даёт 1 балл проверки, опыт и коины.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Проверка сохранена', schema: { example: { status: 'reviewed', rewards: { xp: 30, coins: 5, reviewPoints: 1 }, newAchievements: ['first-review'] } } })
  @ApiResponse({ status: 403, description: 'Свой ответ или сценарий, который вы не зачли' })
  @ApiResponse({ status: 409, description: 'Ответ уже проверил другой коллега' })
  evaluate(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: EvaluateReviewDto, @CurrentUser() user: AuthUser) {
    return this.reviews.evaluate(user.id, id, body.checks, body.comment);
  }

  @Post(':id/rate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Оценить полученную проверку. Полезная проверка приносит проверяющему коины.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Оценка сохранена', schema: { example: { helpful: true } } })
  rate(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: RateReviewDto, @CurrentUser() user: AuthUser) {
    return this.reviews.rate(user.id, id, body.helpful);
  }
}
