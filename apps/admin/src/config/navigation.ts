import { Blocks, Database, HardDrive, ScrollText, Settings } from 'lucide-react';
import { settingsNavItems } from '../pages/settings';

export const routeGroups = {
  settings: settingsNavItems.map((item) => ({ to: item.to, label: item.label })),
};

export type RouteGroupKey = keyof typeof routeGroups;

export const primaryNav = [
  { id: 'database', icon: Database, label: 'Database', to: '/data' },
  { id: 'storage', icon: HardDrive, label: 'Storage', to: '/storage-files' },
  { id: 'logs', icon: ScrollText, label: 'Logs', to: '/audit' },
  { id: 'plugins', icon: Blocks, label: 'Plugins', to: '/plugins' },
  { id: 'settings', icon: Settings, label: 'Settings', to: '/general' },
] as const;
