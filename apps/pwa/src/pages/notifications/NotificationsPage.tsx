import { ArrowLeft, Award, Hourglass, MessageSquareText, Train, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useResource } from '../../shared/lib/hooks';
import { ErrorNote, Loading, StaleNote } from '../../shared/ui';
import type { Notification } from '../../entities/types';

const ICONS: Record<Notification['type'], ReactNode> = {
  review_received: <MessageSquareText size={20} />,
  review_queue: <MessageSquareText size={20} />,
  skill_fading: <Hourglass size={20} color="var(--safety)" />,
  achievement: <Award size={20} color="var(--ok)" />,
  tribe: <Users size={20} />,
  scenario_open: <Train size={20} color="var(--signal-soft)" />,
};

export function NotificationsPage() {
  const list = useResource<Notification[]>('/me/notifications');
  return (
    <>
      <header className="topbar">
        <Link to="/" className="icon-btn" aria-label="Назад"><ArrowLeft size={20} /></Link>
        <h1 style={{ flex: 1 }}>Уведомления</h1>
      </header>
      {list.stale && <StaleNote />}
      {!list.data ? (list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : <Loading />) : list.data.length === 0 ? (
        <div className="empty">Новостей нет. Пройдите сценарий или проверьте ответ коллеги.</div>
      ) : (
        <div className="stack">
          {list.data.map((item) => (
            <Link key={item.id} to={item.link.startsWith('/scenario/') ? '/' : item.link} className="card row" style={{ alignItems: 'flex-start', textDecoration: 'none', color: 'inherit' }}>
              <span style={{ flex: 'none', marginTop: 2 }}>{ICONS[item.type]}</span>
              <span>
                <b style={{ display: 'block' }}>{item.title}</b>
                <span className="small muted">{item.text}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
