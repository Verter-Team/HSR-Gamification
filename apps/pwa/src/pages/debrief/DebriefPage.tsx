import type { PeerTask, SessionSummary } from '@vsm/scenario-engine';
import { ArrowRight, CloudOff, RotateCcw, Unlock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { cacheGet, cacheSet } from '../../shared/db/store';
import { nf } from '../../shared/lib/format';
import { usePrefersReducedMotion } from '../../shared/lib/hooks';
import { Icon, Loading } from '../../shared/ui';
import type { AttemptResponse } from '../../entities/types';

export interface StoredResult {
  attemptId: string;
  slug: string;
  title: string;
  xpReward: number;
  summary: SessionSummary;
  peerTask: PeerTask | null;
  response: AttemptResponse | null;
  error: string | null;
  finishedAt: string;
  peerSubmitted?: boolean;
}

const OUTCOME = {
  success: { title: 'Смена отработана', color: 'var(--ok)' },
  partial: { title: 'Зачтено с замечаниями', color: 'var(--safety)' },
  failure: { title: 'Не зачтено', color: 'var(--loyalty)' },
};

const VERDICT = { correct: 'Верно', acceptable: 'Допустимо', wrong: 'Ошибка' };

function useCountUp(target: number): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) { setValue(target); return; }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const share = Math.min(1, (now - start) / 900);
      setValue(Math.round(target * (1 - (1 - share) ** 3)));
      if (share < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, target]);
  return value;
}

function Rewards({ result }: { result: StoredResult }) {
  const rewards = result.response?.rewards;
  const xp = useCountUp(rewards?.xp ?? 0);
  if (!result.response) {
    return (
      <div className="card row" style={{ alignItems: 'flex-start' }}>
        <CloudOff size={20} style={{ flex: 'none', marginTop: 2 }} />
        <div>
          <b>Результат сохранён на телефоне</b>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            {result.error ?? 'Связи нет. Отправим, как только появится сеть, и начислим опыт.'}
          </p>
        </div>
      </div>
    );
  }
  if (result.response.status === 'invalid') {
    return <div className="card"><b>Попытка не засчитана</b><p className="small muted" style={{ margin: '4px 0 0' }}>{result.response.reason}</p></div>;
  }
  if (!rewards) return null;
  if (rewards.xp === 0) {
    return (
      <div className="card">
        <b>Опыт начисляется за зачёт</b>
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          Разберите решения ниже и попробуйте снова. Ошибка на тренажёре ничего не стоит, в вагоне - стоит.
        </p>
      </div>
    );
  }
  const levelUp = rewards.levelAfter > rewards.levelBefore;
  return (
    <div className="stack">
      <div className="card reward-burst">
        {levelUp ? (
          <div className="level-up stack" style={{ justifyItems: 'center' }}>
            <span className="eyebrow">Новый уровень</span>
            <div className="level-badge" style={{ width: 88, height: 88, fontSize: 40 }}>{rewards.levelAfter}</div>
            <b>{rewards.rank}</b>
          </div>
        ) : (
          <div className="big mono">+{nf.format(xp)} XP</div>
        )}
        <p className="muted small" style={{ margin: '10px 0 0' }}>
          {levelUp && <>+{nf.format(xp)} XP · </>}
          {rewards.coins > 0 && <>+{rewards.coins} коинов · </>}
          {rewards.firstPass ? 'первый зачёт' : rewards.xp > 0 ? 'повтор: 10% опыта, навык снова свежий' : 'опыт даётся за зачёт'}
        </p>
      </div>
      {rewards.unlockedScenarios.map((item) => (
        <div key={item.slug} className="banner row"><Unlock size={16} style={{ color: 'var(--ok)' }} /> Открыт сценарий «{item.title}»</div>
      ))}
      {rewards.newAchievements.map((item) => (
        <div key={item.code} className="card row level-up">
          <div className={`achievement on t${item.tier}`} style={{ padding: 0, border: 0, background: 'none', opacity: 1 }}>
            <div className="ico" style={{ margin: 0 }}><Icon name={item.icon} /></div>
          </div>
          <div><div className="eyebrow">Достижение</div><b>{item.title}</b></div>
        </div>
      ))}
    </div>
  );
}

function PeerTaskCard({ result, onSubmitted }: { result: StoredResult; onSubmitted: () => void }) {
  const task = result.peerTask;
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!task || result.response?.status !== 'scored' || !result.summary.passed) return null;
  if (result.peerSubmitted) {
    return (
      <div className="card stack">
        <span className="eyebrow">Взаимная проверка</span>
        <p style={{ margin: 0 }}>Ответ у коллег. Когда его проверят, придёт уведомление и опыт за выполненные пункты.</p>
        <Link className="btn ghost" to="/reviews">Проверить коллегу <ArrowRight size={18} /></Link>
      </div>
    );
  }
  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api('/reviews', { attemptId: result.attemptId, answer });
      onSubmitted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card stack">
      <span className="eyebrow">Взаимная проверка · 1 балл</span>
      <p style={{ margin: 0, fontWeight: 600 }}>{task.prompt}</p>
      <p className="small muted" style={{ margin: 0 }}>
        Тест не покажет, как вы говорите с людьми. Ответ проверит коллега, который сам прошёл этот сценарий, по чек-листу:
      </p>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        {task.checklist.map((item) => <li key={item.id}>{item.text}</li>)}
      </ul>
      <textarea className="input" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Ваши слова..." aria-label="Ваш ответ" />
      <div className="spread small muted">
        <span>{answer.trim().length} из {task.minLength} символов минимум</span>
      </div>
      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
      <button className="btn" disabled={busy || answer.trim().length < task.minLength} onClick={send}>
        {busy ? 'Отправляем...' : 'Отправить на проверку'}
      </button>
    </div>
  );
}

export function DebriefPage() {
  const { attemptId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [result, setResult] = useState<StoredResult | null>((location.state as StoredResult | null) ?? null);

  useEffect(() => {
    if (!result && attemptId) void cacheGet<StoredResult>(`result:${attemptId}`).then((stored) => setResult(stored ?? null));
  }, [attemptId, result]);

  if (!result) return <Loading />;
  const { summary } = result;
  const outcome = OUTCOME[summary.outcome];

  function markSubmitted() {
    if (!result) return;
    const next = { ...result, peerSubmitted: true };
    setResult(next);
    void cacheSet(`result:${next.attemptId}`, next);
  }

  return (
    <div className="stack" style={{ paddingTop: 24, gap: 16 }}>
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">{result.title}</span>
        <h1 className="display" style={{ fontSize: 26, color: outcome.color }}>{outcome.title}</h1>
        <p style={{ margin: 0 }}>{summary.endingText}</p>
      </div>
      <div className="wallet">
        <div><b>{summary.score}</b><span>очков</span></div>
        <div><b style={{ color: 'var(--safety)' }}>{summary.metrics.safety}</b><span>безопасность</span></div>
        <div><b style={{ color: 'var(--loyalty)' }}>{summary.metrics.loyalty}</b><span>лояльность</span></div>
      </div>
      <Rewards result={result} />
      <PeerTaskCard result={result} onSubmitted={markSubmitted} />

      <section className="stack">
        <h2 className="eyebrow" style={{ marginTop: 8 }}>Разбор решений</h2>
        {summary.decisions.map((decision, index) => (
          <div key={`${decision.nodeId}-${index}`} className={`card verdict ${decision.verdict ?? ''}`}>
            <div className="stack" style={{ gap: 6 }}>
              <div className="spread small">
                <b>{decision.verdict ? VERDICT[decision.verdict] : 'Решение'}</b>
                <span className="mono muted">{decision.timedOut ? 'время вышло' : `${(decision.reactionMs / 1000).toFixed(1)} с`}</span>
              </div>
              <div className="small muted">{decision.prompt}</div>
              <div style={{ fontWeight: 600 }}>{decision.answer}</div>
              {decision.feedback && <p className="small" style={{ margin: 0 }}>{decision.feedback}</p>}
            </div>
          </div>
        ))}
      </section>

      <div className="row" style={{ marginTop: 4 }}>
        <button className="btn ghost" onClick={() => navigate(`/play/${result.slug}`, { replace: true })}><RotateCcw size={18} /> Ещё раз</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => navigate('/', { replace: true })}>На маршрут</button>
      </div>
    </div>
  );
}
