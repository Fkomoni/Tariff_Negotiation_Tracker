import { prisma } from "@/lib/prisma";
import { CLOSED_STATUSES } from "@/lib/domain";
import type { NegotiationCase } from "@prisma/client";

/**
 * Counts how many services were logged in each visit represented by the
 * given cases, so a list can tell the Provider Team "part of a 3-service
 * visit" instead of showing several near-identical rows with no hint they
 * belong together.
 *
 * Counted with a fresh query rather than off the passed-in list on purpose:
 * the caller's list is usually filtered (by status, urgency, date), so
 * sibling services would be missing from it and the count would understate
 * the real size of the visit.
 *
 * Returns a map of group-root case id → number of services in that group.
 * A case with no sessionGroupId is its own root and is simply absent from
 * the map (callers treat "missing" as 1).
 */
export async function getCaseGroupSizes(cases: Pick<NegotiationCase, "id" | "sessionGroupId">[]): Promise<Record<string, number>> {
  const roots = Array.from(new Set(cases.map((c) => c.sessionGroupId ?? c.id)));
  if (roots.length === 0) return {};

  const members = await prisma.negotiationCase.findMany({
    where: { OR: [{ id: { in: roots } }, { sessionGroupId: { in: roots } }] },
    select: { id: true, sessionGroupId: true },
  });

  const sizes: Record<string, number> = {};
  for (const m of members) {
    const root = m.sessionGroupId ?? m.id;
    sizes[root] = (sizes[root] ?? 0) + 1;
  }
  return sizes;
}

/**
 * Groups cases into the requests they were submitted as, preserving the order
 * the caller's sort produced.
 *
 * Lives here rather than in CaseTable because the queue also needs the grouping
 * *before* rendering: pagination has to page by request, not by case row, or a
 * request whose services straddle the page boundary would show up as two
 * partial rows on different pages.
 */
export function groupCasesByRequest<T extends { id: string; sessionGroupId: string | null }>(cases: T[]): T[][] {
  const byRoot = new Map<string, T[]>();
  for (const c of cases) {
    // A case is its own group root unless it points at one, matching the
    // convention in negotiations/[id]/page.tsx.
    const root = c.sessionGroupId ?? c.id;
    const existing = byRoot.get(root);
    if (existing) existing.push(c);
    else byRoot.set(root, [c]);
  }
  // Map iteration is insertion-ordered, so the page's chosen sort still drives
  // the order of the groups.
  return Array.from(byRoot.values());
}

/**
 * Every service in one request, in the order it was logged, plus where a given
 * service sits in that order and which one to price next.
 *
 * The Provider Team prices one service at a time (each is its own case with its
 * own agreed amount), so without this they landed on whichever service they
 * happened to click with no sense of position — "which of these three am I
 * looking at, and what's left?" — and finishing one dropped them back to the
 * queue to hunt for the next.
 *
 * Ordered by loggedAt with caseNumber as a tiebreak: createCase writes the
 * lines in a loop so their timestamps can land inside the same millisecond, and
 * an unstable order here would renumber the steps between page loads.
 */
export async function getRequestSequence(caseId: string) {
  const current = await prisma.negotiationCase.findUnique({
    where: { id: caseId },
    select: { id: true, sessionGroupId: true },
  });
  if (!current) return null;

  const root = current.sessionGroupId ?? current.id;
  const services = await prisma.negotiationCase.findMany({
    where: { OR: [{ id: root }, { sessionGroupId: root }] },
    select: {
      id: true,
      caseNumber: true,
      requestedItem: true,
      serviceCode: true,
      status: true,
      currentTariff: true,
      providerRequestedAmount: true,
      finalAgreedAmount: true,
      requestType: true,
    },
    orderBy: [{ loggedAt: "asc" }, { caseNumber: "asc" }],
  });

  const position = services.findIndex((s) => s.id === caseId);
  const resolved = services.filter((s) => CLOSED_STATUSES.includes(s.status));
  // The next thing to work on: the first still-open service after this one,
  // wrapping to any open service before it so nothing gets skipped when the
  // team jumps around instead of going in order.
  const nextService =
    services.slice(position + 1).find((s) => !CLOSED_STATUSES.includes(s.status)) ??
    services.slice(0, Math.max(position, 0)).find((s) => !CLOSED_STATUSES.includes(s.status)) ??
    null;

  return {
    services,
    /** 1-based, for display. */
    step: position + 1,
    total: services.length,
    resolvedCount: resolved.length,
    nextService,
    isMulti: services.length > 1,
  };
}
