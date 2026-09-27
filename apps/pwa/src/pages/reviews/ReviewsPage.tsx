import { Check, ThumbsDown, ThumbsUp } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { ago, plural } from '../../shared/lib/format';
import { useResource } from '../../shared/lib/hooks';
import { ErrorNote, Loading, Sheet, StaleNote } from '../../shared/ui';
import type { MyReviews, QueueItem } from '../../entities/types';

function EvaluateSheet({ item, onClose, onDone }: { item: QueueItem; onClose: () => void; onDone: (message: string) => void }) {
  const [checks, setChecks] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setChecks((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ rewards: { xp: number; coins: number; reviewPoints: number } }>(`/reviews/${item.id}/evaluate`, { checks, comment });
      onDone(`Проверка отправлена: +${response.rewards.xp} XP, +${response.rewards.coins} коинов, +${response.rewards.reviewPoints} балл проверки`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose} label={item.scenario.title}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>{item.prompt}</p>
        <blockquote className="card" style={{ margin: 0, fontSize: 17, lineHeight: 1.5 }}>«{item.answer}»</blockquote>
        <div className="eyebrow" style={{ marginTop: 4 }}>Что есть в ответе</div>
        {item.checklist.map((point) => (
          <label key={point.id} className="check">
            <input type="checkbox" checked={checks.includes(point.id)} onChange={() => toggle(point.id)} />
            <span>{point.text}</span>
          </label>
        ))}
        <div className="field">
          <label htmlFor="comment">Совет коллеге</label>
          <textarea id="comment" className="input" style={{ minHeight: 100 }} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Что получилось и что стоит сказать иначе" />
        </div>
        {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
        <button className="btn block" disabled={busy || comment.trim().length < 10} onClick={send}>
          {busy ? 'Отправляем...' : `Отправить проверку · ${checks.length} из ${item.checklist.length}`}
        </button>
      </div>
    </Sheet>
  );
}

function Queue({ onToast }: { onToast: (message: string) => void }) {
  const queue = useResource<{ canReview: boolean; items: QueueItem[] }>('/reviews/queue');
  const [open, setOpen] = useState<QueueItem | null>(null);
  if (!queue.data) return queue.error ? <ErrorNote message={queue.error} onRetry={queue.reload} /> : <Loading />;
  if (!queue.data.canReview) {
    return <div className="empty">Проверять можно сценарии, которые вы сами зачли. Начните с «Первой смены» на маршруте.</div>;
  }
  if (queue.data.items.length === 0) return <div className="empty">Все ответы коллег проверены. Загляните позже.</div>;
  return (
    <div className="stack">
      {queue.data.items.map((item) => (
        <button key={item.id} className="card stack" style={{ textAlign: 'left', cursor: 'pointer', gap: 8 }} onClick={() => setOpen(item)}>
          <div className="spread small">
            <span className="row" style={{ gap: 6, '--t': item.author.tribe?.color } as CSSProperties}>
              <span className="tribe-square" /> Коллега, уровень {item.author.level}
            </span>
            <span className="muted">{ago(item.createdAt)}</span>
          </div>
          <b>{item.scenario.title}</b>
          <span className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>«{item.answer}»</span>
        </button>
      ))}
      {open && (
        <EvaluateSheet
          item={open}
          onClose={() => setOpen(null)}
          onDone={(message) => { setOpen(null); onToast(message); void queue.reload(); }}
        />
      )}
    </div>
  );
}

function Mine({ data, reload }: { data: MyReviews; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function rate(id: string, helpful: boolean) {
    setBusy(id);
    try {
      await api(`/reviews/${id}/rate`, { helpful });
      await reload();
    } finally {
      setBusy(null);
    }
  }
  if (data.submitted.length === 0) {
    return <div className="empty">Вы ещё не отправляли ответы. После сценария на экране разбора есть открытый вопрос.</div>;
  }
  return (
    <div className="stack">
      {data.submitted.map((item) => (
        <div key={item.id} className="card stack" style={{ gap: 10 }}>
          <div className="spread small">
            <b>{item.scenario.title}</b>
            <span className="chip">{item.status === 'pending' ? 'Ждёт проверки' : `${item.checks.length} из ${item.checklist.length}`}</span>
          </div>
          <p className="small muted" style={{ margin: 0 }}>«{item.answer}»</p>
          {item.status === 'reviewed' && (
            <>
              <div className="stack" style={{ gap: 4 }}>
                {item.checklist.map((point) => (
                  <div key={point.id} className="row small" style={{ gap: 8, color: item.checks.includes(point.id) ? 'var(--paper)' : 'var(--muted)' }}>
                    <Check size={16} color={item.checks.includes(point.id) ? 'var(--ok)' : 'var(--line)'} /> {point.text}
                  </div>
                ))}
              </div>
              {item.comment && (
                <div className="banner small">
                  <span className="muted">Коллега, уровень {item.reviewerLevel}: </span>{item.comment}
                </div>
              )}
              {item.helpful === null ? (
                <div className="row">
                  <span className="small muted" style={{ flex: 1 }}>Проверка помогла?</span>
                  <button className="btn ghost" disabled={busy === item.id} onClick={() => rate(item.id, true)}><ThumbsUp size={16} /> Да</button>
                  <button className="btn ghost" disabled={busy === item.id} onClick={() => rate(item.id, false)}><ThumbsDown size={16} /> Формально</button>
                </div>
              ) : (
                <span className="small muted">Вы оценили проверку: {item.helpful ? 'полезная' : 'формальная'}</span>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function ReviewsPage() {
  const [tab, setTab] = useState<'queue' | 'mine'>('queue');
  const [toast, setToast] = useState<string | null>(null);
  const mine = useResource<MyReviews>('/reviews/mine');
  const points = mine.data?.reviewPoints ?? 0;
  return (
    <>
      <header className="topbar"><h1>Проверки</h1></header>
      <div className="stack">
        {mine.stale && <StaleNote />}
        <div className="card stack" style={{ gap: 6 }}>
          <div className="spread">
            <span className="display" style={{ fontSize: 28 }}>{points}</span>
            <span className="small muted">{mine.data?.reviewsGiven ?? 0} {plural(mine.data?.reviewsGiven ?? 0, 'проверка', 'проверки', 'проверок')} проведено</span>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {plural(points, 'балл', 'балла', 'баллов')} проверки. Как в Школе 21: отправить свой ответ стоит 1 балл, заработать его можно, только проверив коллегу.
          </p>
        </div>
        {toast && <div className="banner" role="status" style={{ borderColor: 'var(--ok)' }}>{toast}</div>}
        <div className="segments" role="tablist">
          <button role="tab" aria-selected={tab === 'queue'} className={tab === 'queue' ? 'on' : ''} onClick={() => setTab('queue')}>Проверить коллег</button>
          <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>Мои ответы</button>
        </div>
        {tab === 'queue'
          ? <Queue onToast={(message) => { setToast(message); void mine.reload(); }} />
          : mine.data ? <Mine data={mine.data} reload={mine.reload} /> : <Loading />}
        <p className="small muted" style={{ textAlign: 'center' }}>Ответы анонимны: видно только уровень и племя. <Link to="/">На маршрут</Link></p>
      </div>
    </>
  );
}
