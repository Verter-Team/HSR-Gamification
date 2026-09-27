import { type FormEvent, useState } from 'react';
import { useAuth } from '../../app/auth';
import { OfflineError } from '../../shared/api/client';
import { Pixels } from '../../shared/ui';

export function LoginPage() {
  const { login } = useAuth();
  const [externalId, setExternalId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(externalId.trim(), password);
    } catch (err) {
      setError(err instanceof OfflineError ? 'Нет связи с сервером. Для первого входа нужен интернет.' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app login">
      <div className="stack">
        <span className="eyebrow">ВСМ Москва - Санкт-Петербург</span>
        <h1>Тренажёр<br />проводника</h1>
        <Pixels value={0.35} cells={24} />
        <p className="muted" style={{ margin: 0 }}>
          Рабочие ситуации на время, разбор каждого решения и рост по уровням. Ошибаться здесь можно.
        </p>
      </div>
      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="externalId">Табельный номер</label>
          <input id="externalId" className="input mono" inputMode="numeric" autoComplete="username" value={externalId} onChange={(event) => setExternalId(event.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">Пароль</label>
          <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn block" disabled={busy}>{busy ? 'Входим...' : 'Войти'}</button>
        <p className="small muted" style={{ margin: 0 }}>
          Демо: проводник <span className="mono">4471</span>, руководитель <span className="mono">1001</span>, пароль <span className="mono">demo</span>
        </p>
      </form>
    </div>
  );
}
