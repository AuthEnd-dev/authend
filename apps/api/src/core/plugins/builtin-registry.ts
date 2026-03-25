import type { PluginDefinition } from "./types";
import { adminPluginDefinition } from "./admin/manifest";
import { attachAdminRuntime } from "./admin/runtime";
import { apiKeyPluginDefinition } from "./api-key/manifest";
import { getApiKeyProvisionPlan, getApiKeyRollbackPlan } from "./api-key/provision";
import { attachApiKeyRuntime } from "./api-key/runtime";
import { jwtPluginDefinition } from "./jwt/manifest";
import { getJwtProvisionPlan, getJwtRollbackPlan } from "./jwt/provision";
import { attachJwtRuntime } from "./jwt/runtime";
import { magicLinkPluginDefinition } from "./magic-link/manifest";
import { attachMagicLinkRuntime } from "./magic-link/runtime";
import { organizationPluginDefinition } from "./organization/manifest";
import { getOrganizationProvisionPlan, getOrganizationRollbackPlan } from "./organization/provision";
import { attachOrganizationRuntime } from "./organization/runtime";
import { socialAuthPluginDefinition } from "./social-auth/manifest";
import { attachSocialAuthRuntime } from "./social-auth/runtime";
import { twoFactorPluginDefinition } from "./two-factor/manifest";
import { getTwoFactorProvisionPlan, getTwoFactorRollbackPlan } from "./two-factor/provision";
import { attachTwoFactorRuntime } from "./two-factor/runtime";
import { usernamePluginDefinition } from "./username/manifest";
import { attachUsernameRuntime } from "./username/runtime";

const usernameDefinition = attachUsernameRuntime(usernamePluginDefinition);

const jwtDefinition = attachJwtRuntime({
  ...jwtPluginDefinition,
  getProvisionPlan: () => getJwtProvisionPlan(),
  getRollbackPlan: () => getJwtRollbackPlan(),
});

const organizationDefinition = attachOrganizationRuntime({
  ...organizationPluginDefinition,
  getProvisionPlan: getOrganizationProvisionPlan,
  getRollbackPlan: getOrganizationRollbackPlan,
});

const twoFactorDefinition = attachTwoFactorRuntime({
  ...twoFactorPluginDefinition,
  getProvisionPlan: () => getTwoFactorProvisionPlan(),
  getRollbackPlan: () => getTwoFactorRollbackPlan(),
});

const apiKeyDefinition = attachApiKeyRuntime({
  ...apiKeyPluginDefinition,
  getProvisionPlan: () => getApiKeyProvisionPlan(),
  getRollbackPlan: () => getApiKeyRollbackPlan(),
});

const magicLinkDefinition = attachMagicLinkRuntime(magicLinkPluginDefinition);

const socialAuthDefinition = attachSocialAuthRuntime(socialAuthPluginDefinition);

const adminDefinition = attachAdminRuntime(adminPluginDefinition);

/** Curated Authend plugins. Fork-specific plugins belong in `extensions/plugins.ts`. */
export const builtinPluginRegistry: PluginDefinition[] = [
  usernameDefinition,
  socialAuthDefinition,
  jwtDefinition,
  organizationDefinition,
  twoFactorDefinition,
  apiKeyDefinition,
  magicLinkDefinition,
  adminDefinition,
];
