// Правила прогресса в духе Школы 21: опыт, уровни до 21-го, звания, коины,
// баллы взаимной проверки и срок свежести навыка.
// Лежат в общем пакете, чтобы приложение и сервер считали одинаково.

export const MAX_LEVEL = 21;

export const ECONOMY = {
  // Повторное прохождение уже зачтённого сценария даёт долю опыта: тренировка, а не фарм
  repeatXpShare: 0.1,
  repeatXpMin: 10,
  partialXpShare: 0.7,
  coinsFirstSuccess: 20,
  coinsFirstPartial: 10,
  coinsRepeat: 3,
  // Взаимная проверка: сдать ответ стоит 1 балл, проверить коллегу - заработать 1 балл
  startReviewPoints: 2,
  reviewCost: 1,
  reviewReward: 1,
  reviewerXp: 30,
  reviewerCoins: 5,
  xpPerChecklistItem: 20,
  helpfulReviewCoins: 3,
  // Навык выветривается, если его не тренировать
  freshnessDays: 30,
} as const;

// Сколько всего опыта нужно для уровня n: 200, 500, 900, 1400...
export function xpForLevel(level: number): number {
  return 50 * level * (level + 3);
}

export interface LevelInfo {
  level: number;
  xp: number;
  levelStartXp: number;
  nextLevelXp: number | null;
  progress: number;
  rank: string;
}

const RANKS: { from: number; title: string }[] = [
  { from: 0, title: 'Стажёр' },
  { from: 2, title: 'Проводник' },
  { from: 5, title: 'Старший проводник' },
  { from: 8, title: 'Наставник' },
  { from: 12, title: 'Мастер сервиса' },
  { from: MAX_LEVEL, title: 'Легенда ВСМ' },
];

export function rankFor(level: number): string {
  return [...RANKS].reverse().find((rank) => level >= rank.from)!.title;
}

export function levelInfo(xp: number): LevelInfo {
  const safeXp = Math.max(0, Math.floor(xp));
  let level = 0;
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= safeXp) level += 1;
  const levelStartXp = xpForLevel(level);
  const nextLevelXp = level >= MAX_LEVEL ? null : xpForLevel(level + 1);
  const progress = nextLevelXp === null ? 1 : (safeXp - levelStartXp) / (nextLevelXp - levelStartXp);
  return { level, xp: safeXp, levelStartXp, nextLevelXp, progress: Math.min(1, Math.max(0, progress)), rank: rankFor(level) };
}

export interface AttemptRewardInput {
  xpReward: number;
  outcome: 'success' | 'partial' | 'failure';
  passed: boolean;
  // Сценарий зачтён впервые
  firstPass: boolean;
}

export function attemptRewards(input: AttemptRewardInput): { xp: number; coins: number } {
  if (!input.passed) return { xp: 0, coins: 0 };
  if (!input.firstPass) {
    return {
      xp: Math.max(ECONOMY.repeatXpMin, Math.round(input.xpReward * ECONOMY.repeatXpShare)),
      coins: ECONOMY.coinsRepeat,
    };
  }
  if (input.outcome === 'success') return { xp: input.xpReward, coins: ECONOMY.coinsFirstSuccess };
  return { xp: Math.round(input.xpReward * ECONOMY.partialXpShare), coins: ECONOMY.coinsFirstPartial };
}

// Сколько дней навык ещё считается свежим. Отрицательное число - уже пора освежить.
export function freshnessDaysLeft(lastPassedAt: Date, now: Date = new Date()): number {
  const expires = lastPassedAt.getTime() + ECONOMY.freshnessDays * 86_400_000;
  return Math.ceil((expires - now.getTime()) / 86_400_000);
}
