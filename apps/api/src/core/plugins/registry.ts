import type { PluginDefinition } from "./types";
import { builtinPluginRegistry } from "./builtin-registry";
import { extensionPluginDefinitions } from "../../extensions/plugins";

export const pluginRegistry: PluginDefinition[] = [...builtinPluginRegistry, ...extensionPluginDefinitions];

export function getPluginDefinition(pluginId: string) {
  return pluginRegistry.find((entry) => entry.id === pluginId) ?? null;
}
