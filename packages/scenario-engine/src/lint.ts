// Проверка графа перед публикацией. Ошибки блокируют публикацию, предупреждения - нет.
import type { Condition, Effect, NodeId, ScenarioGraph, ScenarioNode } from './types';

export interface LintIssue {
  level: 'error' | 'warning';
  nodeId?: NodeId;
  message: string;
}

export interface LintReport {
  ok: boolean;
  errors: LintIssue[];
  warnings: LintIssue[];
}

function targets(node: ScenarioNode): NodeId[] {
  switch (node.kind) {
    case 'scene':
    case 'effect': return [node.next];
    case 'branch': return [...node.cases.map((item) => item.next), node.fallback];
    case 'choice': return [...node.options.map((option) => option.next), ...(node.timer ? [node.timer.onTimeout.next] : [])];
    case 'ending': return [];
  }
}

function conditionRefs(condition: Condition | undefined, out: { metrics: string[]; tracks: string[] }): void {
  if (!condition) return;
  if (condition.op === 'metric') out.metrics.push(condition.metric);
  if (condition.op === 'track') out.tracks.push(condition.track);
  if (condition.op === 'all' || condition.op === 'any') condition.of.forEach((part) => conditionRefs(part, out));
  if (condition.op === 'not') conditionRefs(condition.of, out);
}

function metricDeltas(effects: Effect[] | undefined): string {
  return (effects ?? [])
    .filter((effect) => effect.op === 'metric')
    .map((effect) => `${effect.op === 'metric' ? effect.metric : ''}:${effect.op === 'metric' ? effect.delta : ''}`)
    .sort()
    .join(',');
}

export function lintGraph(graph: ScenarioGraph): LintReport {
  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];
  const error = (message: string, nodeId?: NodeId) => errors.push({ level: 'error', nodeId, message });
  const warn = (message: string, nodeId?: NodeId) => warnings.push({ level: 'warning', nodeId, message });

  const metricIds = new Set(graph.metrics.map((metric) => metric.id));
  const trackIds = new Set(graph.tracks.map((track) => track.id));
  if (!graph.nodes[graph.entry]) error(`Стартовый узел ${graph.entry} не существует`);

  for (const [key, node] of Object.entries(graph.nodes)) {
    if (node.id !== key) error(`Ключ ${key} не совпадает с id узла ${node.id}`, key);
    for (const target of targets(node)) {
      if (!graph.nodes[target]) error(`Ссылка на несуществующий узел ${target}`, key);
    }
    const refs = { metrics: [] as string[], tracks: [] as string[] };
    const effects: Effect[] = [];
    if (node.kind === 'effect') effects.push(...node.effects);
    if (node.kind === 'branch') node.cases.forEach((item) => conditionRefs(item.when, refs));
    if (node.kind === 'choice') {
      if (node.options.length === 0) error('Выбор без вариантов', key);
      const ids = node.options.map((option) => option.id);
      if (new Set(ids).size !== ids.length) error('Повторяются id вариантов', key);
      if (node.timer && node.timer.seconds <= 0) error('Таймер должен быть больше нуля', key);
      for (const option of node.options) {
        effects.push(...(option.effects ?? []));
        conditionRefs(option.visibleIf, refs);
        if (!option.feedback) warn(`Вариант ${option.id} без разбора`, key);
      }
      if (node.timer) effects.push(...(node.timer.onTimeout.effects ?? []));
      if (node.options.length > 1) {
        const signatures = new Set(node.options.map((option) => metricDeltas(option.effects)));
        if (signatures.size === 1) warn('Все варианты одинаково меняют шкалы - выбор ничего не решает', key);
        const hasCost = node.options.some((option) =>
          (option.effects ?? []).some((effect) => effect.op === 'metric' && effect.delta < 0));
        if (!hasCost) warn('Ни один вариант не ухудшает шкалы - у решения нет цены', key);
      }
    }
    for (const effect of effects) {
      if ((effect.op === 'metric' || effect.op === 'metric.set') && !metricIds.has(effect.metric)) {
        error(`Неизвестная шкала ${effect.metric}`, key);
      }
      if (effect.op === 'track' && !trackIds.has(effect.track)) error(`Неизвестная компетенция ${effect.track}`, key);
    }
    refs.metrics.filter((id) => !metricIds.has(id)).forEach((id) => error(`Условие ссылается на шкалу ${id}`, key));
    refs.tracks.filter((id) => !trackIds.has(id)).forEach((id) => error(`Условие ссылается на компетенцию ${id}`, key));
  }

  // Достижимость узлов и финалов
  const reachable = new Set<NodeId>();
  const queue: NodeId[] = graph.nodes[graph.entry] ? [graph.entry] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id) || !graph.nodes[id]) continue;
    reachable.add(id);
    queue.push(...targets(graph.nodes[id]));
  }
  for (const def of graph.metrics) {
    if (def.critical?.goto && graph.nodes[def.critical.goto]) queue.push(def.critical.goto);
  }
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id) || !graph.nodes[id]) continue;
    reachable.add(id);
    queue.push(...targets(graph.nodes[id]));
  }
  for (const id of Object.keys(graph.nodes)) {
    if (!reachable.has(id)) error('Узел недостижим со старта', id);
  }
  if (![...reachable].some((id) => graph.nodes[id]?.kind === 'ending')) error('Нет достижимого финала');

  // Из каждого достижимого узла должен быть путь к финалу
  const canFinish = new Set<NodeId>(Object.values(graph.nodes).filter((node) => node.kind === 'ending').map((node) => node.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of Object.values(graph.nodes)) {
      if (canFinish.has(node.id)) continue;
      if (targets(node).some((target) => canFinish.has(target))) {
        canFinish.add(node.id);
        changed = true;
      }
    }
  }
  for (const id of reachable) {
    if (!canFinish.has(id)) error('Из узла нельзя дойти до финала', id);
  }

  if (graph.peerTask && graph.peerTask.checklist.length === 0) error('В задании для взаимной проверки нет критериев');

  return { ok: errors.length === 0, errors, warnings };
}
