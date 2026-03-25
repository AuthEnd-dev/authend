import { Hono } from "hono";
import { listPluginCapabilityManifests } from "../services/plugin-service";
import { buildSdkSchemaManifest } from "../services/sdk-service";

export const systemRouter = new Hono()
  .get("/plugin-manifest", async (c) => {
    const manifests = await listPluginCapabilityManifests();
    return c.json(manifests.filter((manifest) => manifest.installState.enabled));
  })
  .get("/sdk-schema", async (c) => c.json(await buildSdkSchemaManifest()));
