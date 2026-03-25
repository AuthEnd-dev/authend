import { Hono } from 'hono';
import { z } from 'zod';
import { tableApiConfigSchema } from '@authend/shared';
import type { SessionContext } from '../../middleware/auth';
import { buildApiPreview, listApiResources, saveTableApiConfig } from '../../services/api-design-service';

export const adminApiPreviewRouter = new Hono<{ Variables: { auth: SessionContext } }>()
  .get('/api-preview', async (c) => c.json(await listApiResources()))
  .get('/api-preview/:table', async (c) => c.json(await buildApiPreview(c.req.param('table'))))
  .post('/api-preview/:table', async (c) => {
    const auth = c.get('auth');
    const table = z.string().min(1).parse(c.req.param('table'));
    const body = tableApiConfigSchema.parse(await c.req.json());
    return c.json(await saveTableApiConfig(table, body, auth.user.id));
  });
