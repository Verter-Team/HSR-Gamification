// Проверка условий для развилок и видимости вариантов
import type { Cmp, Condition, SessionState } from './types';

export function compare(actual: number, cmp: Cmp, expected: number): boolean {
  switch (cmp) {
    case 'lt': return actual < expected;
    case 'lte': return actual <= expected;
    case 'gt': return actual > expected;
    case 'gte': return actual >= expected;
    case 'eq': return actual === expected;
    case 'ne': return actual !== expected;
  }
}

export function evaluate(condition: Condition, state: SessionState): boolean {
  switch (condition.op) {
    case 'metric': return compare(state.metrics[condition.metric] ?? 0, condition.cmp, condition.value);
    case 'track': return compare(state.tracks[condition.track] ?? 0, condition.cmp, condition.value);
    case 'flag': return (state.flags[condition.flag] ?? false) === condition.is;
    case 'visited': return state.visited.includes(condition.node);
    case 'chose': return state.events.some((event) => event.nodeId === condition.node && event.optionId === condition.option);
    case 'all': return condition.of.every((part) => evaluate(part, state));
    case 'any': return condition.of.some((part) => evaluate(part, state));
    case 'not': return !evaluate(condition.of, state);
  }
}
