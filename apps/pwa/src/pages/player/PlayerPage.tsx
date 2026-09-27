import { parseGraph, type ScenarioGraph, type SessionState, summarize } from '@vsm/scenario-engine';
import { Heart, Shield, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { submitAttempt } from '../../features/offline-sync/sync';
import { type Delta, usePlayer } from '../../features/scenario-player/usePlayer';
import { cacheSet } from '../../shared/db/store';
import { useResource } from '../../shared/lib/hooks';
import { uuid } from '../../shared/lib/uuid';
import { ErrorNote, Loading, Pixels } from '../../shared/ui';
import type { PublishedScenario } from '../../entities/types';
import type { StoredResult } from '../debrief/DebriefPage';

const METRIC_STYLE: Record<string, { color: string; icon: typeof Shield }> = {
  safety: { color: 'var(--safety)', icon: Shield },
  loyalty: { color: 'var(--loyalty)', icon: Heart },
};

function Meter({ graph, metric, value, delta }: { graph: ScenarioGraph; metric: string; value: number; delta?: Delta }) {
  const def = graph.metrics.find((item) => item.id === metric)!;
  const style = METRIC_STYLE[metric] ?? { color: 'var(--signal)', icon: Shield };
  const IconComponent = style.icon;
  return (
    <div className="meter" aria-label={`${def.title}: ${value}`}>
      <div className="spread">
        <span className="row" style={{ gap: 5 }}><IconComponent size={14} color={style.color} />{def.title.split(' ')[0]}</span>
        <b>{value}</b>
      </div>
      <Pixels value={(value - def.min) / (def.max - def.min)} cells={10} color={style.color} />
      {delta && <span key={delta.key} className={`delta ${delta.value > 0 ? 'up' : 'down'}`}>{delta.value > 0 ? '+' : ''}{delta.value}</span>}
    </div>
  );
}

// Порядок вариантов перемешивается при каждом прохождении: в таблицах верный ответ часто первый
function shuffleKey(seed: string, id: string): number {
  let hash = 2166136261;
  for (const char of `${seed}:${id}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function Game({ scenario, graph }: { scenario: PublishedScenario; graph: ScenarioGraph }) {
  const navigate = useNavigate();
  const startedAt = useRef(new Date().toISOString());
  const seed = useRef(uuid());
  const [sending, setSending] = useState(false);

  const finish = useCallback(async (state: SessionState) => {
    setSending(true);
    const summary = summarize(graph, state);
    const attemptId = uuid();
    const result: StoredResult = {
      attemptId, slug: scenario.slug, title: scenario.title, xpReward: scenario.xpReward,
      summary, peerTask: graph.peerTask ?? null, response: null, error: null, finishedAt: new Date().toISOString(),
    };
    try {
      result.response = await submitAttempt({
        attemptId, scenarioVersionId: scenario.versionId, scenarioSlug: scenario.slug, scenarioTitle: scenario.title,
        startedAt: startedAt.current, clientScore: summary.score, events: state.events, queuedAt: new Date().toISOString(),
      });
    } catch (error) {
      result.error = (error as Error).message;
    }
    await cacheSet(`result:${attemptId}`, result);
    navigate(`/result/${attemptId}`, { replace: true, state: result });
  }, [graph, navigate, scenario]);

  const player = usePlayer(graph, finish);
  const { node, state } = player;
  const deltaFor = (metric: string) => player.deltas.find((delta) => delta.metric === metric);
  const options = [...player.options].sort((a, b) => shuffleKey(seed.current, `${node.id}/${a.id}`) - shuffleKey(seed.current, `${node.id}/${b.id}`));
  function exit() {
    if (window.confirm('Выйти из сценария? Прохождение не сохранится.')) navigate('/');
  }

  return (
    <div className="player">
      <div className="player-top">
        <div className="spread">
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">{node.kind === 'choice' ? `Решение ${state.events.length + 1}` : 'Обстановка'}</div>
            <div style={{ fontWeight: 600, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{scenario.title}</div>
          </div>
          <button className="icon-btn" onClick={exit} aria-label="Выйти из сценария"><X size={20} /></button>
        </div>
        <div className="meters">
          {graph.metrics.filter((metric) => metric.display !== 'hidden').map((metric) => (
            <Meter key={metric.id} graph={graph} metric={metric.id} value={state.metrics[metric.id]} delta={deltaFor(metric.id)} />
          ))}
        </div>
        {player.timeLeft !== null && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="spread small">
              <span className="muted">Время на решение</span>
              <span className="timer-label" style={{ color: player.timeShare < 0.3 ? 'var(--loyalty)' : undefined }}>
                {Math.ceil(player.timeLeft / 1000)} с
              </span>
            </div>
            <div className={`timer${player.timeShare < 0.3 ? ' hurry' : ''}`} role="progressbar" aria-label="Оставшееся время" aria-valuenow={Math.ceil(player.timeLeft / 1000)}>
              <i style={{ transform: `scaleX(${player.timeShare})` }} />
            </div>
          </div>
        )}
      </div>

      <div className="scene" key={`${state.currentNodeId}:${state.events.length}`}>
        {sending || player.finished ? (
          <div className="empty">Подводим итог смены...</div>
        ) : node.kind === 'scene' ? (
          <>
            {node.speaker && <div className="speaker">{node.speaker}</div>}
            <p className="scene-text" style={{ margin: 0 }}>{node.text}</p>
            <div className="options"><button className="btn block" onClick={player.next}>Дальше</button></div>
          </>
        ) : node.kind === 'choice' ? (
          <>
            {node.speaker && <div className="speaker">{node.speaker}</div>}
            <h2 className={node.speaker ? 'scene-text' : 'prompt'} style={node.speaker ? { fontWeight: 400 } : undefined}>
              {node.speaker ? `«${node.prompt}»` : node.prompt}
            </h2>
            <div className="options">
              {options.map((option) => (
                <button key={option.id} className="option" onClick={() => player.choose(option.id)}>{option.text}</button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function PlayerPage() {
  const { slug } = useParams();
  const scenarios = useResource<PublishedScenario[]>('/scenarios');
  const scenario = scenarios.data?.find((item) => item.slug === slug);
  const graph = useMemo(() => (scenario ? parseGraph(scenario.graph) : null), [scenario]);

  if (scenario && graph) return <Game scenario={scenario} graph={graph} />;
  if (scenarios.loading && !scenarios.data) return <Loading />;
  return (
    <div style={{ paddingTop: 40 }}>
      <ErrorNote message={scenarios.error ?? 'Сценарий не найден или ещё не загружен. Откройте его, когда будет связь.'} />
    </div>
  );
}
