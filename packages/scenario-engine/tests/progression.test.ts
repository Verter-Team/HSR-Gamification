import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attemptRewards, ECONOMY, freshnessDaysLeft, levelInfo, MAX_LEVEL, xpForLevel } from '../src/progression';

test('уровни растут по возрастающей шкале и заканчиваются на 21-м', () => {
  assert.deepEqual([1, 2, 3, 4].map(xpForLevel), [200, 500, 900, 1400]);
  assert.equal(levelInfo(0).level, 0);
  assert.equal(levelInfo(199).level, 0);
  assert.equal(levelInfo(200).level, 1);
  const mid = levelInfo(700);
  assert.equal(mid.level, 2);
  assert.equal(mid.progress, 0.5);
  assert.equal(mid.rank, 'Проводник');
  const top = levelInfo(10_000_000);
  assert.equal(top.level, MAX_LEVEL);
  assert.equal(top.nextLevelXp, null);
  assert.equal(top.rank, 'Легенда ВСМ');
});

test('опыт даётся за первый зачёт, повтор приносит только долю', () => {
  assert.deepEqual(attemptRewards({ xpReward: 500, outcome: 'success', passed: true, firstPass: true }), { xp: 500, coins: ECONOMY.coinsFirstSuccess });
  assert.deepEqual(attemptRewards({ xpReward: 500, outcome: 'partial', passed: true, firstPass: true }), { xp: 350, coins: ECONOMY.coinsFirstPartial });
  assert.deepEqual(attemptRewards({ xpReward: 500, outcome: 'success', passed: true, firstPass: false }), { xp: 50, coins: ECONOMY.coinsRepeat });
  assert.deepEqual(attemptRewards({ xpReward: 500, outcome: 'failure', passed: false, firstPass: true }), { xp: 0, coins: 0 });
});

test('навык выветривается через 30 дней', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  assert.equal(freshnessDaysLeft(new Date('2026-09-20T12:00:00Z'), now), 23);
  assert.ok(freshnessDaysLeft(new Date('2026-08-20T12:00:00Z'), now) < 0);
});
