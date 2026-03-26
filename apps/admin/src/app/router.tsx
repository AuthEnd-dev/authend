import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { PluginsPage } from '../pages/plugins';
import { DataPage } from '../pages/data';
import { MigrationsPage } from '../pages/migrations';
import { AuditPage } from '../pages/audit';
import { RealtimeDiagnosticsPage } from '../pages/realtime';
import { StorageFilesPage } from '../pages/storage';
import {
  AiAssistantSettingsPage,
  AdminAccessSettingsPage,
  ApiSettingsPage,
  AuthenticationSettingsPage,
  BackupsSettingsPage,
  CronsSettingsPage,
  DangerZoneSettingsPage,
  DomainsOriginsSettingsPage,
  EmailSettingsPage,
  EnvironmentsSecretsSettingsPage,
  GeneralSettingsPage,
  ObservabilitySettingsPage,
  SessionsSecuritySettingsPage,
  StorageSettingsPage,
  WebhooksSettingsPage,
} from '../pages/settings';
import { mergeExtensionRouteChildren } from '../extensions/routes';
import { DatabaseLayout, FullBleedOutletLayout, Shell, StandardLayout } from './shell';

const rootRoute = createRootRoute({
  component: Shell,
});

function SettingsLayout() {
  return <StandardLayout groupKey="settings" activeSection="settings" />;
}

const databaseGroup = createRoute({
  getParentRoute: () => rootRoute,
  id: 'database',
  component: DatabaseLayout,
});

const settingsGroup = createRoute({
  getParentRoute: () => rootRoute,
  id: 'settings',
  component: SettingsLayout,
});

const pluginsGroup = createRoute({
  getParentRoute: () => rootRoute,
  id: 'plugins',
  component: FullBleedOutletLayout,
});

const logsGroup = createRoute({
  getParentRoute: () => rootRoute,
  id: 'logs',
  component: FullBleedOutletLayout,
});

const realtimeGroup = createRoute({
  getParentRoute: () => rootRoute,
  id: 'realtime-group',
  component: FullBleedOutletLayout,
});

const storageGroup = createRoute({
  getParentRoute: () => rootRoute,
  id: 'storage',
  component: FullBleedOutletLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: '/',
  component: GeneralSettingsPage,
});

const pluginsRoute = createRoute({
  getParentRoute: () => pluginsGroup,
  path: '/plugins',
  component: PluginsPage,
});

const generalSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: '/general',
  component: GeneralSettingsPage,
});

const authenticationSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: '/authentication',
  component: AuthenticationSettingsPage,
});

const sessionsSecuritySettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: '/sessions-security',
  component: SessionsSecuritySettingsPage,
});

const emailSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: '/email',
  component: EmailSettingsPage,
});

const domainsOriginsSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: '/domains-origins',
  component: DomainsOriginsSettingsPage,
});

const apiSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: '/api-settings',
  component: ApiSettingsPage,
});

const storageSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: '/storage',
  component: StorageSettingsPage,
});

const backupsSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: '/backups',
  component: BackupsSettingsPage,
});

const cronsSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: '/crons',
  component: CronsSettingsPage,
});

const webhooksSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: '/webhooks',
  component: WebhooksSettingsPage,
});

const aiAssistantSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: '/ai-assistant',
  component: AiAssistantSettingsPage,
});

const adminAccessSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: '/admin-access',
  component: AdminAccessSettingsPage,
});

const environmentsSecretsSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: '/environments-secrets',
  component: EnvironmentsSecretsSettingsPage,
});

const observabilitySettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: '/observability',
  component: ObservabilitySettingsPage,
});

const dangerZoneSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: '/danger-zone',
  component: DangerZoneSettingsPage,
});

const dataRoute = createRoute({
  getParentRoute: () => databaseGroup,
  path: '/data',
  validateSearch: (search: Record<string, unknown>) => ({
    table: typeof search.table === 'string' ? search.table : undefined,
    page: typeof search.page === 'number' && Number.isFinite(search.page) ? search.page : undefined,
    pageSize: typeof search.pageSize === 'number' && Number.isFinite(search.pageSize) ? search.pageSize : undefined,
  }),
  component: DataPage,
});

const migrationsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: '/migrations',
  component: MigrationsPage,
});

const auditRoute = createRoute({
  getParentRoute: () => logsGroup,
  path: '/audit',
  component: AuditPage,
});

const realtimeRoute = createRoute({
  getParentRoute: () => realtimeGroup,
  path: '/realtime',
  component: RealtimeDiagnosticsPage,
});

const storageFilesRoute = createRoute({
  getParentRoute: () => storageGroup,
  path: '/storage-files',
  component: StorageFilesPage,
});

const routeTree = rootRoute.addChildren([
  databaseGroup.addChildren([dataRoute]),
  settingsGroup.addChildren([
    indexRoute,
    generalSettingsRoute,
    authenticationSettingsRoute,
    sessionsSecuritySettingsRoute,
    emailSettingsRoute,
    domainsOriginsSettingsRoute,
    apiSettingsRoute,
    storageSettingsRoute,
    backupsSettingsRoute,
    cronsSettingsRoute,
    webhooksSettingsRoute,
    aiAssistantSettingsRoute,
    adminAccessSettingsRoute,
    environmentsSecretsSettingsRoute,
    observabilitySettingsRoute,
    dangerZoneSettingsRoute,
    migrationsRoute,
  ]),
  pluginsGroup.addChildren([pluginsRoute]),
  logsGroup.addChildren([auditRoute]),
  realtimeGroup.addChildren([realtimeRoute]),
  storageGroup.addChildren([storageFilesRoute]),
  ...mergeExtensionRouteChildren(),
]);

export const router = createRouter({
  routeTree,
  basepath: '/admin',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
