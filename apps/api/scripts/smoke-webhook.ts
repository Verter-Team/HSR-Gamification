// Ручная проверка: DATABASE_URL=... node --import tsx scripts/smoke-webhook.ts
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import 'reflect-metadata';

async function main(): Promise<void> {
  const secret = 'local-webhook-smoke-secret';
  const received: { valid: boolean; payload: any; id: string }[] = [];
  const receiver = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString('utf8');
    const timestamp = String(request.headers['x-webhook-timestamp']);
    const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
    const actual = String(request.headers['x-webhook-signature']);
    const valid = expected.length === actual.length && timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
    received.push({ valid, payload: JSON.parse(body), id: String(request.headers['x-webhook-id']) });
    response.writeHead(received.length === 1 ? 500 : 204);
    response.end();
  });
  await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
  const receiverPort = (receiver.address() as { port: number }).port;
  process.env.WEBHOOK_URL = `http://127.0.0.1:${receiverPort}/attempt-scored`;
  process.env.WEBHOOK_SECRET = secret;
  process.env.JWT_SECRET ??= 'local-smoke-jwt-secret';

  const [{ NestFactory }, { AppModule }, { PrismaService }, engine] = await Promise.all([
    import('@nestjs/core'), import('../dist/app.module.js'), import('../dist/prisma/prisma.service.js'), import('@vsm/scenario-engine'),
  ]);
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  try {
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ externalId: '4471', password: 'demo' }),
    });
    if (!login.ok) throw new Error(`Вход: HTTP ${login.status}`);
    const { accessToken, user } = await login.json() as { accessToken: string; user: { id: string } };
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const scenarios = await (await fetch(`${base}/scenarios`, { headers })).json() as { slug: string; versionId: string; graph: unknown }[];
    const intro = scenarios.find((scenario) => scenario.slug === 'first-shift');
    if (!intro) throw new Error('Нет сценария first-shift, запустите seed');
    const graph = engine.parseGraph(intro.graph);
    // Все верные ответы: сцены пролистываются, на выборе берётся вариант с оценкой "верно"
    let state = engine.createSession(graph);
    for (;;) {
      while (!engine.isFinished(state) && engine.currentNode(graph, state).kind === 'scene') state = engine.advance(graph, state);
      if (engine.isFinished(state)) break;
      const node = engine.currentNode(graph, state);
      if (node.kind !== 'choice') throw new Error('Ожидался выбор');
      state = engine.applyChoice(graph, state, node.options.find((option) => option.feedback?.verdict === 'correct')!.id, 1800);
    }
    const expected = engine.summarize(graph, state);
    const readStats = async () => {
      const response = await fetch(`${base}/users/${user.id}/stats`, { headers });
      if (!response.ok) throw new Error(`Статистика: HTTP ${response.status}`);
      return response.json() as Promise<{ totalScore: number; attemptsCount: number; passedCount: number }>;
    };
    const before = await readStats();
    const attemptId = randomUUID();
    const submitted = await fetch(`${base}/attempts`, {
      method: 'POST', headers,
      body: JSON.stringify({
        attemptId, scenarioVersionId: intro.versionId, startedAt: new Date().toISOString(), clientScore: expected.score,
        events: state.events,
      }),
    });
    if (submitted.status !== 202) throw new Error(`Отправка: HTTP ${submitted.status}: ${await submitted.text()}`);
    const accepted = await submitted.json() as { status: string };
    if (accepted.status !== 'scored') throw new Error(`После POST: ${JSON.stringify(accepted)}`);
    const result = await (await fetch(`${base}/attempts/${attemptId}`, { headers })).json() as { status: string; score: number };
    if (result.status !== 'scored' || result.score !== expected.score) throw new Error(`Результат: ${JSON.stringify(result)}`);
    const after = await readStats();
    if (after.totalScore !== before.totalScore + expected.score || after.attemptsCount !== before.attemptsCount + 1 ||
        after.passedCount !== before.passedCount + 1) {
      throw new Error(`Статистика: до=${JSON.stringify(before)}, после=${JSON.stringify(after)}`);
    }
    const prisma = app.get(PrismaService);
    const ledger = await prisma.pointsLedger.findMany({ where: { attemptId } });
    const service = ledger.find((entry) => entry.track === 'service');
    if (!service || service.amount !== expected.tracks.service) {
      throw new Error(`Начисления: ${JSON.stringify(ledger)}`);
    }
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const row = await prisma.webhookEvent.findUnique({ where: { attemptId } });
      if (row?.status === 'DELIVERED') break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const row = await prisma.webhookEvent.findUniqueOrThrow({ where: { attemptId } });
    if (row.status !== 'DELIVERED' || row.attempts !== 2 || received.length !== 2 ||
        received.some((item) => !item.valid || item.id !== row.id || item.payload.attemptId !== attemptId ||
          item.payload.event !== 'attempt.scored' || item.payload.xapi.actor.account.name !== '4471')) {
      throw new Error(`Webhook: status=${row.status}, attempts=${row.attempts}, received=${JSON.stringify(received)}`);
    }
    process.stdout.write(`OK: login -> scenarios -> replay на сервере -> scored -> stats +${expected.score} -> ledger -> signed webhook (500, 204), attemptId=${attemptId}\n`);
  } finally {
    await app.close();
    receiver.close();
  }
}

void main().catch((error) => { process.stderr.write(`${String(error)}\n`); process.exitCode = 1; });
