// Собирает content/scenarios/*.json из таблиц участника В и каталога content/catalog.json.
// Запуск: npm run scenarios (в папке packages/scenario-engine)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lintGraph } from '../src/lint';
import type { ChoiceNode, Condition, Effect, Feedback, ScenarioGraph, ScenarioNode } from '../src/types';

const contentDir = resolve(__dirname, '../../../content');

interface CatalogScenario {
  slug: string;
  source: string;
  title: string;
  summary: string;
  difficulty: number;
  estimatedMinutes: number;
  skills: string[];
  tags: string[];
  peerTask?: ScenarioGraph['peerTask'];
}

interface Catalog {
  skills: { id: string; title: string }[];
  scenarios: CatalogScenario[];
}

type Row = Record<string, string>;

// Разбор CSV с разделителем ";" и кавычками
export function parseCsv(text: string): Row[] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  const input = text.replace(/^﻿/, '');
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ';') { record.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      record.push(field);
      if (record.some((value) => value.trim() !== '')) records.push(record);
      record = []; field = '';
    } else field += char;
  }
  record.push(field);
  if (record.some((value) => value.trim() !== '')) records.push(record);
  const [header, ...rows] = records;
  return rows.map((values) => Object.fromEntries(header.map((name, index) => [name.trim(), (values[index] ?? '').trim()])));
}

const VERDICTS: Record<string, Feedback['verdict']> = { 'верно': 'correct', 'допустимо': 'acceptable', 'ошибка': 'wrong' };
const OUTCOMES = { 'хороший': 'success', 'средний': 'partial', 'плохой': 'failure' } as const;
const ENDING_TITLES = { success: 'Отличная работа', partial: 'Есть что улучшить', failure: 'Сценарий не зачтён' };
const METRIC_NAMES: Record<string, string> = { 'безопасность': 'safety', 'лояльность': 'loyalty' };
const OPTION_IDS = 'abcdefgh';

function number(value: string): number {
  const parsed = Number(value.replace('+', '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function metricEffects(row: Row): Effect[] {
  return [
    { op: 'metric', metric: 'safety', delta: number(row['безопасность'] ?? '0') },
    { op: 'metric', metric: 'loyalty', delta: number(row['лояльность'] ?? '0') },
  ];
}

// За верное решение компетенции растут: главная на 10, остальные на 5
function skillEffects(skills: string[], verdict: Feedback['verdict']): Effect[] {
  if (verdict === 'correct') return skills.map((track, index) => ({ op: 'track', track, amount: index === 0 ? 10 : 5 }));
  if (verdict === 'acceptable') return skills.slice(0, 1).map((track) => ({ op: 'track', track, amount: 5 }));
  return [];
}

// "безопасность >= 75; лояльность >= 65" - все условия через точку с запятой должны выполниться
function parseCondition(text: string, where: string): Condition {
  const parts = text.split(';').map((part) => part.trim()).filter(Boolean).map((part): Condition => {
    const match = /^(\S+)\s*(>=|<=|>|<|=)\s*(-?\d+)$/.exec(part);
    const metric = match ? METRIC_NAMES[match[1].toLowerCase()] : undefined;
    if (!match || !metric) throw new Error(`${where}: не понимаю условие "${part}"`);
    const cmp = ({ '>=': 'gte', '<=': 'lte', '>': 'gt', '<': 'lt', '=': 'eq' } as const)[match[2] as '>=' | '<=' | '>' | '<' | '='];
    return { op: 'metric', metric, cmp, value: Number(match[3]) };
  });
  return parts.length === 1 ? parts[0] : { op: 'all', of: parts };
}

export function buildGraph(entry: CatalogScenario, rows: Row[], skillTitles: Map<string, string>): ScenarioGraph {
  const nodes: Record<string, ScenarioNode> = {};
  const order: string[] = [];
  for (const row of rows) {
    const id = row['id'];
    const type = row['тип'];
    const where = `${entry.slug}/${id}`;
    if (!order.includes(id)) order.push(id);
    const speaker = row['кто говорит'] || undefined;
    if (type === 'сцена') {
      nodes[id] = { id, kind: 'scene', speaker, text: row['текст'], next: row['дальше'] };
    } else if (type === 'финал') {
      const outcome = OUTCOMES[row['оценка'] as keyof typeof OUTCOMES];
      if (!outcome) throw new Error(`${where}: у финала оценка должна быть хороший, средний или плохой`);
      nodes[id] = { id, kind: 'ending', outcome, title: ENDING_TITLES[outcome], text: row['текст'] };
    } else if (type === 'выбор') {
      let node = nodes[id] as ChoiceNode | undefined;
      if (!node) {
        node = { id, kind: 'choice', prompt: row['текст'], speaker, options: [] };
        const seconds = number(row['таймер'] ?? '');
        if (seconds > 0) node.timer = { seconds, onTimeout: { next: '' } };
        nodes[id] = node;
      }
      const verdict = VERDICTS[row['оценка']];
      if (!verdict) throw new Error(`${where}: оценка варианта должна быть верно, допустимо или ошибка`);
      const feedback: Feedback = { verdict, text: row['разбор'], showImmediately: false };
      if (row['вариант'].toUpperCase() === 'ВРЕМЯ ВЫШЛО') {
        if (!node.timer) throw new Error(`${where}: вариант ВРЕМЯ ВЫШЛО без таймера`);
        node.timer.onTimeout = { effects: metricEffects(row), feedback, next: row['дальше'] };
      } else {
        node.options.push({
          id: OPTION_IDS[node.options.length],
          text: row['вариант'],
          effects: [...metricEffects(row), ...skillEffects(entry.skills, verdict)],
          feedback,
          next: row['дальше'],
        });
      }
    } else if (type === 'развилка') {
      let node = nodes[id];
      if (!node) {
        node = { id, kind: 'branch', cases: [], fallback: '' };
        nodes[id] = node;
      }
      if (node.kind !== 'branch') throw new Error(`${where}: id уже занят другим типом`);
      if (row['текст']) node.cases.push({ when: parseCondition(row['текст'], where), next: row['дальше'] });
      else node.fallback = row['дальше'];
    } else {
      throw new Error(`${where}: неизвестный тип "${type}"`);
    }
  }
  return {
    schemaVersion: 1,
    slug: entry.slug,
    title: entry.title,
    summary: entry.summary,
    audience: 'staff',
    role: 'проводник',
    difficulty: entry.difficulty,
    estimatedMinutes: entry.estimatedMinutes,
    tags: entry.tags,
    metrics: [
      { id: 'safety', title: 'Безопасность', min: 0, max: 100, initial: 60, direction: 'higher-better', display: 'shield' },
      { id: 'loyalty', title: 'Лояльность пассажира', min: 0, max: 100, initial: 60, direction: 'higher-better', display: 'hearts' },
    ],
    tracks: entry.skills.map((id) => ({ id, title: skillTitles.get(id) ?? id })),
    scoring: {
      base: 0,
      metricWeights: { safety: 2, loyalty: 1 },
      timeBonus: { maxPointsPerDecision: 10, fullBonusWithinMs: 3000, zeroBonusAfterMs: 12000 },
      timeoutPenalty: 15,
      passThreshold: 150,
    },
    entry: order[0],
    nodes,
    peerTask: entry.peerTask,
  };
}

function main(): void {
  const catalog = JSON.parse(readFileSync(join(contentDir, 'catalog.json'), 'utf8')) as Catalog;
  const skillTitles = new Map(catalog.skills.map((skill) => [skill.id, skill.title]));
  mkdirSync(join(contentDir, 'scenarios'), { recursive: true });
  let failed = false;
  for (const entry of catalog.scenarios) {
    const rows = parseCsv(readFileSync(join(contentDir, entry.source), 'utf8'));
    const graph = buildGraph(entry, rows, skillTitles);
    const report = lintGraph(graph);
    for (const issue of [...report.errors, ...report.warnings]) {
      process.stdout.write(`  ${issue.level === 'error' ? 'ОШИБКА' : 'внимание'} ${entry.slug}${issue.nodeId ? `/${issue.nodeId}` : ''}: ${issue.message}\n`);
    }
    if (!report.ok) { failed = true; continue; }
    writeFileSync(join(contentDir, 'scenarios', `${entry.slug}.json`), `${JSON.stringify(graph, null, 2)}\n`);
    const choices = Object.values(graph.nodes).filter((node) => node.kind === 'choice').length;
    process.stdout.write(`${entry.slug}: ${Object.keys(graph.nodes).length} узлов, ${choices} выборов - готово\n`);
  }
  if (failed) process.exitCode = 1;
}

if (require.main === module) main();
