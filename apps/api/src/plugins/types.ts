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
  sendMagicLink?: (data: {
    email: string;
    url: string;
    token: string;
  }, ctx?: unknown) => Promise<void>;
  generateMagicLinkToken?: (email: string) => Promise<string> | string;
  usernameValidator?: (username: string) => Promise<boolean> | boolean;
  displayUsernameValidator?: (displayUsername: string) => Promise<boolean> | boolean;
  usernameNormalization?: (username: string) => string;
  displayUsernameNormalization?: (displayUsername: string) => string;
  jwtDefinePayload?: (session: {
    user: Record<string, unknown>;
    session: Record<string, unknown>;
  }) => Promise<Record<string, unknown>> | Record<string, unknown>;
  jwtGetSubject?: (session: {
    user: Record<string, unknown>;
    session: Record<string, unknown>;
  }) => Promise<string> | string;
  jwtSign?: (payload: Record<string, unknown>) => Promise<string> | string;
  customAPIKeyGetter?: (ctx: unknown) => string | null;
  customAPIKeyValidator?: (options: {
    ctx: unknown;
    key: string;
  }) => Promise<boolean> | boolean;
  customKeyGenerator?: (options: {
    length: number;
    prefix: string | undefined;
  }) => Promise<string> | string;
  defaultPermissions?: (referenceId: string, ctx: unknown) => Promise<Record<string, string[]>> | Record<string, string[]>;
  customCreateDefaultTeam?: (organization: Record<string, unknown>, ctx?: unknown) => Promise<Record<string, unknown>>;
  organizationHook?: (...args: unknown[]) => Promise<unknown> | unknown;
  ac?: unknown;
  roles?: Record<string, unknown>;
};

export type ExtensionHandlerDefinition = {
  id: string;
  label: string;
  description: string;
  slotKeys?: string[];
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
  defaultEnabled?: boolean;
  required?: boolean;
  allowUnknownConfigKeys?: boolean;
  defaultConfig?: PluginConfig;
  defaultCapabilityState?: PluginCapabilityState;
  defaultExtensionBindings?: PluginExtensionBindings;
  validateConfig?: (config: PluginConfig, context: { forEnable: boolean }) => string | null;
  getRequiredEnv?: (state: PluginInstallState) => string[];
  getProvisionPlan?: (state: PluginInstallState) => PluginSqlPlan | null;
  getRollbackPlan?: (state: PluginInstallState) => PluginSqlPlan | null;
  composeServer?: (context: RuntimePluginContext) => unknown | null;
  composeAuthOptions?: (context: RuntimePluginContext) => Record<string, unknown> | null;
  composeClient?: (state: PluginInstallState) => string[];
};
