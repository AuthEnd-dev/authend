import { Hono } from 'hono';
import { z } from 'zod';
import { cronJobInputSchema, settingsSectionIdSchema } from '@authend/shared';
import type { SessionContext } from '../../middleware/auth';
import { runBackupNow } from '../../services/backup-service';
import {
  createCronJobFromInput,
  getEnvironmentEditorState,
  getSettingsSectionState,
  removeCronJob,
  saveEnvironmentEditorState,
  saveSettingsSectionState,
  triggerCronJob,
  updateCronJobFromInput,
} from '../../services/settings-service';

export const adminSettingsRouter = new Hono<{ Variables: { auth: SessionContext } }>()
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
  });
