// "Where does the database still remember this user?" Driven by
// lib/accountDeletion/manifest.ts, so a manifest entry without a table mapping
// fails loudly, plus every FK to profiles(id) found in the catalog.
import { PROFILE_MANIFEST } from "@/lib/accountDeletion/manifest";
import { prisma } from "./db";

const TABLE: Record<string, string> = {
  Coffee: "coffees",
  CoffeeInvite: "coffee_invites",
  CuppingSession: "cupping_sessions",
  Evaluation: "evaluations",
  PhysicalEvaluation: "physical_evaluations",
  ExtrinsicData: "extrinsic_data",
  SessionInvite: "session_invites",
  CoffeeShare: "coffee_shares",
  SessionParticipant: "session_participants",
  UserCoffeeHistory: "user_coffee_history",
  SavedInsight: "saved_insights",
  WarmupReflection: "warmup_reflections",
  TastingGroup: "tasting_groups",
  GroupPost: "group_posts",
  TastingGroupMember: "tasting_group_members",
  CloseEmailDelivery: "close_email_deliveries",
  SessionReminderDelivery: "session_reminder_deliveries",
  AiChatUsage: "ai_chat_usage",
  OutboundEmailEvent: "outbound_email_events",
};
const COLUMN: Record<string, string> = { "SessionParticipant.excludedBy": "excluded_by" };

/** table.column -> number of rows that reference `userId` (zero entries omitted). */
export async function referencesTo(userId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const bump = (k: string, n: number) => {
    if (n > 0) out[k] = (out[k] ?? 0) + n;
  };

  // every FK in the catalog that points at profiles(id)
  const fks = await prisma.$queryRaw<{ tbl: string; col: string }[]>`
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass`;
  for (const fk of fks) {
    const tbl = fk.tbl.replace(/"/g, "");
    const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `select count(*)::bigint as n from "${tbl}" where "${fk.col}" = $1`,
      userId,
    );
    bump(`${tbl}.${fk.col}`, Number(rows[0].n));
  }

  // manifest entries (relations + bare columns), so a bare column is covered too
  for (const e of PROFILE_MANIFEST) {
    if (e.model === "WaitlistEntry") continue; // email-keyed
    const tbl = TABLE[e.model];
    if (!tbl) throw new Error(`refs.ts: no table mapping for manifest model ${e.model}`);
    const col = COLUMN[`${e.model}.${e.field}`] ?? e.field;
    const value = e.field === "actorKey" ? `u_${userId}` : userId;
    const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `select count(*)::bigint as n from "${tbl}" where "${col}" = $1`,
      value,
    );
    bump(`${tbl}.${col}`, Number(rows[0].n));
  }
  return out;
}
