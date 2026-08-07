import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { addTariffReviews, getActiveTariffScheduleName } from "@/lib/prognosis";

/**
 * Sweeps cases whose tariff end date has fallen due without their
 * return-to-old-price landing in Prognosis, and pushes the reversion now.
 * The automated safety net behind the per-case "Revert now" button - meant
 * to be hit once a day by a scheduler (e.g. a Render Cron Job):
 *
 *   curl -X POST -H "Authorization: Bearer $REVERT_TASK_TOKEN" \
 *     https://<app>/api/tasks/revert-due-tariffs
 *
 * Exists because Prognosis has no scheduled end-dating of its own (verified
 * 05/08/2026: EndDate on AddTarrifReviews is silently discarded) - a price
 * only ends when a successor price starts, so someone has to push that
 * successor. Cases whose reversion was already verified-scheduled at
 * completion have tariffRevertPushedAt set and are never touched here.
 *
 * Pushes as the case's owner (falling back to whoever logged it) because
 * Prognosis validates UserEmail against a real staff account - there is no
 * system identity to push as.
 */

function authorized(req: NextRequest): boolean {
  const expected = process.env.REVERT_TASK_TOKEN;
  if (!expected) return false;
  const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!process.env.REVERT_TASK_TOKEN) {
    return NextResponse.json({ error: "REVERT_TASK_TOKEN is not configured" }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = await prisma.negotiationCase.findMany({
    where: {
      status: "COMPLETED",
      requestType: "EXISTING_TARIFF_UPDATE",
      tariffEndDate: { lte: new Date() },
      tariffRevertPushedAt: null,
      // Only cases whose negotiated price actually reached Prognosis - if the
      // original push never landed there's nothing live to revert.
      tariffPushedAt: { not: null },
      providerId: { not: null },
      serviceCode: { not: null },
      // A former price of 0 is included on purpose: on this provider 0 is a
      // legitimate default, so "revert to 0" is a real reversion, not a no-op.
    },
    include: { owner: true, loggedBy: true },
    orderBy: { tariffEndDate: "asc" },
    // Bounds one sweep; the task runs daily so a backlog drains over a few runs
    // rather than one request ballooning.
    take: 25,
  });

  const results: { case: string; outcome: string }[] = [];
  const scheduleCache = new Map<number, string>();

  for (const c of due) {
    const oldPrice = Number(c.currentTariff);
    const userEmail = c.owner?.email ?? c.loggedBy.email ?? "";
    if (!userEmail) {
      results.push({ case: c.caseNumber, outcome: "skipped - no staff email on the owner or logger to push as" });
      continue;
    }

    if (!scheduleCache.has(c.providerId!)) {
      try {
        scheduleCache.set(c.providerId!, (await getActiveTariffScheduleName(c.providerId!, userEmail)) ?? "");
      } catch {
        scheduleCache.set(c.providerId!, "");
      }
    }

    try {
      await addTariffReviews([
        {
          procedureId: c.serviceCode!,
          procedureName: c.requestedItem,
          newPrice: oldPrice,
          providerId: c.providerId!,
          tariffScheduleName: scheduleCache.get(c.providerId!) ?? "",
          userEmail,
          requestorMobile: "",
          action: "Insert",
          providerTariffCode: c.providerTariffCode ?? "",
          providerTariffName: "",
          zeroRate: false,
          effectiveDate: new Date(),
        },
      ]);
      await prisma.negotiationCase.update({ where: { id: c.id }, data: { tariffRevertPushedAt: new Date() } });
      await prisma.caseUpdate.create({
        data: {
          caseId: c.id,
          userId: c.ownerUserId ?? c.loggedByUserId,
          type: "NOTE",
          note: `Price reverted automatically: ${c.serviceCode} pushed back to ${oldPrice}, effective today (end date was ${c.tariffEndDate!.toISOString().slice(0, 10)}; daily revert task).`,
        },
      });
      results.push({ case: c.caseNumber, outcome: `reverted to ${oldPrice}` });
      console.error(`[revert-due] reverted ${c.caseNumber} (${c.serviceCode}) to ${oldPrice}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      results.push({ case: c.caseNumber, outcome: `failed - ${message}` });
      console.error(`[revert-due] failed for ${c.caseNumber}:`, err);
    }
  }

  return NextResponse.json({ due: due.length, results });
}
