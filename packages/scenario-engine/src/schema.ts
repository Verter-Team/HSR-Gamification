// Структурная проверка JSON до того, как с ним начнёт работать движок.
// Без внешних зависимостей, чтобы пакет одинаково работал в браузере и на сервере.
import type { ScenarioGraph } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseGraph(value: unknown): ScenarioGraph {
  if (!isRecord(value)) throw new Error('Сценарий должен быть объектом');
  if (value.schemaVersion !== 1) throw new Error('Поддерживается только schemaVersion 1');
  for (const key of ['slug', 'title', 'entry']) {
    if (typeof value[key] !== 'string' || !(value[key] as string).length) throw new Error(`Поле ${key} обязательно`);
  }
  if (!Array.isArray(value.metrics) || !Array.isArray(value.tracks)) throw new Error('Нужны массивы metrics и tracks');
  if (!isRecord(value.scoring)) throw new Error('Нужен блок scoring');
  if (!isRecord(value.nodes) || Object.keys(value.nodes).length === 0) throw new Error('Нужен непустой объект nodes');
  for (const [id, node] of Object.entries(value.nodes)) {
    if (!isRecord(node) || typeof node.kind !== 'string') throw new Error(`Узел ${id} без поля kind`);
    if (!['scene', 'choice', 'branch', 'effect', 'ending'].includes(node.kind)) throw new Error(`Узел ${id}: неизвестный тип ${node.kind}`);
    if (node.kind === 'choice' && !Array.isArray(node.options)) throw new Error(`Узел ${id}: у выбора нет options`);
  }
  return value as unknown as ScenarioGraph;
}
