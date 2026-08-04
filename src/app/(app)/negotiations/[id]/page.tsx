import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Card, CardHeader, Badge, Button, Field, inputClass } from "@/components/ui";
import { Timeline } from "@/components/Timeline";
import { SubmitButton } from "@/components/SubmitButton";
import {
  LogIcon,
  BellIcon,
  DownloadIcon,
  CloseIcon,
  InfoIcon,
  ClockIcon,
  BuildingIcon,
  UserIcon,
  UsersIcon,
  TagIcon,
  FlagIcon,
  CheckMarkIcon,
  MailIcon,
  PhoneIcon,
  NairaIcon,
} from "@/components/icons";
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
import { updateCaseStatus, addNote, cancelCase } from "@/app/actions/case-actions";
import type { CaseStatus } from "@prisma/client";

export default async function CaseDetailsPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ tab?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
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

  // CANCELLED is excluded on purpose: it's reachable only through the Cancel
  // Request form below, which requires a reason. Offering it here — where the
  // note is optional — is exactly the silent disappearance that form prevents.
  const allowedNext = STATUS_TRANSITIONS[negotiationCase.status as CaseStatus].filter((s) => s !== "CANCELLED");
  const canCancel = STATUS_TRANSITIONS[negotiationCase.status as CaseStatus].includes("CANCELLED");
  // Cancelling closes the whole request, so say how many services that is.
  // Already-completed siblings are excluded because cancelCase leaves them
  // alone rather than voiding an agreed tariff.
  const cancellableCount =
    [negotiationCase, ...relatedCases].filter((c) =>
      STATUS_TRANSITIONS[c.status as CaseStatus].includes("CANCELLED")
    ).length;

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
        backHref={isProviderTeam ? "/negotiations/queue" : "/dashboard"}
        badge={
          <Badge className={CASE_STATUS_BADGE[negotiationCase.status]}>
            {CASE_STATUS_LABELS[negotiationCase.status]}
          </Badge>
        }
      />

      <div className="px-8 pt-6">
        {isProviderTeam && (
          <div className="flex gap-1 border-b border-line-subtle">
            <Link
              href={`/negotiations/${negotiationCase.id}`}
              className={`px-4 py-2.5 text-[13px] font-semibold ${
                activeTab === "overview"
                  ? "border-b-2 border-navy-900 text-navy-900"
                  : "border-b-2 border-transparent text-navy-400 hover:text-navy-700"
              }`}
            >
              Overview
            </Link>
            <Link
              href={`/negotiations/${negotiationCase.id}?tab=provider-team`}
              className={`px-4 py-2.5 text-[13px] font-semibold ${
                activeTab === "provider-team"
                  ? "border-b-2 border-navy-900 text-navy-900"
                  : "border-b-2 border-transparent text-navy-400 hover:text-navy-700"
              }`}
            >
              Provider Team
            </Link>
          </div>
        )}
      </div>

      {negotiationCase.status === "CANCELLED" && negotiationCase.cancellationReason && (
        <div className="px-8 pt-6">
          <div className="flex items-start gap-3.5 rounded-xl border border-line-subtle bg-surface-muted px-4 py-4">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white text-navy-400 shadow-sm">
              <InfoIcon className="h-[18px] w-[18px]" />
            </span>
            <div>
              <p className="text-[13px] font-bold text-navy-900">This request was cancelled</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-navy-600">{negotiationCase.cancellationReason}</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "provider-team" ? (
        <div className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-8 py-8">
          <Card>
            <CardHeader title="At a Glance" />
            <dl className="grid grid-cols-2 gap-4 px-5 py-4">
              <Detail label="Provider" value={negotiationCase.providerName} />
              <Detail label="Provider Code" value={negotiationCase.providerCode ?? "—"} />
              <Detail label="Provider ID" value={negotiationCase.providerId ?? "—"} />
              <Detail label="Provider Email" icon={<MailIcon className="h-4 w-4" />} value={negotiationCase.providerEmail ?? "—"} />
              <Detail label="Provider Phone" icon={<PhoneIcon className="h-4 w-4" />} value={negotiationCase.providerPhone ?? "—"} />
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
                        <a
                          href={`/api/pm-attachment/${negotiationCase.id}`}
                          download
                          className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-[12.5px] font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100"
                        >
                          <DownloadIcon className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{negotiationCase.pmAttachmentName}</span>
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
              <Detail label="Logged By" icon={<UserIcon className="h-4 w-4" />} value={negotiationCase.loggedBy.displayName ?? negotiationCase.loggedBy.prognosisUsername} />
              <Detail label="Handled By" icon={<UsersIcon className="h-4 w-4" />} value={negotiationCase.owner?.displayName ?? negotiationCase.owner?.prognosisUsername ?? "Unclaimed"} />
            </dl>
            <div className="flex gap-2 px-5 pb-4">
              <Badge className={CASE_TYPE_BADGE[negotiationCase.caseType]}>{CASE_TYPE_BADGE_LABEL[negotiationCase.caseType]}</Badge>
              {negotiationCase.caseType === "TARIFF_UPDATE" && (
                <Badge className={REQUEST_TYPE_BADGE[negotiationCase.requestType]}>{REQUEST_TYPE_LABELS[negotiationCase.requestType]}</Badge>
              )}
              <Badge className={URGENCY_BADGE[negotiationCase.urgency]}>{URGENCY_LABELS[negotiationCase.urgency]}</Badge>
              <Badge className={CASE_STATUS_BADGE[negotiationCase.status]}>{CASE_STATUS_LABELS[negotiationCase.status]}</Badge>
            </div>
          </Card>

          {/* The Provider Team treats one service at a time (each is its own
              case with its own price and status), but they need to see the
              rest of the visit to review it as a whole — without this, only
              the service they happened to open was visible here. */}
          {relatedCases.length > 0 && (
            <Card>
              <CardHeader
                title="Other Services in This Visit"
                subtitle={`${relatedCases.length + 1} services were logged together — each is approved separately`}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="border-b border-ink-100 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                    <tr>
                      <th className="px-5 py-2.5">Case</th>
                      <th className="px-5 py-2.5">Service / Item</th>
                      <th className="px-5 py-2.5 text-right">Current → Requested</th>
                      <th className="px-5 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {relatedCases.map((c) => (
                      <tr key={c.id}>
                        <td className="px-5 py-2.5">
                          <Link
                            href={`/negotiations/${c.id}?tab=provider-team`}
                            className="font-semibold text-brand-600 hover:underline"
                          >
                            {c.caseNumber}
                          </Link>
                        </td>
                        <td className="px-5 py-2.5 text-ink-800">
                          {c.serviceCode ? `${c.requestedItem} (${c.serviceCode})` : c.requestedItem}
                        </td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-700">
                          {c.requestType === "NEW_SERVICE"
                            ? formatCurrency(c.providerRequestedAmount.toString())
                            : `${formatCurrency(c.currentTariff.toString())} → ${formatCurrency(c.providerRequestedAmount.toString())}`}
                        </td>
                        <td className="px-5 py-2.5">
                          <Badge className={CASE_STATUS_BADGE[c.status]}>{CASE_STATUS_LABELS[c.status]}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Timing" />
            <div className="space-y-3 px-5 py-4">
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

          {canCancel && (
            <Card className="border-brand-100">
              <CardHeader
                title="Cancel Request"
                subtitle="Disregard this request entirely"
                icon={<CloseIcon className="h-[18px] w-[18px]" />}
              />
              <form action={cancelCase} className="space-y-4 px-5 py-4">
                <input type="hidden" name="caseId" value={negotiationCase.id} />
                <p className="text-[12px] leading-relaxed text-navy-600">
                  Use this when the request shouldn&apos;t proceed at all — logged in error, a duplicate, the provider
                  withdrew it, or the enrollee is no longer at the facility. Your reason is shown to the Contact Centre
                  on the case.
                </p>
                <p className="rounded-lg bg-surface-muted px-3 py-2.5 text-[12px] font-semibold text-navy-700">
                  {cancellableCount > 1
                    ? `This closes all ${cancellableCount} services in this request and stops the delay clock.`
                    : "This closes the request and stops the delay clock."}
                  {relatedCases.some((c) => c.status === "COMPLETED") &&
                    " Services already completed keep their agreed tariff."}
                </p>
                <Field label="Reason for cancelling" required hint="At least 10 characters — the Contact Centre sees this">
                  <textarea
                    name="cancellationReason"
                    rows={3}
                    required
                    minLength={10}
                    maxLength={500}
                    className={inputClass}
                    placeholder="e.g. Duplicate of TN-2026-0117 logged earlier the same day"
                  />
                </Field>
                <SubmitButton className="w-full" variant="danger" pendingLabel="Cancelling…">
                  Cancel This Request
                </SubmitButton>
              </form>
            </Card>
          )}

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
              <dl className="grid grid-cols-1 gap-x-8 gap-y-5 px-5 py-5 sm:grid-cols-2">
                <Detail label="Provider / Hospital" icon={<BuildingIcon className="h-4 w-4" />} value={negotiationCase.providerName} />
                {negotiationCase.enrolleeName !== "N/A" && (
                  <Detail label="Enrollee" icon={<UserIcon className="h-4 w-4" />} value={`${negotiationCase.enrolleeName}${negotiationCase.enrolleeId ? ` (${negotiationCase.enrolleeId})` : ""}`} />
                )}
                <Detail label="Provider Email" icon={<MailIcon className="h-4 w-4" />} value={negotiationCase.providerEmail ?? "—"} />
                <Detail label="Provider Phone" icon={<PhoneIcon className="h-4 w-4" />} value={negotiationCase.providerPhone ?? "—"} />
                <Detail label="Company / Scheme" icon={<BuildingIcon className="h-4 w-4" />} value={[negotiationCase.enrolleeCompany, negotiationCase.enrolleeScheme].filter(Boolean).join(" · ") || "—"} />
                <Detail label="Age" icon={<UserIcon className="h-4 w-4" />} value={negotiationCase.enrolleeAge ?? "—"} />
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
                    {negotiationCase.serviceType && <Detail label="Service Type" icon={<TagIcon className="h-4 w-4" />} value={SERVICE_TYPE_LABELS[negotiationCase.serviceType]} />}
                    <Detail
                      icon={<TagIcon className="h-4 w-4" />}
                      label="Requested Item"
                      value={
                        negotiationCase.serviceCode
                          ? `${negotiationCase.requestedItem} (${negotiationCase.serviceCode})`
                          : negotiationCase.requestedItem
                      }
                    />
                    <Detail
                      icon={<NairaIcon className="h-4 w-4" />}
                      label={negotiationCase.requestType === "NEW_SERVICE" ? "Current Tariff (not priced on this provider)" : "Current Tariff"}
                      value={negotiationCase.requestType === "NEW_SERVICE" ? "—" : formatCurrency(negotiationCase.currentTariff.toString())}
                    />
                    <Detail
                      icon={<NairaIcon className="h-4 w-4" />}
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
                <Detail label="Enrollee Email" icon={<MailIcon className="h-4 w-4" />} value={negotiationCase.enrolleeEmail ?? "—"} />
                <Detail label="Enrollee Phone" icon={<PhoneIcon className="h-4 w-4" />} value={negotiationCase.enrolleePhone ?? "—"} />
                <Detail label="Logged By" icon={<UserIcon className="h-4 w-4" />} value={negotiationCase.loggedBy.displayName ?? negotiationCase.loggedBy.prognosisUsername} />
                <Detail label="Handled By" icon={<UsersIcon className="h-4 w-4" />} value={negotiationCase.owner?.displayName ?? negotiationCase.owner?.prognosisUsername ?? "Unclaimed"} />
                <Detail
                  icon={<FlagIcon className="h-4 w-4" />}
                  label={negotiationCase.caseType === "PROVIDER_MANAGEMENT" ? "Details for Provider Management" : "Reason Provider Is Negotiating"}
                  value={negotiationCase.reason}
                  full
                />
                {negotiationCase.notes && <Detail label="Notes" icon={<LogIcon className="h-4 w-4" />} value={negotiationCase.notes} full />}
                {negotiationCase.finalAgreedAmount && (
                  <Detail icon={<CheckMarkIcon className="h-4 w-4" />} label="Final Agreed Amount" value={formatCurrency(negotiationCase.finalAgreedAmount.toString())} />
                )}
                {negotiationCase.tariffEffectiveDate && (
                  <Detail label="Tariff Effective Date" icon={<ClockIcon className="h-4 w-4" />} value={negotiationCase.tariffEffectiveDate.toISOString().slice(0, 10)} />
                )}
                {negotiationCase.approvalReason && <Detail label="Approval / Decline Reason" icon={<FlagIcon className="h-4 w-4" />} value={negotiationCase.approvalReason} full />}
              </dl>
            </Card>

            <Card>
              <CardHeader title="Timeline" subtitle="Most recent activity" />
              <Timeline updates={negotiationCase.updates} limit={4} />
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
            <Card>
              <CardHeader title="Timing" icon={<ClockIcon className="h-[18px] w-[18px]" />} />
              <div className="space-y-3 px-5 py-4">
                <TimingRow
                  label="Log → First Provider Team Action"
                  value={formatDuration(firstActionMs)}
                  at={negotiationCase.firstActionAt}
                />
                <TimingRow
                  label={negotiationCase.completedAt ? "Log → Completion" : "Log → Now"}
                  value={formatDuration(totalMs)}
                  at={negotiationCase.completedAt ?? new Date()}
                />
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[12.5px] font-semibold text-navy-900">Total Time</span>
                  <span className="rounded-[10px] bg-accent-50 px-2 py-0.5 text-[11.5px] font-bold text-accent-600">
                    {formatDuration(totalMs)}
                  </span>
                </div>
              </div>
            </Card>

            {relatedCases.length > 0 && (
              <Card>
                <CardHeader title="Related Services" subtitle="Same visit, logged separately" />
                <ul className="divide-y divide-line-subtle">
                  {relatedCases.map((c) => (
                    <li key={c.id} className="px-5 py-3.5">
                      <Link
                        href={`/negotiations/${c.id}`}
                        className="text-[13px] font-semibold text-navy-900 hover:text-accent-600 hover:underline"
                      >
                        {c.caseNumber}
                      </Link>
                      <p className="mt-0.5 text-[11.5px] text-navy-500">{c.requestedItem}</p>
                      <Badge className={`mt-1.5 ${CASE_STATUS_BADGE[c.status]}`}>{CASE_STATUS_LABELS[c.status]}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {isProviderTeam && (
              <Card className="flex items-start gap-3.5 border-line-subtle bg-surface-muted px-5 py-4">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white text-navy-400 shadow-sm">
                  <UsersIcon className="h-[18px] w-[18px]" />
                </span>
                <div>
                  <p className="text-[12.5px] leading-relaxed text-navy-600">
                    Claim or update this case&apos;s status from the Provider Team tab.
                  </p>
                  <Link href={`/negotiations/${negotiationCase.id}?tab=provider-team`} className="mt-2.5 inline-block">
                    <Button variant="secondary" className="whitespace-nowrap bg-white">
                      Go to Provider Team
                    </Button>
                  </Link>
                </div>
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
                        <p className="mt-1 text-[11px] text-ink-500">
                          {n.recipientEmail ?? n.recipientPhone} · {formatDateTime(n.createdAt)}
                        </p>
                        {n.errorMessage && <p className="mt-1 text-[11px] text-brand-600">{n.errorMessage}</p>}
                        {/* Only meaningful for SMS. "Sent" means the gateway
                            accepted it, not that the handset received it — if
                            the member says it never arrived, this is the
                            reference Prognosis needs to trace it. */}
                        {n.providerReference && (
                          <p className="mt-1 text-[11px] text-ink-400">
                            Gateway ticket <span className="font-semibold text-ink-600">{n.providerReference}</span> — accepted by the
                            SMS gateway; not a delivery confirmation
                          </p>
                        )}
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

function Detail({
  label,
  value,
  full = false,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  full?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className={`flex gap-2.5 ${full ? "sm:col-span-2" : ""}`}>
      {/* Icons are a scanning aid only — the label always carries the meaning,
       * so a field without a natural icon simply indents to align with the rest. */}
      <span className="mt-0.5 w-4 flex-shrink-0 text-navy-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-navy-500">{label}</p>
        <p className="mt-0.5 text-[13.5px] font-medium text-navy-900">{value}</p>
      </div>
    </div>
  );
}

function TimingRow({ label, value, at }: { label: string; value: string; at?: Date | null }) {
  return (
    <div className="border-b border-line-subtle pb-3 last:border-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[12.5px] text-navy-600">{label}</span>
        <span className="whitespace-nowrap text-[13px] font-bold text-navy-900">{value}</span>
      </div>
      {at && <p className="mt-0.5 text-[11.5px] text-navy-400">{formatDateTime(at)}</p>}
    </div>
  );
}
