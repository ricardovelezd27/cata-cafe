// Helpers shared by the DB suite: raw pg access (guarded), per-test reset, and
// small typed fixtures. Every connection goes through assertSafeTestDatabaseUrl.
import { Client } from "pg";
import { inject } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { computeEvaluationDerived, moduleKeyForFormat } from "@/lib/evaluation";
import { assertSafeTestDatabaseUrl } from "./guard";

export { prisma };

export function dbUrl(): string {
  const url = inject("dbUrl");
  assertSafeTestDatabaseUrl(url);
  return url;
}

export async function rawClient(): Promise<Client> {
  const c = new Client({ connectionString: dbUrl() });
  await c.connect();
  return c;
}

/** Wipes every app table (and auth.users) between tests. */
export async function resetDb(): Promise<void> {
  assertSafeTestDatabaseUrl(process.env.DATABASE_URL);
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> '_prisma_migrations'`;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list}, auth.users RESTART IDENTITY CASCADE`);
}

// ── Fixtures ───────────────────────────────────────────────────────────────

/** Creates an auth.users row; the real handle_new_user trigger makes the profile. */
export async function makeUser(
  opts: { name?: string; email?: string | null; anonymous?: boolean; id?: string } = {},
): Promise<string> {
  const id = opts.id ?? randomUUID();
  const anonymous = opts.anonymous ?? false;
  const email = anonymous ? null : (opts.email ?? `u_${id.slice(0, 8)}@example.test`);
  await prisma.$executeRaw`
    insert into auth.users (id, email, is_anonymous, raw_user_meta_data)
    values (${id}::uuid, ${email}, ${anonymous}, ${JSON.stringify(opts.name ? { display_name: opts.name } : {})}::jsonb)`;
  const p = await prisma.profile.findUnique({ where: { id } });
  if (!p) throw new Error("handle_new_user trigger did not create the profile");
  if (opts.name) await prisma.profile.update({ where: { id }, data: { displayName: opts.name } });
  return id;
}

export async function makeCoffee(ownerId: string, name = "Café " + randomUUID().slice(0, 4)) {
  return prisma.coffee.create({
    data: { name, createdBy: ownerId, country: "Colombia", visibility: "private" },
  });
}

export type SampleSpec = { label?: string; coffeeId?: string | null; revealed?: boolean };

export async function makeSession(opts: {
  ownerId: string;
  isGroup?: boolean;
  format?: "affective" | "combined" | "descriptive";
  cupsPerSample?: number;
  status?: "active" | "closed";
  samples?: SampleSpec[];
  participants?: string[];
  closesAt?: Date | null;
}) {
  const samples = opts.samples ?? [{}];
  const session = await prisma.cuppingSession.create({
    data: {
      name: "Sesión " + randomUUID().slice(0, 4),
      date: new Date("2026-11-01T12:00:00Z"),
      format: opts.format ?? "affective",
      cupsPerSample: opts.cupsPerSample ?? 5,
      isGroup: opts.isGroup ?? false,
      status: opts.status ?? "active",
      createdBy: opts.ownerId,
      closesAt: opts.closesAt ?? null,
      startedAt: opts.isGroup ? new Date("2026-11-01T12:00:00Z") : null,
      participants: {
        create: [
          { userId: opts.ownerId, status: "owner" },
          ...(opts.participants ?? [])
            .filter((u) => u !== opts.ownerId)
            .map((userId) => ({ userId, status: "joined" })),
        ],
      },
      samples: {
        create: samples.map((s, i) => ({
          position: i + 1,
          label: s.label ?? `Muestra ${String.fromCharCode(65 + i)}`,
          coffeeId: s.coffeeId ?? null,
          revealed: s.revealed ?? false,
        })),
      },
    },
    include: { samples: { orderBy: { position: "asc" } } },
  });
  return session;
}

/** Affective module data: `values` is one number for all 8 attributes or 8 numbers. */
export function affectiveData(values: number | number[]): Record<string, unknown> {
  const arr = Array.isArray(values) ? values : AFFECTIVE_ATTRIBUTES.map(() => values);
  const out: Record<string, unknown> = {};
  AFFECTIVE_ATTRIBUTES.forEach((a, i) => {
    out[`${a.id}_final`] = arr[i];
  });
  return out;
}

/**
 * Inserts an evaluation exactly the way the app derives it (computeEvaluationDerived),
 * submitted unless `draft`. The real DB trigger recomputes the aggregate on insert.
 */
export async function makeEvaluation(opts: {
  sampleId: string;
  sessionId: string;
  cupperId: string;
  format?: string;
  cupsPerSample?: number;
  values?: number | number[];
  nonUniform?: boolean[];
  defective?: boolean[];
  draft?: boolean;
  data?: Record<string, unknown>;
  /** Column values written AFTER the derived ones: e.g. `{ cups: null }` for a row
   *  older than the evaluations.cups backfill, or flag arrays longer than the cups
   *  (which computeEvaluationDerived would clamp). */
  overrides?: Record<string, unknown>;
}) {
  const format = opts.format ?? "affective";
  const moduleKey = moduleKeyForFormat(format);
  const cups = opts.cupsPerSample ?? 5;
  const data = {
    ...(opts.data ?? affectiveData(opts.values ?? 6)),
    tazas_no_uniformes: opts.nonUniform ?? [],
    tazas_defectuosas: opts.defective ?? [],
  };
  const fields = computeEvaluationDerived(moduleKey, data, cups);
  const draft = opts.draft ?? false;
  return prisma.evaluation.create({
    data: {
      sessionSampleId: opts.sampleId,
      sessionId: opts.sessionId,
      cupperId: opts.cupperId,
      ...(fields as unknown as Record<string, never>),
      ...((opts.overrides ?? {}) as Record<string, never>),
      isDraft: draft,
      submittedAt: draft ? null : new Date(),
    },
  });
}

export async function storedAggregate(sampleId: string) {
  return prisma.aggregateScore.findUnique({ where: { sessionSampleId: sampleId } });
}
