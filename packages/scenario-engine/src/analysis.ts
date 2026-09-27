// Обход всех путей графа: максимум очков и компетенций, которые можно получить.
// Нужен для радара навыков (какая доля от возможного набрана) и для статистики сценария.
import { advance, applyChoice, applyTimeout, availableOptions, createSession, currentNode, isFinished, summarize } from './engine';
import type { ScenarioGraph, SessionState } from './types';

export interface GraphPotential {
  paths: number;
  maxScore: number;
  maxTracks: Record<string, number>;
  outcomes: Record<string, number>;
}

const PATH_LIMIT = 50_000;

export function explorePotential(graph: ScenarioGraph): GraphPotential {
  const result: GraphPotential = { paths: 0, maxScore: 0, maxTracks: {}, outcomes: {} };
  for (const track of graph.tracks) result.maxTracks[track.id] = 0;

  const walk = (start: SessionState): void => {
    if (result.paths >= PATH_LIMIT) return;
    let state = start;
    while (!isFinished(state) && currentNode(graph, state).kind === 'scene') state = advance(graph, state);
    if (isFinished(state)) {
      const summary = summarize(graph, state);
      result.paths += 1;
      result.maxScore = Math.max(result.maxScore, summary.score);
      result.outcomes[summary.outcome] = (result.outcomes[summary.outcome] ?? 0) + 1;
      for (const [track, value] of Object.entries(summary.tracks)) {
        result.maxTracks[track] = Math.max(result.maxTracks[track] ?? 0, value);
      }
      return;
    }
    // Ответ за 1 секунду - чтобы максимум включал полный бонус за скорость
    for (const option of availableOptions(graph, state)) walk(applyChoice(graph, state, option.id, 1000));
    const node = currentNode(graph, state);
    if (node.kind === 'choice' && node.timer) walk(applyTimeout(graph, state));
  };

  walk(createSession(graph));
  return result;
}
