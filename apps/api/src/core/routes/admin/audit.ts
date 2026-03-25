import { Hono } from 'hono';
import { desc } from 'drizzle-orm';
import { db } from '../../db/client';
import { auditLogs } from '../../db/schema/system';
import type { SessionContext } from '../../middleware/auth';

export const adminAuditRouter = new Hono<{ Variables: { auth: SessionContext } }>().get('/audit', async (c) =>
  c.json(await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt))),
);
