import { prisma } from "@/lib/prisma";
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
