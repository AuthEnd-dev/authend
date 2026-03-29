import type { PluginDefinition } from "./types";
import { adminPluginDefinition } from "./admin/manifest";
import { attachAdminRuntime } from "./admin/runtime";
import { apiKeyPluginDefinition } from "./api-key/manifest";
import { attachApiKeyRuntime } from "./api-key/runtime";
import { jwtPluginDefinition } from "./jwt/manifest";
import { attachJwtRuntime } from "./jwt/runtime";
import { magicLinkPluginDefinition } from "./magic-link/manifest";
import { attachMagicLinkRuntime } from "./magic-link/runtime";
import { organizationPluginDefinition } from "./organization/manifest";
import { attachOrganizationRuntime } from "./organization/runtime";
import { socialAuthPluginDefinition } from "./social-auth/manifest";
import { attachSocialAuthRuntime } from "./social-auth/runtime";
import { twoFactorPluginDefinition } from "./two-factor/manifest";
import { attachTwoFactorRuntime } from "./two-factor/runtime";
import { usernamePluginDefinition } from "./username/manifest";
import { attachUsernameRuntime } from "./username/runtime";

const usernameDefinition = attachUsernameRuntime(usernamePluginDefinition);

const jwtDefinition = attachJwtRuntime(jwtPluginDefinition);

const organizationDefinition = attachOrganizationRuntime(organizationPluginDefinition);

const twoFactorDefinition = attachTwoFactorRuntime(twoFactorPluginDefinition);

const apiKeyDefinition = attachApiKeyRuntime(apiKeyPluginDefinition);

const magicLinkDefinition = attachMagicLinkRuntime(magicLinkPluginDefinition);

const socialAuthDefinition = attachSocialAuthRuntime(socialAuthPluginDefinition);

const adminDefinition = attachAdminRuntime(adminPluginDefinition);

/** Curated AuthEnd plugins. Fork-specific plugins belong in `extensions/plugins.ts`. */
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
