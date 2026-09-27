// Типы графа сценария. Подробное описание формата - docs/scenario-model.md

export type NodeId = string;

export interface ScenarioGraph {
  schemaVersion: 1;
  id?: string;
  slug: string;
  title: string;
  summary: string;
  audience: 'staff' | 'passenger';
  role?: string;
  difficulty: number;
  estimatedMinutes: number;
  tags: string[];
  metrics: MetricDef[];
  tracks: TrackDef[];
  scoring: ScoringSpec;
  entry: NodeId;
  nodes: Record<NodeId, ScenarioNode>;
  // Задание для взаимной проверки после прохождения
  peerTask?: PeerTask;
}

export interface MetricDef {
  id: string;
  title: string;
  min: number;
  max: number;
  initial: number;
  direction: 'higher-better' | 'lower-better';
  display: 'bar' | 'hearts' | 'shield' | 'hidden';
  critical?: { below?: number; above?: number; goto: NodeId };
}

export interface TrackDef {
  id: string;
  title: string;
}

export interface ScoringSpec {
  base: number;
  metricWeights: Record<string, number>;
  timeBonus?: {
    maxPointsPerDecision: number;
    fullBonusWithinMs: number;
    zeroBonusAfterMs: number;
  };
  timeoutPenalty: number;
  passThreshold: number;
}

export interface PeerTask {
  prompt: string;
  checklist: { id: string; text: string }[];
  minLength: number;
}

export type ScenarioNode = SceneNode | ChoiceNode | BranchNode | EffectNode | EndingNode;

interface NodeBase {
  id: NodeId;
  note?: string;
}

export interface SceneNode extends NodeBase {
  kind: 'scene';
  speaker?: string;
  text: string;
  next: NodeId;
}

export interface ChoiceNode extends NodeBase {
  kind: 'choice';
  prompt: string;
  speaker?: string;
  timer?: TimerSpec;
  options: Option[];
}

export interface Option {
  id: string;
  text: string;
  visibleIf?: Condition;
  effects?: Effect[];
  feedback?: Feedback;
  next: NodeId;
}

export interface Feedback {
  verdict: 'correct' | 'acceptable' | 'wrong';
  text: string;
  showImmediately?: boolean;
}

export interface TimerSpec {
  seconds: number;
  onTimeout: { effects?: Effect[]; feedback?: Feedback; next: NodeId };
}

export interface BranchNode extends NodeBase {
  kind: 'branch';
  cases: { when: Condition; next: NodeId }[];
  fallback: NodeId;
}

export interface EffectNode extends NodeBase {
  kind: 'effect';
  effects: Effect[];
  next: NodeId;
}

export interface EndingNode extends NodeBase {
  kind: 'ending';
  outcome: Outcome;
  title: string;
  text: string;
}

export type Outcome = 'success' | 'partial' | 'failure';

export type Cmp = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'ne';

export type Condition =
  | { op: 'metric'; metric: string; cmp: Cmp; value: number }
  | { op: 'track'; track: string; cmp: Cmp; value: number }
  | { op: 'flag'; flag: string; is: boolean }
  | { op: 'visited'; node: NodeId }
  | { op: 'chose'; node: NodeId; option: string }
  | { op: 'all'; of: Condition[] }
  | { op: 'any'; of: Condition[] }
  | { op: 'not'; of: Condition };

export type Effect =
  | { op: 'metric'; metric: string; delta: number }
  | { op: 'metric.set'; metric: string; value: number }
  | { op: 'track'; track: string; amount: number }
  | { op: 'flag'; flag: string; value: boolean };

export interface DecisionEvent {
  seq: number;
  nodeId: NodeId;
  // null - истёк таймер
  optionId: string | null;
  reactionMs: number;
}

export interface SessionState {
  currentNodeId: NodeId;
  metrics: Record<string, number>;
  tracks: Record<string, number>;
  flags: Record<string, boolean>;
  visited: NodeId[];
  events: DecisionEvent[];
  status: 'in_progress' | 'finished';
}

export interface DecisionReview {
  nodeId: NodeId;
  prompt: string;
  optionId: string | null;
  answer: string;
  verdict: Feedback['verdict'] | null;
  feedback: string | null;
  reactionMs: number;
  timedOut: boolean;
}

export interface SessionSummary {
  outcome: Outcome;
  endingTitle: string;
  endingText: string;
  score: number;
  passed: boolean;
  metrics: Record<string, number>;
  tracks: Record<string, number>;
  timeouts: number;
  avgReactionMs: number;
  decisions: DecisionReview[];
}
