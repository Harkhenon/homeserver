import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Notifications } from '@mantine/notifications';
import { AppLayout } from './layout/AppLayout';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { SitesPage } from './pages/Sites';
import { SiteDetailPage } from './pages/SiteDetail';
import { NodeAppsPage } from './pages/NodeApps';
import { NodeAppDetailPage } from './pages/NodeAppDetail';
import { DomainsPage } from './pages/Domains';
import { DomainDetailPage } from './pages/DomainDetail';
import { MailPage } from './pages/Mail';
import { MailDomainPage } from './pages/MailDomain';
import { DatabasesPage } from './pages/Databases';
import { SslPage } from './pages/Ssl';
import { UsersPage } from './pages/Users';
import { FilesPage } from './pages/Files';
import { CronPage } from './pages/Cron';
import { BackupsPage } from './pages/Backups';
import { FirewallPage } from './pages/Firewall';
import { ServerPage } from './pages/Server';
import { SettingsPage } from './pages/Settings';
import { AppearanceProvider } from './theme/AppearanceProvider';
import { getToken } from './api/client';

function LoginRoute() {
  if (getToken() !== null) return <Navigate to="/" replace />;
  return <LoginPage />;
}

function AuthGate({ username, avatarSeed, onAvatarChange }: {
  username: string;
  avatarSeed: string;
  onAvatarChange: (seed: string) => void;
}) {
  if (getToken() === null) return <Navigate to="/login" replace />;
  return (
    <AppLayout
      username={username}
      avatarSeed={avatarSeed}
      onAvatarChange={onAvatarChange}
    />
  );
}

function Shell() {
  const [avatarSeed, setAvatarSeed] = useState<string>(
    localStorage.getItem('hs_avatar') ?? '',
  );
  const changeAvatar = (seed: string) => {
    setAvatarSeed(seed);
    localStorage.setItem('hs_avatar', seed);
  };

  return (
    <AppearanceProvider>
      <Notifications />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route
            element={
              <AuthGate
                username={localStorage.getItem('hs_username') ?? 'admin'}
                avatarSeed={avatarSeed}
                onAvatarChange={changeAvatar}
              />
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/sites" element={<SitesPage />} />
            <Route path="/sites/:server/:id" element={<SiteDetailPage />} />
            <Route path="/node" element={<NodeAppsPage />} />
            <Route path="/node/:name" element={<NodeAppDetailPage />} />
            <Route path="/domains" element={<DomainsPage />} />
            <Route path="/domains/:id" element={<DomainDetailPage />} />
            <Route path="/mail" element={<MailPage />} />
            <Route path="/mail/:domain" element={<MailDomainPage />} />
            <Route path="/databases" element={<DatabasesPage />} />
            <Route path="/ssl" element={<SslPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="/cron" element={<CronPage />} />
            <Route path="/backups" element={<BackupsPage />} />
            <Route path="/firewall" element={<FirewallPage />} />
            <Route path="/server" element={<ServerPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppearanceProvider>
  );
}

export const App = Shell;
