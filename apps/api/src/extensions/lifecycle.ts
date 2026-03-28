import type { ForkBootstrapTask, ForkRuntimeService } from "../core/services/lifecycle-types";

/**
 * Register fork-owned bootstrap tasks here.
 *
 * These tasks run during `bootstrapSystem()` after core schema/plugin/bootstrap
 * work completes. Keep them idempotent and short.
 *
 * Use this for:
 * - seeding fork-owned records
 * - one-time setup that depends on extension schema being present
 *
 * Do not use this for:
 * - starting timers, schedulers, or long-lived loops
 * - persisting built-in plugin defaults
 * - ad hoc startup behavior better expressed through other extension points
 */
export const forkBootstrapTasks: ForkBootstrapTask[] = [];

/**
 * Register fork-owned runtime services here.
 *
 * These services start from `src/index.ts` after `bootstrapSystem()` and the
 * built-in process schedulers are started.
 *
 * Use this for:
 * - fork-owned schedulers
 * - long-lived polling loops
 * - background workers bound to the API process lifetime
 *
 * Do not use this for:
 * - durable plugin/config persistence
 * - one-time data seeding
 */
export const forkRuntimeServices: ForkRuntimeService[] = [];

/*
Example: seed fork-owned records and start a fork-owned scheduler.

Uncomment and adapt this for your fork:

export const forkBootstrapTasks: ForkBootstrapTask[] = [
  {
    id: "seed-pulse-integrators",
    async run(ctx) {
      ctx.logger.info("fork.bootstrap.seed_pulse_integrators.starting");
      await seedPulseIntegrators();
      ctx.logger.info("fork.bootstrap.seed_pulse_integrators.completed");
    },
  },
];

export const forkRuntimeServices: ForkRuntimeService[] = [
  {
    id: "pulse-callback-scheduler",
    start(ctx) {
      ctx.logger.info("fork.runtime.pulse_callback_scheduler.starting");
      startPulseCallbackScheduler();
    },
  },
];

Notes:

- Bootstrap tasks must be idempotent because `bun run bootstrap` and app startup both call core bootstrap.
- Runtime services should own their own "start once" guard if repeated calls would be unsafe.
- Keep built-in plugin defaults in `plugin-defaults.ts`.
*/
