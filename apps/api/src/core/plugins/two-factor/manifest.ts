import type { PluginDefinition } from "../types";

export const twoFactorPluginDefinition: PluginDefinition = {
  id: "twoFactor",
  version: "2.0.0",
  label: "Two Factor",
  description: "Add TOTP-based two-factor authentication with recovery codes and trusted-device settings.",
  category: "authentication",
  documentationUrl: "https://www.better-auth.com/docs/plugins/2fa",
  migrationStrategy: "sql",
  dependencies: [],
  requiredEnv: [],
  configSchema: [
    { key: "issuer", label: "Issuer", type: "string", helpText: "Application name shown in authenticator apps." },
    { key: "skipVerificationOnEnable", label: "Skip verification on enable", type: "boolean", helpText: "Do not require an initial verification step during enablement.", defaultValue: false },
    { key: "twoFactorCookieMaxAge", label: "2FA cookie max age", type: "number", helpText: "Maximum age of the two-factor verification cookie in seconds.", defaultValue: 600 },
    { key: "trustDeviceMaxAge", label: "Trusted device max age", type: "number", helpText: "Maximum age of the trusted-device cookie in seconds.", defaultValue: 2592000 },
    { key: "totpDigits", label: "TOTP digits", type: "number", helpText: "Number of digits used in generated TOTP codes." },
    { key: "totpPeriod", label: "TOTP period", type: "number", helpText: "Validity period for TOTP codes in seconds." },
    { key: "otpDigits", label: "OTP digits", type: "number", helpText: "Number of digits used in OTP fallback codes." },
    { key: "otpPeriod", label: "OTP period", type: "number", helpText: "Validity period for OTP fallback codes in seconds." },
  ],
  capabilities: [
    {
      key: "core",
      label: "Two-factor authentication",
      description: "TOTP enrollment, backup codes, trusted devices, and verification flows.",
      enabledByDefault: true,
      requires: [],
      addsModels: ["two_factor"],
      addsClientFeatures: ["twoFactor"],
      addsServerFeatures: ["2fa enable/disable", "backup codes", "trusted devices"],
      addsAdminPanels: ["overview", "security"],
    },
  ],
  extensionSlots: [],
  models: [
    {
      key: "two_factor",
      tableName: "two_factor",
      label: "Two factor",
      capabilityKeys: ["core"],
      primaryKey: "id",
      fields: [
        { name: "id", type: "text", nullable: false, unique: true, indexed: true },
        { name: "user_id", type: "text", nullable: false, unique: true, indexed: true },
      ],
      description: "Two-factor secrets and recovery codes.",
    },
  ],
  adminPanels: [
    { key: "overview", label: "Overview", description: "Plugin state, docs, and health.", capabilityKeys: ["core"] },
    { key: "security", label: "Security", description: "Two-factor config and recovery-code behavior.", capabilityKeys: ["core"] },
  ],
  examples: [
    {
      key: "client-enable-2fa",
      title: "Start two-factor enrollment",
      description: "Use the native Better Auth twoFactor client namespace after enabling the plugin.",
      language: "ts",
      audience: "client",
      capabilityKeys: ["core"],
      code: `await client.auth.twoFactor.enable({
  password: "ChangeMe123!",
});`,
    },
    {
      key: "client-generate-backup-codes",
      title: "Generate new backup codes",
      description: "Rotate backup codes from the Better Auth twoFactor client namespace.",
      language: "ts",
      audience: "client",
      capabilityKeys: ["core"],
      code: `await client.auth.twoFactor.generateBackupCodes({
  password: "ChangeMe123!",
});`,
    },
  ],
  clientNamespaces: ["twoFactor"],
  serverOperations: ["auth.twoFactor"],
  defaultConfig: {
    skipVerificationOnEnable: false,
    twoFactorCookieMaxAge: 600,
    trustDeviceMaxAge: 2592000,
  },
  defaultCapabilityState: { core: true },
  defaultExtensionBindings: {},
};
