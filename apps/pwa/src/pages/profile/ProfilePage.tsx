import { BarChart3, LogOut, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isStaff, useAuth } from '../../app/auth';
import { freshnessLabel, nf } from '../../shared/lib/format';
import { useResource } from '../../shared/lib/hooks';
import { ErrorNote, Icon, Loading, Pixels, StaleNote } from '../../shared/ui';
import type { Achievement, Me, Skill } from '../../entities/types';

// Радар навыков: доля от максимума, который можно набрать во всех сценариях
function Radar({ skills }: { skills: Skill[] }) {
  const size = 300;
  const center = size / 2;
  const radius = 92;
  const point = (index: number, share: number) => {
    const angle = (Math.PI * 2 * index) / skills.length - Math.PI / 2;
    return [center + Math.cos(angle) * radius * share, center + Math.sin(angle) * radius * share] as const;
  };
  const polygon = (share: (index: number) => number) => skills.map((_, index) => point(index, share(index)).join(',')).join(' ');
  return (
    <svg viewBox={`-70 0 ${size + 140} ${size}`} role="img" aria-label={`Навыки: ${skills.map((skill) => `${skill.title} ${skill.percent}%`).join(', ')}`} style={{ width: '100%', maxWidth: 400, display: 'block', margin: '0 auto' }}>
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon key={ring} points={polygon(() => ring)} fill="none" stroke="var(--line)" strokeWidth={1} />
      ))}
      {skills.map((_, index) => {
        const [x, y] = point(index, 1);
        return <line key={index} x1={center} y1={center} x2={x} y2={y} stroke="var(--line)" />;
      })}
      <polygon points={polygon((index) => Math.max(0.04, skills[index].percent / 100))} fill="rgba(47,107,255,.35)" stroke="var(--signal)" strokeWidth={2} />
      {skills.map((skill, index) => {
        const [x, y] = point(index, Math.max(0.04, skill.percent / 100));
        const faded = skill.daysLeft !== null && skill.daysLeft <= 0;
        return <rect key={skill.id} x={x - 4} y={y - 4} width={8} height={8} fill={faded ? 'var(--safety)' : 'var(--signal-soft)'} />;
      })}
      {skills.map((skill, index) => {
        const [x, y] = point(index, 1.3);
        const anchor = Math.abs(x - center) < 10 ? 'middle' : x > center ? 'start' : 'end';
        return (
          <text key={skill.id} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" fill="var(--muted)" fontSize={12} fontFamily="var(--body)">
            {skill.title.split(' ').map((word, line) => <tspan key={line} x={x} dy={line === 0 ? 0 : 13}>{word}</tspan>)}
          </text>
        );
      })}
    </svg>
  );
}

export function ProfilePage() {
  const { user, logout } = useAuth();
  const me = useResource<Me>('/me');
  const achievements = useResource<Achievement[]>(user ? `/users/${user.id}/achievements` : null);

  if (!me.data) return me.error ? <div style={{ paddingTop: 24 }}><ErrorNote message={me.error} onRetry={me.reload} /></div> : <Loading />;
  const { level, stats } = me.data;

  return (
    <>
      <header className="topbar"><h1>Профиль</h1></header>
      <div className="stack" style={{ gap: 16 }}>
        {me.stale && <StaleNote />}
        <section className="card stack">
          <div className="row" style={{ gap: 14 }}>
            <div className="level-badge">{level.level}</div>
            <div>
              <div className="eyebrow">{level.rank}</div>
              <b style={{ fontSize: 18 }}>{me.data.user.displayName}</b>
              <div className="small muted mono">таб. {me.data.user.externalId} · {me.data.depot?.name}</div>
            </div>
          </div>
          <Pixels value={level.progress} cells={24} tall />
          <div className="spread small">
            <span className="mono">{nf.format(level.xp)} XP</span>
            <span className="muted">Уровни как в Школе 21: до 21-го</span>
          </div>
        </section>

        <section className="card stack">
          <div className="spread">
            <h2 className="eyebrow">Навыки</h2>
            <span className="small muted">от максимума во всех сценариях</span>
          </div>
          <Radar skills={me.data.skills} />
          <div className="stack" style={{ gap: 8 }}>
            {me.data.skills.map((skill) => {
              const label = freshnessLabel(skill.daysLeft);
              const faded = skill.daysLeft !== null && skill.daysLeft <= 0;
              return (
                <div key={skill.id} className="spread small">
                  <span>{skill.title}</span>
                  <span className="row" style={{ gap: 8 }}>
                    <span style={{ color: faded ? 'var(--safety)' : 'var(--muted)' }}>{label ?? 'не тренировался'}</span>
                    <b className="mono" style={{ width: 40, textAlign: 'right' }}>{skill.percent}%</b>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="small muted" style={{ margin: 0 }}>Навык без практики выветривается за 30 дней. Повторите сценарий, чтобы он снова стал свежим.</p>
        </section>

        <section className="wallet">
          <div><b>{stats.scenariosPassed}</b><span>сценариев зачтено</span></div>
          <div><b>{stats.avgSafety === null ? '-' : Math.round(stats.avgSafety)}</b><span>средняя безопасность</span></div>
          <div><b>{stats.reviewsGiven}</b><span>проверок коллег</span></div>
        </section>

        <section className="stack">
          <div className="spread">
            <h2 className="eyebrow">Достижения</h2>
            <span className="small muted mono">{me.data.achievements.unlocked} / {me.data.achievements.total}</span>
          </div>
          {achievements.data ? (
            <div className="achievements">
              {achievements.data.map((item) => (
                <div key={item.code} className={`achievement t${item.tier}${item.unlockedAt ? ' on' : ''}`} title={item.description}>
                  <div className="ico"><Icon name={item.icon} /></div>
                  <b>{item.title}</b>
                  <span className="small muted" style={{ fontSize: 11 }}>{item.description}</span>
                </div>
              ))}
            </div>
          ) : <Loading />}
        </section>

        <Link to="/shop" className="card spread" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="row"><ShoppingBag size={20} /> Магазин наград</span>
          <b className="mono">{me.data.coins} коинов</b>
        </Link>
        {isStaff(user) && (
          <Link to="/analytics" className="card row" style={{ textDecoration: 'none', color: 'inherit' }}>
            <BarChart3 size={20} /> Аналитика обучения
          </Link>
        )}
        <button className="btn ghost block" onClick={logout}><LogOut size={18} /> Выйти</button>
      </div>
    </>
  );
}
