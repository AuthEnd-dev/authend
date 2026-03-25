import { Hono } from 'hono';
import { pluginConfigUpdateSchema, pluginIdSchema } from '@authend/shared';
import type { SessionContext } from '../../middleware/auth';
import {
  listPluginCatalog,
  listPluginCapabilityManifests,
  readPluginCapabilityManifest,
  savePluginConfig,
  enablePlugin,
  disablePlugin,
} from '../../services/plugin-service';

export const adminPluginsRouter = new Hono<{ Variables: { auth: SessionContext } }>()
  .get('/plugins', async (c) => c.json(await listPluginCatalog()))
  .get('/plugins/manifests', async (c) => c.json(await listPluginCapabilityManifests()))
  .get('/plugins/:pluginId/manifest', async (c) => {
    const pluginId = pluginIdSchema.parse(c.req.param('pluginId'));
    return c.json(await readPluginCapabilityManifest(pluginId));
  })
  .post('/plugins/:pluginId/config', async (c) => {
    const auth = c.get('auth');
    const pluginId = pluginIdSchema.parse(c.req.param('pluginId'));
    const body = pluginConfigUpdateSchema.parse(await c.req.json());
    return c.json(await savePluginConfig(pluginId, body, auth.user.id));
  })
  .post('/plugins/:pluginId/enable', async (c) => {
    const auth = c.get('auth');
    const pluginId = pluginIdSchema.parse(c.req.param('pluginId'));
    return c.json(await enablePlugin(pluginId, auth.user.id));
  })
  .post('/plugins/:pluginId/disable', async (c) => {
    const auth = c.get('auth');
    const pluginId = pluginIdSchema.parse(c.req.param('pluginId'));
    return c.json(await disablePlugin(pluginId, auth.user.id));
  });
