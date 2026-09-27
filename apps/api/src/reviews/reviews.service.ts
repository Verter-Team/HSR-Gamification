import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, Prisma, ReviewStatus } from '@prisma/client';
import { ECONOMY, levelInfo, parseGraph } from '@vsm/scenario-engine';
import { PrismaService } from '../prisma/prisma.service';
import { TRACK_COINS, TRACK_REVIEW_POINTS, TRACK_XP } from '../gamification/constants';
import { ledgerBalances, refreshUserProgress } from '../scoring/progress';

type Checklist = { id: string; text: string }[];

// Трата баллов и коинов идёт под блокировкой пользователя, чтобы баланс не ушёл в минус
export async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))::text AS locked`;
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  private async hasPassed(db: Prisma.TransactionClient, userId: string, scenarioId: string): Promise<boolean> {
    const count = await db.attempt.count({
      where: { userId, status: AttemptStatus.SCORED, passed: true, scenarioVersion: { scenarioId } },
    });
    return count > 0;
  }

  async submit(userId: string, attemptId: string, answer: string) {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.attempt.findFirst({
        // Как в Школе 21: на проверку сдают зачтённую работу
        where: { id: attemptId, userId, status: AttemptStatus.SCORED, passed: true },
        select: { id: true, peerReview: { select: { id: true } }, scenarioVersion: { select: { graph: true, scenarioId: true } } },
      });
      if (!attempt) throw new NotFoundException('Зачтённая попытка не найдена');
      if (attempt.peerReview) throw new ConflictException('Ответ к этой попытке уже отправлен');
      const task = parseGraph(attempt.scenarioVersion.graph).peerTask;
      if (!task) throw new BadRequestException('В этом сценарии нет задания для взаимной проверки');
      const text = answer.trim();
      if (text.length < task.minLength) throw new BadRequestException(`Ответ слишком короткий: нужно хотя бы ${task.minLength} символов`);

      await lockUser(tx, userId);
      const balance = (await ledgerBalances(tx, userId))[TRACK_REVIEW_POINTS] ?? 0;
      if (balance < ECONOMY.reviewCost) {
        throw new ConflictException('Не хватает баллов проверки. Проверьте ответ коллеги, чтобы заработать балл.');
      }
      const review = await tx.peerReview.create({
        data: {
          attemptId, authorId: userId, scenarioId: attempt.scenarioVersion.scenarioId,
          prompt: task.prompt, checklist: task.checklist, answer: text,
        },
        select: { id: true, status: true, createdAt: true },
      });
      await tx.pointsLedger.create({ data: { userId, track: TRACK_REVIEW_POINTS, amount: -ECONOMY.reviewCost, reason: 'review_submitted' } });
      await refreshUserProgress(tx, userId);
      return { ...review, status: review.status.toLowerCase(), reviewPoints: balance - ECONOMY.reviewCost };
    });
  }

  // Очередь: ответы коллег по сценариям, которые проверяющий сам зачёл. Автор скрыт.
  async queue(userId: string) {
    const passed = await this.prisma.attempt.findMany({
      where: { userId, status: AttemptStatus.SCORED, passed: true },
      select: { scenarioVersion: { select: { scenarioId: true } } },
    });
    const scenarioIds = [...new Set(passed.map((item) => item.scenarioVersion.scenarioId))];
    if (scenarioIds.length === 0) return { canReview: false, items: [] };
    const items = await this.prisma.peerReview.findMany({
      where: { status: ReviewStatus.PENDING, authorId: { not: userId }, scenarioId: { in: scenarioIds } },
      select: {
        id: true, prompt: true, checklist: true, answer: true, createdAt: true,
        scenario: { select: { slug: true, title: true } },
        author: { select: { stats: { select: { xp: true } }, tribe: { select: { name: true, color: true } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    return {
      canReview: true,
      items: items.map(({ author, ...item }) => ({
        ...item,
        author: { level: levelInfo(author.stats?.xp ?? 0).level, tribe: author.tribe },
      })),
    };
  }

  async evaluate(userId: string, reviewId: string, checks: string[], comment: string) {
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.peerReview.findUnique({
        where: { id: reviewId },
        select: { id: true, authorId: true, scenarioId: true, status: true, checklist: true },
      });
      if (!review) throw new NotFoundException('Ответ не найден');
      if (review.authorId === userId) throw new ForbiddenException('Свой ответ проверять нельзя');
      if (review.status !== ReviewStatus.PENDING) throw new ConflictException('Этот ответ уже проверил другой коллега');
      if (!(await this.hasPassed(tx, userId, review.scenarioId))) {
        throw new ForbiddenException('Проверять можно только сценарии, которые вы сами зачли');
      }
      const allowed = new Set((review.checklist as Checklist).map((item) => item.id));
      const unique = [...new Set(checks)];
      if (unique.some((id) => !allowed.has(id))) throw new BadRequestException('Неизвестный критерий чек-листа');

      const claim = await tx.peerReview.updateMany({
        where: { id: reviewId, status: ReviewStatus.PENDING },
        data: { status: ReviewStatus.REVIEWED, reviewerId: userId, checks: unique, comment: comment.trim(), reviewedAt: new Date() },
      });
      if (claim.count === 0) throw new ConflictException('Этот ответ уже проверил другой коллега');

      const authorXp = unique.length * ECONOMY.xpPerChecklistItem;
      await tx.pointsLedger.createMany({
        data: [
          { userId, track: TRACK_REVIEW_POINTS, amount: ECONOMY.reviewReward, reason: 'review_given' },
          { userId, track: TRACK_XP, amount: ECONOMY.reviewerXp, reason: 'review_given' },
          { userId, track: TRACK_COINS, amount: ECONOMY.reviewerCoins, reason: 'review_given' },
          ...(authorXp > 0 ? [{ userId: review.authorId, track: TRACK_XP, amount: authorXp, reason: 'review_received' }] : []),
        ],
      });
      const newAchievements = await refreshUserProgress(tx, userId);
      await refreshUserProgress(tx, review.authorId);
      return {
        status: 'reviewed',
        rewards: { xp: ECONOMY.reviewerXp, coins: ECONOMY.reviewerCoins, reviewPoints: ECONOMY.reviewReward },
        newAchievements,
      };
    });
  }

  async mine(userId: string) {
    const [submitted, given, stats] = await Promise.all([
      this.prisma.peerReview.findMany({
        where: { authorId: userId },
        select: {
          id: true, prompt: true, checklist: true, answer: true, status: true, checks: true, comment: true,
          helpful: true, createdAt: true, reviewedAt: true,
          scenario: { select: { slug: true, title: true } },
          reviewer: { select: { stats: { select: { xp: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.peerReview.findMany({
        where: { reviewerId: userId },
        select: { id: true, checks: true, checklist: true, helpful: true, reviewedAt: true, scenario: { select: { title: true } } },
        orderBy: { reviewedAt: 'desc' },
        take: 10,
      }),
      this.prisma.userStats.findUnique({ where: { userId }, select: { reviewPoints: true, reviewsGiven: true } }),
    ]);
    return {
      reviewPoints: stats?.reviewPoints ?? 0,
      reviewsGiven: stats?.reviewsGiven ?? 0,
      submitted: submitted.map(({ reviewer, status, ...item }) => ({
        ...item,
        status: status.toLowerCase(),
        reviewerLevel: reviewer ? levelInfo(reviewer.stats?.xp ?? 0).level : null,
      })),
      given: given.map((item) => ({
        id: item.id, scenarioTitle: item.scenario.title, helpful: item.helpful, reviewedAt: item.reviewedAt,
        score: `${item.checks.length}/${(item.checklist as Checklist).length}`,
      })),
    };
  }

  // Автор оценивает проверку, как в Школе 21 оценивают проверяющего
  async rate(userId: string, reviewId: string, helpful: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.peerReview.findUnique({ where: { id: reviewId }, select: { authorId: true, reviewerId: true, status: true } });
      if (!review || review.authorId !== userId) throw new NotFoundException('Ответ не найден');
      if (review.status !== ReviewStatus.REVIEWED || !review.reviewerId) throw new ConflictException('Ответ ещё не проверен');
      const claim = await tx.peerReview.updateMany({
        where: { id: reviewId, helpful: null },
        data: { helpful, ratedAt: new Date() },
      });
      if (claim.count === 0) throw new ConflictException('Проверка уже оценена');
      if (helpful) {
        await tx.pointsLedger.create({
          data: { userId: review.reviewerId, track: TRACK_COINS, amount: ECONOMY.helpfulReviewCoins, reason: 'review_helpful' },
        });
        await refreshUserProgress(tx, review.reviewerId);
      }
      return { helpful };
    });
  }
}
