export interface RuleAttempt {
  id: string;
  score: number | null;
  passed: boolean | null;
  metrics: unknown;
  timeouts: number;
  scoredAt: Date | null;
}

type Comparator = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'ne';

function compare(actual: number, cmp: Comparator, expected: number): boolean {
  switch (cmp) {
    case 'lt': return actual < expected;
    case 'lte': return actual <= expected;
    case 'gt': return actual > expected;
    case 'gte': return actual >= expected;
    case 'eq': return actual === expected;
    case 'ne': return actual !== expected;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesCount(rule: unknown, actual: number): boolean {
  if (!isRecord(rule) || typeof rule.value !== 'number' || typeof rule.cmp !== 'string') return false;
  if (!['lt', 'lte', 'gt', 'gte', 'eq', 'ne'].includes(rule.cmp)) return false;
  return compare(actual, rule.cmp as Comparator, rule.value);
}

export function evaluateAchievementRule(rule: unknown, history: RuleAttempt[]): boolean {
  if (!isRecord(rule) || history.length === 0) return false;
  const current = history[history.length - 1];

  if (Array.isArray(rule.all)) return rule.all.length > 0 && rule.all.every((part) => evaluateAchievementRule(part, history));
  if (Array.isArray(rule.any)) return rule.any.some((part) => evaluateAchievementRule(part, history));

  let windowHistory = history;
  if (rule.window !== undefined) {
    if (typeof rule.window !== 'string' || !/^\d+d$/.test(rule.window) || !current.scoredAt) return false;
    const days = Number.parseInt(rule.window, 10);
    if (days <= 0) return false;
    const cutoff = current.scoredAt.getTime() - days * 86_400_000;
    windowHistory = history.filter((attempt) => attempt.scoredAt && attempt.scoredAt.getTime() >= cutoff);
  }

  if ('attempts' in rule) return matchesCount(rule.attempts, windowHistory.length);
  if ('passed' in rule) return matchesCount(rule.passed, windowHistory.filter((attempt) => attempt.passed).length);
  if ('score' in rule) return current.score !== null && matchesCount(rule.score, current.score);
  if ('timeouts' in rule) return matchesCount(rule.timeouts, current.timeouts);
  if (typeof rule.metric === 'string' && isRecord(current.metrics)) {
    const value = current.metrics[rule.metric];
    return typeof value === 'number' && matchesCount(rule, value);
  }
  return false;
}
