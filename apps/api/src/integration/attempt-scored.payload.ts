import type { CanonicalResult } from '../scoring/progress.service';

interface ScoredAttemptIdentity {
  id: string;
  user: { externalId: string };
  scenarioVersion: { scenario: { slug: string } };
}

export function buildAttemptScoredPayload(
  attempt: ScoredAttemptIdentity,
  result: CanonicalResult,
  scoredAt: Date,
  publicBaseUrl = process.env.PUBLIC_BASE_URL ?? 'https://vsm.local',
) {
  const base = publicBaseUrl.replace(/\/$/, '');
  return {
    event: 'attempt.scored',
    attemptId: attempt.id,
    occurredAt: scoredAt.toISOString(),
    data: {
      employeeId: attempt.user.externalId,
      scenarioSlug: attempt.scenarioVersion.scenario.slug,
      score: result.score,
      passed: result.passed,
      outcome: result.outcome,
      metrics: result.metrics,
      tracks: result.tracks,
    },
    xapi: {
      id: attempt.id,
      actor: { account: { name: attempt.user.externalId, homePage: base } },
      verb: { id: 'http://adlnet.gov/expapi/verbs/completed' },
      object: { id: `${base}/scenarios/${encodeURIComponent(attempt.scenarioVersion.scenario.slug)}` },
      result: {
        score: { raw: result.score },
        success: result.passed,
      },
      timestamp: scoredAt.toISOString(),
    },
  };
}
