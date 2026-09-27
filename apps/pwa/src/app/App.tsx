import { Map, MessageSquareText, Trophy, UserRound } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { startSync } from '../features/offline-sync/sync';
import { useResource } from '../shared/lib/hooks';
import type { Notification } from '../entities/types';
import { AnalyticsPage } from '../pages/admin/AnalyticsPage';
import { DebriefPage } from '../pages/debrief/DebriefPage';
import { HomePage } from '../pages/home/HomePage';
import { LeaderboardPage } from '../pages/leaderboard/LeaderboardPage';
import { LoginPage } from '../pages/login/LoginPage';
import { NotificationsPage } from '../pages/notifications/NotificationsPage';
import { PlayerPage } from '../pages/player/PlayerPage';
import { ProfilePage } from '../pages/profile/ProfilePage';
import { ReviewsPage } from '../pages/reviews/ReviewsPage';
import { ShopPage } from '../pages/profile/ShopPage';
import { AuthProvider, isStaff, useAuth } from './auth';

function TabBar() {
  const notifications = useResource<Notification[]>('/me/notifications');
  const reviewBadge = notifications.data?.filter((item) => item.type === 'review_received' || item.type === 'review_queue').length ?? 0;
  const tabs: { to: string; label: string; icon: ReactNode; badge?: number }[] = [
    { to: '/', label: 'Маршрут', icon: <Map size={22} /> },
    { to: '/reviews', label: 'Проверки', icon: <MessageSquareText size={22} />, badge: reviewBadge },
    { to: '/rating', label: 'Рейтинг', icon: <Trophy size={22} /> },
    { to: '/profile', label: 'Профиль', icon: <UserRound size={22} /> },
  ];
  return (
    <div className="tabbar">
      <nav aria-label="Разделы">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge ? <span className="badge">{tab.badge}</span> : null}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function WithTabs({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="app">{children}</div>
      <TabBar />
    </>
  );
}

function Routed() {
  const { user } = useAuth();
  useEffect(() => (user ? startSync() : undefined), [user]);
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route path="/" element={<WithTabs><HomePage /></WithTabs>} />
      <Route path="/play/:slug" element={<div className="app"><PlayerPage /></div>} />
      <Route path="/result/:attemptId" element={<div className="app"><DebriefPage /></div>} />
      <Route path="/reviews" element={<WithTabs><ReviewsPage /></WithTabs>} />
      <Route path="/rating" element={<WithTabs><LeaderboardPage /></WithTabs>} />
      <Route path="/profile" element={<WithTabs><ProfilePage /></WithTabs>} />
      <Route path="/shop" element={<WithTabs><ShopPage /></WithTabs>} />
      <Route path="/notifications" element={<WithTabs><NotificationsPage /></WithTabs>} />
      <Route path="/analytics" element={isStaff(user) ? <div className="app"><AnalyticsPage /></div> : <Navigate to="/" />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routed />
      </BrowserRouter>
    </AuthProvider>
  );
}
