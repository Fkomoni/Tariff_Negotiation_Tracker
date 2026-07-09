import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Card, CardHeader, Badge, Button, Field, inputClass } from "@/components/ui";
import { Timeline } from "@/components/Timeline";
import { LogIcon, BellIcon } from "@/components/icons";
import {
  CASE_STATUS_BADGE,
  CASE_STATUS_LABELS,
  SERVICE_TYPE_LABELS,
  URGENCY_BADGE,
  URGENCY_LABELS,
  STATUS_TRANSITIONS,
  formatCurrency,
  formatDateTime,
  formatDuration,
  amountDifference,
} from "@/lib/domain";
import { claimCase, updateCaseStatus, addNote, notifyMember } from "@/app/actions/case-actions";
import type { CaseStatus } from "@prisma/client";

export default async function CaseDetailsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const session = await auth();
  if (!session?.user) return null;

  const negotiationCase = await prisma.negotiationCase.findUnique({
    where: { id: params.id },
    include: {
      loggedBy: true,
      owner: true,
      updates: { include: { user: true }, orderBy: { createdAt: "asc" } },
      notifications: { include: { sentBy: true }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!negotiationCase) notFound();

  const isProviderTeam = ["PROVIDER_TEAM", "ADMIN"].includes(session.user.role);
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
        subtitle={`${negotiationCase.providerName} · ${negotiationCase.enrolleeName}`}
        icon={<LogIcon />}
        user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }}
      />

      <div className="grid flex-1 grid-cols-1 gap-6 px-8 py-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {searchParams.error && (
            <p className="rounded-lg bg-brand-50 px-3.5 py-2.5 text-[12.5px] font-medium text-brand-700">
              {searchParams.error}
            </p>
          )}

          <Card>
            <CardHeader
              title="Request Details"
              subtitle={`Logged ${formatDateTime(negotiationCase.loggedAt)} by ${
                negotiationCase.loggedBy.displayName ?? negotiationCase.loggedBy.prognosisUsername
              }`}
              action={
                <div className="flex gap-2">
                  <Badge className={URGENCY_BADGE[negotiationCase.urgency]}>{URGENCY_LABELS[negotiationCase.urgency]}</Badge>
                  <Badge className={CASE_STATUS_BADGE[negotiationCase.status]}>{CASE_STATUS_LABELS[negotiationCase.status]}</Badge>
                </div>
              }
            />
            <dl className="grid grid-cols-1 gap-5 px-5 py-5 sm:grid-cols-2">
              <Detail label="Provider / Hospital" value={negotiationCase.providerName} />
              <Detail label="Enrollee" value={`${negotiationCase.enrolleeName}${negotiationCase.enrolleeId ? ` (${negotiationCase.enrolleeId})` : ""}`} />
              <Detail label="Provider Email" value={negotiationCase.providerEmail ?? "—"} />
              <Detail label="Provider Phone" value={negotiationCase.providerPhone ?? "—"} />
              <Detail label="Service Type" value={SERVICE_TYPE_LABELS[negotiationCase.serviceType]} />
              <Detail label="Requested Item" value={negotiationCase.requestedItem} />
              <Detail label="Current Tariff" value={formatCurrency(negotiationCase.currentTariff.toString())} />
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
              <Detail label="Enrollee Email" value={negotiationCase.enrolleeEmail ?? "—"} />
              <Detail label="Enrollee Phone" value={negotiationCase.enrolleePhone ?? "—"} />
              <Detail label="Reason Provider Is Negotiating" value={negotiationCase.reason} full />
              {negotiationCase.notes && <Detail label="Notes" value={negotiationCase.notes} full />}
              {negotiationCase.finalAgreedAmount && (
                <Detail label="Final Agreed Amount" value={formatCurrency(negotiationCase.finalAgreedAmount.toString())} />
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
              <Button type="submit" variant="secondary">
                Add
              </Button>
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

          {isProviderTeam && (
            <Card>
              <CardHeader title="Update Status" subtitle="Provider Team" />
              <div className="space-y-4 px-5 py-4">
                {!negotiationCase.ownerUserId && (
                  <form action={claimCase}>
                    <input type="hidden" name="caseId" value={negotiationCase.id} />
                    <Button type="submit" variant="secondary" className="w-full">
                      Claim This Case
                    </Button>
                  </form>
                )}

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
                  <Button type="submit" className="w-full">
                    Save Update
                  </Button>
                </form>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Notify Member" icon={<BellIcon className="h-4 w-4" />} />
            <form action={notifyMember} className="space-y-4 px-5 py-4">
              <input type="hidden" name="caseId" value={negotiationCase.id} />
              <Field label="Message Template">
                <select name="template" className={inputClass} defaultValue={negotiationCase.urgency === "ROUTINE" ? "ROUTINE" : "URGENT"}>
                  <option value="ROUTINE">Routine delay notice</option>
                  <option value="URGENT">Urgent delay notice</option>
                </select>
              </Field>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-[12.5px] text-ink-700">
                  <input type="checkbox" name="channel" value="EMAIL" defaultChecked={!!negotiationCase.enrolleeEmail} />
                  Email
                </label>
                <label className="flex items-center gap-2 text-[12.5px] text-ink-700">
                  <input type="checkbox" name="channel" value="SMS" defaultChecked={!!negotiationCase.enrolleePhone} />
                  SMS
                </label>
              </div>
              <Field label="Email" hint="Override or fill in if missing">
                <input name="email" type="email" defaultValue={negotiationCase.enrolleeEmail ?? ""} className={inputClass} />
              </Field>
              <Field label="Phone" hint="Override or fill in if missing">
                <input name="phone" defaultValue={negotiationCase.enrolleePhone ?? ""} className={inputClass} />
              </Field>
              <Button type="submit" className="w-full">
                Notify Member
              </Button>
            </form>
          </Card>

          <Card>
            <CardHeader title="Notification History" />
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
        </div>
      </div>
    </>
  );
}

function Detail({ label, value, full = false }: { label: string; value: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
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
