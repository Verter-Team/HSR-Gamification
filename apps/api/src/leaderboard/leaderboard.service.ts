import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { rankFor } from '@vsm/scenario-engine';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  // Как в Школе 21: место определяет опыт, при равенстве - меньше попыток выше
  async list(depotId?: string, limit = 20) {
    const stats = await this.prisma.userStats.findMany({
      where: {
        attemptsCount: { gt: 0 },
        user: { role: UserRole.PLAYER, ...(depotId ? { orgUnitId: depotId } : {}) },
      },
      select: {
        userId: true, totalScore: true, attemptsCount: true, passedCount: true, xp: true, level: true,
        user: {
          select: {
            displayName: true,
            orgUnit: { select: { id: true, name: true } },
            tribe: { select: { slug: true, name: true, color: true } },
          },
        },
      },
      orderBy: [{ xp: 'desc' }, { attemptsCount: 'asc' }, { user: { displayName: 'asc' } }],
    });
    let rank = 0;
    const entries = stats.map((stat, index) => {
      if (index === 0 || stat.xp !== stats[index - 1].xp || stat.attemptsCount !== stats[index - 1].attemptsCount) {
        rank = index + 1;
      }
      return {
        rank, userId: stat.userId, displayName: stat.user.displayName,
        orgUnit: stat.user.orgUnit, tribe: stat.user.tribe,
        xp: stat.xp, level: stat.level, title: rankFor(stat.level),
        totalScore: stat.totalScore, attemptsCount: stat.attemptsCount, passedCount: stat.passedCount,
      };
    });
    return { scope: depotId ? 'depot' : 'global', depotId: depotId ?? null, entries: entries.slice(0, limit) };
  }
}
