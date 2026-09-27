import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, Prisma, VersionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringQueue } from '../scoring/scoring-queue';
import { CreateAttemptDto } from './dto/create-attempt.dto';

@Injectable()
export class AttemptsService {
  constructor(private readonly prisma: PrismaService, private readonly scoring: ScoringQueue) {}

  async getResult(id: string, userId: string) {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id, userId },
      select: {
        id: true,
        scenarioVersionId: true,
        status: true,
        outcome: true,
        score: true,
        passed: true,
        metrics: true,
        tracks: true,
        timeouts: true,
        avgReactionMs: true,
        startedAt: true,
        submittedAt: true,
        scoredAt: true,
      },
    });
    if (!attempt) throw new NotFoundException('Попытка не найдена');

    return {
      attemptId: attempt.id,
      scenarioVersionId: attempt.scenarioVersionId,
      status: attempt.status.toLowerCase(),
      outcome: attempt.outcome,
      score: attempt.score,
      passed: attempt.passed,
      metrics: attempt.metrics,
      tracks: attempt.tracks,
      timeouts: attempt.timeouts,
      avgReactionMs: attempt.avgReactionMs,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      scoredAt: attempt.scoredAt,
    };
  }

  async submit(body: CreateAttemptDto, userId: string) {
    const events = [...body.events].sort((a, b) => a.seq - b.seq);
    if (events.some((event, index) => index > 0 && event.seq === events[index - 1].seq)) {
      throw new BadRequestException('Номера событий должны быть уникальными');
    }

    const existing = await this.prisma.attempt.findUnique({
      where: { id: body.attemptId },
      include: { events: { orderBy: { seq: 'asc' } } },
    });
    if (existing) return this.repeatedSubmission(existing, body, events, userId);

    try {
      await this.prisma.$transaction(async (tx) => {
        const [user, version] = await Promise.all([
          tx.user.findUnique({ where: { id: userId }, select: { id: true } }),
          tx.scenarioVersion.findUnique({
            where: { id: body.scenarioVersionId },
            select: { status: true, scenario: { select: { isActive: true } } },
          }),
        ]);
        if (!user) throw new NotFoundException('Пользователь не найден');
        if (!version || version.status !== VersionStatus.PUBLISHED || !version.scenario.isActive) {
          throw new NotFoundException('Опубликованная версия сценария не найдена');
        }

        await tx.attempt.create({
          data: {
            id: body.attemptId,
            userId,
            scenarioVersionId: body.scenarioVersionId,
            status: AttemptStatus.SUBMITTED,
            startedAt: new Date(body.startedAt),
            submittedAt: new Date(),
            clientScore: body.clientScore,
            events: {
              create: events.map((event) => ({
                seq: event.seq,
                nodeId: event.nodeId,
                optionId: event.optionId ?? null,
                reactionMs: event.reactionMs,
              })),
            },
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.attempt.findUnique({
          where: { id: body.attemptId },
          include: { events: { orderBy: { seq: 'asc' } } },
        });
        if (raced) return this.repeatedSubmission(raced, body, events, userId);
      }
      throw error;
    }

    // Сервер пересчитывает прохождение по логу тем же движком, что и приложение
    const outcome = await this.scoring.enqueue(body.attemptId);
    return {
      attemptId: body.attemptId,
      status: outcome.status,
      ...(outcome.reason ? { reason: outcome.reason } : {}),
      ...(outcome.rewards ? { rewards: outcome.rewards } : {}),
    };
  }

  private repeatedSubmission(
    existing: Prisma.AttemptGetPayload<{ include: { events: true } }>,
    body: CreateAttemptDto,
    events: CreateAttemptDto['events'],
    userId: string,
  ) {
    if (existing.userId !== userId) throw new NotFoundException('Попытка не найдена');
    const samePayload =
      existing.scenarioVersionId === body.scenarioVersionId &&
      existing.startedAt.getTime() === new Date(body.startedAt).getTime() &&
      existing.clientScore === (body.clientScore ?? null) &&
      existing.events.length === events.length &&
      existing.events.every((saved, index) =>
        saved.seq === events[index].seq &&
        saved.nodeId === events[index].nodeId &&
        saved.optionId === (events[index].optionId ?? null) &&
        saved.reactionMs === events[index].reactionMs,
      );
    if (!samePayload) throw new ConflictException('attemptId уже использован для другой попытки');
    return { attemptId: existing.id, status: existing.status.toLowerCase() };
  }
}
