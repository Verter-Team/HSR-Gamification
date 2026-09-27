import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useResource } from '../../shared/lib/hooks';
import { ErrorNote, Loading, Pixels } from '../../shared/ui';
import type { Analytics } from '../../entities/types';

// Экран руководителя и методолога: где проводники ошибаются и какие депо проседают
export function AnalyticsPage() {
  const data = useResource<Analytics>('/analytics/overview');
  return (
    <>
      <header className="topbar">
        <Link to="/profile" className="icon-btn" aria-label="Назад"><ArrowLeft size={20} /></Link>
        <h1 style={{ flex: 1 }}>Аналитика</h1>
      </header>
      {!data.data ? (data.error ? <ErrorNote message={data.error} onRetry={data.reload} /> : <Loading />) : (
        <div className="stack" style={{ gap: 18, paddingBottom: 32 }}>
          <section className="wallet">
            <div><b>{data.data.totals.players}</b><span>проводников</span></div>
            <div><b>{data.data.totals.attempts}</b><span>прохождений</span></div>
            <div><b>{data.data.totals.passRate ?? '-'}%</b><span>зачтено</span></div>
            <div><b style={{ color: 'var(--safety)' }}>{data.data.totals.avgSafety ?? '-'}</b><span>безопасность</span></div>
            <div><b style={{ color: 'var(--loyalty)' }}>{data.data.totals.avgLoyalty ?? '-'}</b><span>лояльность</span></div>
            <div><b>{data.data.totals.reviewsDone}</b><span>взаимных проверок</span></div>
          </section>

          <section className="stack">
            <h2 className="eyebrow">Где ошибаются чаще всего</h2>
            <p className="small muted" style={{ margin: 0 }}>Кандидаты на очный разбор с наставником</p>
            {data.data.hardestSteps.map((step) => (
              <div key={`${step.scenarioSlug}/${step.nodeId}`} className="card stack" style={{ gap: 8 }}>
                <div className="spread">
                  <span className="small muted">{step.scenarioTitle}</span>
                  <b className="mono" style={{ color: 'var(--loyalty)' }}>{step.errorRate}%</b>
                </div>
                <b>{step.prompt}</b>
                <Pixels value={step.errorRate / 100} cells={20} color="var(--loyalty)" />
                <div className="small muted">
                  {step.answers} ответов{step.timeoutRate > 0 ? `, не успели ${step.timeoutRate}%` : ''}
                  {step.commonMistake && <> · чаще всего выбирают: «{step.commonMistake.text}»</>}
                </div>
              </div>
            ))}
          </section>

          <section className="stack">
            <h2 className="eyebrow">Сценарии</h2>
            {data.data.scenarios.map((scenario) => (
              <div key={scenario.slug} className="stack" style={{ gap: 6 }}>
                <div className="spread small"><span>{scenario.title}</span><b className="mono">{scenario.passRate}%</b></div>
                <Pixels value={scenario.passRate / 100} cells={24} color="var(--ok)" />
              </div>
            ))}
          </section>

          <section className="stack">
            <h2 className="eyebrow">Депо</h2>
            {data.data.depots.map((depot) => (
              <div key={depot.id} className="card spread">
                <div>
                  <b>{depot.name}</b>
                  <div className="small muted">{depot.attempts} прохождений · безопасность {depot.avgSafety ?? '-'} · лояльность {depot.avgLoyalty ?? '-'}</div>
                </div>
                <b className="mono">{depot.passRate ?? '-'}%</b>
              </div>
            ))}
          </section>
        </div>
      )}
    </>
  );
}
