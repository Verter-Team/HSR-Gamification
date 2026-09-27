import { type CSSProperties, useState } from 'react';
import { useAuth } from '../../app/auth';
import { nf, plural } from '../../shared/lib/format';
import { useResource } from '../../shared/lib/hooks';
import { ErrorNote, Loading, Pixels, StaleNote } from '../../shared/ui';
import type { LeaderboardEntry, Tribes } from '../../entities/types';

function People() {
  const { user } = useAuth();
  const board = useResource<{ entries: LeaderboardEntry[] }>('/leaderboard?limit=50');
  if (!board.data) return board.error ? <ErrorNote message={board.error} onRetry={board.reload} /> : <Loading />;
  return (
    <div className="stack" style={{ gap: 4 }}>
      {board.stale && <StaleNote />}
      {board.data.entries.map((entry) => (
        <div key={entry.userId} className={`rank-row${entry.userId === user?.id ? ' me' : ''}`}>
          <span className="rank-num">{entry.rank}</span>
          <span style={{ minWidth: 0 }}>
            <b style={{ display: 'block' }}>{entry.displayName}</b>
            <span className="small muted row" style={{ gap: 6, '--t': entry.tribe?.color } as CSSProperties}>
              <span className="tribe-square" /> {entry.title} · {entry.orgUnit?.name.replace('Депо ', '')}
            </span>
          </span>
          <span style={{ textAlign: 'right' }}>
            <b className="mono" style={{ display: 'block' }}>ур. {entry.level}</b>
            <span className="small muted mono">{nf.format(entry.xp)} XP</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function TribesView() {
  const tribes = useResource<Tribes>('/tribes');
  if (!tribes.data) return tribes.error ? <ErrorNote message={tribes.error} onRetry={tribes.reload} /> : <Loading />;
  const { season } = tribes.data;
  const top = Math.max(1, ...tribes.data.tribes.map((tribe) => tribe.points));
  return (
    <div className="stack">
      <div className="card spread">
        <div>
          <div className="eyebrow">{season.title}</div>
          <div className="small muted" style={{ marginTop: 4 }}>
            Ещё {season.daysLeft} {plural(season.daysLeft, 'день', 'дня', 'дней')}. Племя копит опыт всех участников за сезон.
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <b className="mono">+{nf.format(tribes.data.myContribution)}</b>
          <div className="small muted">ваш вклад</div>
        </div>
      </div>
      {tribes.data.tribes.map((tribe) => (
        <div key={tribe.slug} className="card stack" style={{ gap: 10, borderColor: tribe.isMine ? tribe.color : undefined }}>
          <div className="spread">
            <span className="row" style={{ gap: 10, '--t': tribe.color } as CSSProperties}>
              <span className="rank-num" style={{ width: 20 }}>{tribe.rank}</span>
              <span className="tribe-square" style={{ width: 16, height: 16 }} />
              <span className="display" style={{ fontSize: 17 }}>{tribe.name}</span>
              {tribe.isMine && <span className="chip">ваше</span>}
            </span>
            <b className="mono">{nf.format(tribe.points)}</b>
          </div>
          <Pixels value={tribe.points / top} cells={24} color={tribe.color} />
          <div className="small muted">«{tribe.motto}» · {tribe.members} {plural(tribe.members, 'участник', 'участника', 'участников')}</div>
          {tribe.top.length > 0 && (
            <div className="small">Больше всех принесли: {tribe.top.map((person) => `${person.displayName} (${nf.format(person.points)})`).join(', ')}</div>
          )}
        </div>
      ))}
      <p className="small muted" style={{ margin: 0 }}>
        Племена собраны из разных депо, как в Школе 21: чтобы опыт Москвы, Твери и Петербурга перемешивался.
      </p>
    </div>
  );
}

export function LeaderboardPage() {
  const [tab, setTab] = useState<'tribes' | 'people'>('tribes');
  return (
    <>
      <header className="topbar"><h1>Рейтинг</h1></header>
      <div className="segments" role="tablist">
        <button role="tab" aria-selected={tab === 'tribes'} className={tab === 'tribes' ? 'on' : ''} onClick={() => setTab('tribes')}>Племена</button>
        <button role="tab" aria-selected={tab === 'people'} className={tab === 'people' ? 'on' : ''} onClick={() => setTab('people')}>Проводники</button>
      </div>
      {tab === 'tribes' ? <TribesView /> : <People />}
    </>
  );
}
