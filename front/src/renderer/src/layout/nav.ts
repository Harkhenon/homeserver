import {
  IconDashboard, IconServer, IconWorld, IconBrandNodejs,
  IconDatabase, IconUsers, IconFileDescription,
  IconClock, IconDatabaseImport, IconFlame, IconSettings,
  IconApps, IconTool, IconAdjustments,
} from '@tabler/icons-react';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof IconDashboard;
}

export interface NavSection {
  label: string;
  icon: typeof IconApps;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Général',
    icon: IconApps,
    items: [
      { to: '/', label: 'Tableau de bord', icon: IconDashboard },
      { to: '/server', label: 'Supervision', icon: IconServer },
    ],
  },
  {
    label: 'Hébergement',
    icon: IconWorld,
    items: [
      { to: '/sites', label: 'Sites', icon: IconWorld },
      { to: '/node', label: 'Apps Node', icon: IconBrandNodejs },
      { to: '/domains', label: 'Domaines', icon: IconWorld },
    ],
  },
  {
    label: 'Gestion',
    icon: IconDatabase,
    items: [
      { to: '/databases', label: 'Bases de données', icon: IconDatabase },
      { to: '/users', label: 'Utilisateurs', icon: IconUsers },
      { to: '/files', label: 'Fichiers', icon: IconFileDescription },
    ],
  },
  {
    label: 'Système',
    icon: IconTool,
    items: [
      { to: '/cron', label: 'Tâches cron', icon: IconClock },
      { to: '/backups', label: 'Sauvegardes', icon: IconDatabaseImport },
      { to: '/firewall', label: 'Pare-feu', icon: IconFlame },
    ],
  },
  {
    label: 'Paramètres',
    icon: IconAdjustments,
    items: [
      { to: '/settings', label: 'Paramètres', icon: IconSettings },
    ],
  },
];
