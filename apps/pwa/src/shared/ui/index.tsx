import {
  Award, Badge, BadgeCheck, Calendar, CalendarCheck, Check, Clock, Coffee, Crown, Flame, Footprints,
  GraduationCap, HeartPulse, type LucideIcon, Medal, MessageSquare, Network, Palmtree, Repeat, Shield,
  ShieldCheck, Star, Sticker, Target, TrendingUp, UserCheck, Users, X,
} from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect } from 'react';

const ICONS: Record<string, LucideIcon> = {
  award: Award, badge: Badge, 'badge-check': BadgeCheck, calendar: Calendar, 'calendar-check': CalendarCheck,
  check: Check, clock: Clock, coffee: Coffee, crown: Crown, flame: Flame, footprints: Footprints,
  'graduation-cap': GraduationCap, 'heart-pulse': HeartPulse, medal: Medal, 'message-square': MessageSquare,
  network: Network, palmtree: Palmtree, repeat: Repeat, shield: Shield, 'shield-check': ShieldCheck,
  star: Star, sticker: Sticker, target: Target, 'trending-up': TrendingUp, 'user-check': UserCheck, users: Users,
};

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const Component = ICONS[name] ?? Star;
  return <Component size={size} strokeWidth={2} aria-hidden />;
}

// Полоса из квадратиков: value от 0 до 1
export function Pixels({ value, cells = 20, color, tall }: { value: number; cells?: number; color?: string; tall?: boolean }) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * cells);
  return (
    <div className={`pixels${tall ? ' tall' : ''}`} style={{ '--c': color } as CSSProperties} aria-hidden>
      {Array.from({ length: cells }, (_, index) => <i key={index} className={index < filled ? 'on' : ''} />)}
    </div>
  );
}

export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal aria-label={label} onClick={(event) => event.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <span className="eyebrow">{label}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Loading() {
  return <div className="empty">Загружаем...</div>;
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card stack">
      <p className="error" style={{ margin: 0 }}>{message}</p>
      {onRetry && <button className="btn ghost" onClick={onRetry}>Повторить</button>}
    </div>
  );
}

export function StaleNote() {
  return <div className="banner small">Нет связи. Показаны последние сохранённые данные.</div>;
}
