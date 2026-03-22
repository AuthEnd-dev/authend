import { extensionHandlers } from "./extensions";

export { extensionHandlers };

export function getExtensionHandlerDefinition(id: string) {
  return extensionHandlers.find((entry) => entry.id === id) ?? null;
}
