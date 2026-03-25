import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from './lib/logger';
import { jsonError } from './lib/http';
import { env } from './config/env';
import { registerCoreRoutes } from './register-core-routes';
import { registerExtensionRoutes } from '../extensions/routes';

const adminDist = resolve(import.meta.dir, '../../../admin/dist');

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

  app.use(async (c, next) => {
    const started = performance.now();
    try {
      await next();
    } finally {
      const url = new URL(c.req.url);
      const search = url.search;
      const query =
        search.length === 0 ? undefined : search.length <= 512 ? search.slice(1) : `${search.slice(1, 509)}…`;
      const userAgent = c.req.header('user-agent');
      logger.info('request', {
        method: c.req.method,
        path: c.req.path,
        ...(query ? { query } : {}),
        status: c.res.status,
        durationMs: Math.round(performance.now() - started),
        ...(userAgent ? { userAgent: userAgent.length <= 400 ? userAgent : `${userAgent.slice(0, 397)}…` } : {}),
        ...(c.req.header('x-forwarded-for') ? { forwardedFor: c.req.header('x-forwarded-for') } : {}),
        ...(c.req.header('referer') ? { referer: c.req.header('referer') } : {}),
      });
    }
  });

  app.use(
    '/api/*',
    cors({
      origin: (origin) => {
        const allowed = env.CORS_ORIGIN ?? [env.ADMIN_DEV_URL];
        if (origin && allowed.includes(origin)) return origin;
        return allowed[0];
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

  registerCoreRoutes(app);
  registerExtensionRoutes(app);

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
