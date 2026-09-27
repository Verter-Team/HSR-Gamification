// IndexedDB: сценарии, последние ответы сервера и очередь результатов на отправку.
// Всё, что нужно для прохождения в поезде без связи.
import { createStore, del, get, keys, set } from 'idb-keyval';

const cache = createStore('vsm-trainer', 'cache');
const queue = createStore('vsm-trainer-queue', 'attempts');

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    return await get<T>(key, cache);
  } catch {
    return undefined;
  }
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  try {
    await set(key, value, cache);
  } catch {
    // хранилище недоступно: приложение работает, но без офлайна
  }
}

export interface QueuedAttempt {
  attemptId: string;
  scenarioVersionId: string;
  scenarioSlug: string;
  scenarioTitle: string;
  startedAt: string;
  clientScore: number;
  events: { seq: number; nodeId: string; optionId: string | null; reactionMs: number }[];
  queuedAt: string;
}

export async function enqueueAttempt(item: QueuedAttempt): Promise<void> {
  await set(item.attemptId, item, queue);
}

export async function removeQueued(attemptId: string): Promise<void> {
  await del(attemptId, queue);
}

export async function listQueued(): Promise<QueuedAttempt[]> {
  try {
    const ids = await keys<string>(queue);
    const items = await Promise.all(ids.map((id) => get<QueuedAttempt>(id, queue)));
    return items.filter((item): item is QueuedAttempt => Boolean(item)).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  } catch {
    return [];
  }
}
