import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateAchievementRule, RuleAttempt } from '../src/achievements/rules';
import { currentSeason } from '../src/gamification/constants';

const attempt = (slug: string, passed: boolean, safety: number): RuleAttempt => ({
  id: `${slug}-${safety}`, score: passed ? 260 : 120, passed, metrics: { safety }, timeouts: 0,
  scoredAt: new Date('2026-09-20T12:00:00Z'), scenarioSlug: slug,
});

test('достижения Школы 21: уровень, проверки коллег и сценарии', () => {
  const history = [attempt('first-shift', true, 80), attempt('medical-incident', true, 95)];
  assert.equal(evaluateAchievementRule({ level: { cmp: 'gte', value: 3 } }, [], { level: 3, reviewsGiven: 0 }), true);
  assert.equal(evaluateAchievementRule({ level: { cmp: 'gte', value: 3 } }, [], { level: 2, reviewsGiven: 0 }), false);
  assert.equal(evaluateAchievementRule({ reviewsGiven: { cmp: 'gte', value: 1 } }, [], { level: 0, reviewsGiven: 1 }), true);
  assert.equal(evaluateAchievementRule({ passedScenario: 'first-shift' }, history), true);
  assert.equal(evaluateAchievementRule({ distinctPassed: { cmp: 'gte', value: 2 } }, history), true);
  const lifesaver = { all: [{ scenario: 'medical-incident' }, { metric: 'safety', cmp: 'gte', value: 90 }] };
  assert.equal(evaluateAchievementRule(lifesaver, history), true);
  assert.equal(evaluateAchievementRule(lifesaver, history.slice(0, 1)), false, 'медицина ещё не пройдена');
});

test('сезон племён - три месяца, осень с сентября по ноябрь', () => {
  const autumn = currentSeason(new Date('2026-10-03T10:00:00Z'));
  assert.equal(autumn.title, 'Осенний сезон');
  assert.equal(autumn.startsAt.toISOString(), '2026-09-01T00:00:00.000Z');
  assert.equal(autumn.endsAt.toISOString(), '2026-12-01T00:00:00.000Z');
  const winter = currentSeason(new Date('2027-01-15T10:00:00Z'));
  assert.equal(winter.title, 'Зимний сезон');
  assert.equal(winter.startsAt.toISOString(), '2026-12-01T00:00:00.000Z');
});
