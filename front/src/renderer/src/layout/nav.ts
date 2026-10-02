import {
  IconDashboard, IconServer, IconWorld, IconBrandNodejs,
  IconDatabase, IconLock, IconUsers, IconFileDescription,
  IconClock, IconDatabaseImport, IconFlame,
} from '@tabler/icons-react';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof IconDashboard;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Général',
    items: [
      { to: '/', label: 'Tableau de bord', icon: IconDashboard },
      { to: '/server', label: 'Serveur', icon: IconServer },
    ],
  },
  {
    label: 'Hébergement',
    items: [
      { to: '/sites', label: 'Sites (Apache)', icon: IconWorld },
      { to: '/sites-nginx', label: 'Sites (Nginx)', icon: IconWorld },
      { to: '/node', label: 'Apps Node', icon: IconBrandNodejs },
      { to: '/domains', label: 'Domaines', icon: IconWorld },
      { to: '/ssl', label: 'SSL', icon: IconLock },
    ],
  },
  {
    label: 'Gestion',
    items: [
      { to: '/databases', label: 'Bases de données', icon: IconDatabase },
      { to: '/users', label: 'Utilisateurs', icon: IconUsers },
      { to: '/files', label: 'Fichiers', icon: IconFileDescription },
    ],
  },
  {
    label: 'Système',
    items: [
      { to: '/cron', label: 'Tâches cron', icon: IconClock },
      { to: '/backups', label: 'Sauvegardes', icon: IconDatabaseImport },
      { to: '/firewall', label: 'Pare-feu', icon: IconFlame },
    ],
  },
];
