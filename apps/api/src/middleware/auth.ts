import type { Context, Next } from 'hono';
import { getAdminAuth, getAuth } from '../services/auth-service';
import { db } from '../db/client';
import { HttpError } from '../lib/http';

export type SessionContext = {
  user: {
    id: string;
    email: string;
    name: string;
  };
  session: {
    id: string;
  };
};

export type ApiKeyActor = {
  kind: 'apiKey';
  subjectId: string | null;
  permissions: Set<string>;
  keyId: string;
};

export type SessionActor = {
  kind: 'session' | 'superadmin';
  subjectId: string;
  session: SessionContext;
};

export type PublicActor = {
  kind: 'public';
  subjectId: null;
};

export type RequestActor = PublicActor | SessionActor | ApiKeyActor;

type VerifiedApiKey = {
  id: string;
  referenceId: string;
  permissions?: Record<string, string[]> | null;
};

type VerifyApiKeyResult = {
  valid: boolean;
  key: VerifiedApiKey | null;
};

function flattenApiKeyPermissions(permissions: Record<string, string[]> | null | undefined) {
  const flattened = new Set<string>();

  if (!permissions) {
    return flattened;
  }

  for (const [resource, actions] of Object.entries(permissions)) {
    for (const action of actions) {
      flattened.add(`${resource}:${action}`);
    }
  }

  return flattened;
}

function readApiKeyHeader(c: Context) {
  const direct = c.req.header('x-api-key');
  if (direct) {
    return direct;
  }

  const authorization = c.req.header('authorization');
  if (authorization) {
    const match = authorization.match(/^ApiKey\s+(.+)$/i);
    if (match) {
      return match[1]?.trim() ?? null;
    }
  }

  return null;
}

export async function readSession(c: Context) {
  const auth = await getAuth();
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user || !session.session) {
    return null;
  }

  c.set('auth', session as SessionContext);
  return session as SessionContext;
}

export async function readAdminSession(c: Context) {
  const auth = await getAdminAuth();
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user || !session.session) {
    return null;
  }

  c.set('auth', session as SessionContext);
  return session as SessionContext;
}

export async function requireSession(c: Context, next: Next) {
  const session = await readSession(c);
  if (!session) {
    throw new HttpError(401, 'Unauthorized');
  }

  await next();
}

export async function verifyRequestApiKey(c: Context) {
  const presentedKey = readApiKeyHeader(c);
  if (!presentedKey) {
    return null;
  }

  const auth = await getAuth();
  const result = await (auth.api as typeof auth.api & {
    verifyApiKey: (input: { body: { key: string } }) => Promise<VerifyApiKeyResult>;
  }).verifyApiKey({
    body: {
      key: presentedKey,
    },
  });

  if (!result.valid || !result.key) {
    throw new HttpError(401, 'Invalid API key');
  }

  const key = result.key as VerifiedApiKey;

  return {
    kind: 'apiKey' as const,
    subjectId: key.referenceId ?? null,
    permissions: flattenApiKeyPermissions(key.permissions),
    keyId: key.id,
  };
}

export async function resolveRequestActor(c: Context): Promise<RequestActor> {
  const apiKeyActor = await verifyRequestApiKey(c);
  if (apiKeyActor) {
    return apiKeyActor;
  }

  const session = await readSession(c);
  if (!session) {
    return {
      kind: 'public',
      subjectId: null,
    };
  }

  return {
    kind: 'session',
    subjectId: session.user.id,
    session,
  };
}

export async function resolveAdminRequestActor(c: Context): Promise<RequestActor> {
  const apiKeyActor = await verifyRequestApiKey(c);
  if (apiKeyActor) {
    return apiKeyActor;
  }

  const session = await readAdminSession(c);
  if (!session) {
    return {
      kind: 'public',
      subjectId: null,
    };
  }

  const admin = await db.query.systemAdmins.findFirst({
    where: (table, operators) => operators.eq(table.userId, session.user.id),
  });

  if (!admin) {
    return {
      kind: 'session',
      subjectId: session.user.id,
      session,
    };
  }

  return {
    kind: 'superadmin',
    subjectId: session.user.id,
    session,
  };
}

export async function requireSuperAdmin(c: Context, next: Next) {
  const actor = await resolveAdminRequestActor(c);
  if (actor.kind !== 'superadmin') {
    if (actor.kind === 'public') {
      throw new HttpError(401, 'Unauthorized');
    }
    throw new HttpError(403, 'Superadmin access required');
  }

  await next();
}
