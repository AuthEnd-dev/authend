import { Hono } from 'hono';
import { schemaDraftSchema } from '@authend/shared';
import type { SessionContext } from '../../middleware/auth';
import { getSchemaDraft, previewDraft, applyDraft, getSchemaDriftReport } from '../../services/schema-service';

export const adminSchemaRouter = new Hono<{ Variables: { auth: SessionContext } }>()
  .get('/schema', async (c) => c.json(await getSchemaDraft()))
  .get('/schema/drift', async (c) => c.json(await getSchemaDriftReport()))
  .post('/schema/preview', async (c) => {
    const body = schemaDraftSchema.parse(await c.req.json());
    return c.json(await previewDraft(body));
  })
  .post('/schema/apply', async (c) => {
    const auth = c.get('auth');
    const body = schemaDraftSchema.parse(await c.req.json());
    return c.json(await applyDraft(body, auth.user.id));
  });
