// Применение эффектов к состоянию. Шкалы всегда остаются в своих границах.
import type { Effect, ScenarioGraph, SessionState } from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function applyEffects(graph: ScenarioGraph, state: SessionState, effects: Effect[] | undefined): SessionState {
  if (!effects?.length) return state;
  const metrics = { ...state.metrics };
  const tracks = { ...state.tracks };
  const flags = { ...state.flags };
  for (const effect of effects) {
    switch (effect.op) {
      case 'metric':
      case 'metric.set': {
        const def = graph.metrics.find((metric) => metric.id === effect.metric);
        if (!def) break;
        const raw = effect.op === 'metric' ? (metrics[effect.metric] ?? def.initial) + effect.delta : effect.value;
        metrics[effect.metric] = clamp(raw, def.min, def.max);
        break;
      }
      case 'track':
        tracks[effect.track] = (tracks[effect.track] ?? 0) + effect.amount;
        break;
      case 'flag':
        flags[effect.flag] = effect.value;
        break;
    }
  }
  return { ...state, metrics, tracks, flags };
}

// Если шкала вышла за критический порог, сценарий уходит в узел провала
export function criticalJump(graph: ScenarioGraph, state: SessionState): string | null {
  for (const def of graph.metrics) {
    if (!def.critical) continue;
    const value = state.metrics[def.id];
    if (def.critical.below !== undefined && value < def.critical.below) return def.critical.goto;
    if (def.critical.above !== undefined && value > def.critical.above) return def.critical.goto;
  }
  return null;
}
