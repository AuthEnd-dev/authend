import { env } from './config/env';
import { createApp } from './app';
import { bootstrapSystem } from './services/bootstrap-service';
import { logger } from './lib/logger';
import { startCronScheduler } from './services/cron-service';

type RegisteredRoute = {
  method?: string;
  path?: string;
};

function printPrettyRoutes(routes: RegisteredRoute[]) {
  const normalized = routes
    .map((route) => ({
      method: (route.method ?? 'ALL').toUpperCase(),
      path: (route.path ?? '').trim() || '/',
    }))
    .sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)));

  const methodWidth = Math.max('METHOD'.length, ...normalized.map((route) => route.method.length));
  const pathWidth = Math.max('PATH'.length, ...normalized.map((route) => route.path.length));
  const line = `+${'-'.repeat(methodWidth + 2)}+${'-'.repeat(pathWidth + 2)}+`;

  console.log('');
  console.log('Registered API Routes');
  console.log(line);
  console.log(`| ${'METHOD'.padEnd(methodWidth)} | ${'PATH'.padEnd(pathWidth)} |`);
  console.log(line);
  for (const route of normalized) {
    console.log(`| ${route.method.padEnd(methodWidth)} | ${route.path.padEnd(pathWidth)} |`);
  }
  console.log(line);
  console.log(`Total: ${normalized.length}`);
}

await bootstrapSystem();
startCronScheduler();

const app = createApp();
const routes = (app as { routes?: RegisteredRoute[] }).routes ?? [];

Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

logger.info('server.started', {
  port: env.PORT,
  appUrl: env.APP_URL,
});
printPrettyRoutes(routes);
