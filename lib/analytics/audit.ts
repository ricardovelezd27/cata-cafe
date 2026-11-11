// Audit trail for privileged admin actions (S8-08, F-insights-2). One JSON
// line per event, searchable in Vercel Logs by `where:"audit"` + `action`.
// Ids and counts only: NEVER an email, a name or the CSV contents.

import { logInfo, type LogFields } from "@/lib/log";

export type AuditAction =
  | "exportRegisteredUsersCsv"
  | "listAnalyticsUsers"
  | "grantAnalyticsAccess"
  | "revokeAnalyticsAccess";

export function auditFields(
  action: AuditAction,
  actorId: string,
  extra: { targetId?: string; count?: number } = {},
): LogFields {
  const fields: LogFields = { where: "audit", action, actorId };
  if (extra.targetId) fields.targetId = extra.targetId;
  if (typeof extra.count === "number") fields.count = extra.count;
  return fields;
}

export function auditLog(
  action: AuditAction,
  actorId: string,
  extra: { targetId?: string; count?: number } = {},
): void {
  logInfo(auditFields(action, actorId, extra));
}
