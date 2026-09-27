// Ответы API. Описание эндпоинтов - Swagger на /api/docs
import type { ScenarioGraph } from '@vsm/scenario-engine';

export interface AuthUser {
  id: string;
  externalId: string;
  displayName: string;
  role: string;
}

export interface LevelInfo {
  level: number;
  xp: number;
  levelStartXp: number;
  nextLevelXp: number | null;
  progress: number;
  rank: string;
}

export interface Tribe {
  slug: string;
  name: string;
  color: string;
  motto: string;
}

export interface Skill {
  id: string;
  title: string;
  value: number;
  max: number;
  percent: number;
  lastPassedAt: string | null;
  daysLeft: number | null;
}

export interface Me {
  user: AuthUser;
  depot: { id: string; name: string } | null;
  tribe: Tribe | null;
  level: LevelInfo;
  coins: number;
  reviewPoints: number;
  stats: {
    attemptsCount: number;
    passedCount: number;
    scenariosPassed: number;
    avgSafety: number | null;
    avgLoyalty: number | null;
    streakDays: number;
    reviewsGiven: number;
    totalScore: number;
  };
  skills: Skill[];
  achievements: { unlocked: number; total: number };
  season: { title: string; endsAt: string };
}

export type NodeStatus = 'soon' | 'locked' | 'available' | 'in_progress' | 'passed';

export interface MapNode {
  slug: string;
  title: string;
  summary: string | null;
  branch: string | null;
  tier: number;
  xpReward: number;
  requires: string[];
  requiresTitles: string[];
  skills: string[];
  difficulty: number;
  estimatedMinutes: number;
  versionId: string | null;
  status: NodeStatus;
  attempts: number;
  bestScore: number | null;
  lastPassedAt: string | null;
  freshnessDaysLeft: number | null;
}

export interface Branch {
  id: string;
  title: string;
  color: string;
}

export interface ScenarioMap {
  branches: Branch[];
  nodes: MapNode[];
}

export interface PublishedScenario {
  id: string;
  slug: string;
  title: string;
  versionId: string;
  version: number;
  xpReward: number;
  graph: ScenarioGraph;
}

export interface AttemptRewards {
  xp: number;
  coins: number;
  firstPass: boolean;
  xpTotal: number;
  levelBefore: number;
  levelAfter: number;
  rank: string;
  newAchievements: { code: string; title: string; icon: string; tier: number }[];
  unlockedScenarios: { slug: string; title: string }[];
}

export interface AttemptResponse {
  attemptId: string;
  status: 'scored' | 'invalid' | 'submitted';
  reason?: string;
  rewards?: AttemptRewards;
}

export interface Notification {
  id: string;
  type: 'review_received' | 'review_queue' | 'skill_fading' | 'achievement' | 'tribe' | 'scenario_open';
  title: string;
  text: string;
  link: string;
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
}

export interface QueueItem {
  id: string;
  prompt: string;
  checklist: ChecklistItem[];
  answer: string;
  createdAt: string;
  scenario: { slug: string; title: string };
  author: { level: number; tribe: { name: string; color: string } | null };
}

export interface MyReviews {
  reviewPoints: number;
  reviewsGiven: number;
  submitted: {
    id: string;
    prompt: string;
    checklist: ChecklistItem[];
    answer: string;
    status: 'pending' | 'reviewed';
    checks: string[];
    comment: string | null;
    helpful: boolean | null;
    createdAt: string;
    reviewedAt: string | null;
    scenario: { slug: string; title: string };
    reviewerLevel: number | null;
  }[];
  given: { id: string; scenarioTitle: string; helpful: boolean | null; reviewedAt: string; score: string }[];
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  orgUnit: { id: string; name: string } | null;
  tribe: { slug: string; name: string; color: string } | null;
  xp: number;
  level: number;
  title: string;
  passedCount: number;
}

export interface TribeStanding extends Tribe {
  members: number;
  points: number;
  rank: number;
  isMine: boolean;
  top: { displayName: string; points: number }[];
}

export interface Tribes {
  season: { title: string; startsAt: string; endsAt: string; daysLeft: number };
  tribes: TribeStanding[];
  myTribe: string | null;
  myContribution: number;
}

export interface Achievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  tier: number;
  unlockedAt: string | null;
}

export interface Shop {
  coins: number;
  items: { code: string; title: string; description: string; icon: string; price: number }[];
  purchases: { id: string; price: number; status: string; createdAt: string; item: { code: string; title: string; icon: string } }[];
}

export interface Analytics {
  totals: {
    players: number;
    attempts: number;
    passRate: number | null;
    avgSafety: number | null;
    avgLoyalty: number | null;
    timeouts: number;
    reviewsDone: number;
    reviewsPending: number;
  };
  scenarios: { slug: string; title: string; attempts: number; passRate: number; avgScore: number | null }[];
  hardestSteps: {
    scenarioSlug: string;
    scenarioTitle: string;
    nodeId: string;
    prompt: string;
    answers: number;
    errorRate: number;
    timeoutRate: number;
    commonMistake: { text: string; count: number } | null;
  }[];
  depots: { id: string; name: string; attempts: number; passRate: number | null; avgSafety: number | null; avgLoyalty: number | null }[];
}
