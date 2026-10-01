import {
  IconDashboard, IconServer, IconWorld, IconBrandNodejs,
  IconDatabase, IconLock, IconUsers, IconFileDescription,
  IconClock, IconDatabaseImport, IconFlame, IconActivity, IconBinaryTree,
} from '@tabler/icons-react';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof IconDashboard;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Tableau de bord', icon: IconDashboard },
  { to: '/sites', label: 'Sites (Apache)', icon: IconWorld },
  { to: '/sites-nginx', label: 'Sites (Nginx)', icon: IconWorld },
  { to: '/node', label: 'Apps Node', icon: IconBrandNodejs },
  { to: '/dns', label: 'DNS', icon: IconBinaryTree },
  { to: '/databases', label: 'Bases de données', icon: IconDatabase },
  { to: '/ssl', label: 'SSL', icon: IconLock },
  { to: '/users', label: 'Utilisateurs SFTP', icon: IconUsers },
  { to: '/files', label: 'Fichiers', icon: IconFileDescription },
  { to: '/cron', label: 'Tâches cron', icon: IconClock },
  { to: '/backups', label: 'Sauvegardes', icon: IconDatabaseImport },
  { to: '/firewall', label: 'Pare-feu', icon: IconFlame },
  { to: '/monitor', label: 'Supervision', icon: IconActivity },
  { to: '/server', label: 'Serveur', icon: IconServer },
];
