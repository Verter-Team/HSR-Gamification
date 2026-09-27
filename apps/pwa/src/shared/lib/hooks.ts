import { useCallback, useEffect, useRef, useState } from 'react';
import { api, OfflineError } from '../api/client';
import { cacheGet, cacheSet } from '../db/store';

interface Resource<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  // Данные из кеша, сервер недоступен
  stale: boolean;
  reload: () => Promise<void>;
}

// Загрузка с сервера с запасным вариантом из IndexedDB: без сети показываем последнее известное
export function useResource<T>(path: string | null): Resource<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const current = useRef(path);
  current.current = path;

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const fresh = await api<T>(path);
      if (current.current !== path) return;
      setData(fresh);
      setStale(false);
      setError(null);
      void cacheSet(`res:${path}`, fresh);
    } catch (err) {
      const cached = await cacheGet<T>(`res:${path}`);
      if (current.current !== path) return;
      if (cached !== undefined) {
        setData(cached);
        setStale(err instanceof OfflineError);
        setError(err instanceof OfflineError ? null : (err as Error).message);
      } else {
        setError((err as Error).message);
      }
    } finally {
      if (current.current === path) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    let alive = true;
    if (path) {
      void cacheGet<T>(`res:${path}`).then((cached) => {
        if (alive && cached !== undefined) setData((prev) => prev ?? cached);
      });
    }
    void load();
    return () => { alive = false; };
  }, [load, path]);

  return { data, error, loading, stale, reload: load };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  return reduced;
}
