import type {
  PluginAdminPanel,
  PluginCapability,
  PluginCapabilityState,
  PluginConfig,
  PluginConfigField,
  PluginDependencyState,
  PluginExtensionBindings,
  PluginExtensionSlot,
  PluginExample,
  PluginHealth,
  PluginId,
  PluginInstallState,
  PluginManifest,
  PluginModel,
} from "@authend/shared";

export type PluginSqlPlan = {
  key: string;
  title: string;
  sql: string;
};

export type PluginContextRow = {
  pluginId: PluginId;
  enabled: boolean;
  version: string;
  config: PluginConfig;
  capabilityState: PluginCapabilityState;
  dependencyState: PluginDependencyState[];
  health: PluginHealth;
  provisioningState: PluginInstallState["provisioningState"];
  extensionBindings: PluginExtensionBindings;
};

export type ExtensionHandlerRuntime = {
  id: string;
  allowUserToCreateOrganization?: ((user: Record<string, unknown>) => Promise<boolean> | boolean);
  sendInvitationEmail?: (data: {
    id: string;
    role: string;
    email: string;
    organization: Record<string, unknown>;
    invitation: Record<string, unknown>;
  }) => Promise<void>;
  customCreateDefaultTeam?: (organization: Record<string, unknown>, ctx?: unknown) => Promise<Record<string, unknown>>;
  organizationHook?: (...args: unknown[]) => Promise<unknown> | unknown;
  ac?: unknown;
  roles?: Record<string, unknown>;
};

export type ExtensionHandlerDefinition = {
  id: string;
  label: string;
  description: string;
  build: () => ExtensionHandlerRuntime;
};

export type RuntimePluginContext = {
  state: PluginInstallState;
  getHandler(slotKey: string): ExtensionHandlerRuntime | null;
};

export type PluginDefinition = {
  id: PluginId;
  version: string;
  label: string;
  description: string;
  category: PluginManifest["category"];
  documentationUrl: string;
  migrationStrategy: "none" | "sql" | "manual";
  dependencies: PluginId[];
  configSchema: PluginConfigField[];
  capabilities: Omit<PluginCapability, "enabled" | "missingRequirements">[];
  extensionSlots: Omit<PluginExtensionSlot, "enabled" | "selectedHandlerId" | "availableHandlers">[];
  models: Omit<PluginModel, "provisioned">[];
  adminPanels: Omit<PluginAdminPanel, "enabled">[];
  examples: PluginExample[];
  clientNamespaces: string[];
  serverOperations: string[];
  requiredEnv: string[];
  defaultConfig?: PluginConfig;
  defaultCapabilityState?: PluginCapabilityState;
  defaultExtensionBindings?: PluginExtensionBindings;
  getProvisionPlan?: (state: PluginInstallState) => PluginSqlPlan | null;
  getRollbackPlan?: (state: PluginInstallState) => PluginSqlPlan | null;
  composeServer?: (context: RuntimePluginContext) => unknown | null;
  composeClient?: (state: PluginInstallState) => string[];
};
