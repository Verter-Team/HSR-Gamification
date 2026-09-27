// Клиент к серверу. Токен хранится локально, при 401 сессия сбрасывается.
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api';
const TOKEN_KEY = 'vsm.token';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class OfflineError extends Error {
  constructor() {
    super('Нет связи с сервером');
  }
}

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // приватный режим браузера: работаем без сохранения
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new OfflineError();
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (response.status === 401 && token) onUnauthorized?.();
  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join('. ') : data?.message;
    throw new ApiError(response.status, message ?? `Ошибка сервера (${response.status})`);
  }
  return data as T;
}
