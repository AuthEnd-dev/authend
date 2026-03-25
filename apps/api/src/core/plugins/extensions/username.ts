import type { ExtensionHandlerDefinition } from "../types";

export const usernameExtensionHandlers: ExtensionHandlerDefinition[] = [
  {
    id: "authend.defaultUsernameValidator",
    label: "Default username validator",
    description: "Allows lowercase letters, numbers, and underscores for usernames.",
    slotKeys: ["usernameValidator"],
    build: () => ({
      id: "authend.defaultUsernameValidator",
      usernameValidator: (username) => /^[a-z0-9_]+$/i.test(username),
    }),
  },
  {
    id: "authend.lowercaseUsernameNormalization",
    label: "Lowercase username normalization",
    description: "Normalizes usernames to lowercase before persistence.",
    slotKeys: ["usernameNormalization"],
    build: () => ({
      id: "authend.lowercaseUsernameNormalization",
      usernameNormalization: (username) => username.trim().toLowerCase(),
    }),
  },
  {
    id: "authend.identityDisplayUsernameNormalization",
    label: "Trim display username",
    description: "Trims display usernames without changing the visible casing.",
    slotKeys: ["displayUsernameNormalization"],
    build: () => ({
      id: "authend.identityDisplayUsernameNormalization",
      displayUsernameNormalization: (displayUsername) => displayUsername.trim(),
    }),
  },
];
