import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { ago } from '../../shared/lib/format';
import { useResource } from '../../shared/lib/hooks';
import { ErrorNote, Icon, Loading } from '../../shared/ui';
import type { Shop } from '../../entities/types';

export function ShopPage() {
  const shop = useResource<Shop>('/shop');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function buy(code: string, title: string) {
    setBusy(code);
    setMessage(null);
    try {
      await api(`/shop/${code}/buy`, {});
      setMessage({ text: `Заявка на «${title}» отправлена руководителю`, ok: true });
      await shop.reload();
    } catch (err) {
      setMessage({ text: (err as Error).message, ok: false });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header className="topbar">
        <Link to="/profile" className="icon-btn" aria-label="Назад"><ArrowLeft size={20} /></Link>
        <h1 style={{ flex: 1 }}>Магазин</h1>
        {shop.data && <span className="chip mono">{shop.data.coins} коинов</span>}
      </header>
      {!shop.data ? (shop.error ? <ErrorNote message={shop.error} onRetry={shop.reload} /> : <Loading />) : (
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>
            Коины приходят за первый зачёт сценария, повторы и проверки коллег. Каталог наград настраивает HR.
          </p>
          {message && <div className="banner" role="status" style={{ borderColor: message.ok ? 'var(--ok)' : 'var(--loyalty)' }}>{message.text}</div>}
          {shop.data.items.map((item) => {
            const enough = shop.data!.coins >= item.price;
            return (
              <div key={item.code} className="card row" style={{ gap: 14 }}>
                <div className="achievement on" style={{ padding: 0, border: 0, background: 'none' }}>
                  <div className="ico" style={{ margin: 0 }}><Icon name={item.icon} /></div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{item.title}</b>
                  <div className="small muted">{item.description}</div>
                </div>
                <button className="btn" style={{ padding: '0 14px' }} disabled={!enough || busy === item.code} onClick={() => buy(item.code, item.title)}>
                  <span className="mono">{item.price}</span>
                </button>
              </div>
            );
          })}
          {shop.data.purchases.length > 0 && (
            <section className="stack">
              <h2 className="eyebrow" style={{ marginTop: 8 }}>Мои заявки</h2>
              {shop.data.purchases.map((purchase) => (
                <div key={purchase.id} className="spread small">
                  <span>{purchase.item.title}</span>
                  <span className="muted">{purchase.status === 'requested' ? 'у руководителя' : 'выдано'} · {ago(purchase.createdAt)}</span>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </>
  );
}
