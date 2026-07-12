import { prisma } from "@/lib/prisma";
import { fetchTreatmentsFromPrognosis, refreshProviders, msUntilNextUtcMidnight, type TreatmentRecord } from "@/lib/prognosis";

// This module is the only place that combines Prisma with Prognosis lookup
// data — kept separate from prognosis.ts on purpose, since prognosis.ts is
// reachable from middleware.ts (via auth.ts) which runs in the Edge
// runtime, where Prisma cannot execute. Nothing here should be imported
// from auth.ts or middleware.ts.

const TREATMENTS_SYNC_KEY = "treatments";

function todayUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

/** Wholesale-replaces the persisted procedure catalog and records the sync
 * time, so the full list survives app restarts/redeploys instead of living
 * only in memory. Prognosis's raw catalog has been observed to contain
 * duplicate procedure codes (same tariff_code appearing more than once) —
 * skipDuplicates keeps one of each instead of the whole persist (and every
 * search behind it) failing on the unique constraint. */
async function persistTreatments(records: TreatmentRecord[]): Promise<void> {
  const now = new Date();
  const [, inserted] = await prisma.$transaction([
    prisma.procedureCatalogEntry.deleteMany({}),
    prisma.procedureCatalogEntry.createMany({
      data: records.map((r) => ({ procedureId: r.procedureId, name: r.name, tariffId: r.tariffId })),
      skipDuplicates: true,
    }),
    prisma.lookupSync.upsert({
      where: { key: TREATMENTS_SYNC_KEY },
      create: { key: TREATMENTS_SYNC_KEY, lastSyncedAt: now, recordCount: records.length },
      update: { lastSyncedAt: now, recordCount: records.length },
    }),
  ]);
  if (inserted.count < records.length) {
    console.error(`[procedure-catalog] skipped ${records.length - inserted.count} duplicate procedure code(s) out of ${records.length}`);
  }
}

/** Returns the persisted catalog if it was synced today (UTC), else null —
 * meaning the caller should fetch fresh from Prognosis and persist. */
async function loadTreatmentsFromDbIfFresh(): Promise<TreatmentRecord[] | null> {
  const sync = await prisma.lookupSync.findUnique({ where: { key: TREATMENTS_SYNC_KEY } });
  if (!sync || sync.lastSyncedAt < todayUtcMidnight()) return null;

  const rows = await prisma.procedureCatalogEntry.findMany();
  if (rows.length === 0) return null;
  return rows.map((r) => ({ procedureId: r.procedureId, name: r.name, tariffId: r.tariffId }));
}

async function fetchAndPersistTreatments(): Promise<TreatmentRecord[]> {
  const data = await fetchTreatmentsFromPrognosis();
  await persistTreatments(data);
  return data;
}

let cachedTreatments: { data: TreatmentRecord[]; expiresAt: number } | null = null;
let inFlightTreatmentsFetch: Promise<TreatmentRecord[]> | null = null;

/**
 * Returns Prognosis's full master treatment/procedure catalog. Backed by a
 * database table (ProcedureCatalogEntry), not just an in-memory cache, so
 * the full list survives app restarts/redeploys — Render can wipe an
 * in-memory-only cache on every deploy, forcing a slow full re-fetch on
 * the first search after each one. Refreshes once a day (UTC midnight), or
 * immediately via resyncLookupCaches() ("Sync Now").
 */
async function getTreatments(): Promise<TreatmentRecord[]> {
  if (cachedTreatments && cachedTreatments.expiresAt > Date.now()) return cachedTreatments.data;
  if (!inFlightTreatmentsFetch) {
    inFlightTreatmentsFetch = (async () => {
      const fromDb = await loadTreatmentsFromDbIfFresh();
      return fromDb ?? (await fetchAndPersistTreatments());
    })()
      .then((data) => {
        cachedTreatments = { data, expiresAt: Date.now() + msUntilNextUtcMidnight() };
        return data;
      })
      .finally(() => {
        inFlightTreatmentsFetch = null;
      });
  }
  return inFlightTreatmentsFetch;
}

export interface TreatmentSearchResult {
  results: TreatmentRecord[];
  totalMatches: number;
}

/**
 * A generic word like "consultation" can match hundreds of catalog
 * entries — silently hard-capping at a small limit meant real matches
 * (e.g. "Cardiothoracic Surgeon Consultation") could be cut off depending
 * on the catalog's arbitrary original ordering. Matches are now sorted
 * alphabetically before slicing (so the same subset shows consistently
 * rather than whatever order Prognosis happened to return), the cap is
 * much higher, and totalMatches lets the caller tell the user when
 * results were truncated instead of failing silently.
 */
export async function searchTreatments(query: string, limit = 100): Promise<TreatmentSearchResult> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { results: [], totalMatches: 0 };
  const treatments = await getTreatments();
  const matches = treatments
    .filter((t) => t.name.toLowerCase().includes(q) || t.procedureId.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { results: matches.slice(0, limit), totalMatches: matches.length };
}

/**
 * Forces an immediate refresh of the provider list and the persisted
 * treatment catalog instead of waiting for the next midnight refresh, for
 * when Prognosis's underlying data changes mid-day. Re-fetches eagerly
 * (not just clears) so the cache is already warm by the time anyone
 * actually searches — the sync itself pays the full-list fetch cost, not
 * the next Contact Centre search.
 */
export async function resyncLookupCaches(): Promise<{ providers: number; treatments: number }> {
  cachedTreatments = null;
  const [providers, treatments] = await Promise.all([refreshProviders(), fetchAndPersistTreatments()]);
  cachedTreatments = { data: treatments, expiresAt: Date.now() + msUntilNextUtcMidnight() };
  return { providers, treatments: treatments.length };
}
