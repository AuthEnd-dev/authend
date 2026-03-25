import type { AnyRoute } from '@tanstack/react-router';

/**
 * Return extra top-level route groups to register beside the core admin tree.
 * Use createRoute({ getParentRoute: () => rootRoute, ... }) from a module that imports rootRoute,
 * or add sibling groups here if you re-export root from router.
 */
export function mergeExtensionRouteChildren(): AnyRoute[] {
  return [];
}
