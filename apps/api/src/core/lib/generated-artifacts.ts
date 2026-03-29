import { resolve } from "node:path";

const defaultGeneratedRoot = resolve(import.meta.dir, "../../../generated");

export function resolveGeneratedSchemaFile() {
  return process.env.AUTHEND_GENERATED_SCHEMA_FILE
    ? resolve(process.env.AUTHEND_GENERATED_SCHEMA_FILE)
    : resolve(defaultGeneratedRoot, "schema/generated.ts");
}

export function resolveGeneratedMigrationsDir() {
  return process.env.AUTHEND_GENERATED_MIGRATIONS_DIR
    ? resolve(process.env.AUTHEND_GENERATED_MIGRATIONS_DIR)
    : resolve(defaultGeneratedRoot, "migrations");
}

export function resolveGeneratedPluginDefaultsFile() {
  return process.env.AUTHEND_GENERATED_PLUGIN_DEFAULTS_FILE
    ? resolve(process.env.AUTHEND_GENERATED_PLUGIN_DEFAULTS_FILE)
    : resolve(import.meta.dir, "../../extensions/generated/plugin-defaults.generated.ts");
}
