import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from './lib/logger';
import { jsonError } from './lib/http';
import { env } from './config/env';
import { healthRouter } from './routes/health';
import { setupRouter } from './routes/setup';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { adminDataRouter, dataRouter } from './routes/data';
import { openApiRouter } from './routes/openapi';
import { systemRouter } from './routes/system';
import { storageRouter } from './routes/storage';

const adminDist = resolve(import.meta.dir, '../../admin/dist');

async function serveAdminAsset(pathname: string) {
  const filePath = pathname === '/' ? resolve(adminDist, 'index.html') : resolve(adminDist, `.${pathname}`);
  return readFile(filePath);
}

async function adminShell() {
  try {
    const body = await serveAdminAsset('/');
    return new Response(body, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
    });
  } catch {
    const devUrl = env.ADMIN_DEV_URL;
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=${devUrl}" />
  </head>
  <body>
    <a href="${devUrl}">Open admin dashboard</a>
  </body>
</html>`;
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
    });
  }
}

export function createApp() {
  const app = new Hono();

  app.use(
    '/api/*',
    cors({
      origin: (origin) => {
        const allowed = env.CORS_ORIGIN ?? env.ADMIN_DEV_URL;
        return origin === allowed ? origin : allowed;
      },
      allowHeaders: ['Content-Type', 'Authorization', 'x-better-auth-session'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
      exposeHeaders: ['set-cookie'],
    }),
  );

  app.onError((error) => {
    logger.error('request.failed', { error: error instanceof Error ? error.message : String(error) });
    return jsonError(error);
  });

  app.route('/', healthRouter);
  app.route('/api/setup', setupRouter);
  app.route('/api/auth', authRouter);
  app.route('/api/admin', adminRouter);
  app.route('/api/admin/data', adminDataRouter);
  app.route('/api/system', systemRouter);
  app.route('/api/data', dataRouter);
  app.route('/api/storage', storageRouter);
  app.route('/api', openApiRouter);

  app.get('/', (c) => c.redirect('/admin'));
  app.get('/admin', () => adminShell());
  app.get('/admin/*', async (c) => {
    const pathname = new URL(c.req.url).pathname.replace('/admin', '') || '/';
    try {
      const body = await serveAdminAsset(pathname);
      const contentType = pathname.endsWith('.js')
        ? 'text/javascript; charset=utf-8'
        : pathname.endsWith('.css')
          ? 'text/css; charset=utf-8'
          : pathname.endsWith('.svg')
            ? 'image/svg+xml'
            : 'text/html; charset=utf-8';
      return new Response(body, {
        headers: {
          'content-type': contentType,
        },
      });
    } catch {
      return adminShell();
    }
  });

  return app;
}
