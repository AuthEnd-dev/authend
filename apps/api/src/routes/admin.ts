import { Hono } from 'hono';
import { z } from 'zod';
import {
  cronJobInputSchema,
  pluginConfigUpdateSchema,
  pluginIdSchema,
  schemaDraftSchema,
  settingsSectionIdSchema,
  tableApiConfigSchema,
} from '@authend/shared';
import { requireSuperAdmin, type SessionContext } from '../middleware/auth';
import {
  listPluginCatalog,
  listPluginCapabilityManifests,
  readPluginCapabilityManifest,
  savePluginConfig,
  enablePlugin,
  disablePlugin,
} from '../services/plugin-service';
import { getSchemaDraft, previewDraft, applyDraft } from '../services/schema-service';
import { listMigrationHistory, previewPendingMigrations, applyPendingMigrations } from '../services/migration-service';
import { buildApiPreview, listApiResources, saveTableApiConfig } from '../services/api-design-service';
import { runBackupNow } from '../services/backup-service';
import {
  createCronJobFromInput,
  getEnvironmentEditorState,
  getSettingsSectionState,
  removeCronJob,
  saveEnvironmentEditorState,
  saveSettingsSectionState,
  triggerCronJob,
  updateCronJobFromInput,
} from '../services/settings-service';
import { desc } from 'drizzle-orm';
import { db } from '../db/client';
import { auditLogs } from '../db/schema/system';

export const adminRouter = new Hono<{ Variables: { auth: SessionContext } }>()
  .use('*', requireSuperAdmin)
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
  })
  .post('/settings/backups/run', async (c) => {
    const auth = c.get('auth');
    return c.json(await runBackupNow(auth.user.id, 'manual'));
  })
  .get('/settings/crons/jobs', async (c) => {
    const state = await getSettingsSectionState('crons');
    return c.json('jobs' in state ? state.jobs : []);
  })
  .post('/settings/crons/jobs', async (c) => {
    const auth = c.get('auth');
    const body = cronJobInputSchema.parse(await c.req.json());
    return c.json(await createCronJobFromInput(body, auth.user.id));
  })
  .patch('/settings/crons/jobs/:jobId', async (c) => {
    const auth = c.get('auth');
    const body = cronJobInputSchema.partial().parse(await c.req.json());
    return c.json(await updateCronJobFromInput(c.req.param('jobId'), body, auth.user.id));
  })
  .delete('/settings/crons/jobs/:jobId', async (c) => {
    const auth = c.get('auth');
    await removeCronJob(c.req.param('jobId'), auth.user.id);
    return c.body(null, 204);
  })
  .get('/settings/crons/runs', async (c) => {
    const state = await getSettingsSectionState('crons');
    return c.json('runs' in state ? state.runs : []);
  })
  .get('/settings/environments-secrets/env', async (c) => c.json(await getEnvironmentEditorState()))
  .post('/settings/environments-secrets/env', async (c) => {
    const auth = c.get('auth');
    const body = z.object({ raw: z.string() }).parse(await c.req.json());
    return c.json(await saveEnvironmentEditorState(body.raw, auth.user.id));
  })
  .post('/settings/crons/:jobId/run', async (c) => {
    const auth = c.get('auth');
    return c.json(await triggerCronJob(c.req.param('jobId'), auth.user.id));
  })
  .get('/settings/:section', async (c) => {
    const section = settingsSectionIdSchema.parse(c.req.param('section'));
    return c.json(await getSettingsSectionState(section));
  })
  .post('/settings/:section', async (c) => {
    const auth = c.get('auth');
    const section = settingsSectionIdSchema.parse(c.req.param('section'));
    const body = await c.req.json();
    return c.json(await saveSettingsSectionState(section, body as never, auth.user.id));
  })
  .get('/schema', async (c) => c.json(await getSchemaDraft()))
  .post('/schema/preview', async (c) => {
    const body = schemaDraftSchema.parse(await c.req.json());
    return c.json(await previewDraft(body));
  })
  .post('/schema/apply', async (c) => {
    const auth = c.get('auth');
    const body = schemaDraftSchema.parse(await c.req.json());
    return c.json(await applyDraft(body, auth.user.id));
  })
  .get('/migrations', async (c) => c.json(await listMigrationHistory()))
  .post('/migrations/preview', async (c) => c.json(await previewPendingMigrations()))
  .post('/migrations/apply', async (c) => {
    const auth = c.get('auth');
    const applied = await applyPendingMigrations(auth.user.id);
    return c.json({ applied });
  })
  .get('/api-preview', async (c) => c.json(await listApiResources()))
  .get('/api-preview/:table', async (c) => c.json(await buildApiPreview(c.req.param('table'))))
  .post('/api-preview/:table', async (c) => {
    const auth = c.get('auth');
    const table = z.string().min(1).parse(c.req.param('table'));
    const body = tableApiConfigSchema.parse(await c.req.json());
    return c.json(await saveTableApiConfig(table, body, auth.user.id));
  })
  .get('/audit', async (c) => c.json(await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt))));
