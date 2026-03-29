import { resolve } from "node:path";

const defaultGeneratedRoot = resolve(import.meta.dir, "../../../generated");
const defaultTestGeneratedRoot = resolve(import.meta.dir, `../tests/generated/run-${process.pid}`);

function generatedRoot() {
  return process.env.NODE_ENV === "test" ? defaultTestGeneratedRoot : defaultGeneratedRoot;
}

export function resolveGeneratedSchemaFile() {
  return process.env.AUTHEND_GENERATED_SCHEMA_FILE
    ? resolve(process.env.AUTHEND_GENERATED_SCHEMA_FILE)
    : resolve(generatedRoot(), "schema/generated.ts");
}

export function resolveGeneratedMigrationsDir() {
  return process.env.AUTHEND_GENERATED_MIGRATIONS_DIR
    ? resolve(process.env.AUTHEND_GENERATED_MIGRATIONS_DIR)
    : resolve(generatedRoot(), "migrations");
}

export function resolveGeneratedPluginDefaultsFile() {
  return process.env.AUTHEND_GENERATED_PLUGIN_DEFAULTS_FILE
    ? resolve(process.env.AUTHEND_GENERATED_PLUGIN_DEFAULTS_FILE)
    : resolve(import.meta.dir, "../../extensions/generated/plugin-defaults.generated.ts");
}
