import type { Hono } from "hono";

/**
 * Mount fork-owned Hono routers here (e.g. `app.route("/api/my-feature", myRouter)`).
 * Keeps `app.ts` and `register-core-routes.ts` stable when pulling upstream.
 */
export function registerExtensionRoutes(_app: Hono): void {
  // Example: _app.route("/api/custom", customRouter);
}
