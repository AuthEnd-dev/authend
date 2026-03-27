import type { ApiSettings } from "@authend/shared";
import type { RequestActor } from "../middleware/auth";
import { readSettingsSection } from "./settings-store";

type CompatibleApiRateLimitSettings = ApiSettings & {
  publicRateLimitPerMinute?: number;
  sessionRateLimitPerMinute?: number;
  apiKeyRateLimitPerMinute?: number;
};

type RateLimitKey = string;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitDecision =
  | {
      limited: false;
      limit: number;
      remaining: number;
      resetAt: number;
      retryAfterSeconds: number;
    }
  | {
      limited: true;
      limit: number;
      remaining: number;
      resetAt: number;
      retryAfterSeconds: number;
    };

const WINDOW_MS = 60_000;
const buckets = new Map<RateLimitKey, RateLimitBucket>();

function buildBucketKey(actor: RequestActor, identifier: string) {
  return `data:${actor.kind}:${identifier}`;
}

function publicRateLimit(settings: CompatibleApiRateLimitSettings) {
  return Math.max(1, settings.publicRateLimitPerMinute ?? settings.defaultRateLimitPerMinute);
}

function sessionRateLimit(settings: CompatibleApiRateLimitSettings) {
  return Math.max(
    1,
    settings.sessionRateLimitPerMinute ?? Math.max(settings.defaultRateLimitPerMinute, settings.publicRateLimitPerMinute ?? 0),
  );
}

function apiKeyRateLimit(settings: CompatibleApiRateLimitSettings) {
  return Math.max(1, settings.apiKeyRateLimitPerMinute ?? settings.maxRateLimitPerMinute);
}

function resolveLimit(actor: RequestActor, settings: CompatibleApiRateLimitSettings) {
  if (actor.kind === "public") {
    return publicRateLimit(settings);
  }

  if (actor.kind === "apiKey") {
    return apiKeyRateLimit(settings);
  }

  return sessionRateLimit(settings);
}

function upsertBucket(key: string, now: number) {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const next = {
      count: 0,
      resetAt: now + WINDOW_MS,
    };
    buckets.set(key, next);
    return next;
  }

  return current;
}

export function clearRateLimitBuckets() {
  buckets.clear();
}

export function consumeRateLimit(limit: number, key: string, now = Date.now()): RateLimitDecision {
  const bucket = upsertBucket(key, now);
  const remainingBefore = Math.max(0, limit - bucket.count);
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  if (remainingBefore <= 0) {
    return {
      limited: true,
      limit,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSeconds,
    };
  }

  bucket.count += 1;

  return {
    limited: false,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export async function rateLimitDataRequest(actor: RequestActor, identifier: string | null | undefined) {
  const settings = (await readSettingsSection("api")).config as CompatibleApiRateLimitSettings;
  const limit = resolveLimit(actor, settings);
  if (limit === null || !identifier) {
    return null;
  }

  return consumeRateLimit(limit, buildBucketKey(actor, identifier));
}
