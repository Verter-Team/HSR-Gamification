import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateAchievementRule, RuleAttempt } from '../src/achievements/rules';

test('правила достижений учитывают метрики, серию и окно в 30 дней', () => {
  const first: RuleAttempt = {
    id: 'a', score: 180, passed: false, metrics: { safety: 30 }, timeouts: 1,
    scoredAt: new Date('2026-08-01T12:00:00Z'),
  };
  const second: RuleAttempt = {
    id: 'b', score: 220, passed: true, metrics: { safety: 70 }, timeouts: 0,
    scoredAt: new Date('2026-09-25T12:00:00Z'),
  };
  assert.equal(evaluateAchievementRule({ all: [{ metric: 'safety', cmp: 'gte', value: 70 }, { timeouts: { cmp: 'eq', value: 0 } }] }, [first, second]), true);
  assert.equal(evaluateAchievementRule({ attempts: { cmp: 'gte', value: 2 }, window: '30d' }, [first, second]), false);
  assert.equal(evaluateAchievementRule({ passed: { cmp: 'gte', value: 1 } }, [first, second]), true);
  assert.equal(evaluateAchievementRule({ score: { cmp: 'gte', value: 220 } }, [first, second]), true);
  assert.equal(evaluateAchievementRule({ metric: 'missing', cmp: 'gte', value: 1 }, [first, second]), false);
});
