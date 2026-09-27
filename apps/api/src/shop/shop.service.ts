import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TRACK_COINS } from '../gamification/constants';
import { lockUser } from '../reviews/reviews.service';
import { ledgerBalances, refreshUserProgress } from '../scoring/progress';

// Магазин коинов как в Школе 21. Каталог наград настраивает HR, покупка - это заявка руководителю.
@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const [items, stats, purchases] = await Promise.all([
      this.prisma.shopItem.findMany({
        where: { isActive: true },
        select: { code: true, title: true, description: true, icon: true, price: true },
        orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
      }),
      this.prisma.userStats.findUnique({ where: { userId }, select: { coins: true } }),
      this.prisma.purchase.findMany({
        where: { userId },
        select: { id: true, price: true, status: true, createdAt: true, item: { select: { code: true, title: true, icon: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return { coins: stats?.coins ?? 0, items, purchases };
  }

  async buy(userId: string, code: string) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.shopItem.findFirst({ where: { code, isActive: true } });
      if (!item) throw new NotFoundException('Такой награды нет');
      await lockUser(tx, userId);
      const coins = (await ledgerBalances(tx, userId))[TRACK_COINS] ?? 0;
      if (coins < item.price) throw new ConflictException(`Не хватает коинов: нужно ${item.price}, у вас ${coins}`);
      const purchase = await tx.purchase.create({
        data: { userId, itemId: item.id, price: item.price },
        select: { id: true, price: true, status: true, createdAt: true },
      });
      await tx.pointsLedger.create({ data: { userId, track: TRACK_COINS, amount: -item.price, reason: 'purchase', externalRef: purchase.id } });
      await refreshUserProgress(tx, userId);
      return { purchase: { ...purchase, item: { code: item.code, title: item.title, icon: item.icon } }, coins: coins - item.price };
    });
  }
}
