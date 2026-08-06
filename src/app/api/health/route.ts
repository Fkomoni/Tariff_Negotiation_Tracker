import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Deploy health check, answering the one question that has caused every
 * production outage on this app so far: is the database schema behind the code?
 *
 * The failure mode is silent and confusing — the code selects a column the
 * database doesn't have yet, so every page that reads a full case row 500s
 * while the app itself looks fine. Nothing surfaced that except opening a page
 * and seeing the error boundary.
 *
 * Checks the schema features the current code depends on rather than reading
 * _prisma_migrations, because what matters is whether the columns and enum
 * values actually exist — a migration recorded as applied but only partly run
 * (someone pasting SQL by hand) would still break the app.
 *
 * Returns only names and booleans. No business data, so it's safe unauthenticated,
 * which is what lets Render use it as the service health check.
 */

/** Column and enum-value requirements, newest migrations first. */
const REQUIRED_COLUMNS: { table: string; column: string; migration: string }[] = [
  { table: "NegotiationCase", column: "cancellationReason", migration: "20260804160000_add_cancelled_status" },
  { table: "MemberNotification", column: "providerReference", migration: "20260804120000_add_notification_provider_reference" },
];

const REQUIRED_ENUM_VALUES: { enumName: string; value: string; migration: string }[] = [
  { enumName: "CaseStatus", value: "CANCELLED", migration: "20260804160000_add_cancelled_status" },
  { enumName: "ServiceType", value: "MATERNITY", migration: "20260731100000_add_service_type_categories" },
  { enumName: "ServiceType", value: "GYM_AND_SPA", migration: "20260731100000_add_service_type_categories" },
  { enumName: "ServiceType", value: "IMMUNIZATIONS", migration: "20260731100000_add_service_type_categories" },
];

export async function GET() {
  const missing: string[] = [];
  const pendingMigrations = new Set<string>();

  try {
    const columns = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'
    `;
    const have = new Set(columns.map((c) => `${c.table_name}.${c.column_name}`));
    for (const req of REQUIRED_COLUMNS) {
      if (!have.has(`${req.table}.${req.column}`)) {
        missing.push(`column ${req.table}.${req.column}`);
        pendingMigrations.add(req.migration);
      }
    }

    const enumValues = await prisma.$queryRaw<{ enum_name: string; enum_value: string }[]>`
      SELECT t.typname AS enum_name, e.enumlabel AS enum_value
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    `;
    const haveEnum = new Set(enumValues.map((e) => `${e.enum_name}.${e.enum_value}`));
    for (const req of REQUIRED_ENUM_VALUES) {
      if (!haveEnum.has(`${req.enumName}.${req.value}`)) {
        missing.push(`enum value ${req.enumName}.${req.value}`);
        pendingMigrations.add(req.migration);
      }
    }
  } catch (err) {
    // Couldn't even reach the database — distinct from "reachable but stale".
    // The raw driver error can name the DB host / auth wording, so it goes to
    // the server log (where the operator diagnosing a deploy already looks),
    // not into an unauthenticated HTTP response.
    console.error("[health] database unreachable:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ status: "unhealthy", database: "unreachable" }, { status: 503 });
  }

  if (missing.length > 0) {
    // Enumerating the exact missing tables/columns/enums + migration filenames
    // is useful for the operator but is internal schema detail — log it, and
    // return only a count to anonymous callers. Render's health check keys off
    // the 503 status code, not the body, so this doesn't weaken the gate.
    console.error(
      `[health] schema behind code — missing: ${missing.join(", ")}; pending migrations: ${[...pendingMigrations].sort().join(", ")}`
    );
    return NextResponse.json(
      { status: "unhealthy", database: "reachable", schema: "behind the code", missingCount: missing.length },
      { status: 503 }
    );
  }

  return NextResponse.json({ status: "healthy", database: "reachable", schema: "up to date" });
}
