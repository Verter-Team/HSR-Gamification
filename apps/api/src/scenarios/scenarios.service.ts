import { Injectable } from '@nestjs/common';
import { VersionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ScenariosService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublished() {
    const scenarios = await this.prisma.scenario.findMany({
      where: { isActive: true, versions: { some: { status: VersionStatus.PUBLISHED } } },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        branch: true,
        tier: true,
        xpReward: true,
        requires: true,
        skills: true,
        difficulty: true,
        estimatedMinutes: true,
        versions: {
          where: { status: VersionStatus.PUBLISHED },
          select: { id: true, version: true, graph: true },
        },
      },
      orderBy: [{ tier: 'asc' }, { slug: 'asc' }],
    });

    return scenarios.map(({ versions, ...scenario }) => ({
      ...scenario,
      versionId: versions[0].id,
      version: versions[0].version,
      graph: versions[0].graph,
    }));
  }
}
