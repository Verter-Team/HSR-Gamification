import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, displayName: true,
        orgUnit: { select: { id: true, name: true } },
        stats: { select: {
          totalScore: true, attemptsCount: true, passedCount: true,
          avgSafety: true, avgLoyalty: true, streakDays: true,
          lastAttemptAt: true, updatedAt: true,
        } },
      },
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return {
      userId: user.id,
      displayName: user.displayName,
      orgUnit: user.orgUnit,
      totalScore: user.stats?.totalScore ?? 0,
      attemptsCount: user.stats?.attemptsCount ?? 0,
      passedCount: user.stats?.passedCount ?? 0,
      avgSafety: user.stats?.avgSafety?.toNumber() ?? null,
      avgLoyalty: user.stats?.avgLoyalty?.toNumber() ?? null,
      streakDays: user.stats?.streakDays ?? 0,
      lastAttemptAt: user.stats?.lastAttemptAt ?? null,
      updatedAt: user.stats?.updatedAt ?? null,
    };
  }
}
