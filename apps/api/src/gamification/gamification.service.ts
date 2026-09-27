import { Injectable, NotFoundException } from '@nestjs/common';
import { AttemptStatus, ReviewStatus, UserRole, VersionStatus } from '@prisma/client';
import { freshnessDaysLeft, levelInfo } from '@vsm/scenario-engine';
import { PrismaService } from '../prisma/prisma.service';
import { BRANCHES, currentSeason, TRACK_XP } from './constants';
import { computeSkills } from './skills';

type NodeStatus = 'soon' | 'locked' | 'available' | 'in_progress' | 'passed';

export interface Notification {
  id: string;
  type: 'review_received' | 'review_queue' | 'skill_fading' | 'achievement' | 'tribe' | 'scenario_open';
  title: string;
  text: string;
  link: string;
  createdAt: Date;
}

@Injectable()
export class GamificationService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, externalId: true, displayName: true, role: true,
        orgUnit: { select: { id: true, name: true } },
        tribe: { select: { slug: true, name: true, color: true, motto: true } },
        stats: true,
      },
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
    const stats = user.stats;
    const [skills, unlocked, total, passedScenarios] = await Promise.all([
      computeSkills(this.prisma, userId),
      this.prisma.userAchievement.count({ where: { userId } }),
      this.prisma.achievement.count({ where: { isActive: true, isSecret: false } }),
      this.passedSlugs(userId),
    ]);
    const season = currentSeason();
    return {
      user: { id: user.id, externalId: user.externalId, displayName: user.displayName, role: user.role.toLowerCase() },
      depot: user.orgUnit,
      tribe: user.tribe,
      level: levelInfo(stats?.xp ?? 0),
      coins: stats?.coins ?? 0,
      reviewPoints: stats?.reviewPoints ?? 0,
      stats: {
        attemptsCount: stats?.attemptsCount ?? 0,
        passedCount: stats?.passedCount ?? 0,
        scenariosPassed: passedScenarios.size,
        avgSafety: stats?.avgSafety?.toNumber() ?? null,
        avgLoyalty: stats?.avgLoyalty?.toNumber() ?? null,
        streakDays: stats?.streakDays ?? 0,
        reviewsGiven: stats?.reviewsGiven ?? 0,
        totalScore: stats?.totalScore ?? 0,
      },
      skills,
      achievements: { unlocked, total },
      season: { title: season.title, endsAt: season.endsAt },
    };
  }

  private async passedSlugs(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.attempt.findMany({
      where: { userId, status: AttemptStatus.SCORED, passed: true },
      select: { scenarioVersion: { select: { scenario: { select: { slug: true } } } } },
    });
    return new Set(rows.map((row) => row.scenarioVersion.scenario.slug));
  }

  // Граф сценариев как холиграф Школы 21: следующий открывается после зачёта предыдущих
  async getMap(userId: string) {
    const [scenarios, attempts] = await Promise.all([
      this.prisma.scenario.findMany({
        where: { isActive: true },
        select: {
          slug: true, title: true, summary: true, branch: true, tier: true, xpReward: true,
          requires: true, skills: true, difficulty: true, estimatedMinutes: true,
          versions: { where: { status: VersionStatus.PUBLISHED }, select: { id: true } },
        },
        orderBy: [{ tier: 'asc' }, { slug: 'asc' }],
      }),
      this.prisma.attempt.findMany({
        where: { userId, status: AttemptStatus.SCORED },
        select: { passed: true, score: true, scoredAt: true, scenarioVersion: { select: { scenario: { select: { slug: true } } } } },
      }),
    ]);
    const bySlug = new Map<string, { attempts: number; passed: boolean; bestScore: number | null; lastPassedAt: Date | null }>();
    for (const attempt of attempts) {
      const slug = attempt.scenarioVersion.scenario.slug;
      const entry = bySlug.get(slug) ?? { attempts: 0, passed: false, bestScore: null, lastPassedAt: null };
      entry.attempts += 1;
      if (attempt.score !== null) entry.bestScore = Math.max(entry.bestScore ?? 0, attempt.score);
      if (attempt.passed) {
        entry.passed = true;
        if (attempt.scoredAt && (!entry.lastPassedAt || entry.lastPassedAt < attempt.scoredAt)) entry.lastPassedAt = attempt.scoredAt;
      }
      bySlug.set(slug, entry);
    }
    const passed = new Set([...bySlug.entries()].filter(([, entry]) => entry.passed).map(([slug]) => slug));
    const titles = new Map(scenarios.map((scenario) => [scenario.slug, scenario.title]));
    const nodes = scenarios.map(({ versions, ...scenario }) => {
      const progress = bySlug.get(scenario.slug);
      let status: NodeStatus;
      if (versions.length === 0) status = 'soon';
      else if (progress?.passed) status = 'passed';
      else if (scenario.requires.every((slug) => passed.has(slug))) status = progress ? 'in_progress' : 'available';
      else status = 'locked';
      return {
        ...scenario,
        requiresTitles: scenario.requires.map((slug) => titles.get(slug) ?? slug),
        versionId: versions[0]?.id ?? null,
        status,
        attempts: progress?.attempts ?? 0,
        bestScore: progress?.bestScore ?? null,
        lastPassedAt: progress?.lastPassedAt ?? null,
        freshnessDaysLeft: progress?.lastPassedAt ? freshnessDaysLeft(progress.lastPassedAt) : null,
      };
    });
    return { branches: BRANCHES, nodes };
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    const now = new Date();
    const items: Notification[] = [];
    const passed = await this.passedSlugs(userId);

    const reviewed = await this.prisma.peerReview.findMany({
      where: { authorId: userId, status: ReviewStatus.REVIEWED, helpful: null },
      select: { id: true, checks: true, checklist: true, reviewedAt: true, scenario: { select: { title: true } } },
      orderBy: { reviewedAt: 'desc' },
      take: 5,
    });
    for (const review of reviewed) {
      const total = Array.isArray(review.checklist) ? review.checklist.length : 0;
      items.push({
        id: `review-${review.id}`, type: 'review_received', link: '/reviews',
        title: 'Коллега проверил ваш ответ',
        text: `«${review.scenario.title}»: ${review.checks.length} из ${total} критериев. Оцените, была ли проверка полезной.`,
        createdAt: review.reviewedAt ?? now,
      });
    }

    if (passed.size > 0) {
      const queue = await this.prisma.peerReview.count({
        where: { status: ReviewStatus.PENDING, authorId: { not: userId }, scenario: { slug: { in: [...passed] } } },
      });
      if (queue > 0) {
        items.push({
          id: 'queue', type: 'review_queue', link: '/reviews',
          title: `Ответы коллег ждут проверки: ${queue}`,
          text: 'За каждую проверку - балл проверки, опыт и коины. Баллы нужны, чтобы сдать свой ответ.',
          createdAt: now,
        });
      }
    }

    const map = await this.getMap(userId);
    for (const node of map.nodes) {
      if (node.status !== 'passed' || node.freshnessDaysLeft === null || node.freshnessDaysLeft > 5) continue;
      items.push({
        id: `fading-${node.slug}`, type: 'skill_fading', link: '/',
        title: node.freshnessDaysLeft <= 0 ? `«${node.title}»: пора повторить` : `«${node.title}»: навык скоро выветрится`,
        text: node.freshnessDaysLeft <= 0
          ? 'Больше 30 дней без практики. Пройдите сценарий ещё раз, чтобы навык снова стал свежим.'
          : `Осталось дней: ${node.freshnessDaysLeft}. Повторите сценарий, чтобы не потерять форму.`,
        createdAt: now,
      });
    }

    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const achievements = await this.prisma.userAchievement.findMany({
      where: { userId, unlockedAt: { gte: weekAgo } },
      select: { unlockedAt: true, achievement: { select: { code: true, title: true, description: true } } },
      orderBy: { unlockedAt: 'desc' },
      take: 3,
    });
    for (const item of achievements) {
      items.push({
        id: `achievement-${item.achievement.code}`, type: 'achievement', link: '/profile',
        title: `Новое достижение «${item.achievement.title}»`, text: item.achievement.description,
        createdAt: item.unlockedAt,
      });
    }

    for (const node of map.nodes.filter((item) => item.status === 'available')) {
      items.push({
        id: `open-${node.slug}`, type: 'scenario_open', link: '/',
        title: `Открыт сценарий «${node.title}»`, text: `${node.xpReward} XP за первый зачёт.`,
        createdAt: now,
      });
    }

    const tribes = await this.getTribes(userId);
    const mine = tribes.tribes.find((tribe) => tribe.slug === tribes.myTribe);
    if (mine) {
      const leader = tribes.tribes[0];
      items.push({
        id: 'tribe', type: 'tribe', link: '/rating',
        title: mine.rank === 1 ? `Племя «${mine.name}» лидирует в сезоне` : `Племя «${mine.name}» на ${mine.rank}-м месте`,
        text: mine.rank === 1
          ? `Отрыв от второго места: ${mine.points - (tribes.tribes[1]?.points ?? 0)} XP. Держите темп.`
          : `До лидера («${leader.name}») ${leader.points - mine.points} XP. Ваш вклад в сезоне: ${tribes.myContribution} XP.`,
        createdAt: now,
      });
    }

    const priority: Record<Notification['type'], number> = {
      review_received: 0, achievement: 1, scenario_open: 2, skill_fading: 3, review_queue: 4, tribe: 5,
    };
    return items.sort((a, b) => priority[a.type] - priority[b.type] || b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Племена соревнуются опытом, заработанным в текущем сезоне
  async getTribes(userId: string) {
    const season = currentSeason();
    const [tribes, me] = await Promise.all([
      this.prisma.tribe.findMany({
        select: { id: true, slug: true, name: true, color: true, motto: true, _count: { select: { users: { where: { role: UserRole.PLAYER } } } } },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { tribeId: true } }),
    ]);
    const earned = await this.prisma.pointsLedger.groupBy({
      by: ['userId'],
      where: { track: TRACK_XP, createdAt: { gte: season.startsAt, lt: season.endsAt }, user: { tribeId: { not: null }, role: UserRole.PLAYER } },
      _sum: { amount: true },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: earned.map((row) => row.userId) } },
      select: { id: true, tribeId: true, displayName: true },
    });
    const byUser = new Map(users.map((user) => [user.id, user]));
    const points = new Map<string, number>();
    const contributors = new Map<string, { displayName: string; points: number }[]>();
    let myContribution = 0;
    for (const row of earned) {
      const user = byUser.get(row.userId);
      if (!user?.tribeId) continue;
      const amount = row._sum.amount ?? 0;
      points.set(user.tribeId, (points.get(user.tribeId) ?? 0) + amount);
      contributors.set(user.tribeId, [...(contributors.get(user.tribeId) ?? []), { displayName: user.displayName, points: amount }]);
      if (user.id === userId) myContribution = amount;
    }
    const ranked = tribes
      .map((tribe) => ({
        slug: tribe.slug, name: tribe.name, color: tribe.color, motto: tribe.motto,
        members: tribe._count.users,
        points: points.get(tribe.id) ?? 0,
        top: (contributors.get(tribe.id) ?? []).sort((a, b) => b.points - a.points).slice(0, 3),
        isMine: tribe.id === me?.tribeId,
      }))
      .sort((a, b) => b.points - a.points)
      .map((tribe, index) => ({ ...tribe, rank: index + 1 }));
    return {
      season: {
        title: season.title, startsAt: season.startsAt, endsAt: season.endsAt,
        daysLeft: Math.max(0, Math.ceil((season.endsAt.getTime() - Date.now()) / 86_400_000)),
      },
      tribes: ranked,
      myTribe: ranked.find((tribe) => tribe.isMine)?.slug ?? null,
      myContribution,
    };
  }
}
