import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AttemptStatus, VersionStatus } from '@prisma/client';
import { AttemptsService } from '../src/attempts/attempts.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { CreateAttemptDto } from '../src/attempts/dto/create-attempt.dto';
import { ScoringQueue } from '../src/scoring/scoring-queue';

// Очередь скоринга подменяется: здесь проверяется только сохранение и идемпотентность
class FakeQueue extends ScoringQueue {
  calls: string[] = [];
  async enqueue(attemptId: string) {
    this.calls.push(attemptId);
    return { status: 'scored' as const };
  }
}

test('сохраняет события, сразу отдаёт на подсчёт и повторный запрос не создаёт вторую попытку', async () => {
  const attemptId = '5c590082-8e61-44b4-8c2c-6e6d5d7f9451';
  const userId = '578ac298-7f8f-49ea-9aba-18192069aa12';
  const scenarioVersionId = 'fb09dc41-4e9e-4fb7-89df-ec5a626c90c8';
  const body: CreateAttemptDto = {
    attemptId,
    scenarioVersionId,
    startedAt: '2026-09-25T12:00:00.000Z',
    clientScore: 120,
    events: [{ seq: 0, nodeId: 'first_choice', optionId: 'call_help', reactionMs: 1800 }],
  };
  let saved: any;
  let writes = 0;
  const prisma = {
    attempt: {
      findUnique: async () => saved ?? null,
      create: async ({ data }: any) => {
        writes += 1;
        saved = {
          ...data,
          startedAt: data.startedAt,
          events: data.events.create,
        };
        return saved;
      },
    },
    user: { findUnique: async () => ({ id: userId }) },
    scenarioVersion: {
      findUnique: async () => ({ status: VersionStatus.PUBLISHED, scenario: { isActive: true } }),
    },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback(prisma),
  } as unknown as PrismaService;

  const queue = new FakeQueue();
  const service = new AttemptsService(prisma, queue);
  assert.deepEqual(await service.submit(body, userId), { attemptId, status: 'scored' });
  assert.equal(writes, 1);
  assert.deepEqual(queue.calls, [attemptId]);
  assert.equal(saved.events[0].nodeId, 'first_choice');
  assert.equal(saved.score, undefined, 'клиентские очки не сохраняются как результат');
  assert.deepEqual(await service.submit(body, userId), { attemptId, status: 'submitted' });
  assert.equal(writes, 1);
  assert.equal(queue.calls.length, 1, 'повтор не пересчитывается второй раз');
  await assert.rejects(() => service.submit({ ...body, clientScore: 999 }, userId), ConflictException);
  await assert.rejects(() => service.submit(body, '09cb8994-9b8c-4c23-a187-989cbbd99d58'), NotFoundException);
});

test('возвращает текущее состояние и подтверждённый результат попытки', async () => {
  const attemptId = '5c590082-8e61-44b4-8c2c-6e6d5d7f9451';
  const record = {
    id: attemptId,
    scenarioVersionId: 'fb09dc41-4e9e-4fb7-89df-ec5a626c90c8',
    status: AttemptStatus.SUBMITTED,
    outcome: null as string | null,
    score: null as number | null,
    passed: null as boolean | null,
    metrics: null as Record<string, number> | null,
    tracks: null as Record<string, number> | null,
    timeouts: 0,
    avgReactionMs: null as number | null,
    startedAt: new Date('2026-09-25T12:00:00.000Z'),
    submittedAt: new Date('2026-09-25T12:01:00.000Z'),
    scoredAt: null as Date | null,
  };
  const prisma = {
    attempt: { findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
      where.id === attemptId && where.userId === '578ac298-7f8f-49ea-9aba-18192069aa12' ? record : null },
  } as unknown as PrismaService;
  const service = new AttemptsService(prisma, new FakeQueue());
  const ownerId = '578ac298-7f8f-49ea-9aba-18192069aa12';

  const pending = await service.getResult(attemptId, ownerId);
  assert.equal(pending.status, 'submitted');
  assert.equal(pending.score, null);
  assert.equal(pending.scoredAt, null);

  record.status = AttemptStatus.SCORED;
  record.outcome = 'success';
  record.score = 180;
  record.passed = true;
  record.metrics = { safety: 70, loyalty: 50 };
  record.tracks = { emergency: 15 };
  record.avgReactionMs = 1800;
  record.scoredAt = new Date('2026-09-25T12:01:02.000Z');
  const scored = await service.getResult(attemptId, ownerId);
  assert.equal(scored.status, 'scored');
  assert.equal(scored.score, 180);
  assert.deepEqual(scored.tracks, { emergency: 15 });

  await assert.rejects(() => service.getResult('242c9c30-c8a0-455e-9576-ec98c5818447', ownerId), NotFoundException);
  await assert.rejects(() => service.getResult(attemptId, '09cb8994-9b8c-4c23-a187-989cbbd99d58'), NotFoundException);
});
