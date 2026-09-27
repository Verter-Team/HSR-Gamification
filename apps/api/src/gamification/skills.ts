import { AttemptStatus, Prisma, VersionStatus } from '@prisma/client';
import { explorePotential, freshnessDaysLeft, GraphPotential, parseGraph } from '@vsm/scenario-engine';
import { SKILL_ORDER } from './constants';

// Потенциал графа не меняется внутри версии, поэтому считаем один раз
const potentials = new Map<string, GraphPotential>();

export function potentialFor(versionId: string, graph: unknown): GraphPotential {
  let potential = potentials.get(versionId);
  if (!potential) {
    potential = explorePotential(parseGraph(graph));
    potentials.set(versionId, potential);
  }
  return potential;
}

export interface SkillValue {
  id: string;
  title: string;
  value: number;
  max: number;
  percent: number;
  lastPassedAt: Date | null;
  // null - навык ещё не тренировался, меньше нуля - пора освежить
  daysLeft: number | null;
}

type Db = Prisma.TransactionClient;

// Радар навыков. Для каждого сценария берётся лучший результат по компетенции,
// поэтому повторять один и тот же сценарий ради очков бессмысленно.
export async function computeSkills(db: Db, userId: string, now: Date = new Date()): Promise<SkillValue[]> {
  const versions = await db.scenarioVersion.findMany({
    where: { status: VersionStatus.PUBLISHED, scenario: { isActive: true } },
    select: { id: true, graph: true, scenario: { select: { slug: true } } },
  });
  const titles = new Map<string, string>();
  const maxBySkill = new Map<string, number>();
  for (const version of versions) {
    const graph = parseGraph(version.graph);
    for (const track of graph.tracks) titles.set(track.id, track.title);
    const potential = potentialFor(version.id, version.graph);
    for (const [track, max] of Object.entries(potential.maxTracks)) {
      maxBySkill.set(track, (maxBySkill.get(track) ?? 0) + max);
    }
  }

  const attempts = await db.attempt.findMany({
    where: { userId, status: AttemptStatus.SCORED },
    select: { tracks: true, passed: true, scoredAt: true, scenarioVersion: { select: { scenario: { select: { slug: true } } } } },
  });
  const best = new Map<string, Map<string, number>>();
  const lastPassed = new Map<string, Date>();
  for (const attempt of attempts) {
    const slug = attempt.scenarioVersion.scenario.slug;
    const tracks = (attempt.tracks ?? {}) as Record<string, number>;
    const perScenario = best.get(slug) ?? new Map<string, number>();
    for (const [track, value] of Object.entries(tracks)) {
      perScenario.set(track, Math.max(perScenario.get(track) ?? 0, value));
      if (attempt.passed && attempt.scoredAt && value > 0) {
        const previous = lastPassed.get(track);
        if (!previous || previous < attempt.scoredAt) lastPassed.set(track, attempt.scoredAt);
      }
    }
    best.set(slug, perScenario);
  }

  const order = (id: string) => {
    const index = SKILL_ORDER.indexOf(id);
    return index === -1 ? SKILL_ORDER.length : index;
  };
  return [...titles.entries()].sort(([a], [b]) => order(a) - order(b)).map(([id, title]) => {
    let value = 0;
    for (const perScenario of best.values()) value += perScenario.get(id) ?? 0;
    const max = maxBySkill.get(id) ?? 0;
    const passedAt = lastPassed.get(id) ?? null;
    return {
      id,
      title,
      value,
      max,
      percent: max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0,
      lastPassedAt: passedAt,
      daysLeft: passedAt ? freshnessDaysLeft(passedAt, now) : null,
    };
  });
}
