import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AchievementsService {
  constructor(private readonly prisma: PrismaService) {}

  listCatalog() {
    return this.prisma.achievement.findMany({
      where: { isActive: true, isSecret: false },
      select: { code: true, title: true, description: true, icon: true, tier: true },
      orderBy: [{ tier: 'asc' }, { code: 'asc' }],
    });
  }

  async listForUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    const achievements = await this.prisma.achievement.findMany({
      where: {
        isActive: true,
        OR: [{ isSecret: false }, { users: { some: { userId } } }],
      },
      select: {
        code: true, title: true, description: true, icon: true, tier: true,
        users: { where: { userId }, select: { unlockedAt: true, attemptId: true } },
      },
      orderBy: [{ tier: 'asc' }, { code: 'asc' }],
    });
    return achievements.map(({ users, ...achievement }) => ({
      ...achievement,
      unlockedAt: users[0]?.unlockedAt ?? null,
      attemptId: users[0]?.attemptId ?? null,
    }));
  }
}
