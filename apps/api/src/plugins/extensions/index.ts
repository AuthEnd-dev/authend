import type { ExtensionHandlerDefinition } from "../types";
import { adminExtensionHandlers } from "./admin";
import { magicLinkExtensionHandlers } from "./magic-link";
import { organizationExtensionHandlers } from "./organization";
import { usernameExtensionHandlers } from "./username";

// Add custom plugin handlers here and set `slotKeys` on each handler so it appears in the matching admin binding sheet.
export const extensionHandlers: ExtensionHandlerDefinition[] = [
  ...usernameExtensionHandlers,
  ...magicLinkExtensionHandlers,
  ...adminExtensionHandlers,
  ...organizationExtensionHandlers,
];
