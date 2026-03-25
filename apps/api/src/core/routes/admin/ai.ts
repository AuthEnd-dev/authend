import { Hono } from 'hono';
import { z } from 'zod';
import { aiMessageCreateSchema } from '@authend/shared';
import type { SessionContext } from '../../middleware/auth';
import {
  approveAiRun,
  createAiMessage,
  createAiThread,
  getAiThreadDetail,
  listAiThreads,
  rejectAiRun,
} from '../../services/ai-service';

export const adminAiRouter = new Hono<{ Variables: { auth: SessionContext } }>()
  .get('/ai/threads', async (c) => {
    const auth = c.get('auth');
    return c.json(await listAiThreads(auth.user.id));
  })
  .post('/ai/threads', async (c) => {
    const auth = c.get('auth');
    const body = z.object({ title: z.string().min(1).optional() }).parse(await c.req.json().catch(() => ({})));
    return c.json(await createAiThread(auth.user.id, body.title));
  })
  .get('/ai/threads/:threadId', async (c) => {
    const auth = c.get('auth');
    return c.json(await getAiThreadDetail(c.req.param('threadId'), auth.user.id));
  })
  .post('/ai/threads/:threadId/messages', async (c) => {
    const auth = c.get('auth');
    const body = aiMessageCreateSchema.parse(await c.req.json());
    return c.json(await createAiMessage(c.req.param('threadId'), body, auth.user.id));
  })
  .post('/ai/runs/:runId/approve', async (c) => {
    const auth = c.get('auth');
    return c.json(await approveAiRun(c.req.param('runId'), auth.user.id));
  })
  .post('/ai/runs/:runId/reject', async (c) => {
    const auth = c.get('auth');
    return c.json(await rejectAiRun(c.req.param('runId'), auth.user.id));
  });
