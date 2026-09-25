import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './auth/public.decorator';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
@ApiTags('Сервис')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Проверить API и подключение к БД' })
  @ApiResponse({ status: 200, description: 'Сервис готов' })
  @ApiResponse({ status: 503, description: 'База недоступна' })
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('База недоступна');
    }
  }
}
