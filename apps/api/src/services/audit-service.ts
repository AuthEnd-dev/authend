import { sql } from "../db/client";

export async function writeAuditLog(input: {
  action: string;
  actorUserId?: string | null;
  target: string;
  payload?: Record<string, unknown>;
}) {
  await sql`
    insert into audit_logs (id, action, actor_user_id, target, payload, created_at)
    values (
      ${crypto.randomUUID()},
      ${input.action},
      ${input.actorUserId ?? null},
      ${input.target},
      ${JSON.stringify(input.payload ?? {})}::jsonb,
      now()
    )
  `;
}
