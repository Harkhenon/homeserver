import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { AppLayout } from './layout/AppLayout';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { SitesPage } from './pages/Sites';
import { NginxSitesPage } from './pages/NginxSites';
import { NodeAppsPage } from './pages/NodeApps';
import { DnsPage } from './pages/Dns';
import { DatabasesPage } from './pages/Databases';
import { SslPage } from './pages/Ssl';
import { UsersPage } from './pages/Users';
import { FilesPage } from './pages/Files';
import { CronPage } from './pages/Cron';
import { BackupsPage } from './pages/Backups';
import { FirewallPage } from './pages/Firewall';
import { MonitorPage } from './pages/Monitor';
import { ServerPage } from './pages/Server';
import type { AccentColor } from './theme/colors';
import { buildTheme } from './theme/theme';
import { getToken } from './api/client';

function Shell() {
  const [accent, setAccentState] = useState<AccentColor>(
    (localStorage.getItem('hs_accent') as AccentColor) ?? 'blue',
  );
  const authed = getToken() !== null;

  const changeAccent = (color: AccentColor) => {
    setAccentState(color);
    localStorage.setItem('hs_accent', color);
  };

  return (
    <MantineProvider theme={buildTheme(accent)} forceColorScheme="dark">
      <Notifications />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={authed ? <Navigate to="/" /> : <LoginPage />} />
          <Route
            element={authed ? <AppLayout accent={accent} onAccentChange={changeAccent} /> : <Navigate to="/login" />}
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/sites" element={<SitesPage />} />
            <Route path="/sites-nginx" element={<NginxSitesPage />} />
            <Route path="/node" element={<NodeAppsPage />} />
            <Route path="/dns" element={<DnsPage />} />
            <Route path="/databases" element={<DatabasesPage />} />
            <Route path="/ssl" element={<SslPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="/cron" element={<CronPage />} />
            <Route path="/backups" element={<BackupsPage />} />
            <Route path="/firewall" element={<FirewallPage />} />
            <Route path="/monitor" element={<MonitorPage />} />
            <Route path="/server" element={<ServerPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MantineProvider>
  );
}

export const App = Shell;
