import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { AppLayout } from './layout/AppLayout';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { SitesPage } from './pages/Sites';
import { NodeAppsPage } from './pages/NodeApps';
import { DomainsPage } from './pages/Domains';
import { DomainDetailPage } from './pages/DomainDetail';
import { DatabasesPage } from './pages/Databases';
import { SslPage } from './pages/Ssl';
import { UsersPage } from './pages/Users';
import { FilesPage } from './pages/Files';
import { CronPage } from './pages/Cron';
import { BackupsPage } from './pages/Backups';
import { FirewallPage } from './pages/Firewall';
import { ServerPage } from './pages/Server';
import type { AccentColor } from './theme/colors';
import { buildTheme } from './theme/theme';
import { getToken } from './api/client';

function LoginRoute() {
  if (getToken() !== null) return <Navigate to="/" replace />;
  return <LoginPage />;
}

function AuthGate({ accent, onAccentChange, username, avatarSeed, onAvatarChange }: {
  accent: AccentColor;
  onAccentChange: (color: AccentColor) => void;
  username: string;
  avatarSeed: string;
  onAvatarChange: (seed: string) => void;
}) {
  if (getToken() === null) return <Navigate to="/login" replace />;
  return (
    <AppLayout
      accent={accent}
      onAccentChange={onAccentChange}
      username={username}
      avatarSeed={avatarSeed}
      onAvatarChange={onAvatarChange}
    />
  );
}

function Shell() {
  const [accent, setAccentState] = useState<AccentColor>(
    (localStorage.getItem('hs_accent') as AccentColor) ?? 'green',
  );
  const [avatarSeed, setAvatarSeed] = useState<string>(
    localStorage.getItem('hs_avatar') ?? '',
  );
  const changeAccent = (color: AccentColor) => {
    setAccentState(color);
    localStorage.setItem('hs_accent', color);
  };
  const changeAvatar = (seed: string) => {
    setAvatarSeed(seed);
    localStorage.setItem('hs_avatar', seed);
  };

  return (
    <MantineProvider theme={buildTheme(accent)} forceColorScheme="dark">
      <Notifications />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route
            element={
              <AuthGate
                accent={accent}
                onAccentChange={changeAccent}
                username={localStorage.getItem('hs_username') ?? 'admin'}
                avatarSeed={avatarSeed}
                onAvatarChange={changeAvatar}
              />
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/sites" element={<SitesPage />} />
            <Route path="/node" element={<NodeAppsPage />} />
            <Route path="/domains" element={<DomainsPage />} />
            <Route path="/domains/:id" element={<DomainDetailPage />} />
            <Route path="/databases" element={<DatabasesPage />} />
            <Route path="/ssl" element={<SslPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="/cron" element={<CronPage />} />
            <Route path="/backups" element={<BackupsPage />} />
            <Route path="/firewall" element={<FirewallPage />} />
            <Route path="/server" element={<ServerPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MantineProvider>
  );
}

export const App = Shell;
