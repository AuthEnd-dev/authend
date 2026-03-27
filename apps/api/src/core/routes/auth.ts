import { Hono } from "hono";
import { getAuth } from "../services/auth-service";
import {
  assertProtectedAuthAttemptAllowed,
  clearProtectedAuthFailure,
  prepareProtectedAuthAttempt,
  recordProtectedAuthFailure,
  shouldRecordProtectedAuthFailure,
} from "../services/auth-abuse-service";

export const authRouter = new Hono().all("*", async (c) => {
  const protectedAttempt = await prepareProtectedAuthAttempt(c.req.raw, "app");
  if (protectedAttempt) {
    const blockedResponse = assertProtectedAuthAttemptAllowed(protectedAttempt);
    if (blockedResponse) {
      return blockedResponse;
    }
  }

  const auth = await getAuth();
  const response = await auth.handler(c.req.raw);

  if (protectedAttempt) {
    if (response.status === 200) {
      clearProtectedAuthFailure(protectedAttempt);
    } else if (shouldRecordProtectedAuthFailure(response.status)) {
      recordProtectedAuthFailure(protectedAttempt);
    }
  }

  return response;
});
