import { Hono } from "hono";
import { z } from "zod";
import { pluginConfigUpdateSchema, pluginIdSchema, schemaDraftSchema, tableApiConfigSchema } from "@authend/shared";
import { requireSuperAdmin } from "../middleware/auth";
import {
  listPluginCatalog,
  listPluginCapabilityManifests,
  readPluginCapabilityManifest,
  savePluginConfig,
  enablePlugin,
  disablePlugin,
} from "../services/plugin-service";
import { getSchemaDraft, previewDraft, applyDraft } from "../services/schema-service";
import { listMigrationHistory, previewPendingMigrations, applyPendingMigrations } from "../services/migration-service";
import { buildApiPreview, listApiResources, saveTableApiConfig } from "../services/api-design-service";
import { desc } from "drizzle-orm";
import { db } from "../db/client";
import { auditLogs } from "../db/schema/system";

export const adminRouter = new Hono()
  .use("*", requireSuperAdmin)
  .get("/plugins", async (c) => c.json(await listPluginCatalog()))
  .get("/plugins/manifests", async (c) => c.json(await listPluginCapabilityManifests()))
  .get("/plugins/:pluginId/manifest", async (c) => {
    const pluginId = pluginIdSchema.parse(c.req.param("pluginId"));
    return c.json(await readPluginCapabilityManifest(pluginId));
  })
  .post("/plugins/:pluginId/config", async (c) => {
    const auth = c.get("auth");
    const pluginId = pluginIdSchema.parse(c.req.param("pluginId"));
    const body = pluginConfigUpdateSchema.parse(await c.req.json());
    return c.json(await savePluginConfig(pluginId, body, auth.user.id));
  })
  .post("/plugins/:pluginId/enable", async (c) => {
    const auth = c.get("auth");
    const pluginId = pluginIdSchema.parse(c.req.param("pluginId"));
    return c.json(await enablePlugin(pluginId, auth.user.id));
  })
  .post("/plugins/:pluginId/disable", async (c) => {
    const auth = c.get("auth");
    const pluginId = pluginIdSchema.parse(c.req.param("pluginId"));
    return c.json(await disablePlugin(pluginId, auth.user.id));
  })
  .get("/schema", async (c) => c.json(await getSchemaDraft()))
  .post("/schema/preview", async (c) => {
    const body = schemaDraftSchema.parse(await c.req.json());
    return c.json(await previewDraft(body));
  })
  .post("/schema/apply", async (c) => {
    const auth = c.get("auth");
    const body = schemaDraftSchema.parse(await c.req.json());
    return c.json(await applyDraft(body, auth.user.id));
  })
  .get("/migrations", async (c) => c.json(await listMigrationHistory()))
  .post("/migrations/preview", async (c) => c.json(await previewPendingMigrations()))
  .post("/migrations/apply", async (c) => {
    const auth = c.get("auth");
    const applied = await applyPendingMigrations(auth.user.id);
    return c.json({ applied });
  })
  .get("/api-preview", async (c) => c.json(await listApiResources()))
  .get("/api-preview/:table", async (c) => c.json(await buildApiPreview(c.req.param("table"))))
  .post("/api-preview/:table", async (c) => {
    const auth = c.get("auth");
    const table = z.string().min(1).parse(c.req.param("table"));
    const body = tableApiConfigSchema.parse(await c.req.json());
    return c.json(await saveTableApiConfig(table, body, auth.user.id));
  })
  .get("/audit", async (c) =>
    c.json(await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt))),
  );
