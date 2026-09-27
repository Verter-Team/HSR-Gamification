// Прогон сценария демо через HTTP. Меняет данные, поэтому запускать на стенде сразу после seed,
// а перед показом повторить seed. Запуск: API_BASE=http://127.0.0.1:3000 node --import tsx scripts/demo-smoke.ts
import { randomUUID } from 'node:crypto';
import {
  advance, applyChoice, createSession, currentNode, isFinished, parseGraph, ScenarioGraph, summarize,
} from '@vsm/scenario-engine';

const base = process.env.API_BASE ?? 'http://127.0.0.1:3000';

async function call<T>(path: string, options: { token?: string; body?: unknown } = {}): Promise<{ status: number; data: T }> {
  const response = await fetch(`${base}${path}`, {
    method: options.body === undefined ? 'GET' : 'POST',
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return { status: response.status, data: (text ? JSON.parse(text) : null) as T };
}

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(`Не прошло: ${message}`);
  process.stdout.write(`  ok  ${message}\n`);
}

function playBest(graph: ScenarioGraph) {
  let state = createSession(graph);
  for (;;) {
    while (!isFinished(state) && currentNode(graph, state).kind === 'scene') state = advance(graph, state);
    if (isFinished(state)) break;
    const node = currentNode(graph, state);
    if (node.kind !== 'choice') throw new Error('Ожидался выбор');
    const best = node.options.find((option) => option.feedback?.verdict === 'correct') ?? node.options[0];
    state = applyChoice(graph, state, best.id, 1800);
  }
  return { events: state.events, summary: summarize(graph, state) };
}

async function login(externalId: string): Promise<string> {
  const { status, data } = await call<{ accessToken: string }>('/auth/login', { body: { externalId, password: 'demo' } });
  if (status !== 200) throw new Error(`Вход ${externalId}: HTTP ${status}. Запустите seed.`);
  return data.accessToken;
}

async function main(): Promise<void> {
  process.stdout.write(`Проверка демо на ${base}\n`);
  check((await call('/health')).status === 200, 'API и база живы');
  const token = await login('4471');

  const me = (await call<any>('/me', { token })).data;
  check(me.level.level === 2, `демо-сотрудник на 2 уровне (${me.level.xp} XP, ${me.level.rank})`);
  check(me.skills.length >= 5, `радар навыков: ${me.skills.map((skill: any) => `${skill.title} ${skill.percent}%`).join(', ')}`);

  const map = (await call<any>('/me/map', { token })).data;
  const status = (slug: string) => map.nodes.find((node: any) => node.slug === slug)?.status;
  check(status('medical-incident') === 'in_progress' && status('emergency-stop') === 'locked', 'граф: медицина в процессе, задымление закрыто');
  check(map.nodes.filter((node: any) => node.status === 'soon').length === 5, 'в графе 5 сценариев «скоро»');

  const scenarios = (await call<any[]>('/scenarios', { token })).data;
  const medical = scenarios.find((scenario) => scenario.slug === 'medical-incident');
  const graph = parseGraph(medical.graph);
  const run = playBest(graph);
  const attemptId = randomUUID();
  const submitted = await call<any>('/attempts', {
    token,
    body: { attemptId, scenarioVersionId: medical.versionId, startedAt: new Date(Date.now() - 300_000).toISOString(), clientScore: run.summary.score, events: run.events },
  });
  check(submitted.status === 202 && submitted.data.status === 'scored', `медицина пройдена на сервере: ${run.summary.score} очков`);
  const rewards = submitted.data.rewards;
  check(rewards.levelAfter === 3 && rewards.levelBefore === 2, `повышение уровня 2 -> 3, +${rewards.xp} XP, +${rewards.coins} коинов`);
  check(rewards.unlockedScenarios.some((item: any) => item.slug === 'emergency-stop'), 'открылся сценарий «Задымление в вагоне»');
  check(rewards.newAchievements.length > 0, `новые достижения: ${rewards.newAchievements.map((item: any) => item.title).join(', ')}`);

  const fake = await call<any>('/attempts', {
    token,
    body: { attemptId: randomUUID(), scenarioVersionId: medical.versionId, startedAt: new Date().toISOString(), events: [{ seq: 0, nodeId: 'q3', optionId: 'a', reactionMs: 100 }] },
  });
  check(fake.data.status === 'invalid', 'подделанный лог решений не засчитан');

  const answer = await call<any>('/reviews', {
    token,
    body: { attemptId, answer: 'Мужчина около 55 лет, боль в груди с 14:10, в 14:18 потерял сознание. Начали СЛР 30:2, подключили АНД, лекарств не давали.' },
  });
  check(answer.status === 201, 'ответ для взаимной проверки отправлен, списан балл проверки');

  const queue = (await call<any>('/reviews/queue', { token })).data;
  check(queue.items.length > 0, `в очереди на проверку ${queue.items.length} ответов коллег`);
  const item = queue.items[0];
  const evaluated = await call<any>(`/reviews/${item.id}/evaluate`, {
    token,
    body: { checks: item.checklist.slice(0, 3).map((point: any) => point.id), comment: 'Спокойно и по делу, не хватило конкретного следующего шага.' },
  });
  check(evaluated.status === 200, `проверил коллегу: +${evaluated.data.rewards.xp} XP, +${evaluated.data.rewards.reviewPoints} балл проверки`);

  const mine = (await call<any>('/reviews/mine', { token })).data;
  const toRate = mine.submitted.find((review: any) => review.status === 'reviewed' && review.helpful === null);
  if (toRate) check((await call(`/reviews/${toRate.id}/rate`, { token, body: { helpful: true } })).status === 200, 'оценил полученную проверку как полезную');

  const shop = (await call<any>('/shop', { token })).data;
  const affordable = shop.items.filter((entry: any) => entry.price <= shop.coins).pop();
  check(affordable, `в магазине хватает на «${affordable?.title}» (${shop.coins} коинов)`);
  check((await call(`/shop/${affordable.code}/buy`, { token, body: {} })).status === 201, 'награда куплена, заявка ушла руководителю');

  const tribes = (await call<any>('/tribes', { token })).data;
  check(tribes.tribes.length === 4, `племена: ${tribes.tribes.map((tribe: any) => `${tribe.name} ${tribe.points}`).join(', ')}`);
  const board = (await call<any>('/leaderboard?limit=5', { token })).data;
  check(board.entries[0].xp >= board.entries[1].xp, `лидер рейтинга: ${board.entries[0].displayName}, уровень ${board.entries[0].level}`);
  const notifications = (await call<any[]>('/me/notifications', { token })).data;
  check(notifications.length > 0, `уведомлений: ${notifications.length}`);

  check((await call('/analytics/overview', { token })).status === 403, 'проводнику аналитика недоступна');
  const boss = await login('1001');
  const overview = (await call<any>('/analytics/overview', { token: boss })).data;
  const hardest = overview.hardestSteps[0];
  check(hardest, `руководитель видит самый трудный шаг: «${hardest.prompt}» - ошибаются ${hardest.errorRate}%`);
  process.stdout.write('Демо-сценарий работает от начала до конца\n');
}

void main().catch((error) => { process.stderr.write(`${String(error)}\n`); process.exitCode = 1; });
