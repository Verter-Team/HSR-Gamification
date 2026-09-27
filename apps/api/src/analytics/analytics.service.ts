import { Injectable } from '@nestjs/common';
import { AttemptStatus, ReviewStatus, UserRole } from '@prisma/client';
import { ChoiceNode, parseGraph, ScenarioGraph } from '@vsm/scenario-engine';
import { PrismaService } from '../prisma/prisma.service';

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function metricOf(metrics: unknown, name: string): number | null {
  if (typeof metrics !== 'object' || metrics === null) return null;
  const value = (metrics as Record<string, unknown>)[name];
  return typeof value === 'number' ? value : null;
}

// Сводка для руководителя и методолога: где проводники ошибаются и как идут депо
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [players, attempts, reviewed, pending, depots] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.PLAYER } }),
      this.prisma.attempt.findMany({
        where: { status: AttemptStatus.SCORED, user: { role: UserRole.PLAYER } },
        select: {
          id: true, passed: true, score: true, metrics: true, timeouts: true,
          user: { select: { orgUnitId: true } },
          scenarioVersion: { select: { id: true, graph: true, scenario: { select: { slug: true, title: true } } } },
          events: { select: { nodeId: true, optionId: true } },
        },
      }),
      this.prisma.peerReview.count({ where: { status: ReviewStatus.REVIEWED } }),
      this.prisma.peerReview.count({ where: { status: ReviewStatus.PENDING } }),
      this.prisma.orgUnit.findMany({ select: { id: true, name: true } }),
    ]);

    const graphs = new Map<string, ScenarioGraph>();
    const scenarios = new Map<string, { slug: string; title: string; attempts: number; passed: number; scores: number[] }>();
    const steps = new Map<string, { slug: string; title: string; nodeId: string; prompt: string; total: number; wrong: number; timeouts: number; picks: Map<string, number> }>();
    const byDepot = new Map<string, { attempts: number; passed: number; safety: number[]; loyalty: number[] }>();

    for (const attempt of attempts) {
      const version = attempt.scenarioVersion;
      let graph = graphs.get(version.id);
      if (!graph) {
        graph = parseGraph(version.graph);
        graphs.set(version.id, graph);
      }
      const scenario = scenarios.get(version.scenario.slug) ?? { ...version.scenario, attempts: 0, passed: 0, scores: [] };
      scenario.attempts += 1;
      if (attempt.passed) scenario.passed += 1;
      if (attempt.score !== null) scenario.scores.push(attempt.score);
      scenarios.set(version.scenario.slug, scenario);

      for (const event of attempt.events) {
        const node = graph.nodes[event.nodeId];
        if (!node || node.kind !== 'choice') continue;
        const key = `${version.scenario.slug}/${event.nodeId}`;
        const step = steps.get(key) ?? {
          slug: version.scenario.slug, title: version.scenario.title, nodeId: event.nodeId,
          prompt: (node as ChoiceNode).prompt, total: 0, wrong: 0, timeouts: 0, picks: new Map<string, number>(),
        };
        step.total += 1;
        if (event.optionId === null) step.timeouts += 1;
        else {
          const option = (node as ChoiceNode).options.find((item) => item.id === event.optionId);
          if (option?.feedback?.verdict === 'wrong') {
            step.wrong += 1;
            step.picks.set(option.text, (step.picks.get(option.text) ?? 0) + 1);
          }
        }
        steps.set(key, step);
      }

      const depotId = attempt.user.orgUnitId ?? 'none';
      const depot = byDepot.get(depotId) ?? { attempts: 0, passed: 0, safety: [], loyalty: [] };
      depot.attempts += 1;
      if (attempt.passed) depot.passed += 1;
      const safety = metricOf(attempt.metrics, 'safety');
      const loyalty = metricOf(attempt.metrics, 'loyalty');
      if (safety !== null) depot.safety.push(safety);
      if (loyalty !== null) depot.loyalty.push(loyalty);
      byDepot.set(depotId, depot);
    }

    const allSafety = attempts.map((attempt) => metricOf(attempt.metrics, 'safety')).filter((value): value is number => value !== null);
    const allLoyalty = attempts.map((attempt) => metricOf(attempt.metrics, 'loyalty')).filter((value): value is number => value !== null);
    const passedTotal = attempts.filter((attempt) => attempt.passed).length;

    return {
      totals: {
        players,
        attempts: attempts.length,
        passRate: attempts.length ? Math.round((passedTotal / attempts.length) * 100) : null,
        avgSafety: avg(allSafety),
        avgLoyalty: avg(allLoyalty),
        timeouts: attempts.reduce((sum, attempt) => sum + attempt.timeouts, 0),
        reviewsDone: reviewed,
        reviewsPending: pending,
      },
      scenarios: [...scenarios.values()].map((scenario) => ({
        slug: scenario.slug, title: scenario.title, attempts: scenario.attempts,
        passRate: Math.round((scenario.passed / scenario.attempts) * 100),
        avgScore: avg(scenario.scores),
      })).sort((a, b) => a.passRate - b.passRate),
      hardestSteps: [...steps.values()]
        .filter((step) => step.total >= 5)
        .map((step) => {
          const commonMistake = [...step.picks.entries()].sort((a, b) => b[1] - a[1])[0];
          return {
            scenarioSlug: step.slug, scenarioTitle: step.title, nodeId: step.nodeId, prompt: step.prompt,
            answers: step.total,
            errorRate: Math.round(((step.wrong + step.timeouts) / step.total) * 100),
            timeoutRate: Math.round((step.timeouts / step.total) * 100),
            commonMistake: commonMistake ? { text: commonMistake[0], count: commonMistake[1] } : null,
          };
        })
        .sort((a, b) => b.errorRate - a.errorRate)
        .slice(0, 6),
      depots: depots.map((depot) => {
        const stats = byDepot.get(depot.id);
        return {
          id: depot.id, name: depot.name, attempts: stats?.attempts ?? 0,
          passRate: stats?.attempts ? Math.round((stats.passed / stats.attempts) * 100) : null,
          avgSafety: avg(stats?.safety ?? []), avgLoyalty: avg(stats?.loyalty ?? []),
        };
      }),
    };
  }
}
