import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Card, CardHeader, Badge, Button, Field, inputClass } from "@/components/ui";
import { Timeline } from "@/components/Timeline";
import { SubmitButton } from "@/components/SubmitButton";
import { LogIcon, BellIcon } from "@/components/icons";
import {
  CASE_STATUS_BADGE,
  CASE_STATUS_LABELS,
  CASE_TYPE_BADGE,
  CASE_TYPE_BADGE_LABEL,
  PM_CATEGORY_LABELS,
  REQUEST_TYPE_BADGE,
  REQUEST_TYPE_LABELS,
  SERVICE_TYPE_LABELS,
  URGENCY_BADGE,
  URGENCY_LABELS,
  STATUS_TRANSITIONS,
  formatCurrency,
  formatDateTime,
  formatDuration,
  amountDifference,
} from "@/lib/domain";
import { updateCaseStatus, addNote } from "@/app/actions/case-actions";
import type { CaseStatus } from "@prisma/client";

export default async function CaseDetailsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; tab?: string };
}) {
  const session = await auth();
  if (!session?.user) return null;

  let negotiationCase = await prisma.negotiationCase.findUnique({
    where: { id: params.id },
    include: {
      loggedBy: true,
      owner: true,
      updates: { include: { user: true }, orderBy: { createdAt: "desc" } },
      notifications: { include: { sentBy: true }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!negotiationCase) notFound();

  const sessionGroupId = negotiationCase.sessionGroupId ?? negotiationCase.id;
  const relatedCases = await prisma.negotiationCase.findMany({
    where: {
      AND: [{ OR: [{ id: sessionGroupId }, { sessionGroupId }] }, { id: { not: negotiationCase.id } }],
    },
    orderBy: { loggedAt: "asc" },
  });

  const canLogNegotiation = ["CONTACT_CENTER", "ADMIN"].includes(session.user.role);
  const isProviderTeam = ["PROVIDER_TEAM", "ADMIN"].includes(session.user.role);
  const activeTab = searchParams.tab === "provider-team" && isProviderTeam ? "provider-team" : "overview";

  if (activeTab === "provider-team" && !negotiationCase.ownerUserId) {
    // Atomic claim guarded on ownerUserId: null in the WHERE clause — if two
    // requests race (e.g. a double-click on "Treat"), only one updateMany
    // matches and only one "Claimed by Provider Team" entry gets created.
    const claim = await prisma.negotiationCase.updateMany({
      where: { id: negotiationCase.id, ownerUserId: null },
      data: { ownerUserId: session.user.id, firstActionAt: negotiationCase.firstActionAt ?? new Date() },
    });
    if (claim.count > 0) {
      await prisma.caseUpdate.create({
        data: { caseId: negotiationCase.id, userId: session.user.id, type: "OWNER_CHANGE", note: "Claimed by Provider Team" },
      });
    }
    negotiationCase = await prisma.negotiationCase.findUniqueOrThrow({
      where: { id: negotiationCase.id },
      include: {
        loggedBy: true,
        owner: true,
        updates: { include: { user: true }, orderBy: { createdAt: "desc" } },
        notifications: { include: { sentBy: true }, orderBy: { createdAt: "desc" } },
      },
    });
  }

  const diff = amountDifference(negotiationCase.currentTariff.toString(), negotiationCase.providerRequestedAmount.toString());
  const firstActionMs = negotiationCase.firstActionAt
    ? negotiationCase.firstActionAt.getTime() - negotiationCase.loggedAt.getTime()
    : null;
  const totalMs = negotiationCase.completedAt
    ? negotiationCase.completedAt.getTime() - negotiationCase.loggedAt.getTime()
    : Date.now() - negotiationCase.loggedAt.getTime();

  const allowedNext = STATUS_TRANSITIONS[negotiationCase.status as CaseStatus];

  return (
    <>
      <Header
        title={negotiationCase.caseNumber}
        subtitle={
          negotiationCase.enrolleeName !== "N/A"
            ? `${negotiationCase.providerName} · ${negotiationCase.enrolleeName}`
            : negotiationCase.providerName
        }
        icon={<LogIcon />}
        user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }}
      />

      <div className="px-8 pt-6">
        {searchParams.error && (
          <p className="mb-4 rounded-lg bg-brand-50 px-3.5 py-2.5 text-[12.5px] font-medium text-brand-700">
            {searchParams.error}
          </p>
        )}

        {isProviderTeam && (
          <div className="flex gap-1 border-b border-ink-100">
            <Link
              href={`/negotiations/${negotiationCase.id}`}
              className={`px-4 py-2.5 text-[13px] font-semibold ${
                activeTab === "overview"
                  ? "border-b-2 border-brand text-ink-900"
                  : "text-ink-400 hover:text-ink-700"
              }`}
            >
              Overview
            </Link>
            <Link
              href={`/negotiations/${negotiationCase.id}?tab=provider-team`}
              className={`px-4 py-2.5 text-[13px] font-semibold ${
                activeTab === "provider-team"
                  ? "border-b-2 border-brand text-ink-900"
                  : "text-ink-400 hover:text-ink-700"
              }`}
            >
              Provider Team
            </Link>
          </div>
        )}
      </div>

      {activeTab === "provider-team" ? (
        <div className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-8 py-8">
          <Card className="px-5 py-4">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">At a Glance</p>
            <dl className="mt-3 grid grid-cols-2 gap-4">
              <Detail label="Provider" value={negotiationCase.providerName} />
              <Detail label="Provider Code" value={negotiationCase.providerCode ?? "—"} />
              <Detail label="Provider ID" value={negotiationCase.providerId ?? "—"} />
              <Detail label="Provider Email" value={negotiationCase.providerEmail ?? "—"} />
              <Detail label="Provider Phone" value={negotiationCase.providerPhone ?? "—"} />
              {negotiationCase.enrolleeName !== "N/A" && <Detail label="Member Full Name" value={negotiationCase.enrolleeName} />}
              <Detail label="Company" value={negotiationCase.enrolleeCompany ?? "—"} />
              <Detail label="Scheme / Plan" value={negotiationCase.enrolleeScheme ?? "—"} />
              {negotiationCase.caseType === "PROVIDER_MANAGEMENT" ? (
                <>
                  <Detail
                    label="Categories"
                    value={
                      <div className="flex flex-wrap gap-1">
                        {negotiationCase.pmCategories.map((c) => (
                          <Badge key={c} className="bg-sky-100 text-sky-800">
                            {PM_CATEGORY_LABELS[c]}
                          </Badge>
                        ))}
                      </div>
                    }
                    full
                  />
                  {negotiationCase.pmAttachmentName && (
                    <Detail
                      label="Attachment"
                      value={
                        <a href={`/api/pm-attachment/${negotiationCase.id}`} className="text-brand-600 hover:underline">
                          {negotiationCase.pmAttachmentName}
                        </a>
                      }
                    />
                  )}
                  <Detail label="Details for Provider Management" value={negotiationCase.reason} full />
                </>
              ) : (
                <>
                  <Detail
                    label="Requested Item"
                    value={
                      negotiationCase.serviceCode
                        ? `${negotiationCase.requestedItem} (${negotiationCase.serviceCode})`
                        : negotiationCase.requestedItem
                    }
                  />
                  <Detail
                    label={negotiationCase.requestType === "NEW_SERVICE" ? "Proposed Price (not yet priced on this provider)" : "Current → Requested"}
                    value={
                      negotiationCase.requestType === "NEW_SERVICE"
                        ? formatCurrency(negotiationCase.providerRequestedAmount.toString())
                        : `${formatCurrency(negotiationCase.currentTariff.toString())} → ${formatCurrency(negotiationCase.providerRequestedAmount.toString())}`
                    }
                    full
                  />
                  <Detail label="Reason for Tariff Increase" value={negotiationCase.reason} full />
                </>
              )}
              {negotiationCase.notes && <Detail label="Notes from Contact Centre" value={negotiationCase.notes} full />}
              <Detail label="Logged By" value={negotiationCase.loggedBy.displayName ?? negotiationCase.loggedBy.prognosisUsername} />
              <Detail label="Handled By" value={negotiationCase.owner?.displayName ?? negotiationCase.owner?.prognosisUsername ?? "Unclaimed"} />
            </dl>
            <div className="mt-4 flex gap-2">
              <Badge className={CASE_TYPE_BADGE[negotiationCase.caseType]}>{CASE_TYPE_BADGE_LABEL[negotiationCase.caseType]}</Badge>
              {negotiationCase.caseType === "TARIFF_UPDATE" && (
                <Badge className={REQUEST_TYPE_BADGE[negotiationCase.requestType]}>{REQUEST_TYPE_LABELS[negotiationCase.requestType]}</Badge>
              )}
              <Badge className={URGENCY_BADGE[negotiationCase.urgency]}>{URGENCY_LABELS[negotiationCase.urgency]}</Badge>
              <Badge className={CASE_STATUS_BADGE[negotiationCase.status]}>{CASE_STATUS_LABELS[negotiationCase.status]}</Badge>
            </div>
          </Card>

          <Card className="px-5 py-4">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">Timing</p>
            <div className="mt-3 space-y-3">
              <TimingRow label="Log → First Provider Team Action" value={formatDuration(firstActionMs)} />
              <TimingRow label="Log → Now / Completion" value={formatDuration(totalMs)} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Update Status" subtitle="Provider Team" />
            <div className="space-y-4 px-5 py-4">
              <form action={updateCaseStatus} className="space-y-4">
                <input type="hidden" name="caseId" value={negotiationCase.id} />
                <Field label="New Status">
                  <select name="status" className={inputClass} defaultValue={negotiationCase.status}>
                    <option value={negotiationCase.status}>{CASE_STATUS_LABELS[negotiationCase.status]} (no change)</option>
                    {allowedNext.map((s) => (
                      <option key={s} value={s}>
                        {CASE_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </Field>
                {negotiationCase.caseType === "TARIFF_UPDATE" && (
                  <>
                    <Field label="Final Agreed Amount (₦)" hint="Required to mark Completed">
                      <input
                        name="finalAgreedAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={negotiationCase.finalAgreedAmount?.toString() ?? ""}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Tariff Effective Date" hint="Required to mark Completed — when this price takes effect on Prognosis">
                      <input
                        name="effectiveDate"
                        type="date"
                        defaultValue={
                          (negotiationCase.tariffEffectiveDate ?? new Date()).toISOString().slice(0, 10)
                        }
                        className={inputClass}
                      />
                    </Field>
                  </>
                )}
                <Field label="Approved / Declined Reason">
                  <textarea
                    name="approvalReason"
                    rows={2}
                    defaultValue={negotiationCase.approvalReason ?? ""}
                    className={inputClass}
                  />
                </Field>
                <Field label="Update Note">
                  <textarea name="note" rows={2} className={inputClass} placeholder="What changed and why" />
                </Field>
                <SubmitButton className="w-full" pendingLabel="Saving…">
                  Save Update
                </SubmitButton>
              </form>
            </div>
          </Card>

          <Card>
            <CardHeader title="Timeline" subtitle="Every update, in order" />
            <Timeline updates={negotiationCase.updates} />
          </Card>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-6 px-8 py-8 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            {canLogNegotiation && (
              <Card className="flex items-center justify-between gap-4 border-emerald-100 bg-emerald-50/50 px-5 py-4">
                <p className="text-[12.5px] text-emerald-800">
                  Same visit, another service? Provider and enrollee details carry over automatically.
                </p>
                <Link href={`/negotiations/new?repeatFrom=${negotiationCase.id}`}>
                  <Button variant="secondary" className="whitespace-nowrap bg-white">
                    + Log Another Service
                  </Button>
                </Link>
              </Card>
            )}

            <Card>
              <CardHeader
                title="Request Details"
                subtitle={`Logged ${formatDateTime(negotiationCase.loggedAt)} by ${
                  negotiationCase.loggedBy.displayName ?? negotiationCase.loggedBy.prognosisUsername
                }`}
                action={
                  <div className="flex gap-2">
                    <Badge className={CASE_TYPE_BADGE[negotiationCase.caseType]}>{CASE_TYPE_BADGE_LABEL[negotiationCase.caseType]}</Badge>
                    {negotiationCase.caseType === "TARIFF_UPDATE" && (
                      <Badge className={REQUEST_TYPE_BADGE[negotiationCase.requestType]}>{REQUEST_TYPE_LABELS[negotiationCase.requestType]}</Badge>
                    )}
                    <Badge className={URGENCY_BADGE[negotiationCase.urgency]}>{URGENCY_LABELS[negotiationCase.urgency]}</Badge>
                    <Badge className={CASE_STATUS_BADGE[negotiationCase.status]}>{CASE_STATUS_LABELS[negotiationCase.status]}</Badge>
                  </div>
                }
              />
              <dl className="grid grid-cols-1 gap-5 px-5 py-5 sm:grid-cols-2">
                <Detail label="Provider / Hospital" value={negotiationCase.providerName} />
                {negotiationCase.enrolleeName !== "N/A" && (
                  <Detail label="Enrollee" value={`${negotiationCase.enrolleeName}${negotiationCase.enrolleeId ? ` (${negotiationCase.enrolleeId})` : ""}`} />
                )}
                <Detail label="Provider Email" value={negotiationCase.providerEmail ?? "—"} />
                <Detail label="Provider Phone" value={negotiationCase.providerPhone ?? "—"} />
                <Detail label="Company / Scheme" value={[negotiationCase.enrolleeCompany, negotiationCase.enrolleeScheme].filter(Boolean).join(" · ") || "—"} />
                <Detail label="Age" value={negotiationCase.enrolleeAge ?? "—"} />
                {negotiationCase.caseType === "PROVIDER_MANAGEMENT" ? (
                  <>
                    <Detail
                      label="Categories"
                      value={
                        <div className="flex flex-wrap gap-1">
                          {negotiationCase.pmCategories.map((c) => (
                            <Badge key={c} className="bg-sky-100 text-sky-800">
                              {PM_CATEGORY_LABELS[c]}
                            </Badge>
                          ))}
                        </div>
                      }
                      full
                    />
                    {negotiationCase.pmAttachmentName && (
                      <Detail
                        label="Attachment"
                        value={
                          <a href={`/api/pm-attachment/${negotiationCase.id}`} className="text-brand-600 hover:underline">
                            {negotiationCase.pmAttachmentName}
                          </a>
                        }
                      />
                    )}
                  </>
                ) : (
                  <>
                    {negotiationCase.serviceType && <Detail label="Service Type" value={SERVICE_TYPE_LABELS[negotiationCase.serviceType]} />}
                    <Detail
                      label="Requested Item"
                      value={
                        negotiationCase.serviceCode
                          ? `${negotiationCase.requestedItem} (${negotiationCase.serviceCode})`
                          : negotiationCase.requestedItem
                      }
                    />
                    <Detail
                      label={negotiationCase.requestType === "NEW_SERVICE" ? "Current Tariff (not priced on this provider)" : "Current Tariff"}
                      value={negotiationCase.requestType === "NEW_SERVICE" ? "—" : formatCurrency(negotiationCase.currentTariff.toString())}
                    />
                    <Detail
                      label="Provider Requested Amount"
                      value={
                        <>
                          {formatCurrency(negotiationCase.providerRequestedAmount.toString())}{" "}
                          <span className={diff > 0 ? "text-brand-600" : "text-ink-400"}>
                            ({diff > 0 ? "+" : ""}
                            {formatCurrency(diff)})
                          </span>
                        </>
                      }
                    />
                  </>
                )}
                <Detail label="Enrollee Email" value={negotiationCase.enrolleeEmail ?? "—"} />
                <Detail label="Enrollee Phone" value={negotiationCase.enrolleePhone ?? "—"} />
                <Detail label="Logged By" value={negotiationCase.loggedBy.displayName ?? negotiationCase.loggedBy.prognosisUsername} />
                <Detail label="Handled By" value={negotiationCase.owner?.displayName ?? negotiationCase.owner?.prognosisUsername ?? "Unclaimed"} />
                <Detail
                  label={negotiationCase.caseType === "PROVIDER_MANAGEMENT" ? "Details for Provider Management" : "Reason Provider Is Negotiating"}
                  value={negotiationCase.reason}
                  full
                />
                {negotiationCase.notes && <Detail label="Notes" value={negotiationCase.notes} full />}
                {negotiationCase.finalAgreedAmount && (
                  <Detail label="Final Agreed Amount" value={formatCurrency(negotiationCase.finalAgreedAmount.toString())} />
                )}
                {negotiationCase.tariffEffectiveDate && (
                  <Detail label="Tariff Effective Date" value={negotiationCase.tariffEffectiveDate.toISOString().slice(0, 10)} />
                )}
                {negotiationCase.approvalReason && <Detail label="Approval / Decline Reason" value={negotiationCase.approvalReason} full />}
              </dl>
            </Card>

            <Card>
              <CardHeader title="Timeline" subtitle="Every update, in order" />
              <Timeline updates={negotiationCase.updates} />
            </Card>

            <Card>
              <CardHeader title="Add Note" />
              <form action={addNote} className="flex gap-3 px-5 py-4">
                <input type="hidden" name="caseId" value={negotiationCase.id} />
                <input name="note" placeholder="Add an internal note…" className={inputClass} />
                <SubmitButton variant="secondary" pendingLabel="Adding…">
                  Add
                </SubmitButton>
              </form>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="px-5 py-4">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">Timing</p>
              <div className="mt-3 space-y-3">
                <TimingRow label="Log → First Provider Team Action" value={formatDuration(firstActionMs)} />
                <TimingRow label="Log → Now / Completion" value={formatDuration(totalMs)} />
              </div>
            </Card>

            {relatedCases.length > 0 && (
              <Card>
                <CardHeader title="Related Services" subtitle="Same visit, logged separately" />
                <ul className="divide-y divide-ink-100">
                  {relatedCases.map((c) => (
                    <li key={c.id} className="px-5 py-3">
                      <Link href={`/negotiations/${c.id}`} className="text-[12.5px] font-semibold text-ink-900 hover:underline">
                        {c.caseNumber}
                      </Link>
                      <p className="text-[11.5px] text-ink-500">{c.requestedItem}</p>
                      <Badge className={`mt-1 ${CASE_STATUS_BADGE[c.status]}`}>{CASE_STATUS_LABELS[c.status]}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {isProviderTeam && (
              <Card className="flex items-center justify-between gap-4 border-ink-200 bg-ink-100/60 px-5 py-4">
                <p className="text-[12.5px] text-ink-600">Claim or update this case's status from the Provider Team tab.</p>
                <Link href={`/negotiations/${negotiationCase.id}?tab=provider-team`}>
                  <Button variant="secondary" className="whitespace-nowrap bg-white">
                    Go to Provider Team
                  </Button>
                </Link>
              </Card>
            )}

            {canLogNegotiation && (
              <Card>
                <CardHeader title="Member Notification" icon={<BellIcon className="h-4 w-4" />} subtitle="Sent automatically when the case was logged" />
                {negotiationCase.notifications.length === 0 ? (
                  <p className="px-5 py-6 text-[12.5px] text-ink-400">No notifications sent yet.</p>
                ) : (
                  <ul className="divide-y divide-ink-100">
                    {negotiationCase.notifications.map((n) => (
                      <li key={n.id} className="px-5 py-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-semibold text-ink-800">
                            {n.channel} · {n.template === "URGENT" ? "Urgent" : "Routine"}
                          </span>
                          <Badge className={n.status === "SENT" ? "bg-emerald-100 text-emerald-800" : "bg-brand-100 text-brand-700"}>
                            {n.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[11.5px] text-ink-500">
                          {n.recipientEmail ?? n.recipientPhone} · {formatDateTime(n.createdAt)}
                        </p>
                        <p className="mt-1 text-[11px] text-ink-400">by {n.sentBy.displayName ?? n.sentBy.prognosisUsername}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Detail({ label, value, full = false }: { label: string; value: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-0.5 text-[13.5px] text-ink-900">{value}</p>
    </div>
  );
}

function TimingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12.5px] text-ink-500">{label}</span>
      <span className="text-[13px] font-bold text-ink-900">{value}</span>
    </div>
  );
}
