// Отправка результатов. Сначала попытка кладётся в очередь, потом уходит на сервер.
// Если связи нет - уйдёт при появлении сети или при следующем открытии приложения.
// Background Sync не используем: в Safari его нет.
import { useEffect, useState } from 'react';
import { api, ApiError, OfflineError } from '../../shared/api/client';
import { enqueueAttempt, listQueued, QueuedAttempt, removeQueued } from '../../shared/db/store';
import type { AttemptResponse } from '../../entities/types';

type Listener = (count: number) => void;
const listeners = new Set<Listener>();
let flushing: Promise<void> | null = null;

async function notify(): Promise<void> {
  const count = (await listQueued()).length;
  listeners.forEach((listener) => listener(count));
}

async function send(item: QueuedAttempt): Promise<AttemptResponse> {
  const { scenarioSlug: _slug, scenarioTitle: _title, queuedAt: _queued, ...body } = item;
  return api<AttemptResponse>('/attempts', body);
}

// Отправляет одну попытку сразу. Возвращает null, если связи нет - попытка осталась в очереди.
export async function submitAttempt(item: QueuedAttempt): Promise<AttemptResponse | null> {
  await enqueueAttempt(item);
  await notify();
  try {
    const response = await send(item);
    await removeQueued(item.attemptId);
    await notify();
    return response;
  } catch (error) {
    if (error instanceof OfflineError) return null;
    // Сервер отклонил навсегда (например, версия сценария снята) - не держим в очереди
    if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429) {
      await removeQueued(item.attemptId);
      await notify();
    }
    throw error;
  }
}

export function flushQueue(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    for (const item of await listQueued()) {
      try {
        await send(item);
        await removeQueued(item.attemptId);
      } catch (error) {
        if (error instanceof OfflineError) break;
        if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429) {
          await removeQueued(item.attemptId);
        }
      }
    }
    await notify();
  })().finally(() => { flushing = null; });
  return flushing;
}

export function startSync(): () => void {
  const onOnline = () => void flushQueue();
  window.addEventListener('online', onOnline);
  void flushQueue();
  return () => window.removeEventListener('online', onOnline);
}

export function useQueueCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    listeners.add(setCount);
    void listQueued().then((items) => setCount(items.length));
    return () => { listeners.delete(setCount); };
  }, []);
  return count;
}
