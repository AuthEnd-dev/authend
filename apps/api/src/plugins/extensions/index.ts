import type { ExtensionHandlerDefinition } from "../types";
import { organizationExtensionHandlers } from "./organization";

// Add custom plugin handlers here so they appear in the admin binding sheet.
export const extensionHandlers: ExtensionHandlerDefinition[] = [
  ...organizationExtensionHandlers,
];
