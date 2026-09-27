import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  advance, applyChoice, applyTimeout, createSession, currentNode, isFinished,
  lintGraph, replay, ScenarioError, summarize,
} from '../src/index';
import type { ScenarioGraph, SessionState } from '../src/types';

function load(slug: string): ScenarioGraph {
  return JSON.parse(readFileSync(join(__dirname, '../../../content/scenarios', `${slug}.json`), 'utf8')) as ScenarioGraph;
}

function skipScenes(graph: ScenarioGraph, state: SessionState): SessionState {
  let current = state;
  while (!isFinished(current) && currentNode(graph, current).kind === 'scene') current = advance(graph, current);
  return current;
}

function play(graph: ScenarioGraph, choices: (string | null)[]): SessionState {
  let state = skipScenes(graph, createSession(graph));
  for (const choice of choices) {
    state = choice === null ? applyTimeout(graph, state) : applyChoice(graph, state, choice, 2000);
    state = skipScenes(graph, state);
  }
  return state;
}

test('правильные решения в медицинском сценарии ведут к хорошему финалу и зачёту', () => {
  const graph = load('medical-incident');
  const state = play(graph, ['a', 'a', 'a']);
  assert.equal(isFinished(state), true);
  const summary = summarize(graph, state);
  assert.equal(summary.outcome, 'success');
  assert.equal(summary.passed, true);
  assert.equal(summary.metrics.safety, 100);
  assert.equal(summary.timeouts, 0);
  assert.ok(summary.tracks.first_aid > 0, 'растёт компетенция первой помощи');
  assert.equal(summary.decisions.every((decision) => decision.verdict === 'correct'), true);
});

test('таймер и ошибки ведут к провалу, разбор объясняет каждое решение', () => {
  const graph = load('medical-incident');
  const state = play(graph, [null, 'b']);
  const summary = summarize(graph, state);
  assert.equal(summary.outcome, 'failure');
  assert.equal(summary.passed, false);
  assert.equal(summary.timeouts, 1);
  assert.equal(summary.decisions[0].timedOut, true);
  assert.ok(summary.decisions.every((decision) => decision.feedback), 'у каждого решения есть разбор');
});

test('шкалы не выходят за границы 0-100', () => {
  const graph = load('emergency-stop');
  const state = play(graph, ['b', 'b']);
  const summary = summarize(graph, state);
  assert.ok(summary.metrics.safety >= 0 && summary.metrics.safety <= 100);
  assert.ok(summary.metrics.loyalty >= 0 && summary.metrics.loyalty <= 100);
});

test('развилка по шкалам выбирает финал в интенсиве', () => {
  const graph = load('first-shift');
  assert.equal(summarize(graph, play(graph, ['a', 'a', 'a', 'a'])).outcome, 'success');
  assert.equal(summarize(graph, play(graph, ['a', 'a', 'b', 'a'])).outcome, 'partial');
  assert.equal(summarize(graph, play(graph, ['b', 'b', 'b', 'c'])).outcome, 'failure');
});

test('replay по логу даёт тот же результат, что и живое прохождение', () => {
  const graph = load('passenger-conflict');
  const live = play(graph, ['a', 'a', 'a']);
  const replayed = replay(graph, live.events);
  assert.deepEqual(summarize(graph, replayed), summarize(graph, live));
});

test('replay отклоняет подделанный лог', () => {
  const graph = load('passenger-conflict');
  const live = play(graph, ['a', 'a', 'a']);
  assert.throws(() => replay(graph, [{ ...live.events[0], nodeId: 'q3_service' }, ...live.events.slice(1)]), ScenarioError);
  assert.throws(() => replay(graph, [{ ...live.events[0], optionId: 'z' }, ...live.events.slice(1)]), ScenarioError);
  assert.throws(() => replay(graph, [{ ...live.events[0], reactionMs: 60_000 }, ...live.events.slice(1)]), ScenarioError, 'ответ после таймера');
  assert.throws(() => replay(graph, live.events.slice(0, 1)), ScenarioError, 'недоигранный сценарий');
  assert.throws(() => replay(graph, [...live.events, live.events[0]]), ScenarioError, 'решения после финала');
});

test('быстрый ответ даёт бонус за время', () => {
  const graph = load('passenger-conflict');
  let fast = skipScenes(graph, createSession(graph));
  let slow = fast;
  for (const choice of ['a', 'a', 'a']) {
    fast = skipScenes(graph, applyChoice(graph, fast, choice, 1000));
    slow = skipScenes(graph, applyChoice(graph, slow, choice, 11000));
  }
  assert.ok(summarize(graph, fast).score > summarize(graph, slow).score);
});

test('линтер находит битые ссылки, тупики и недостижимые узлы', () => {
  const graph = load('first-shift');
  assert.equal(lintGraph(graph).ok, true);
  const broken: ScenarioGraph = structuredClone(graph);
  (broken.nodes.q1 as { options: { next: string }[] }).options[0].next = 'nowhere';
  broken.nodes.orphan = { id: 'orphan', kind: 'scene', text: 'Никто сюда не попадёт', next: 'end_good' };
  const report = lintGraph(broken);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((issue) => issue.message.includes('nowhere')));
  assert.ok(report.errors.some((issue) => issue.nodeId === 'orphan'));
});

test('линтер предупреждает, если выбор ничего не решает', () => {
  const graph = load('first-shift');
  const flat: ScenarioGraph = structuredClone(graph);
  const q4 = flat.nodes.q4 as { options: { effects: unknown[] }[] };
  q4.options.forEach((option) => { option.effects = [{ op: 'metric', metric: 'safety', delta: 5 }]; });
  const warnings = lintGraph(flat).warnings.filter((issue) => issue.nodeId === 'q4').map((issue) => issue.message);
  assert.ok(warnings.some((message) => message.includes('ничего не решает')));
  assert.ok(warnings.some((message) => message.includes('нет цены')));
});
