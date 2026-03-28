import type { Hono } from "hono";

/**
 * Mount fork-owned Hono routers here (e.g. `app.route("/api/my-feature", myRouter)`).
 * Keeps `app.ts` and `register-core-routes.ts` stable when pulling upstream.
 */
export function registerExtensionRoutes(_app: Hono): void {
  // Example: _app.route("/api/custom", customRouter);
}

/*
Example: mount a fork-owned route module.

Uncomment and adapt this for your fork:

import { Hono } from "hono";

const customRouter = new Hono().get("/", (c) =>
  c.json({
    ok: true,
    source: "extension-route",
  }),
);

export function registerExtensionRoutes(app: Hono): void {
  app.route("/api/custom", customRouter);
}

Notes:

- Put fork-owned HTTP surface here instead of editing core route registration.
- Prefer new files imported from here if the extension grows beyond a few routes.
*/
