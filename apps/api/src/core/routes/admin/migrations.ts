import { Hono } from 'hono';
import type { SessionContext } from '../../middleware/auth';
import { listMigrationHistory, previewPendingMigrations, applyPendingMigrations } from '../../services/migration-service';

export const adminMigrationsRouter = new Hono<{ Variables: { auth: SessionContext } }>()
  .get('/migrations', async (c) => c.json(await listMigrationHistory()))
  .post('/migrations/preview', async (c) => c.json(await previewPendingMigrations()))
  .post('/migrations/apply', async (c) => {
    const auth = c.get('auth');
    const applied = await applyPendingMigrations(auth.user.id);
    return c.json({ applied });
  });
