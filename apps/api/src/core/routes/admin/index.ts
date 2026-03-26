import { Hono } from 'hono';
import { requireSuperAdmin, type SessionContext } from '../../middleware/auth';
import { adminAiRouter } from './ai';
import { adminApiPreviewRouter } from './api-preview';
import { adminAuditRouter } from './audit';
import { adminRealtimeRouter } from './realtime';
import { adminMigrationsRouter } from './migrations';
import { adminPluginsRouter } from './plugins';
import { adminSchemaRouter } from './schema';
import { adminSettingsRouter } from './settings';
import { adminWebhooksRouter } from './webhooks';

export const adminRouter = new Hono<{ Variables: { auth: SessionContext } }>()
  .use('*', requireSuperAdmin)
  .route('/', adminAiRouter)
  .route('/', adminPluginsRouter)
  .route('/', adminSettingsRouter)
  .route('/', adminSchemaRouter)
  .route('/', adminMigrationsRouter)
  .route('/', adminApiPreviewRouter)
  .route('/', adminAuditRouter)
  .route('/', adminRealtimeRouter)
  .route('/', adminWebhooksRouter);

