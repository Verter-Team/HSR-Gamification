// Служебные треки журнала начислений. Всё остальное в треках - компетенции.
export const TRACK_XP = 'xp';
export const TRACK_COINS = 'coins';
export const TRACK_REVIEW_POINTS = 'review_points';
export const CURRENCY_TRACKS = [TRACK_XP, TRACK_COINS, TRACK_REVIEW_POINTS];

// Ветки графа прогресса. Совпадают с content/catalog.json.
export const BRANCHES = [
  { id: 'intensive', title: 'Интенсив', color: '#7C8CFF' },
  { id: 'service', title: 'Сервис и общение', color: '#2FD4A7' },
  { id: 'medicine', title: 'Медицина', color: '#FF6B81' },
  { id: 'safety', title: 'Безопасность', color: '#FFB547' },
  { id: 'exam', title: 'Аттестация', color: '#E8EDF7' },
];

// Порядок осей на радаре навыков
export const SKILL_ORDER = ['service', 'communication', 'deescalation', 'first_aid', 'fire_safety', 'coordination'];

export const STAFF_ROLES = ['METHODOLOGIST', 'SUPERVISOR', 'ADMIN'];

const SEASON_TITLES: Record<number, string> = { 11: 'Зимний сезон', 2: 'Весенний сезон', 5: 'Летний сезон', 8: 'Осенний сезон' };

// Сезон племён - три календарных месяца: осень, зима, весна, лето
export function currentSeason(now: Date = new Date()): { title: string; startsAt: Date; endsAt: Date } {
  const month = now.getUTCMonth();
  const startMonth = month - ((month + 1) % 3);
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), startMonth, 1));
  const endsAt = new Date(Date.UTC(now.getUTCFullYear(), startMonth + 3, 1));
  return { title: SEASON_TITLES[(startMonth + 12) % 12], startsAt, endsAt };
}
