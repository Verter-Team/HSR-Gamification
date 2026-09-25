// Запускать только на локальной тестовой БД с seed: API_BASE=... DATABASE_URL=... JWT_SECRET=... node --import tsx scripts/security-smoke.ts
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname)) {
    throw new Error('Проверка разрешена только на локальной тестовой БД');
  }
  const base = process.env.API_BASE ?? 'http://127.0.0.1:31017';
  const prisma = new PrismaClient();
  const created: string[] = [];
  try {
    const send = async (path: string, options: { token?: string; body?: unknown; method?: string; origin?: string } = {}) => {
      const response = await fetch(`${base}${path}`, {
        method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
        headers: {
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          ...(options.origin ? { Origin: options.origin } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      return { status: response.status, headers: response.headers, body: await response.text() };
    };
    const login = await send('/auth/login', { body: { externalId: '4471', password: 'demo' } });
    if (login.status !== 200) throw new Error(`Нужен seed: вход HTTP ${login.status}`);
    const owner = JSON.parse(login.body) as { accessToken: string; user: { id: string } };
    const other = await prisma.user.findUniqueOrThrow({ where: { externalId: '4401' } });
    const otherToken = await new JwtService({ secret: process.env.JWT_SECRET }).signAsync({ sub: other.id });
    const scenarios = await send('/scenarios', { token: owner.accessToken });
    const versionId = (JSON.parse(scenarios.body) as { versionId: string }[])[0].versionId;
    const body = (attemptId = randomUUID()) => ({
      attemptId, scenarioVersionId: versionId, startedAt: new Date().toISOString(),
      events: [{ seq: 0, nodeId: 'first_choice', optionId: 'call_help', reactionMs: 1800 }],
    });
    const attempt = body();
    const saved = await send('/attempts', { token: owner.accessToken, body: attempt });
    if (saved.status !== 202) throw new Error(`Не удалось создать тестовую попытку: HTTP ${saved.status}`);
    created.push(attempt.attemptId);
    const checks: [string, number | string, number | string][] = [];
    checks.push(['без токена', (await send('/scenarios')).status, 401]);
    checks.push(['поддельный токен', (await send('/scenarios', { token: `${owner.accessToken}x` })).status, 401]);
    const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: owner.user.id })).toString('base64url')}.`;
    checks.push(['JWT alg:none', (await send('/scenarios', { token: unsigned })).status, 401]);
    checks.push(['чужая попытка', (await send(`/attempts/${attempt.attemptId}`, { token: otherToken })).status, 404]);
    checks.push(['чужая статистика', (await send(`/users/${other.id}/stats`, { token: owner.accessToken })).status, 403]);
    checks.push(['чужие достижения', (await send(`/users/${other.id}/achievements`, { token: owner.accessToken })).status, 403]);
    checks.push(['подмена userId', (await send('/attempts', { token: owner.accessToken, body: { ...body(), userId: other.id } })).status, 400]);
    checks.push(['лишнее поле события', (await send('/attempts', { token: owner.accessToken, body: {
      ...body(), events: [{ seq: 0, nodeId: 'first_choice', optionId: 'call_help', reactionMs: 1800, score: 999999 }],
    } })).status, 400]);
    checks.push(['повтор той же попытки', (await send('/attempts', { token: owner.accessToken, body: attempt })).status, 202]);
    checks.push(['подмена повторной попытки', (await send('/attempts', { token: owner.accessToken, body: { ...attempt, clientScore: 999999 } })).status, 409]);
    checks.push(['чужой повтор attemptId', (await send('/attempts', { token: otherToken, body: attempt })).status, 404]);
    checks.push(['SQL-инъекция в логин', (await send('/auth/login', { body: { externalId: "' OR 1=1 --", password: 'demo' } })).status, 401]);
    checks.push(['длинный пароль', (await send('/auth/login', { body: { externalId: '4471', password: 'x'.repeat(257) } })).status, 400]);
    checks.push(['переполнение reactionMs', (await send('/attempts', {
      token: owner.accessToken, body: { ...body(), events: [{ seq: 0, nodeId: 'first_choice', optionId: 'call_help', reactionMs: 2_147_483_648 }] },
    })).status, 400]);
    checks.push(['переполнение clientScore', (await send('/attempts', { token: owner.accessToken, body: { ...body(), clientScore: 2_147_483_648 } })).status, 400]);
    const largeAttempt = body();
    const many = await send('/attempts', { token: owner.accessToken, body: {
      ...largeAttempt, events: Array.from({ length: 101 }, (_, seq) => ({ seq, nodeId: 'first_choice', optionId: 'call_help', reactionMs: 1 })),
    } });
    if (many.status === 202) created.push(largeAttempt.attemptId);
    checks.push(['101 событие', many.status, 400]);
    checks.push(['неверный limit', (await send('/leaderboard?limit=1000000', { token: owner.accessToken })).status, 400]);
    checks.push(['большое тело запроса', (await send('/auth/login', { body: { externalId: '4471', password: 'x'.repeat(120_000) } })).status, 413]);
    const cors = await send('/health', { origin: 'https://evil.example' });
    checks.push(['CORS для чужого Origin', cors.headers.get('access-control-allow-origin') ?? 'нет', 'нет']);
    const wrongPasswords: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      wrongPasswords.push((await send('/auth/login', { body: { externalId: '4471', password: `wrong-${i}` } })).status);
    }
    checks.push(['перебор пароля блокируется', wrongPasswords.includes(429) ? 'да' : 'нет', 'да']);
    for (const [name, value, expected] of checks) {
      process.stdout.write(`${name}: ${value}${value === expected ? '' : ` (ожидалось ${expected})`}\n`);
    }
    if (checks.some(([, value, expected]) => value !== expected)) throw new Error('Проверка безопасности не прошла');
  } finally {
    await prisma.attempt.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  }
}

void main().catch((error) => { process.stderr.write(`${String(error)}\n`); process.exitCode = 1; });
