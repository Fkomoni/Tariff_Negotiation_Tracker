"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmailAlert, sendSms, addTariffReviews, getActiveTariffScheduleName, pushEchoContainsRow } from "@/lib/prognosis";
import { generateCaseNumber, CASE_STATUS_LABELS, SERVICE_TYPE_LABELS, PM_CATEGORY_LABELS, PM_CATEGORIES_REQUIRING_ATTACHMENT, OPEN_STATUSES, CLOSED_STATUSES } from "@/lib/domain";
import type { CaseStatus, ProviderManagementCategory, ServiceType } from "@prisma/client";
import { STATUS_TRANSITIONS } from "@/lib/domain";
import { buildMemberNotificationEmailHtml } from "@/lib/email-template";
import { detectAllowedFileType, sanitizeFilename } from "@/lib/file-validation";
import { redirectWithToast } from "@/lib/toast";
import { getRequestSequence } from "@/lib/case-groups";

async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

const PM_CATEGORY_VALUES = Object.keys(PM_CATEGORY_LABELS) as [ProviderManagementCategory, ...ProviderManagementCategory[]];

// Derived from the label map rather than repeated as a literal list - the
// two drifted apart the moment new service types were added (the form
// offered Maternity/Gym and Spa/Immunizations while this schema still only
// accepted the original six, so picking one failed validation). Deriving
// it means adding a service type in one place can't silently break the form.
const SERVICE_TYPE_VALUES = Object.keys(SERVICE_TYPE_LABELS) as [ServiceType, ...ServiceType[]];

const createCaseSchema = z
  .object({
    caseType: z.enum(["TARIFF_UPDATE", "PROVIDER_MANAGEMENT"]).default("TARIFF_UPDATE"),
    providerName: z.string().min(2, "Provider/Hospital name is required"),
    providerCode: z.string().optional(),
    providerId: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : v),
      z.coerce.number().int().optional()
    ),
    providerEmail: z.string().email("Enter a valid provider email").optional().or(z.literal("")),
    providerPhone: z.string().optional(),
    enrolleeName: z.string().optional(),
    enrolleeId: z.string().optional(),
    enrolleeEmail: z.string().email("Enter a valid email").optional().or(z.literal("")),
    enrolleePhone: z.string().optional(),
    enrolleeCompany: z.string().optional(),
    enrolleeScheme: z.string().optional(),
    enrolleeAge: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : v),
      z.coerce.number().int().min(0).optional()
    ),
    serviceType: z.enum(SERVICE_TYPE_VALUES).optional(),
    reason: z.string().min(3, "Reason is required"),
    urgency: z.enum(["ROUTINE", "URGENT", "EMERGENCY"]),
    notes: z.string().optional(),
    sessionGroupId: z.string().optional(),
    pmCategories: z.array(z.enum(PM_CATEGORY_VALUES)).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (data.caseType === "TARIFF_UPDATE") {
      if (!data.enrolleeName || data.enrolleeName.trim().length < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enrollee name is required", path: ["enrolleeName"] });
      }
      if (!data.serviceType) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Service type is required", path: ["serviceType"] });
      }
    } else {
      if (data.pmCategories.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pick at least one category for this request", path: ["pmCategories"] });
      }
    }
  });

/**
 * One service line from the "Log Negotiation" form - the same provider,
 * enrollee, urgency, and reason apply to every line in a submission
 * (they're entered once, shared), but each line negotiates its own item
 * at its own price. The client sends every line's fields under the same
 * field names (see ServiceTariffFields.tsx), so createCase zips them back
 * into per-line objects by array position via formData.getAll().
 */
const serviceLineSchema = z.object({
  requestedItem: z.string().trim().min(2, "Requested service/item is required"),
  serviceCode: z.string().optional(),
  providerTariffCode: z.string().optional(),
  requestType: z.enum(["EXISTING_TARIFF_UPDATE", "NEW_SERVICE"]),
  currentTariff: z.coerce.number().min(0),
  providerRequestedAmount: z.coerce.number().min(0, "Provider requested amount is required"),
});

/** Identity of a service line for de-duplication: its Prognosis service
 * code when one was matched, else its free-typed name. Shared by the
 * same-submission check and the already-negotiated check so both agree on
 * what counts as "the same service". */
function lineKey(line: { serviceCode?: string; requestedItem: string }): string {
  return (line.serviceCode || line.requestedItem).trim().toLowerCase();
}

/** Reads the repeated per-line fields off the form and zips them back into
 * one object per service line, in the order they appear in the form. */
function readServiceLines(formData: FormData): unknown[] {
  const requestedItem = formData.getAll("requestedItem");
  const serviceCode = formData.getAll("serviceCode");
  const providerTariffCode = formData.getAll("providerTariffCode");
  const requestType = formData.getAll("requestType");
  const currentTariff = formData.getAll("currentTariff");
  const providerRequestedAmount = formData.getAll("providerRequestedAmount");

  return requestedItem.map((_, i) => ({
    requestedItem: requestedItem[i],
    serviceCode: serviceCode[i],
    providerTariffCode: providerTariffCode[i],
    requestType: requestType[i],
    currentTariff: currentTariff[i],
    providerRequestedAmount: providerRequestedAmount[i],
  }));
}

/**
 * Finds an existing tariff case for the same provider + enrollee + service
 * that isn't Declined, if one exists - nothing in createCase previously
 * checked this, so the same request logged twice (a second call about the
 * same delay, two agents picking up related contacts, or one already
 * completed with an agreed tariff) silently created two independent cases
 * with no link between them. Completed cases count as a duplicate too -
 * the tariff was already agreed and pushed to Prognosis, so a fresh
 * request for the identical service is almost always a mistake, not a new
 * negotiation. Declined cases don't block a resubmission, since a
 * rejected attempt is a legitimate reason to try again. Matches on the
 * Prognosis-confirmed identifiers (providerId/enrolleeId/serviceCode) when
 * available, falling back to name/requestedItem text for free-typed
 * entries that never matched a Prognosis record.
 */
async function findDuplicateTariffCase(data: {
  providerId: number | null;
  providerName: string;
  enrolleeId: string | null;
  enrolleeName: string;
  serviceCode: string | null;
  requestedItem: string;
}) {
  const candidates = await prisma.negotiationCase.findMany({
    where: {
      caseType: "TARIFF_UPDATE",
      status: { in: [...OPEN_STATUSES, "COMPLETED"] },
      ...(data.providerId
        ? { providerId: data.providerId }
        : { providerName: { equals: data.providerName, mode: "insensitive" } }),
    },
  });

  return candidates.find((c) => {
    const sameEnrollee = data.enrolleeId
      ? c.enrolleeId === data.enrolleeId
      : c.enrolleeName.trim().toLowerCase() === data.enrolleeName.trim().toLowerCase();
    const sameService =
      data.serviceCode && c.serviceCode
        ? c.serviceCode === data.serviceCode
        : c.requestedItem.trim().toLowerCase() === data.requestedItem.trim().toLowerCase();
    return sameEnrollee && sameService;
  });
}

/** One service line the agent tried to log that already has a live (or
 * completed) case for the same provider + enrollee + service. Returned to
 * the form so it can list every affected service at once and offer to drop
 * them, rather than bouncing the whole submission on the first one found. */
export interface DuplicateServiceFlag {
  requestedItem: string;
  caseId: string;
  caseNumber: string;
  statusLabel: string;
}

export interface CreateCaseState {
  duplicates: DuplicateServiceFlag[];
  /** How many of the submitted service lines are still valid, i.e. how many
   * would actually be logged if the agent chooses to skip the flagged ones. */
  remainingCount: number;
}

/**
 * Server action behind the Log Negotiation form. Returns a
 * CreateCaseState only when it needs the agent to decide something
 * (currently: some services are duplicates) - every other outcome, success
 * or validation failure, redirects with a toast as before, so the returned
 * state stays narrowly about the duplicate decision.
 *
 * Takes the useActionState previous-state argument it never reads; the form
 * needs to keep the agent's typed-in data across a duplicate warning, which
 * a redirect can't do.
 */
export async function createCase(_prevState: CreateCaseState | null, formData: FormData): Promise<CreateCaseState | null> {
  const session = await requireSession();
  // Server Actions are directly-invocable POST endpoints - the CONTACT_CENTER/
  // ADMIN gate on negotiations/new/page.tsx does NOT protect this action, so it
  // must enforce the same allowlist itself. Without it any authenticated role
  // (PROVIDER_TEAM, or a PENDING account replaying the action id) could create
  // cases and, worse, trigger member SMS/email to arbitrary recipients below.
  if (!["CONTACT_CENTER", "ADMIN"].includes(session.user.role)) {
    redirectWithToast("/dashboard", { type: "error", message: "Only the Contact Centre can log a negotiation request." });
  }

  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  raw.pmCategories = formData.getAll("pmCategories");
  const parsed = createCaseSchema.safeParse(raw);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    redirectWithToast("/negotiations/new", { type: "error", message });
  }

  const data = parsed.data;
  const isProviderManagement = data.caseType === "PROVIDER_MANAGEMENT";
  const enrolleeName = data.enrolleeName?.trim() || "N/A";

  // Provider Management is still a single request (its "service" is really
  // a set of categories, not a list of priced items) - only Tariff Update
  // submits one or more service lines.
  let serviceLines: z.infer<typeof serviceLineSchema>[] = [];
  if (!isProviderManagement) {
    const rawLines = readServiceLines(formData);
    if (rawLines.length === 0) {
      redirectWithToast("/negotiations/new", { type: "error", message: "At least one service is required" });
    }
    for (const rawLine of rawLines) {
      const parsedLine = serviceLineSchema.safeParse(rawLine);
      if (!parsedLine.success) {
        redirectWithToast("/negotiations/new", { type: "error", message: parsedLine.error.issues[0]?.message ?? "Invalid service line" });
      }
      serviceLines.push(parsedLine.data);
    }

    // Catches an agent adding the same drug/service twice in the same
    // submission (fat-fingering "+ Add Another Service") before it ever
    // reaches the database, on top of the cross-case check below.
    const seen = new Set<string>();
    for (const line of serviceLines) {
      const key = lineKey(line);
      if (seen.has(key)) {
        redirectWithToast("/negotiations/new", {
          type: "error",
          message: `"${line.requestedItem}" was added more than once in this submission.`,
        });
      }
      seen.add(key);
    }

    // Checks every line and collects all of them rather than redirecting on
    // the first hit - one already-negotiated service used to reject the
    // whole submission, forcing the agent to re-enter every other service
    // by hand. The agent gets the full list back and can drop just those.
    const duplicates: DuplicateServiceFlag[] = [];
    const duplicateKeys = new Set<string>();
    for (const line of serviceLines) {
      const duplicate = await findDuplicateTariffCase({
        providerId: data.providerId ?? null,
        providerName: data.providerName,
        enrolleeId: data.enrolleeId || null,
        enrolleeName,
        serviceCode: line.serviceCode || null,
        requestedItem: line.requestedItem,
      });
      if (duplicate) {
        duplicates.push({
          requestedItem: line.requestedItem,
          caseId: duplicate.id,
          caseNumber: duplicate.caseNumber,
          statusLabel: CASE_STATUS_LABELS[duplicate.status],
        });
        duplicateKeys.add(lineKey(line));
      }
    }

    if (duplicates.length > 0) {
      const remaining = serviceLines.filter((l) => !duplicateKeys.has(lineKey(l)));

      // Only drops the flagged lines once the agent has actually seen the
      // list and asked for it (the "skip these" submit button sets this) -
      // never silently on the first attempt, since a duplicate is usually a
      // signal the agent picked the wrong service, not something to discard
      // without being told.
      if (formData.get("skipDuplicates") === "1" && remaining.length > 0) {
        serviceLines = remaining;
      } else {
        return { duplicates, remainingCount: remaining.length };
      }
    }
  }

  let pmAttachmentName: string | null = null;
  let pmAttachmentMimeType: string | null = null;
  let pmAttachmentData: Buffer | null = null;

  if (isProviderManagement) {
    const needsAttachment = data.pmCategories.some((c) => PM_CATEGORIES_REQUIRING_ATTACHMENT.includes(c));
    const file = formData.get("pmAttachment");
    if (needsAttachment) {
      if (!(file instanceof File) || file.size === 0) {
        redirectWithToast("/negotiations/new", {
          type: "error",
          message: "A bank details letterhead file is required for a bank information update",
        });
      }
      const typedFile = file as File;
      if (typedFile.size > MAX_ATTACHMENT_BYTES) {
        redirectWithToast("/negotiations/new", { type: "error", message: "Attachment is too large - the limit is 2MB." });
      }

      const buffer = Buffer.from(await typedFile.arrayBuffer());
      // The browser-supplied name/MIME type are both attacker-controlled -
      // only the file's actual leading bytes decide what it is, and only a
      // PDF/PNG/JPEG is accepted regardless of what the upload claimed to be.
      const detected = detectAllowedFileType(buffer);
      if (!detected) {
        redirectWithToast("/negotiations/new", { type: "error", message: "Attachment must be a PDF, PNG, or JPEG file." });
      }

      pmAttachmentName = sanitizeFilename(typedFile.name, detected.extension);
      pmAttachmentMimeType = detected.mimeType;
      pmAttachmentData = buffer;
    }
  }

  // One notional "line" for Provider Management (its combined category
  // list stands in for requestedItem), or the real service lines for a
  // Tariff Update - either way, every entry in this array becomes exactly
  // one NegotiationCase row, all sharing one sessionGroupId once there's
  // more than one.
  const linesToCreate = isProviderManagement
    ? [
        {
          requestedItem: data.pmCategories.map((c) => PM_CATEGORY_LABELS[c]).join(", "),
          serviceCode: undefined as string | undefined,
          providerTariffCode: undefined as string | undefined,
          requestType: "EXISTING_TARIFF_UPDATE" as const,
          currentTariff: 0,
          providerRequestedAmount: 0,
        },
      ]
    : serviceLines;

  let groupSessionId: string | null = data.sessionGroupId || null;
  const createdCases: Awaited<ReturnType<typeof prisma.negotiationCase.create>>[] = [];

  for (const line of linesToCreate) {
    const created = await prisma.negotiationCase.create({
      data: {
        caseNumber: generateCaseNumber(),
        caseType: data.caseType,
        providerName: data.providerName,
        providerCode: data.providerCode || null,
        providerId: data.providerId ?? null,
        providerEmail: data.providerEmail || null,
        providerPhone: data.providerPhone || null,
        enrolleeName,
        enrolleeId: data.enrolleeId || null,
        enrolleeEmail: data.enrolleeEmail || null,
        enrolleePhone: data.enrolleePhone || null,
        enrolleeCompany: data.enrolleeCompany || null,
        enrolleeScheme: data.enrolleeScheme || null,
        enrolleeAge: data.enrolleeAge ?? null,
        serviceType: data.serviceType ?? null,
        requestType: line.requestType,
        requestedItem: line.requestedItem,
        serviceCode: line.serviceCode || null,
        providerTariffCode: line.providerTariffCode || null,
        currentTariff: line.currentTariff,
        providerRequestedAmount: line.providerRequestedAmount,
        reason: data.reason,
        urgency: data.urgency,
        notes: data.notes || null,
        pmCategories: data.pmCategories,
        pmAttachmentName,
        pmAttachmentMimeType,
        pmAttachmentData,
        status: "NEW_REQUEST",
        sessionGroupId: groupSessionId,
        loggedByUserId: session.user.id,
        updates: {
          create: {
            userId: session.user.id,
            type: "STATUS_CHANGE",
            newStatus: "NEW_REQUEST",
            note: "Case logged by contact centre",
          },
        },
      },
    });
    createdCases.push(created);
    // Every case after the first in a multi-service batch points at the
    // first one as its group root, the same convention "Log Another
    // Service" already uses (see negotiations/[id]/page.tsx).
    if (!groupSessionId) groupSessionId = created.id;
  }

  // Deliberately outside the loop above: the member gets one notification
  // for the whole visit, listing every service, instead of one per service
  // line. Sending inside the loop meant a two-service submission emailed
  // and texted the same person twice about the same visit.
  const first = createdCases[0];

  // Surfaced in the toast so an unsent member notification isn't silent behind
  // a "logged successfully".
  let notifyProblem = "";
  if (isProviderManagement) {
    await prisma.caseUpdate.create({
      data: {
        caseId: first.id,
        userId: session.user.id,
        type: "NOTE",
        note: "Provider Management request: no member notification applicable.",
      },
    });
  } else {
    const wantsEmail = !!first.enrolleeEmail;
    const wantsSms = !!first.enrolleePhone;
    const autoTemplate: "ROUTINE" | "URGENT" = first.urgency === "ROUTINE" ? "ROUTINE" : "URGENT";
    const serviceCount = `${createdCases.length} service${createdCases.length === 1 ? "" : "s"}`;

    let note: string;
    if (wantsEmail || wantsSms) {
      const results = await dispatchMemberNotifications({
        caseId: first.id,
        caseNumber: first.caseNumber,
        providerName: first.providerName,
        enrolleeName: first.enrolleeName,
        enrolleeId: first.enrolleeId,
        requestedItems: createdCases.map((c) => c.requestedItem),
        serviceType: first.serviceType as ServiceType,
        loggedAt: first.loggedAt,
        template: autoTemplate,
        wantsEmail,
        wantsSms,
        email: first.enrolleeEmail,
        phone: first.enrolleePhone,
        sentByUserId: session.user.id,
      });
      note = `Member auto-notified once for all ${serviceCount} in this submission (${autoTemplate.toLowerCase()} template): ${results.join(", ")}`;
      const failed = results.filter((r) => /fail/i.test(r));
      if (failed.length > 0) {
        notifyProblem = ` The member could not be notified automatically. ${failed.join(". ")}. Please contact the member directly.`;
      }
    } else {
      note = "Member not auto-notified: no email or phone number on file.";
    }

    // Recorded against every case in the group, not just the one the
    // notification row hangs off, so the trail is visible from whichever
    // service the Provider Team happens to open.
    await prisma.caseUpdate.createMany({
      data: createdCases.map((c) => ({
        caseId: c.id,
        userId: session.user.id,
        type: (wantsEmail || wantsSms ? "NOTIFICATION" : "NOTE") as "NOTIFICATION" | "NOTE",
        note,
      })),
    });
  }

  revalidatePath("/negotiations/queue");
  revalidatePath("/dashboard");
  const message =
    createdCases.length > 1
      ? `${createdCases.length} cases logged successfully (${createdCases.map((c) => c.caseNumber).join(", ")}).`
      : `Case ${first.caseNumber} logged successfully.`;
  redirectWithToast(`/negotiations/${first.id}`, {
    type: notifyProblem ? "error" : "success",
    message: message + notifyProblem,
  });
}

const updateStatusSchema = z.object({
  caseId: z.string(),
  status: z.enum([
    "NEW_REQUEST",
    "UNDER_REVIEW",
    "NEGOTIATING",
    "AWAITING_PROVIDER_FEEDBACK",
    "AWAITING_INTERNAL_APPROVAL",
    "COMPLETED",
    "DECLINED",
    "ESCALATED",
  ]),
  note: z.string().optional(),
  // Empty input means "no amount yet", not zero. Without the preprocess,
  // z.coerce.number() turns the form's empty string into 0, which then
  // passed ?? and was stored - cases still being negotiated showed a
  // "Final Agreed Amount: ₦0.00" nobody entered. An explicit 0 is rejected
  // too: a tariff agreed at ₦0 is never a real outcome.
  finalAgreedAmount: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().positive("Final agreed amount must be greater than 0").optional()
  ),
  effectiveDate: z.string().optional(),
  endDate: z.string().optional(),
  approvalReason: z.string().optional(),
});

export async function updateCaseStatus(formData: FormData) {
  const session = await requireSession();
  const raw = Object.fromEntries(formData.entries());
  const caseId = String(raw.caseId ?? "");

  if (!["PROVIDER_TEAM", "ADMIN"].includes(session.user.role)) {
    redirectWithToast(`/negotiations/${caseId}`, { type: "error", message: "Only the Provider Team can update negotiation status." });
  }

  const parsed = updateStatusSchema.safeParse(raw);
  if (!parsed.success) {
    redirectWithToast(`/negotiations/${caseId}`, { type: "error", message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  const data = parsed.data;

  const existing = await prisma.negotiationCase.findUnique({ where: { id: data.caseId } });
  if (!existing) {
    redirectWithToast("/negotiations/queue", { type: "error", message: "That case no longer exists." });
  }

  const allowed = STATUS_TRANSITIONS[existing.status as CaseStatus];
  if (existing.status !== data.status && !allowed.includes(data.status)) {
    redirectWithToast(`/negotiations/${data.caseId}`, {
      type: "error",
      message: `Cannot move from ${CASE_STATUS_LABELS[existing.status]} to ${CASE_STATUS_LABELS[data.status]}`,
    });
  }

  // Provider Management requests must be actively progressed: the Provider Team
  // has to move the status forward before saving or moving on, not save with it
  // left unchanged. (Tariff cases may save an intermediate update without a
  // status change; a note-only update on a PM case goes through Add Note.)
  const isProviderManagement = existing.caseType === "PROVIDER_MANAGEMENT";
  if (isProviderManagement && data.status === existing.status) {
    redirectWithToast(`/negotiations/${data.caseId}`, {
      type: "error",
      message: "Choose a new status for this provider management request before saving.",
    });
  }

  const isTariffCase = existing.caseType === "TARIFF_UPDATE";
  if (isTariffCase && data.status === "COMPLETED" && !data.finalAgreedAmount) {
    redirectWithToast(`/negotiations/${data.caseId}`, { type: "error", message: "Final agreed amount is required to mark as Completed" });
  }
  if (isTariffCase && data.status === "COMPLETED" && !data.effectiveDate) {
    redirectWithToast(`/negotiations/${data.caseId}`, { type: "error", message: "Tariff effective date is required to mark as Completed" });
  }

  const now = new Date();
  const tariffEffectiveDate = data.effectiveDate ? new Date(data.effectiveDate) : existing.tariffEffectiveDate ?? undefined;

  // Optional intended lapse date for the price. Blank on a tariff case means
  // "no end date" (the input is prefilled with the stored value, so blank is
  // a deliberate state, not a missing field); non-tariff cases never carry
  // one. Must fall after the effective date to mean anything.
  const tariffEndDate = isTariffCase ? (data.endDate ? new Date(data.endDate) : null) : undefined;
  if (tariffEndDate && isNaN(tariffEndDate.getTime())) {
    redirectWithToast(`/negotiations/${data.caseId}`, { type: "error", message: "Tariff end date is not a valid date." });
  }
  if (tariffEndDate && tariffEffectiveDate && tariffEndDate.getTime() <= tariffEffectiveDate.getTime()) {
    redirectWithToast(`/negotiations/${data.caseId}`, {
      type: "error",
      message: "Tariff end date must be after the effective date.",
    });
  }

  await prisma.negotiationCase.update({
    where: { id: data.caseId },
    data: {
      status: data.status,
      finalAgreedAmount: data.finalAgreedAmount ?? existing.finalAgreedAmount ?? undefined,
      tariffEffectiveDate,
      tariffEndDate,
      approvalReason: data.approvalReason || existing.approvalReason || undefined,
      ownerUserId: existing.ownerUserId ?? session.user.id,
      firstActionAt: existing.firstActionAt ?? now,
      completedAt: CLOSED_STATUSES.includes(data.status) ? now : existing.completedAt,
      updates: {
        create: {
          userId: session.user.id,
          type: "STATUS_CHANGE",
          previousStatus: existing.status,
          newStatus: data.status,
          note: data.note || null,
        },
      },
    },
  });

  // Collected so the outcome of the Prognosis push is surfaced in the toast
  // the Provider Team sees at submit time, not left only on the timeline. A
  // completing tariff push that fails or lands unverified must NOT show as a
  // plain green "Completed".
  const pushProblems: string[] = [];
  let pushedVerified = 0;
  let attemptedTariffPush = false;

  if (isTariffCase && data.status === "COMPLETED" && data.finalAgreedAmount) {
    attemptedTariffPush = true;
    if (!existing.providerId) {
      pushProblems.push("no provider ID on record, so the price was not sent to Prognosis");
      await prisma.caseUpdate.create({
        data: {
          caseId: data.caseId,
          userId: session.user.id,
          type: "NOTE",
          note: "Tariff not pushed to Prognosis: this case has no provider ID on record (likely logged before provider search was in place).",
        },
      });
    } else if (!existing.serviceCode) {
      pushProblems.push("no procedure code on record, so the price was not sent to Prognosis");
      await prisma.caseUpdate.create({
        data: {
          caseId: data.caseId,
          userId: session.user.id,
          type: "NOTE",
          note: "Tariff not pushed to Prognosis: this case has no procedure code on record (likely logged before the treatment-catalog search was in place).",
        },
      });
    } else {
      // Bundle in any other completed-but-unpushed services from the same
      // visit (quick-repeat) and provider into one AddTarrifReviews call -
      // Action "Insert" upserts on Prognosis's side, so this covers both
      // updating an existing provider tariff line and adding a brand new
      // one, for one or several services at once, in a single request.
      const groupRoot = existing.sessionGroupId ?? existing.id;
      const pushable = await prisma.negotiationCase.findMany({
        where: {
          OR: [{ id: groupRoot }, { sessionGroupId: groupRoot }],
          status: "COMPLETED",
          finalAgreedAmount: { not: null },
          tariffPushedAt: null,
          providerId: existing.providerId,
          serviceCode: { not: null },
        },
      });

      const actingUser = await prisma.user.findUnique({ where: { id: session.user.id } });
      const userEmail = actingUser?.email ?? "";

      // Look up which tariff schedule is currently active for this provider
      // so the push carries a real TariffScheduleName instead of "" - falls
      // back to "" if the lookup fails, so a schedule-lookup hiccup never
      // blocks the actual price push.
      let tariffScheduleName = "";
      try {
        tariffScheduleName = (await getActiveTariffScheduleName(existing.providerId, userEmail)) ?? "";
        console.error(`[case-actions] resolved tariff schedule for provider ${existing.providerId}: ${tariffScheduleName || "(none found)"}`);
      } catch (err) {
        console.error("[case-actions] tariff schedule lookup failed:", err);
      }

      // Sent one at a time rather than as a single batched call - Prognosis
      // gives one pass/fail result for the whole TarifList, so a bad line
      // (e.g. a stale procedure code) would otherwise sink every other
      // service in the same visit. Pushing individually lets each service
      // succeed or fail on its own.
      for (const c of pushable) {
        try {
          const effectiveDate = c.tariffEffectiveDate ?? new Date();
          const mainEcho = await addTariffReviews([
            {
              procedureId: c.serviceCode!,
              procedureName: c.requestedItem,
              newPrice: Number(c.finalAgreedAmount),
              providerId: c.providerId!,
              tariffScheduleName,
              userEmail,
              requestorMobile: "",
              action: "Insert",
              providerTariffCode: c.providerTariffCode ?? "",
              providerTariffName: "",
              zeroRate: false,
              effectiveDate,
              endDate: c.tariffEndDate,
            },
          ]);
          // "Success" from Prognosis proves nothing - verified 06/08/2026,
          // a push whose code didn't exactly match the provider's line key
          // (whitespace included) answered Success while landing on a
          // DIFFERENT catalog procedure, leaving the negotiated line
          // untouched. Only the new row actually appearing on this
          // provider's tariff counts.
          const baseVerified = pushEchoContainsRow(mainEcho, c.serviceCode!, effectiveDate, Number(c.finalAgreedAmount));

          await prisma.negotiationCase.update({
            where: { id: c.id },
            data: { tariffPushedAt: new Date() },
          });

          // Whether the end date can be actioned automatically. A brand-new
          // service has no old price to return to (currentTariff is 0), and
          // pushing ₦0 could zero-rate it - those stay manual by design.
          const oldPrice = Number(c.currentTariff);
          const canScheduleRevert =
            !!c.tariffEndDate && c.requestType === "EXISTING_TARIFF_UPDATE" && oldPrice > 0;

          await prisma.caseUpdate.create({
            data: {
              caseId: c.id,
              userId: session.user.id,
              type: "NOTE",
              note: baseVerified
                ? `Tariff review submitted to Prognosis: ${c.serviceCode} → ${c.finalAgreedAmount}. Tariff schedule: ${tariffScheduleName || "none found - sent blank"}. Confirmed: the new price appears on the provider's tariff.${
                    c.tariffEndDate && !canScheduleRevert
                      ? ` Intended end date: ${c.tariffEndDate.toISOString().slice(0, 10)} - no previous price exists to revert to (new service or zero current tariff), so ending this price needs a manual decision when it falls due.`
                      : ""
                  }`
                : `Tariff review submitted to Prognosis: ${c.serviceCode} → ${c.finalAgreedAmount}. WARNING: Prognosis answered Success but the new price did NOT appear on this provider's tariff in its response - likely the procedure code doesn't exactly match the provider's line key upstream. Treat this price as NOT applied and escalate to the Prognosis team with procedure code "${c.serviceCode}" and provider ID ${c.providerId}.${
                    c.tariffEndDate ? " Price reversion was not scheduled because the base price is unconfirmed." : ""
                  }`,
            },
          });
          console.error(
            `[case-actions] tariff review push for provider ${existing.providerId}: ${c.serviceCode}: ${baseVerified ? "verified on tariff" : "NOT visible on tariff (Success without effect)"}`
          );
          if (baseVerified) {
            pushedVerified++;
          } else {
            pushProblems.push(
              `${c.serviceCode}: Prognosis reported success but the new price did not appear on its tariff, so treat it as not applied`
            );
          }

          // Try to set up the return-to-old-price in the same breath: push the
          // previous price future-dated to the end date. Prognosis silently
          // drops scheduling it doesn't support, so "Success" alone proves
          // nothing - the row actually appearing in the response echo does.
          // If it doesn't appear, the case stays flagged for the manual path
          // (the Revert button / the revert-due sweep). Skipped entirely when
          // the base push itself couldn't be confirmed: scheduling a revert
          // for a price that never applied would only compound the mess.
          if (baseVerified && canScheduleRevert) {
            const endDateStr = c.tariffEndDate!.toISOString().slice(0, 10);
            try {
              const echo = await addTariffReviews([
                {
                  procedureId: c.serviceCode!,
                  procedureName: c.requestedItem,
                  newPrice: oldPrice,
                  providerId: c.providerId!,
                  tariffScheduleName,
                  userEmail,
                  requestorMobile: "",
                  action: "Insert",
                  providerTariffCode: c.providerTariffCode ?? "",
                  providerTariffName: "",
                  zeroRate: false,
                  effectiveDate: c.tariffEndDate!,
                },
              ]);
              const verified = pushEchoContainsRow(echo, c.serviceCode!, c.tariffEndDate!, oldPrice);
              if (verified) {
                await prisma.negotiationCase.update({
                  where: { id: c.id },
                  data: { tariffRevertPushedAt: new Date() },
                });
                await prisma.caseUpdate.create({
                  data: {
                    caseId: c.id,
                    userId: session.user.id,
                    type: "NOTE",
                    note: `Price reversion scheduled in Prognosis: ${c.serviceCode} returns to ${oldPrice} on ${endDateStr} (verified in the push response - no further action needed).`,
                  },
                });
                console.error(`[case-actions] scheduled reversion verified for ${c.serviceCode} on ${endDateStr}`);
              } else {
                await prisma.caseUpdate.create({
                  data: {
                    caseId: c.id,
                    userId: session.user.id,
                    type: "NOTE",
                    note: `Price reversion could NOT be scheduled: Prognosis accepted the future-dated push for ${c.serviceCode} but the ${endDateStr} row did not appear in its response, so it was likely discarded. Revert to ${oldPrice} manually when the end date falls due (button on this case, or the daily revert task).`,
                  },
                });
                console.error(`[case-actions] future-dated reversion not visible in echo for ${c.serviceCode} - flagged manual`);
              }
            } catch (revertErr) {
              const rMessage = revertErr instanceof Error ? revertErr.message : "Unknown error";
              await prisma.caseUpdate.create({
                data: {
                  caseId: c.id,
                  userId: session.user.id,
                  type: "NOTE",
                  note: `Price reversion push failed for ${c.serviceCode}: ${rMessage}. Revert to ${oldPrice} manually when the end date falls due.`,
                },
              });
              console.error(`[case-actions] reversion push failed for ${c.serviceCode}:`, revertErr);
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          pushProblems.push(`${c.serviceCode}: push failed (${message})`);
          await prisma.caseUpdate.create({
            data: {
              caseId: c.id,
              userId: session.user.id,
              type: "NOTE",
              note: `Failed to submit tariff review to Prognosis: ${message}`,
            },
          });
          console.error(`[case-actions] tariff review push failed for ${c.serviceCode}:`, err);
        }
      }
    }
  }

  revalidatePath(`/negotiations/${data.caseId}`);
  revalidatePath("/negotiations/queue");
  revalidatePath("/negotiations/completed");
  revalidatePath("/dashboard");

  // Turn the push outcome into the tone and tail of the toast. Any problem
  // makes the whole toast an error (red, and it stays until dismissed) so a
  // failed or unverified price push can't hide behind a green "Completed".
  let statusTone: "success" | "error" = "success";
  let pushNote = "";
  if (attemptedTariffPush) {
    if (pushProblems.length > 0) {
      statusTone = "error";
      pushNote = ` Price update needs attention. ${pushProblems.join(". ")}. Full details are on the case timeline.`;
    } else if (pushedVerified > 0) {
      pushNote = ` Price sent to Prognosis and confirmed on the tariff.`;
    }
  }

  // Multi-service requests are priced one service at a time, so once this one
  // is settled hand the team straight to the next unpriced service instead of
  // making them go back to the queue and find it. Only on a settling status;
  // an intermediate change (say Negotiating) means they're still on this one.
  const settled = CLOSED_STATUSES.includes(data.status);
  const sequence = settled ? await getRequestSequence(data.caseId) : null;

  if (sequence?.isMulti) {
    revalidatePath(`/negotiations/${sequence.services[0].id}`);
    if (sequence.nextService) {
      redirectWithToast(`/negotiations/${sequence.nextService.id}?tab=provider-team`, {
        type: statusTone,
        message: `${CASE_STATUS_LABELS[data.status]}. Next: ${sequence.nextService.requestedItem} (${
          sequence.resolvedCount + 1
        } of ${sequence.total}).${pushNote}`,
      });
    }
    redirectWithToast(`/negotiations/${data.caseId}`, {
      type: statusTone,
      message: `${CASE_STATUS_LABELS[data.status]}. All ${sequence.total} services in this request are now settled.${pushNote}`,
    });
  }

  redirectWithToast(`/negotiations/${data.caseId}`, {
    type: statusTone,
    message: `Status updated to ${CASE_STATUS_LABELS[data.status]}.${pushNote}`,
  });
}

/**
 * Pushes the return-to-old-price for a case whose tariff end date has fallen
 * due but whose reversion isn't in Prognosis yet (scheduling at completion
 * didn't verify, or the case predates scheduling). Manual counterpart of
 * /api/tasks/revert-due-tariffs.
 *
 * Refuses to run before the end date: Prognosis auto-closes the current
 * price the day a successor starts, so reverting early wouldn't "queue" the
 * old price - it would cut the agreed price short immediately.
 */
export async function revertTariffNow(formData: FormData) {
  const session = await requireSession();
  const caseId = String(formData.get("caseId") ?? "");

  if (!["PROVIDER_TEAM", "ADMIN"].includes(session.user.role)) {
    redirectWithToast(`/negotiations/${caseId}`, { type: "error", message: "Only the Provider Team can push a price reversion." });
  }

  const c = await prisma.negotiationCase.findUnique({ where: { id: caseId } });
  if (!c) {
    redirectWithToast("/negotiations/queue", { type: "error", message: "That case no longer exists." });
  }

  const oldPrice = Number(c.currentTariff);
  if (
    !c.tariffEndDate ||
    c.tariffRevertPushedAt ||
    c.requestType !== "EXISTING_TARIFF_UPDATE" ||
    oldPrice <= 0 ||
    !c.providerId ||
    !c.serviceCode
  ) {
    redirectWithToast(`/negotiations/${caseId}`, { type: "error", message: "This case has no pending price reversion." });
  }
  if (c.tariffEndDate.getTime() > Date.now()) {
    redirectWithToast(`/negotiations/${caseId}`, {
      type: "error",
      message: `Not due yet - the agreed price runs until ${c.tariffEndDate.toISOString().slice(0, 10)}. Reverting now would cut it short.`,
    });
  }

  const actingUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  const userEmail = actingUser?.email ?? "";

  let tariffScheduleName = "";
  try {
    tariffScheduleName = (await getActiveTariffScheduleName(c.providerId, userEmail)) ?? "";
  } catch (err) {
    console.error("[case-actions] tariff schedule lookup failed for reversion:", err);
  }

  try {
    await addTariffReviews([
      {
        procedureId: c.serviceCode,
        procedureName: c.requestedItem,
        newPrice: oldPrice,
        providerId: c.providerId,
        tariffScheduleName,
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
        userId: session.user.id,
        type: "NOTE",
        note: `Price reverted: ${c.serviceCode} pushed back to ${oldPrice}, effective today (end date was ${c.tariffEndDate.toISOString().slice(0, 10)}).`,
      },
    });
    revalidatePath(`/negotiations/${caseId}`);
    redirectWithToast(`/negotiations/${caseId}`, { type: "success", message: `Price reverted to ${oldPrice}.` });
  } catch (err) {
    // redirectWithToast works by throwing Next's redirect error - let it
    // through rather than reporting the success redirect as a failure.
    if (err && typeof err === "object" && "digest" in err) throw err;
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.caseUpdate.create({
      data: { caseId: c.id, userId: session.user.id, type: "NOTE", note: `Price reversion push failed: ${message}` },
    });
    redirectWithToast(`/negotiations/${caseId}`, { type: "error", message: `Reversion failed: ${message}` });
  }
}

const cancelCaseSchema = z.object({
  caseId: z.string().min(1),
  // A reason is the whole point of this action: the request disappears from
  // the Contact Centre's queue, so they need to know why without chasing
  // anyone. Ten characters is enough to reject "no" / "n/a" while staying out
  // of the way of a genuine short answer like "logged twice by mistake".
  cancellationReason: z
    .string()
    .trim()
    .min(10, "Give a reason of at least 10 characters so the Contact Centre knows why this was cancelled")
    .max(500, "Keep the reason under 500 characters"),
});

/**
 * Cancels (disregards) a whole negotiation request, with a mandatory reason.
 *
 * This exists because service lines can only be removed down to the last one -
 * a request must always describe at least one service - so there was no way to
 * dispose of a request that shouldn't proceed at all. Rather than allowing an
 * empty request, the whole thing is cancelled as a single explained act.
 *
 * Deliberately a separate action from updateCaseStatus rather than another
 * option in its dropdown: there the note is optional, and a request vanishing
 * from the queue with no explanation is exactly what this is meant to prevent.
 * CANCELLED is likewise kept out of updateStatusSchema so this stays the only
 * route to it.
 */
export async function cancelCase(formData: FormData) {
  const session = await requireSession();
  const caseId = String(formData.get("caseId") ?? "");

  if (!["PROVIDER_TEAM", "ADMIN"].includes(session.user.role)) {
    redirectWithToast(`/negotiations/${caseId}`, {
      type: "error",
      message: "Only the Provider Team can cancel a negotiation request.",
    });
  }

  const parsed = cancelCaseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirectWithToast(`/negotiations/${caseId}`, {
      type: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    });
  }
  const data = parsed.data;

  const existing = await prisma.negotiationCase.findUnique({ where: { id: data.caseId } });
  if (!existing) {
    redirectWithToast("/negotiations/queue", { type: "error", message: "That case no longer exists." });
  }

  // Same transition table the status dropdown obeys, so a Completed case can't
  // be cancelled out from under an agreed tariff that may already be on
  // Prognosis, and an already-cancelled one can't be cancelled twice.
  if (!STATUS_TRANSITIONS[existing.status as CaseStatus].includes("CANCELLED")) {
    redirectWithToast(`/negotiations/${data.caseId}`, {
      type: "error",
      message: `A ${CASE_STATUS_LABELS[existing.status].toLowerCase()} request can no longer be cancelled.`,
    });
  }

  // Cancel every service in the request, not just the one that happened to be
  // open on screen. Each service is its own case row, so cancelling only this
  // one would leave the siblings sitting in the queue - the exact
  // one-at-a-time treadmill this action exists to replace.
  const groupRoot = existing.sessionGroupId ?? existing.id;
  const members = await prisma.negotiationCase.findMany({
    where: { OR: [{ id: groupRoot }, { sessionGroupId: groupRoot }] },
    select: { id: true, status: true, ownerUserId: true, firstActionAt: true },
  });

  // A completed service has an agreed tariff that may already be on Prognosis,
  // so it is left alone rather than voided underneath the agreement.
  const cancellable = members.filter((m) => STATUS_TRANSITIONS[m.status as CaseStatus].includes("CANCELLED"));
  const skipped = members.length - cancellable.length;

  const now = new Date();
  await prisma.$transaction(
    cancellable.map((m) =>
      prisma.negotiationCase.update({
        where: { id: m.id },
        data: {
          status: "CANCELLED",
          cancellationReason: data.cancellationReason,
          ownerUserId: m.ownerUserId ?? session.user.id,
          firstActionAt: m.firstActionAt ?? now,
          // Stops the delay clock. Without this the case would keep ageing in
          // reports forever despite nobody working it.
          completedAt: now,
          updates: {
            create: {
              userId: session.user.id,
              type: "STATUS_CHANGE",
              previousStatus: m.status,
              newStatus: "CANCELLED",
              // Written into each service's own timeline as well as the
              // column, because the timeline is what the Contact Centre
              // actually reads on the case.
              note: `Request cancelled - ${data.cancellationReason}`,
            },
          },
        },
      })
    )
  );

  for (const m of cancellable) revalidatePath(`/negotiations/${m.id}`);
  revalidatePath("/negotiations/queue");
  revalidatePath("/negotiations/completed");
  revalidatePath("/dashboard");

  const serviceCount = `${cancellable.length} service${cancellable.length === 1 ? "" : "s"}`;
  redirectWithToast(`/negotiations/${data.caseId}`, {
    type: "success",
    message: skipped > 0
      ? `Cancelled ${serviceCount}. ${skipped} already-completed service${skipped === 1 ? " was" : "s were"} left as agreed. The Contact Centre can see your reason.`
      : `Request cancelled - ${serviceCount} closed. The Contact Centre can see your reason on the case.`,
  });
}

export async function addNote(formData: FormData) {
  const session = await requireSession();
  const caseId = String(formData.get("caseId"));
  // Same reasoning as createCase: this action is reachable directly, not only
  // through the case page, so it self-enforces the roles the note UI is shown
  // to. Otherwise any authenticated user (incl. PENDING) could inject notes
  // into any case's staff-facing timeline.
  if (!["CONTACT_CENTER", "PROVIDER_TEAM", "ADMIN"].includes(session.user.role)) {
    redirectWithToast(`/negotiations/${caseId}`, { type: "error", message: "You don't have permission to add notes." });
  }
  const note = String(formData.get("note") ?? "").trim();
  if (!note) redirectWithToast(`/negotiations/${caseId}`, { type: "error", message: "Note cannot be empty" });

  await prisma.caseUpdate.create({
    data: { caseId, userId: session.user.id, type: "NOTE", note },
  });

  revalidatePath(`/negotiations/${caseId}`);
  redirectWithToast(`/negotiations/${caseId}`, { type: "success", message: "Note added." });
}

interface DispatchNotificationsParams {
  caseId: string;
  caseNumber: string;
  providerName: string;
  enrolleeName: string;
  enrolleeId: string | null;
  /** Every service logged in this submission - the member is told about the
   * whole visit in one message rather than getting one per service. */
  requestedItems: string[];
  serviceType: ServiceType;
  loggedAt: Date;
  template: "ROUTINE" | "URGENT";
  wantsEmail: boolean;
  wantsSms: boolean;
  email: string | null;
  phone: string | null;
  sentByUserId: string;
}

/**
 * Sends the member email/SMS for a submission and records a
 * MemberNotification per channel. Called exactly once per submission from
 * createCase() - member comms only go out at the moment Contact Centre logs
 * the request, never on later status changes or any other action, and never
 * once per service line.
 */
async function dispatchMemberNotifications(params: DispatchNotificationsParams): Promise<string[]> {
  const emailMessage = buildEmailMessage(params.template, params.enrolleeName, params.providerName);
  const smsMessage = buildSmsMessage(params.template, params.providerName);
  // Strip CR/LF before the free-typed provider name enters an email subject:
  // if Prognosis's mailer composes the SMTP Subject header naively, an embedded
  // newline could inject additional headers (Bcc, etc.). Cheap, closes it
  // regardless of upstream behaviour. (The body needs no equivalent - HTML-
  // escaped in the template, and the SMS is a header-less plaintext channel.)
  const safeProviderName = params.providerName.replace(/[\r\n]+/g, " ").trim();
  const subject = `Update on your care at ${safeProviderName}`;
  const emailHtml = buildMemberNotificationEmailHtml({
    baseUrl: process.env.NEXTAUTH_URL ?? "https://tariff-negotiation-tracker.onrender.com",
    urgency: params.template,
    title: params.template === "URGENT" ? "We're urgently resolving a delay in your care" : "Your requested service may be delayed",
    message: emailMessage,
    caseNumber: params.caseNumber,
    enrolleeId: params.enrolleeId,
    memberName: params.enrolleeName,
    serviceTypeLabel: SERVICE_TYPE_LABELS[params.serviceType],
    requestedItem: params.requestedItems.join(", "),
    providerName: params.providerName,
    submittedAt: params.loggedAt,
  });

  const tasks: Promise<string>[] = [];

  if (params.wantsEmail && params.email) {
    const email = params.email;
    tasks.push(
      sendEmailAlert({ emailAddress: email, subject, messageBody: emailHtml, reference: params.caseNumber })
        .then(() => ({ status: "SENT" as const, errorMessage: null }))
        .catch((err) => ({
          status: "FAILED" as const,
          errorMessage: err instanceof Error ? err.message : "Unknown error sending email",
        }))
        .then(async ({ status, errorMessage }) => {
          await prisma.memberNotification.create({
            data: {
              caseId: params.caseId,
              sentByUserId: params.sentByUserId,
              template: params.template,
              channel: "EMAIL",
              message: emailMessage,
              recipientEmail: email,
              status,
              errorMessage,
            },
          });
          return status === "SENT" ? "email sent" : `email failed: ${errorMessage}`;
        })
    );
  }

  if (params.wantsSms && params.phone) {
    const phone = params.phone;
    tasks.push(
      sendSms({ to: phone, message: smsMessage, referenceNo: params.caseNumber })
        .then((result) => ({ status: "SENT" as const, errorMessage: null, ticketId: result.ticketId }))
        .catch((err) => ({
          status: "FAILED" as const,
          errorMessage: err instanceof Error ? err.message : "Unknown error sending SMS",
          ticketId: null,
        }))
        .then(async ({ status, errorMessage, ticketId }) => {
          await prisma.memberNotification.create({
            data: {
              caseId: params.caseId,
              sentByUserId: params.sentByUserId,
              template: params.template,
              channel: "SMS",
              message: smsMessage,
              recipientPhone: phone,
              status,
              errorMessage,
              providerReference: ticketId,
            },
          });
          return status === "SENT" ? "SMS sent" : `SMS failed: ${errorMessage}`;
        })
    );
  }

  return Promise.all(tasks);
}

function buildEmailMessage(template: "ROUTINE" | "URGENT", memberName: string, hospitalName: string): string {
  if (template === "URGENT") {
    return `Dear ${memberName}, Leadway Health has approved your request. The delay is on ${hospitalName}'s side: they are renegotiating a tariff rate that was already agreed with us for this service. This is not a decision on our part. We are contacting the hospital directly and pushing for a quick resolution, and will update you as soon as it's settled.`;
  }
  return `Dear ${memberName}, Leadway Health is ready to approve your requested care. The short delay is because ${hospitalName} is renegotiating a tariff rate that was already agreed with us for this service. This is not a delay on our end. We are following up with the hospital to resolve it quickly.`;
}

function buildSmsMessage(template: "ROUTINE" | "URGENT", hospitalName: string): string {
  if (template === "URGENT") {
    return `Dear Member, your care is approved on our end. ${hospitalName} is renegotiating an already-agreed tariff, causing this urgent delay. We're pushing hard for an immediate resolution.`;
  }
  return `Dear Member, we're ready to approve your care now. ${hospitalName} is renegotiating an already-agreed tariff, causing the delay. We're following up to resolve this quickly.`;
}

