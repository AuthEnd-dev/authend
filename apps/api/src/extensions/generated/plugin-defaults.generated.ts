import type { ExtensionPluginDefaults } from "../../core/plugins/types";

/**
 * Machine-written plugin defaults snapshot.
 *
 * Admin plugin enable/disable/config actions rewrite this file so the selected
 * built-in plugin state can be committed to git and replayed on a fresh database.
 */
export const generatedPluginDefaults: ExtensionPluginDefaults[] = [
  {
    "pluginId": "apiKey",
    "enabled": true
  }
];
