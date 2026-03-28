import { HttpError } from "../lib/http";

type AuthAttemptBucket = {
  count: number;
  resetAt: number;
};

type ProtectedAuthAttempt = {
  scope: "app" | "admin";
  kind: "password-sign-in";
  identifier: string;
  ipAddress: string;
};

type BruteForceDecision =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      retryAfterSeconds: number;
    };

const WINDOW_MS = 15 * 60 * 1000;
const IDENTIFIER_FAILURE_LIMIT = 5;
const IP_FAILURE_LIMIT = 15;
const globalAuthAbuseState = globalThis as typeof globalThis & {
  __authendProtectedAuthBuckets__?: Map<string, AuthAttemptBucket>;
};
const protectedBuckets = globalAuthAbuseState.__authendProtectedAuthBuckets__ ?? new Map<string, AuthAttemptBucket>();
globalAuthAbuseState.__authendProtectedAuthBuckets__ = protectedBuckets;

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function readClientIpAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "direct";
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "direct";
}

function buildBucketKey(scope: ProtectedAuthAttempt["scope"], dimension: "identifier" | "ip", value: string) {
  return `auth-bruteforce:${scope}:password-sign-in:${dimension}:${value}`;
}

function currentBucket(key: string, now: number) {
  const bucket = protectedBuckets.get(key);
  if (!bucket) {
    return null;
  }

  if (bucket.resetAt <= now) {
    protectedBuckets.delete(key);
    return null;
  }

  return bucket;
}

function evaluateBucket(key: string, limit: number, now: number): BruteForceDecision {
  const bucket = currentBucket(key, now);
  if (!bucket || bucket.count < limit) {
    return { allowed: true };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

function recordFailure(key: string, now: number) {
  const existing = currentBucket(key, now);
  if (!existing) {
    protectedBuckets.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
    return;
  }

  existing.count += 1;
}

function clearFailure(key: string) {
  protectedBuckets.delete(key);
}

function isProtectedPasswordSignIn(pathname: string, method: string) {
  if (method !== "POST" && method !== "PUT") {
    return false;
  }

  return pathname.endsWith("/sign-in/email");
}

export async function prepareProtectedAuthAttempt(
  request: Request,
  scope: ProtectedAuthAttempt["scope"],
): Promise<ProtectedAuthAttempt | null> {
  const pathname = new URL(request.url).pathname;
  if (!isProtectedPasswordSignIn(pathname, request.method)) {
    return null;
  }

  const body = await request.clone().json().catch(() => null);
  const identifier = normalizeEmail((body as { email?: unknown } | null)?.email);
  if (!identifier) {
    throw new HttpError(400, "Invalid sign-in payload");
  }

  return {
    scope,
    kind: "password-sign-in",
    identifier,
    ipAddress: readClientIpAddress(request),
  };
}

export function assertProtectedAuthAttemptAllowed(attempt: ProtectedAuthAttempt) {
  const now = Date.now();
  const identifierDecision = evaluateBucket(buildBucketKey(attempt.scope, "identifier", attempt.identifier), IDENTIFIER_FAILURE_LIMIT, now);
  const ipDecision = evaluateBucket(buildBucketKey(attempt.scope, "ip", attempt.ipAddress), IP_FAILURE_LIMIT, now);
  const blockedDecision = !identifierDecision.allowed ? identifierDecision : ipDecision;
  if (blockedDecision.allowed) {
    return null;
  }

  return new Response(
    JSON.stringify({
      error: "Too many failed sign-in attempts. Try again later.",
      details: {
        retryAfterSeconds: blockedDecision.retryAfterSeconds,
      },
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "retry-after": String(blockedDecision.retryAfterSeconds),
      },
    },
  );
}

export function recordProtectedAuthFailure(attempt: ProtectedAuthAttempt) {
  const now = Date.now();
  recordFailure(buildBucketKey(attempt.scope, "identifier", attempt.identifier), now);
  recordFailure(buildBucketKey(attempt.scope, "ip", attempt.ipAddress), now);
}

export function clearProtectedAuthFailure(attempt: ProtectedAuthAttempt) {
  clearFailure(buildBucketKey(attempt.scope, "identifier", attempt.identifier));
}

export function shouldRecordProtectedAuthFailure(responseStatus: number) {
  return responseStatus === 400 || responseStatus === 401 || responseStatus === 403;
}

export function clearAuthBruteForceBuckets() {
  protectedBuckets.clear();
}
