import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { db } from "../db/client";
import { HttpError } from "../lib/http";
import { getAdminAuth } from "../services/auth-service";
import {
  assertProtectedAuthAttemptAllowed,
  clearProtectedAuthFailure,
  prepareProtectedAuthAttempt,
  recordProtectedAuthFailure,
  shouldRecordProtectedAuthFailure,
} from "../services/auth-abuse-service";

const signInEmailBodySchema = z.object({
  email: z.string().email(),
});

async function assertIsSuperuserForAdminRequest(c: Context) {
  const pathname = new URL(c.req.url).pathname;
  const auth = await getAdminAuth();

  if (pathname.endsWith("/sign-in/email") && (c.req.raw.method === "POST" || c.req.raw.method === "PUT")) {
    const rawClone = c.req.raw.clone();
    const bodyJson = await rawClone.json().catch(() => null);
    const parsed = signInEmailBodySchema.safeParse(bodyJson);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid sign-in payload");
    }

    const superuser = await db.query.systemAdmins.findFirst({
      where: (table, operators) => operators.eq(table.email, parsed.data.email),
    });
    if (!superuser) {
      throw new HttpError(401, "Unauthorized");
    }
  }

  // Block session retrieval for non-superusers (prevents non-superusers from authenticating to admin UI).
  if (pathname.endsWith("/get-session") || pathname.endsWith("/refresh-session") || pathname.endsWith("/token")) {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user?.id) {
      throw new HttpError(401, "Unauthorized");
    }

    const superuser = await db.query.systemAdmins.findFirst({
      where: (table, operators) => operators.eq(table.userId, session.user.id),
    });
    if (!superuser) {
      throw new HttpError(403, "Superadmin access required");
    }
  }
}

export const adminAuthRouter = new Hono().all("*", async (c) => {
  const protectedAttempt = await prepareProtectedAuthAttempt(c.req.raw, "admin");
  if (protectedAttempt) {
    const blockedResponse = assertProtectedAuthAttemptAllowed(protectedAttempt);
    if (blockedResponse) {
      return blockedResponse;
    }
  }

  try {
    await assertIsSuperuserForAdminRequest(c);
    const auth = await getAdminAuth();
    const response = await auth.handler(c.req.raw);

    if (protectedAttempt) {
      if (response.status === 200) {
        clearProtectedAuthFailure(protectedAttempt);
      } else if (shouldRecordProtectedAuthFailure(response.status)) {
        recordProtectedAuthFailure(protectedAttempt);
      }
    }

    return response;
  } catch (error) {
    if (protectedAttempt && error instanceof HttpError && shouldRecordProtectedAuthFailure(error.status)) {
      recordProtectedAuthFailure(protectedAttempt);
    }
    throw error;
  }
});
