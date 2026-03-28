import { bootstrapSystem } from "../../../apps/api/src/core/services/bootstrap-service";

let started = false;

export async function ensureAuthendRuntime() {
  if (started) {
    return;
  }

  await bootstrapSystem();
  started = true;
}
