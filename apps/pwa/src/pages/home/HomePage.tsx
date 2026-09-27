import { Bell, CloudOff, Lock } from 'lucide-react';
import { type CSSProperties, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueueCount } from '../../features/offline-sync/sync';
import { freshnessLabel, nf, plural } from '../../shared/lib/format';
import { useResource } from '../../shared/lib/hooks';
import { ErrorNote, Loading, Pixels, Sheet, StaleNote } from '../../shared/ui';
import type { Branch, MapNode, Me, Notification, PublishedScenario, ScenarioMap } from '../../entities/types';

const TIERS = ['Интенсив', 'Основные ситуации', 'Сложнее', 'На пределе', 'Аттестация'];
const STATUS_TEXT: Record<MapNode['status'], string> = {
  passed: 'Зачтено', available: 'Открыт', in_progress: 'Не зачтено', locked: 'Закрыт', soon: 'Скоро',
};

function Hero({ me }: { me: Me }) {
  const { level } = me;
  const toNext = level.nextLevelXp === null ? null : level.nextLevelXp - level.xp;
  return (
    <section className="hero" aria-label="Мой прогресс">
      <div className="row" style={{ gap: 14 }}>
        <div className="level-badge" aria-label={`Уровень ${level.level}`}>{level.level}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="eyebrow">{level.rank}</div>
          <div style={{ fontWeight: 600, fontSize: 17, marginTop: 4 }}>{me.user.displayName}</div>
          <div className="small muted">{me.depot?.name}</div>
        </div>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <Pixels value={level.progress} cells={24} tall />
        <div className="spread small">
          <span className="mono">{nf.format(level.xp)} XP</span>
          <span className="muted">{toNext === null ? 'Максимальный уровень' : `до ${level.level + 1} уровня ${nf.format(toNext)} XP`}</span>
        </div>
      </div>
      <div className="wallet">
        <div><b>{me.coins}</b><span>коинов</span></div>
        <div><b>{me.reviewPoints}</b><span>{plural(me.reviewPoints, 'балл', 'балла', 'баллов')} проверки</span></div>
        <div style={{ '--t': me.tribe?.color } as CSSProperties}>
          <b className="row" style={{ gap: 6, fontFamily: 'var(--body)' }}>
            <span className="tribe-square" />{me.tribe?.name ?? '-'}
          </b>
          <span>племя</span>
        </div>
      </div>
    </section>
  );
}

function StationSheet({ node, branch, onClose }: { node: MapNode; branch?: Branch; onClose: () => void }) {
  const navigate = useNavigate();
  const canPlay = ['available', 'in_progress', 'passed'].includes(node.status);
  const freshness = node.status === 'passed' ? freshnessLabel(node.freshnessDaysLeft) : null;
  return (
    <Sheet onClose={onClose} label={branch?.title ?? 'Сценарий'}>
      <div className="stack">
        <h2 className="display" style={{ fontSize: 22 }}>{node.title}</h2>
        {node.summary && <p style={{ margin: 0 }}>{node.summary}</p>}
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className="chip mono">+{node.xpReward} XP</span>
          {node.status !== 'soon' && <span className="chip">{node.estimatedMinutes} мин</span>}
          {node.status !== 'soon' && <span className="chip">Сложность {node.difficulty} из 5</span>}
          {node.bestScore !== null && <span className="chip mono">Лучший результат {node.bestScore}</span>}
        </div>
        {freshness && (
          <div className="banner" style={node.freshnessDaysLeft !== null && node.freshnessDaysLeft <= 0 ? { borderColor: 'var(--safety)' } : undefined}>
            {freshness}. Навык выветривается через 30 дней без практики, повтор даёт 10% опыта и обновляет срок.
          </div>
        )}
        {node.status === 'locked' && (
          <div className="banner row"><Lock size={16} /> Откроется после: {node.requiresTitles.join(', ')}</div>
        )}
        {node.status === 'soon' && <div className="banner">Сценарий готовит методолог. Появится в следующих версиях.</div>}
        {canPlay && (
          <button className="btn block" onClick={() => navigate(`/play/${node.slug}`)}>
            {node.status === 'passed' ? 'Пройти ещё раз' : node.status === 'in_progress' ? 'Попробовать снова' : 'Начать смену'}
          </button>
        )}
      </div>
    </Sheet>
  );
}

function LineMap({ map, onPick }: { map: ScenarioMap; onPick: (node: MapNode) => void }) {
  const branches = useMemo(() => new Map(map.branches.map((branch) => [branch.id, branch])), [map.branches]);
  const tiers = useMemo(() => {
    const order = (node: MapNode) => map.branches.findIndex((branch) => branch.id === node.branch);
    const grouped = new Map<number, MapNode[]>();
    for (const node of map.nodes) grouped.set(node.tier, [...(grouped.get(node.tier) ?? []), node]);
    // Внутри этапа станции одной ветки идут подряд и соединены линией
    return [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([tier, nodes]) => [tier, [...nodes].sort((a, b) => order(a) - order(b))] as const);
  }, [map.branches, map.nodes]);
  return (
    <div className="line-map">
      {tiers.map(([tier, nodes]) => (
        <section key={tier}>
          <div className="eyebrow tier-label">{TIERS[tier] ?? `Этап ${tier}`}</div>
          <div className="stations">
            {nodes.map((node, index) => {
              const branch = node.branch ? branches.get(node.branch) : undefined;
              const fading = node.status === 'passed' && node.freshnessDaysLeft !== null && node.freshnessDaysLeft <= 0;
              const joined = index > 0 && nodes[index - 1].branch === node.branch;
              return (
                <button
                  key={node.slug}
                  className={`station ${node.status}${joined ? ' joined' : ''}`}
                  style={{ '--branch': branch?.color ?? 'var(--line)' } as CSSProperties}
                  onClick={() => onPick(node)}
                  aria-label={`${node.title}: ${STATUS_TEXT[node.status]}`}
                >
                  <span className="stop" />
                  <span style={{ minWidth: 0 }}>
                    <h3>{node.title}</h3>
                    <span className="meta">
                      <span className="branch-tag">{branch?.title}</span>
                      {' · '}{fading ? <span style={{ color: 'var(--safety)' }}>пора освежить</span> : STATUS_TEXT[node.status]}
                    </span>
                  </span>
                  <span className="xp">{node.status === 'passed' ? '✓' : `+${node.xpReward}`}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function HomePage() {
  const me = useResource<Me>('/me');
  const map = useResource<ScenarioMap>('/me/map');
  const notifications = useResource<Notification[]>('/me/notifications');
  // Графы сценариев сохраняются заранее, чтобы в поезде без связи было что проходить
  useResource<PublishedScenario[]>('/scenarios');
  const queued = useQueueCount();
  const [picked, setPicked] = useState<MapNode | null>(null);

  const next = map.data?.nodes.find((node) => node.status === 'available' || node.status === 'in_progress');
  const branch = picked?.branch ? map.data?.branches.find((item) => item.id === picked.branch) : undefined;

  return (
    <>
      <header className="topbar">
        <h1>Маршрут</h1>
        <Link to="/notifications" className="icon-btn" aria-label="Уведомления">
          <Bell size={20} />
          {notifications.data?.length ? <span className="dot" /> : null}
        </Link>
      </header>
      <div className="stack" style={{ gap: 14 }}>
        {(me.stale || map.stale) && <StaleNote />}
        {queued > 0 && (
          <div className="banner row"><CloudOff size={16} /> Ждут отправки: {queued}. Уйдут, когда появится связь.</div>
        )}
        {me.data ? <Hero me={me.data} /> : me.error ? <ErrorNote message={me.error} onRetry={me.reload} /> : <Loading />}
      </div>
      {next && (
        <button className="card station available" style={{ '--branch': 'var(--signal)', marginBottom: 6 } as CSSProperties} onClick={() => setPicked(next)}>
          <span className="stop" />
          <span>
            <span className="eyebrow">Следующая станция</span>
            <h3 style={{ marginTop: 4 }}>{next.title}</h3>
          </span>
          <span className="xp">+{next.xpReward}</span>
        </button>
      )}
      {map.data ? <LineMap map={map.data} onPick={setPicked} /> : map.error ? <ErrorNote message={map.error} onRetry={map.reload} /> : null}
      {picked && <StationSheet node={picked} branch={branch} onClose={() => setPicked(null)} />}
    </>
  );
}
