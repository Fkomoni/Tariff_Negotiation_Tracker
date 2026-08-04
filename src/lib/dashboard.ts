import { prisma } from "@/lib/prisma";
import { CLOSED_STATUSES, DISPLAY_TIME_ZONE, OPEN_STATUSES } from "@/lib/domain";
import type { CaseStatus, Urgency } from "@prisma/client";

/** How many days of history each sparkline covers. */
export const TREND_DAYS = 14;

/**
 * Start of a Lagos day, as a UTC instant.
 *
 * Every "today" figure on the dashboard has to agree with the timestamps shown
 * beside it, and those render in Africa/Lagos (DISPLAY_TIME_ZONE). Bucketing on
 * the server's own midnight would put a case logged at 00:30 Lagos into
 * yesterday's column whenever the server runs on UTC — which it does on Render.
 */
function startOfDayLagos(dayOffset = 0): Date {
  const now = new Date();
  // en-CA formats as YYYY-MM-DD, so this is the Lagos calendar date.
  const lagosDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = lagosDate.split("-").map(Number);
  // Lagos is UTC+1 year-round (no DST), so local midnight is 23:00 UTC the
  // previous day. Hardcoding the offset keeps this dependency-free; if Leadway
  // ever runs this outside WAT, swap in a tz library rather than adjusting here.
  return new Date(Date.UTC(y, m - 1, d + dayOffset, 0, 0, 0) - 60 * 60 * 1000);
}

export interface DailyPoint {
  /** Lagos day this point covers, as YYYY-MM-DD. */
  day: string;
  value: number;
}

export interface RankRow {
  label: string;
  count: number;
  /** Share of all ranked cases, 0-100, for the trend bar. */
  percent: number;
}

/** A metric's current value plus its recent daily series. */
interface Metric {
  value: number;
  series: DailyPoint[];
  /** Change vs the previous day, or null when there's no basis to compare. */
  deltaFromYesterday: number | null;
}

function emptyMetric(): Metric {
  return { value: 0, series: [], deltaFromYesterday: null };
}

/**
 * Everything the dashboard renders, in one pass.
 *
 * The daily series are computed in application code from a single fetch of the
 * cases rather than with 8 grouped queries. Two reasons: several of them are
 * *point-in-time backlog* questions ("how many were still open at the end of
 * that day") which SQL GROUP BY can't answer from a status column that only
 * holds the current value, and doing it once in memory keeps every card
 * consistent with the same snapshot.
 */
export async function getDashboardData() {
  const todayStart = startOfDayLagos(0);
  const yesterdayStart = startOfDayLagos(-1);
  const windowStart = startOfDayLagos(-(TREND_DAYS - 1));

  const [cases, urgentOpen, longestPending, recentActivity] = await Promise.all([
    // Every case, minimally projected. The backlog series needs cases logged
    // before the window too (one logged months ago and still open counts toward
    // today's backlog), so this can't be date-filtered.
    prisma.negotiationCase.findMany({
      select: {
        loggedAt: true,
        completedAt: true,
        status: true,
        urgency: true,
        providerName: true,
        requestedItem: true,
      },
    }),
    prisma.negotiationCase.findMany({
      where: { status: { in: OPEN_STATUSES }, urgency: { in: ["URGENT", "EMERGENCY"] } },
      include: { loggedBy: true },
      orderBy: { loggedAt: "asc" },
      take: 6,
    }),
    prisma.negotiationCase.findFirst({
      where: { status: { in: OPEN_STATUSES } },
      orderBy: { loggedAt: "asc" },
    }),
    prisma.caseUpdate.findMany({
      include: { user: true, case: { select: { caseNumber: true, providerName: true, id: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  // ---- day buckets -------------------------------------------------------
  const days: { key: string; start: Date; end: Date }[] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const start = startOfDayLagos(-i);
    const end = startOfDayLagos(-i + 1);
    days.push({ key: new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE }).format(start), start, end });
  }

  const isClosed = (s: CaseStatus) => CLOSED_STATUSES.includes(s);
  const isUrgent = (u: Urgency) => u === "URGENT" || u === "EMERGENCY";

  /** Cases logged within a day. */
  const loggedIn = (start: Date, end: Date) => cases.filter((c) => c.loggedAt >= start && c.loggedAt < end);
  /** Cases settled within a day. */
  const settledIn = (start: Date, end: Date) =>
    cases.filter((c) => c.completedAt && c.completedAt >= start && c.completedAt < end);
  /** Cases still open at a moment in time — logged by then, not yet settled. */
  const openAt = (at: Date) =>
    cases.filter((c) => c.loggedAt < at && (!c.completedAt || c.completedAt >= at));

  const series = <T>(pick: (day: { start: Date; end: Date }) => number): DailyPoint[] =>
    days.map((d) => ({ day: d.key, value: pick(d) }));

  const loggedSeries = series(({ start, end }) => loggedIn(start, end).length);
  const completedSeries = series(({ start, end }) => settledIn(start, end).filter((c) => c.status === "COMPLETED").length);
  const openSeries = series(({ end }) => openAt(end).length);
  const urgentSeries = series(({ end }) => openAt(end).filter((c) => isUrgent(c.urgency)).length);

  // Average resolution, in ms, for cases settled on each day.
  const avgResolutionSeries = series(({ start, end }) => {
    const settled = settledIn(start, end);
    if (settled.length === 0) return 0;
    return settled.reduce((sum, c) => sum + (c.completedAt!.getTime() - c.loggedAt.getTime()), 0) / settled.length;
  });

  // Age of the oldest still-open case at the end of each day.
  const longestPendingSeries = series(({ end }) => {
    const open = openAt(end);
    if (open.length === 0) return 0;
    return Math.max(...open.map((c) => end.getTime() - c.loggedAt.getTime()));
  });

  // ---- headline figures --------------------------------------------------
  const loggedToday = loggedIn(todayStart, startOfDayLagos(1)).length;
  const loggedYesterday = loggedIn(yesterdayStart, todayStart).length;
  const completedToday = settledIn(todayStart, startOfDayLagos(1)).filter((c) => c.status === "COMPLETED").length;
  const completedYesterday = settledIn(yesterdayStart, todayStart).filter((c) => c.status === "COMPLETED").length;

  const openNow = cases.filter((c) => !isClosed(c.status)).length;
  const urgentNow = cases.filter((c) => !isClosed(c.status) && isUrgent(c.urgency)).length;

  const allSettled = cases.filter((c) => c.completedAt);
  const avgResolutionMs =
    allSettled.length > 0
      ? allSettled.reduce((sum, c) => sum + (c.completedAt!.getTime() - c.loggedAt.getTime()), 0) / allSettled.length
      : null;

  // Percentage change in average resolution, yesterday → today. Only meaningful
  // when both days actually settled something.
  const avgToday = avgResolutionSeries[avgResolutionSeries.length - 1]?.value ?? 0;
  const avgYesterday = avgResolutionSeries[avgResolutionSeries.length - 2]?.value ?? 0;
  const avgResolutionDeltaPct =
    avgToday > 0 && avgYesterday > 0 ? ((avgToday - avgYesterday) / avgYesterday) * 100 : null;

  // ---- rankings ---------------------------------------------------------
  function rank(pick: (c: (typeof cases)[number]) => string, limit = 5): RankRow[] {
    const counts = new Map<string, number>();
    for (const c of cases) {
      const key = pick(c);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const total = cases.length || 1;
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([label, count]) => ({ label, count, percent: Math.round((count / total) * 100) }));
  }

  const topProviders = rank((c) => c.providerName);
  const topItems = rank((c) => c.requestedItem);

  /** Daily case count for one provider or item, so its card's line is its own
   * volume rather than the dashboard's overall volume. */
  const seriesFor = (match: (c: (typeof cases)[number]) => boolean) =>
    series(({ start, end }) => loggedIn(start, end).filter(match).length);

  return {
    loggedToday: { value: loggedToday, series: loggedSeries, deltaFromYesterday: loggedToday - loggedYesterday } as Metric,
    openRequests: { value: openNow, series: openSeries, deltaFromYesterday: null } as Metric,
    completedToday: {
      value: completedToday,
      series: completedSeries,
      deltaFromYesterday: completedToday - completedYesterday,
    } as Metric,
    avgResolution: { ms: avgResolutionMs, series: avgResolutionSeries, deltaPct: avgResolutionDeltaPct },
    longestPending: {
      case: longestPending,
      ms: longestPending ? Date.now() - longestPending.loggedAt.getTime() : null,
      series: longestPendingSeries,
    },
    urgentUnresolved: { value: urgentNow, series: urgentSeries, deltaFromYesterday: null } as Metric,
    topProvider: topProviders[0]
      ? { ...topProviders[0], series: seriesFor((c) => c.providerName === topProviders[0].label) }
      : null,
    topItem: topItems[0] ? { ...topItems[0], series: seriesFor((c) => c.requestedItem === topItems[0].label) } : null,
    topProviders,
    topItems,
    urgentOpen,
    recentActivity,
    emptyMetric,
  };
}
