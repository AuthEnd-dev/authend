import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useLocation,
} from "@tanstack/react-router";
import { queryClient } from "./lib/query-client";
import { PluginsPage } from "./pages/plugins";
import { DataPage } from "./pages/data";
import { MigrationsPage } from "./pages/migrations";
import { AuditPage } from "./pages/audit";
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
  settingsNavItems,
  StorageSettingsPage,
} from "./pages/settings";
import { AuthGate } from "./components/auth-gate";
import { client } from "./lib/client";
import "./styles.css";
import { useState } from "react";
import { Input } from "./components/ui/input";
import { FeedbackProvider } from "./components/ui/feedback";
import {
  Database, ScrollText, Blocks, Settings, LogOut, Bot,
  Search, Plus, Folder, FolderOpen, Table2
} from "lucide-react";

import { TableSchemaPanel } from "./components/table-schema-panel";
import { AiAssistantDrawer } from "./components/ai-assistant-drawer";

// Route Categorizations
const routeGroups = {
  settings: settingsNavItems.map((item) => ({ to: item.to, label: item.label })),
};

const SYSTEM_TABLES = ["plugin_configs", "migration_runs", "audit_logs", "system_settings", "backup_runs", "cron_jobs", "cron_runs", "ai_threads", "ai_messages", "ai_runs"];

function DatabaseSubNav() {
  const location = useLocation();
  const searchObj = location.search as { table?: string };
  const currentTable = searchObj.table ?? "user";
  
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["tables"],
    queryFn: () => client.data.tables(),
  });
  const [search, setSearch] = useState("");
  const [sysOpen, setSysOpen] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);

  const tables = data?.tables ?? [];
  const filtered = tables.filter((tableName: string) => tableName.toLowerCase().includes(search.toLowerCase()));
  
  const sysTables = filtered.filter((tableName: string) => SYSTEM_TABLES.includes(tableName));
  const userTables = filtered.filter((tableName: string) => !SYSTEM_TABLES.includes(tableName));

  return (
    <div className="flex flex-col h-full bg-muted/10">
      <div className="p-3 border-b border-border/50 bg-background/50 backdrop-blur shrink-0 py-3.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input 
            placeholder="Search tables..." 
            className="pl-8 h-8 text-xs bg-background/50 border-input shadow-none rounded-md"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
        {isLoading && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center animate-pulse">
            Loading tables...
          </div>
        )}
        
        {error && (
          <div className="px-3 py-4 text-xs text-destructive text-center opacity-80">
            Failed to load tables.
          </div>
        )}

        {!isLoading && !error && userTables.length === 0 && sysTables.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center opacity-70">
            No tables found.
          </div>
        )}

        {userTables.map((tableName: string) => (
          <Link
            key={tableName}
            to="/data"
            search={{ table: tableName, page: undefined, pageSize: undefined }}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
              currentTable === tableName && location.pathname === "/data"
                ? "bg-secondary text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            }`}
          >
            <Table2 className="w-4 h-4 opacity-80 shrink-0" />
            <span className="truncate">{tableName}</span>
          </Link>
        ))}

        {sysTables.length > 0 && (
          <div className="pt-3 pb-1">
            <button 
              onClick={() => setSysOpen(!sysOpen)}
              className="flex items-center justify-between w-full px-3 py-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors group select-none"
            >
              System
              {sysOpen ? <FolderOpen className="w-3.5 h-3.5 opacity-60" /> : <Folder className="w-3.5 h-3.5 opacity-60" />}
            </button>
            {sysOpen && (
              <div className="mt-1 ml-1 space-y-0.5 relative before:absolute before:inset-y-0 before:left-[11px] before:w-px before:bg-border/60">
                {sysTables.map((tableName: string) => (
                  <Link
                    key={tableName}
                    to="/data"
                    search={{ table: tableName, page: undefined, pageSize: undefined }}
                    className={`flex items-center gap-2.5 px-3 pl-8 py-1.5 rounded-md text-sm transition-colors relative ${
                      currentTable === tableName && location.pathname === "/data"
                        ? "bg-secondary text-foreground font-medium shadow-sm"
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    }`}
                  >
                    <Table2 className="w-3.5 h-3.5 opacity-60 shrink-0" />
                    <span className="truncate">{tableName}</span>
                    <div className="absolute left-[11px] top-1/2 -translate-y-1/2 w-2.5 h-px bg-border/60" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border/50 mt-auto shrink-0 bg-background/50">
        <button 
          onClick={() => setSchemaOpen(true)}
          className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-md h-9 text-sm font-medium transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Table
        </button>
      </div>

      <TableSchemaPanel 
        isOpen={schemaOpen}
        onClose={() => setSchemaOpen(false)}
        onSuccess={() => refetch()}
      />
    </div>
  );
}

type RouteItem = { to: string; label: string; icon?: React.ElementType };

function StandardSubNav({ items, activeSection }: { items: RouteItem[], activeSection: string }) {
  const location = useLocation();

  return (
    <div className="flex flex-col h-full bg-muted/10">
      <div className="p-3 flex-1 overflow-auto">
        <h2 className="px-3 pb-2 text-xs font-bold tracking-wider uppercase text-muted-foreground mb-1">{activeSection}</h2>
        <nav className="flex flex-col gap-0.5">
          {items.map((item) => {
            const isActive = location.pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-secondary text-foreground font-medium shadow-sm transition-shadow"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                }`}
              >
                {Icon && <Icon className="w-4 h-4 opacity-70 shrink-0" />}
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  );
}

function DatabaseLayout() {
  return (
    <>
      <aside className="w-60 border-r border-border flex flex-col z-10 shrink-0 hidden md:flex overflow-hidden bg-muted/10">
        <DatabaseSubNav />
      </aside>
      <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden relative">
        <Outlet />
      </main>
    </>
  );
}

function StandardLayout({ groupKey, activeSection }: { groupKey: keyof typeof routeGroups; activeSection: string }) {
  const subNav = routeGroups[groupKey];

  return (
    <>
      <aside className="w-60 border-r border-border flex flex-col z-10 shrink-0 hidden md:flex overflow-hidden bg-muted/10">
        <StandardSubNav items={subNav} activeSection={activeSection} />
      </aside>
      <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden relative">
        <div className="flex-1 overflow-auto">
          <div className="w-full max-w-[1200px] px-4 py-4 md:px-6 md:py-5">
            <Outlet />
          </div>
        </div>
      </main>
    </>
  );
}

function Shell() {
  const location = useLocation();
  const session = client.auth.useSession();
  const [assistantOpen, setAssistantOpen] = useState(false);

  // Highlight active tier 1 icon based on pathname prefix
  const path = location.pathname;
  let activeSection = "settings";
  if (path.startsWith("/data")) activeSection = "database";
  else if (path.startsWith("/audit")) activeSection = "logs";
  else if (path.startsWith("/plugins")) activeSection = "plugins";
  else activeSection = "settings"; 

  const primaryNav = [
    { id: "database", icon: Database, label: "Database", to: "/data" },
    { id: "logs", icon: ScrollText, label: "Logs", to: "/audit" },
    { id: "plugins", icon: Blocks, label: "Plugins", to: "/plugins" },
    { id: "settings", icon: Settings, label: "Settings", to: "/general" },
  ];

  return (
    <AuthGate>
      <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
        
        {/* Tier 1: Primary Icon Rail */}
        <aside className="w-[68px] border-r border-border flex flex-col items-center py-4 bg-muted/30 z-20 shrink-0">
          <div className="mb-6 w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary font-bold text-lg select-none shadow-sm">
            <Database className="w-5 h-5" strokeWidth={2.5} />
          </div>
          
          <nav className="flex flex-col gap-3 w-full px-2 flex-1 items-center mt-2">
            {primaryNav.map((item) => {
              const isActive = activeSection === item.id;
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  title={item.label}
                  className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-all ${
                    isActive 
                      ? "bg-primary/10 text-primary" 
                      : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                  }`}
                >
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                  {isActive && (
                    <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                  )}
                </Link>
              );
            })}
          </nav>
          
          <div className="mt-auto px-2 flex flex-col gap-3 items-center">
            <button
              className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-all"
              onClick={() => setAssistantOpen(true)}
              title="AI Assistant"
            >
              <Bot className="w-5 h-5" strokeWidth={2} />
            </button>
            <button 
              className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-all"
              onClick={() => void client.auth.signOut()}
              title="Sign out"
            >
              <LogOut className="w-5 h-5" strokeWidth={2} />
            </button>
            <div className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center text-xs font-bold text-muted-foreground uppercase cursor-pointer select-none shadow-sm" title={session.data?.user.email ?? ""}>
              {session.data?.user.email?.slice(0, 2) ?? "U"}
            </div>
          </div>
        </aside>

        {/* Outer Outlet for Group Layouts */}
        <Outlet />
        <AiAssistantDrawer isOpen={assistantOpen} onClose={() => setAssistantOpen(false)} />
      </div>
    </AuthGate>
  );
}

const rootRoute = createRootRoute({
  component: Shell,
});

// Layout Route Components
function SettingsLayout() {
  return <StandardLayout groupKey="settings" activeSection="settings" />;
}
function FullBleedOutletLayout() {
  return (
    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <Outlet />
    </main>
  );
}

// Layout Route Groups
const databaseGroup = createRoute({
  getParentRoute: () => rootRoute,
  id: "database",
  component: DatabaseLayout,
});
const settingsGroup = createRoute({
  getParentRoute: () => rootRoute,
  id: "settings",
  component: SettingsLayout,
});
const pluginsGroup = createRoute({
  getParentRoute: () => rootRoute,
  id: "plugins",
  component: FullBleedOutletLayout,
});
const logsGroup = createRoute({
  getParentRoute: () => rootRoute,
  id: "logs",
  component: FullBleedOutletLayout,
});

// Children Routes
const indexRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: "/",
  component: GeneralSettingsPage,
});

const pluginsRoute = createRoute({
  getParentRoute: () => pluginsGroup,
  path: "/plugins",
  component: PluginsPage,
});

const generalSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: "/general",
  component: GeneralSettingsPage,
});

const authenticationSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: "/authentication",
  component: AuthenticationSettingsPage,
});

const sessionsSecuritySettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: "/sessions-security",
  component: SessionsSecuritySettingsPage,
});

const emailSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: "/email",
  component: EmailSettingsPage,
});

const domainsOriginsSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: "/domains-origins",
  component: DomainsOriginsSettingsPage,
});

const apiSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: "/api-settings",
  component: ApiSettingsPage,
});

const storageSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: "/storage",
  component: StorageSettingsPage,
});

const backupsSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: "/backups",
  component: BackupsSettingsPage,
});

const cronsSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: "/crons",
  component: CronsSettingsPage,
});

const aiAssistantSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: "/ai-assistant",
  component: AiAssistantSettingsPage,
});

const adminAccessSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: "/admin-access",
  component: AdminAccessSettingsPage,
});

const environmentsSecretsSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: "/environments-secrets",
  component: EnvironmentsSecretsSettingsPage,
});

const observabilitySettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: "/observability",
  component: ObservabilitySettingsPage,
});

const dangerZoneSettingsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: "/danger-zone",
  component: DangerZoneSettingsPage,
});

const dataRoute = createRoute({
  getParentRoute: () => databaseGroup,
  path: "/data",
  validateSearch: (search: Record<string, unknown>) => ({
    table: typeof search.table === "string" ? search.table : undefined,
    page: typeof search.page === "number" && Number.isFinite(search.page) ? search.page : undefined,
    pageSize: typeof search.pageSize === "number" && Number.isFinite(search.pageSize) ? search.pageSize : undefined,
  }),
  component: DataPage,
});

const migrationsRoute = createRoute({
  getParentRoute: () => settingsGroup,
  path: "/migrations",
  component: MigrationsPage,
});

const auditRoute = createRoute({
  getParentRoute: () => logsGroup,
  path: "/audit",
  component: AuditPage,
});

// Compose Tree
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
    aiAssistantSettingsRoute,
    adminAccessSettingsRoute,
    environmentsSecretsSettingsRoute,
    observabilitySettingsRoute,
    dangerZoneSettingsRoute,
    migrationsRoute,
  ]),
  pluginsGroup.addChildren([pluginsRoute]),
  logsGroup.addChildren([auditRoute]),
]);

const router = createRouter({
  routeTree,
  basepath: "/admin",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <FeedbackProvider>
        <RouterProvider router={router} />
      </FeedbackProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
