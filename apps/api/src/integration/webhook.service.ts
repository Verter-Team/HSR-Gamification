import { createHmac } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, WebhookStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MAX_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 5000;
const LEASE_MS = 30000;

@Injectable()
export class WebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookService.name);
  private readonly url = process.env.WEBHOOK_URL;
  private readonly secret = process.env.WEBHOOK_SECRET;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {
    if (Boolean(this.url) !== Boolean(this.secret)) {
      throw new Error('WEBHOOK_URL и WEBHOOK_SECRET нужно задавать вместе');
    }
    if (this.url) {
      if (process.env.NODE_ENV === 'production' && (this.secret!.length < 32 || this.secret!.startsWith('replace-'))) {
        throw new Error('WEBHOOK_SECRET должен быть случайной строкой длиной не менее 32 символов');
      }
      const target = new URL(this.url);
      if (target.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname))) {
        throw new Error('WEBHOOK_URL должен использовать HTTPS (HTTP разрешён только для локальной проверки)');
      }
    }
  }

  onModuleInit(): void {
    if (!this.url) {
      this.logger.warn('Webhook отключён: задайте WEBHOOK_URL и WEBHOOK_SECRET; события останутся в БД');
      return;
    }
    this.timer = setInterval(() => void this.drain(), 3000);
    this.timer.unref();
    void this.drain();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const ready = await this.prisma.webhookEvent.findMany({
        where: {
          status: { in: [WebhookStatus.PENDING, WebhookStatus.SENDING] },
          nextAttemptAt: { lte: now },
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const event of ready) await this.deliver(event);
    } catch (error) {
      this.logger.error(`Ошибка обработки webhook: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async deliver(event: Prisma.WebhookEventGetPayload<object>): Promise<void> {
    if (event.attempts >= MAX_ATTEMPTS) {
      await this.prisma.webhookEvent.updateMany({
        where: { id: event.id, status: event.status, attempts: event.attempts, nextAttemptAt: event.nextAttemptAt },
        data: { status: WebhookStatus.FAILED, lastError: event.lastError ?? 'Попытки доставки исчерпаны' },
      });
      return;
    }
    const claim = await this.prisma.webhookEvent.updateMany({
      where: { id: event.id, status: event.status, attempts: event.attempts, nextAttemptAt: event.nextAttemptAt },
      data: { status: WebhookStatus.SENDING, attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + LEASE_MS) },
    });
    if (!claim.count) return;
    const attempts = event.attempts + 1;
    try {
      const body = JSON.stringify(event.payload);
      const timestamp = new Date().toISOString();
      const signature = createHmac('sha256', this.secret!).update(`${timestamp}.${body}`).digest('hex');
      const response = await fetch(this.url!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event.eventType,
          'X-Webhook-Id': event.id,
          'X-Webhook-Timestamp': timestamp,
          'X-Webhook-Signature': `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await this.prisma.webhookEvent.updateMany({
        where: { id: event.id, status: WebhookStatus.SENDING, attempts },
        data: { status: WebhookStatus.DELIVERED, deliveredAt: new Date(), lastError: null },
      });
    } catch (error) {
      const failed = attempts >= MAX_ATTEMPTS;
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.webhookEvent.updateMany({
        where: { id: event.id, status: WebhookStatus.SENDING, attempts },
        data: {
          status: failed ? WebhookStatus.FAILED : WebhookStatus.PENDING,
          nextAttemptAt: new Date(Date.now() + Math.min(60000, 5000 * 2 ** (attempts - 1))),
          lastError: message.slice(0, 500),
        },
      });
      this.logger.warn(`Webhook ${event.id}: ${message}${failed ? ' (попытки исчерпаны)' : ''}`);
    }
  }
}
