// Интерпретатор графа. Все функции чистые: получают состояние и возвращают новое.
// Один и тот же код крутит сценарий на телефоне и пересчитывает его на сервере.
import { evaluate } from './conditions';
import { applyEffects, criticalJump } from './effects';
import type {
  ChoiceNode, DecisionEvent, DecisionReview, EndingNode, Option,
  ScenarioGraph, ScenarioNode, SessionState, SessionSummary,
} from './types';

// Запас на задержку сети и отрисовки, прежде чем ответ после таймера считается подделкой
export const TIMER_GRACE_MS = 2000;
const MAX_AUTO_STEPS = 1000;

export class ScenarioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioError';
  }
}

export function getNode(graph: ScenarioGraph, id: string): ScenarioNode {
  const node = graph.nodes[id];
  if (!node) throw new ScenarioError(`Узел ${id} не найден`);
  return node;
}

function moveTo(graph: ScenarioGraph, state: SessionState, nodeId: string): SessionState {
  const jump = criticalJump(graph, state);
  const target = jump ?? nodeId;
  const next: SessionState = { ...state, currentNodeId: target, visited: [...state.visited, target] };
  return settle(graph, next);
}

// Проходит служебные узлы (развилки и эффекты), на которых игроку нечего делать
function settle(graph: ScenarioGraph, state: SessionState): SessionState {
  let current = state;
  for (let step = 0; step < MAX_AUTO_STEPS; step += 1) {
    const node = getNode(graph, current.currentNodeId);
    if (node.kind === 'ending') return { ...current, status: 'finished' };
    if (node.kind === 'effect') {
      const applied = applyEffects(graph, current, node.effects);
      const target = criticalJump(graph, applied) ?? node.next;
      current = { ...applied, currentNodeId: target, visited: [...applied.visited, target] };
      continue;
    }
    if (node.kind === 'branch') {
      const target = node.cases.find((item) => evaluate(item.when, current))?.next ?? node.fallback;
      current = { ...current, currentNodeId: target, visited: [...current.visited, target] };
      continue;
    }
    return current;
  }
  throw new ScenarioError('Сценарий зациклился на служебных узлах');
}

export function createSession(graph: ScenarioGraph): SessionState {
  const metrics: Record<string, number> = {};
  for (const def of graph.metrics) metrics[def.id] = def.initial;
  const tracks: Record<string, number> = {};
  for (const def of graph.tracks) tracks[def.id] = 0;
  return settle(graph, {
    currentNodeId: graph.entry,
    metrics,
    tracks,
    flags: {},
    visited: [graph.entry],
    events: [],
    status: 'in_progress',
  });
}

export function currentNode(graph: ScenarioGraph, state: SessionState): ScenarioNode {
  return getNode(graph, state.currentNodeId);
}

export function isFinished(state: SessionState): boolean {
  return state.status === 'finished';
}

function currentChoice(graph: ScenarioGraph, state: SessionState): ChoiceNode {
  if (isFinished(state)) throw new ScenarioError('Сценарий уже завершён');
  const node = currentNode(graph, state);
  if (node.kind !== 'choice') throw new ScenarioError(`Сейчас не выбор, а ${node.kind}`);
  return node;
}

export function availableOptions(graph: ScenarioGraph, state: SessionState): Option[] {
  const node = currentNode(graph, state);
  if (node.kind !== 'choice') return [];
  return node.options.filter((option) => !option.visibleIf || evaluate(option.visibleIf, state));
}

export function applyChoice(graph: ScenarioGraph, state: SessionState, optionId: string, reactionMs: number): SessionState {
  const node = currentChoice(graph, state);
  const option = availableOptions(graph, state).find((item) => item.id === optionId);
  if (!option) throw new ScenarioError(`Вариант ${optionId} недоступен в узле ${node.id}`);
  if (!Number.isFinite(reactionMs) || reactionMs < 0) throw new ScenarioError('Некорректное время реакции');
  if (node.timer && reactionMs > node.timer.seconds * 1000 + TIMER_GRACE_MS) {
    throw new ScenarioError(`Ответ в узле ${node.id} дан после истечения таймера`);
  }
  const event: DecisionEvent = { seq: state.events.length, nodeId: node.id, optionId, reactionMs: Math.round(reactionMs) };
  const applied = applyEffects(graph, { ...state, events: [...state.events, event] }, option.effects);
  return moveTo(graph, applied, option.next);
}

export function applyTimeout(graph: ScenarioGraph, state: SessionState): SessionState {
  const node = currentChoice(graph, state);
  if (!node.timer) throw new ScenarioError(`У узла ${node.id} нет таймера`);
  const event: DecisionEvent = { seq: state.events.length, nodeId: node.id, optionId: null, reactionMs: node.timer.seconds * 1000 };
  const applied = applyEffects(graph, { ...state, events: [...state.events, event] }, node.timer.onTimeout.effects);
  return moveTo(graph, applied, node.timer.onTimeout.next);
}

// Переход со сцены к следующему узлу
export function advance(graph: ScenarioGraph, state: SessionState): SessionState {
  if (isFinished(state)) throw new ScenarioError('Сценарий уже завершён');
  const node = currentNode(graph, state);
  if (node.kind !== 'scene') throw new ScenarioError(`Узел ${node.id} нельзя пропустить`);
  return moveTo(graph, state, node.next);
}

function timeBonus(graph: ScenarioGraph, events: DecisionEvent[]): number {
  const spec = graph.scoring.timeBonus;
  if (!spec) return 0;
  let total = 0;
  for (const event of events) {
    if (event.optionId === null) continue;
    if (event.reactionMs <= spec.fullBonusWithinMs) total += spec.maxPointsPerDecision;
    else if (event.reactionMs < spec.zeroBonusAfterMs) {
      const share = (spec.zeroBonusAfterMs - event.reactionMs) / (spec.zeroBonusAfterMs - spec.fullBonusWithinMs);
      total += spec.maxPointsPerDecision * share;
    }
  }
  return total;
}

export function computeScore(graph: ScenarioGraph, state: SessionState): number {
  const { scoring } = graph;
  const metricPart = Object.entries(scoring.metricWeights)
    .reduce((sum, [metric, weight]) => sum + weight * (state.metrics[metric] ?? 0), 0);
  const timeouts = state.events.filter((event) => event.optionId === null).length;
  return Math.round(scoring.base + metricPart + timeBonus(graph, state.events) - scoring.timeoutPenalty * timeouts);
}

function describeDecision(graph: ScenarioGraph, event: DecisionEvent): DecisionReview {
  const node = getNode(graph, event.nodeId);
  if (node.kind !== 'choice') throw new ScenarioError(`Узел ${event.nodeId} не является выбором`);
  if (event.optionId === null) {
    const feedback = node.timer?.onTimeout.feedback;
    return {
      nodeId: node.id, prompt: node.prompt, optionId: null, answer: 'Время вышло',
      verdict: feedback?.verdict ?? 'wrong', feedback: feedback?.text ?? null,
      reactionMs: event.reactionMs, timedOut: true,
    };
  }
  const option = node.options.find((item) => item.id === event.optionId);
  return {
    nodeId: node.id, prompt: node.prompt, optionId: event.optionId, answer: option?.text ?? event.optionId,
    verdict: option?.feedback?.verdict ?? null, feedback: option?.feedback?.text ?? null,
    reactionMs: event.reactionMs, timedOut: false,
  };
}

export function summarize(graph: ScenarioGraph, state: SessionState): SessionSummary {
  if (!isFinished(state)) throw new ScenarioError('Сценарий ещё не завершён');
  const ending = currentNode(graph, state) as EndingNode;
  const score = computeScore(graph, state);
  const answered = state.events.filter((event) => event.optionId !== null);
  const reactionPool = answered.length ? answered : state.events;
  const avgReactionMs = reactionPool.length
    ? Math.round(reactionPool.reduce((sum, event) => sum + event.reactionMs, 0) / reactionPool.length)
    : 0;
  return {
    outcome: ending.outcome,
    endingTitle: ending.title,
    endingText: ending.text,
    score,
    passed: ending.outcome !== 'failure' && score >= graph.scoring.passThreshold,
    metrics: { ...state.metrics },
    tracks: Object.fromEntries(Object.entries(state.tracks).map(([key, value]) => [key, Math.round(value)])),
    timeouts: state.events.length - answered.length,
    avgReactionMs,
    decisions: state.events.map((event) => describeDecision(graph, event)),
  };
}

// Восстанавливает прохождение по логу решений. Сцены пролистываются сами.
// Бросает ScenarioError, если лог не соответствует графу.
export function replay(graph: ScenarioGraph, events: Omit<DecisionEvent, 'seq'>[]): SessionState {
  let state = createSession(graph);
  const skipScenes = () => {
    for (let step = 0; step < MAX_AUTO_STEPS && !isFinished(state) && currentNode(graph, state).kind === 'scene'; step += 1) {
      state = advance(graph, state);
    }
  };
  for (const event of events) {
    skipScenes();
    if (isFinished(state)) throw new ScenarioError('В логе есть решения после финала');
    const node = currentNode(graph, state);
    if (node.id !== event.nodeId) throw new ScenarioError(`Ожидался узел ${node.id}, а пришёл ${event.nodeId}`);
    state = event.optionId === null
      ? applyTimeout(graph, state)
      : applyChoice(graph, state, event.optionId, event.reactionMs);
  }
  skipScenes();
  if (!isFinished(state)) throw new ScenarioError('Прохождение не доведено до финала');
  return state;
}
