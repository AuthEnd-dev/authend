import type { Context, Next } from "hono";
import { getAuth } from "../services/auth-service";
import { db } from "../db/client";
import { HttpError } from "../lib/http";

type SessionContext = {
  user: {
    id: string;
    email: string;
    name: string;
  };
  session: {
    id: string;
  };
};

export async function requireSession(c: Context, next: Next) {
  const auth = await getAuth();
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user || !session.session) {
    throw new HttpError(401, "Unauthorized");
  }

  c.set("auth", session as SessionContext);
  await next();
}

export async function requireSuperAdmin(c: Context, next: Next) {
  await requireSession(c, async () => {
    const auth = c.get("auth") as SessionContext;
    const admin = await db.query.systemAdmins.findFirst({
      where: (table, operators) => operators.eq(table.userId, auth.user.id),
    });

    if (!admin) {
      throw new HttpError(403, "Superadmin access required");
    }

    await next();
  });
}
