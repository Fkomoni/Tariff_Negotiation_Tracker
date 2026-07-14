"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmailAlert, sendSms, addTariffReviews, getActiveTariffScheduleName } from "@/lib/prognosis";
import { generateCaseNumber, CASE_STATUS_LABELS, SERVICE_TYPE_LABELS, PM_CATEGORY_LABELS, PM_CATEGORIES_REQUIRING_ATTACHMENT } from "@/lib/domain";
import type { CaseStatus, ProviderManagementCategory, ServiceType } from "@prisma/client";
import { STATUS_TRANSITIONS } from "@/lib/domain";
import { buildMemberNotificationEmailHtml } from "@/lib/email-template";
import { detectAllowedFileType, sanitizeFilename } from "@/lib/file-validation";
import { redirectWithToast } from "@/lib/toast";

async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

const PM_CATEGORY_VALUES = Object.keys(PM_CATEGORY_LABELS) as [ProviderManagementCategory, ...ProviderManagementCategory[]];

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
    serviceType: z
      .enum(["CONSULTATION", "MEDICATIONS", "INVESTIGATIONS", "ADMISSION_RELATED_SERVICES", "PROCEDURES_AND_SERVICES", "SURGERIES"])
      .optional(),
    requestType: z.enum(["EXISTING_TARIFF_UPDATE", "NEW_SERVICE"]).default("EXISTING_TARIFF_UPDATE"),
    requestedItem: z.string().optional(),
    serviceCode: z.string().optional(),
    providerTariffCode: z.string().optional(),
    currentTariff: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.coerce.number().min(0).optional()),
    providerRequestedAmount: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.coerce.number().min(0).optional()),
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
      if (!data.requestedItem || data.requestedItem.trim().length < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Requested service/item is required", path: ["requestedItem"] });
      }
      if (data.currentTariff === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Current tariff is required", path: ["currentTariff"] });
      }
      if (data.providerRequestedAmount === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provider requested amount is required", path: ["providerRequestedAmount"] });
      }
    } else {
      if (data.pmCategories.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pick at least one category for this request", path: ["pmCategories"] });
      }
    }
  });

export async function createCase(formData: FormData) {
  const session = await requireSession();

  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  raw.pmCategories = formData.getAll("pmCategories");
  const parsed = createCaseSchema.safeParse(raw);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    redirectWithToast("/negotiations/new", { type: "error", message });
  }

  const data = parsed.data;
  const isProviderManagement = data.caseType === "PROVIDER_MANAGEMENT";

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
        redirectWithToast("/negotiations/new", { type: "error", message: "Attachment is too large — the limit is 2MB." });
      }

      const buffer = Buffer.from(await typedFile.arrayBuffer());
      // The browser-supplied name/MIME type are both attacker-controlled —
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

  const requestedItem = isProviderManagement
    ? data.pmCategories.map((c) => PM_CATEGORY_LABELS[c]).join(", ")
    : data.requestedItem!;

  const created = await prisma.negotiationCase.create({
    data: {
      caseNumber: generateCaseNumber(),
      caseType: data.caseType,
      providerName: data.providerName,
      providerCode: data.providerCode || null,
      providerId: data.providerId ?? null,
      providerEmail: data.providerEmail || null,
      providerPhone: data.providerPhone || null,
      enrolleeName: data.enrolleeName?.trim() || "N/A",
      enrolleeId: data.enrolleeId || null,
      enrolleeEmail: data.enrolleeEmail || null,
      enrolleePhone: data.enrolleePhone || null,
      enrolleeCompany: data.enrolleeCompany || null,
      enrolleeScheme: data.enrolleeScheme || null,
      enrolleeAge: data.enrolleeAge ?? null,
      serviceType: data.serviceType ?? null,
      requestType: data.requestType,
      requestedItem,
      serviceCode: data.serviceCode || null,
      providerTariffCode: data.providerTariffCode || null,
      currentTariff: data.currentTariff ?? 0,
      providerRequestedAmount: data.providerRequestedAmount ?? 0,
      reason: data.reason,
      urgency: data.urgency,
      notes: data.notes || null,
      pmCategories: data.pmCategories,
      pmAttachmentName,
      pmAttachmentMimeType,
      pmAttachmentData,
      status: "NEW_REQUEST",
      sessionGroupId: data.sessionGroupId || null,
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

  // Provider Management requests (portal access, bank info, complaints, etc.)
  // aren't about a member's care being delayed, so the "your care may be
  // delayed" auto-notification doesn't apply — skip it entirely for those.
  if (isProviderManagement) {
    await prisma.caseUpdate.create({
      data: {
        caseId: created.id,
        userId: session.user.id,
        type: "NOTE",
        note: "Provider Management request — no member notification applicable.",
      },
    });
  } else {
    const wantsEmail = !!created.enrolleeEmail;
    const wantsSms = !!created.enrolleePhone;
    const autoTemplate: "ROUTINE" | "URGENT" = created.urgency === "ROUTINE" ? "ROUTINE" : "URGENT";

    if (wantsEmail || wantsSms) {
      const results = await dispatchMemberNotifications({
        caseId: created.id,
        caseNumber: created.caseNumber,
        providerName: created.providerName,
        enrolleeName: created.enrolleeName,
        enrolleeId: created.enrolleeId,
        requestedItem: created.requestedItem,
        serviceType: created.serviceType as ServiceType,
        loggedAt: created.loggedAt,
        template: autoTemplate,
        wantsEmail,
        wantsSms,
        email: created.enrolleeEmail,
        phone: created.enrolleePhone,
        sentByUserId: session.user.id,
      });
      await prisma.caseUpdate.create({
        data: {
          caseId: created.id,
          userId: session.user.id,
          type: "NOTIFICATION",
          note: `Member auto-notified at logging (${autoTemplate.toLowerCase()} template): ${results.join(", ")}`,
        },
      });
    } else {
      await prisma.caseUpdate.create({
        data: {
          caseId: created.id,
          userId: session.user.id,
          type: "NOTE",
          note: "Member not auto-notified: no email or phone number on file.",
        },
      });
    }
  }

  revalidatePath("/negotiations/queue");
  revalidatePath("/dashboard");
  redirectWithToast(`/negotiations/${created.id}`, { type: "success", message: `Case ${created.caseNumber} logged successfully.` });
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
  finalAgreedAmount: z.coerce.number().min(0, "Final agreed amount must be non-negative").optional(),
  effectiveDate: z.string().optional(),
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

  const isTariffCase = existing.caseType === "TARIFF_UPDATE";
  if (isTariffCase && data.status === "COMPLETED" && !data.finalAgreedAmount) {
    redirectWithToast(`/negotiations/${data.caseId}`, { type: "error", message: "Final agreed amount is required to mark as Completed" });
  }
  if (isTariffCase && data.status === "COMPLETED" && !data.effectiveDate) {
    redirectWithToast(`/negotiations/${data.caseId}`, { type: "error", message: "Tariff effective date is required to mark as Completed" });
  }

  const now = new Date();
  const tariffEffectiveDate = data.effectiveDate ? new Date(data.effectiveDate) : existing.tariffEffectiveDate ?? undefined;
  await prisma.negotiationCase.update({
    where: { id: data.caseId },
    data: {
      status: data.status,
      finalAgreedAmount: data.finalAgreedAmount ?? existing.finalAgreedAmount ?? undefined,
      tariffEffectiveDate,
      approvalReason: data.approvalReason || existing.approvalReason || undefined,
      ownerUserId: existing.ownerUserId ?? session.user.id,
      firstActionAt: existing.firstActionAt ?? now,
      completedAt: ["COMPLETED", "DECLINED"].includes(data.status) ? now : existing.completedAt,
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

  if (isTariffCase && data.status === "COMPLETED" && data.finalAgreedAmount) {
    if (!existing.providerId) {
      await prisma.caseUpdate.create({
        data: {
          caseId: data.caseId,
          userId: session.user.id,
          type: "NOTE",
          note: "Tariff not pushed to Prognosis: this case has no provider ID on record (likely logged before provider search was in place).",
        },
      });
    } else if (!existing.serviceCode) {
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
      // visit (quick-repeat) and provider into one AddTarrifReviews call —
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
      // so the push carries a real TariffScheduleName instead of "" — falls
      // back to "" if the lookup fails, so a schedule-lookup hiccup never
      // blocks the actual price push.
      let tariffScheduleName = "";
      try {
        tariffScheduleName = (await getActiveTariffScheduleName(existing.providerId, userEmail)) ?? "";
        console.error(`[case-actions] resolved tariff schedule for provider ${existing.providerId}: ${tariffScheduleName || "(none found)"}`);
      } catch (err) {
        console.error("[case-actions] tariff schedule lookup failed:", err);
      }

      let failureNote: string | null = null;
      try {
        await addTariffReviews(
          pushable.map((c) => ({
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
            effectiveDate: c.tariffEffectiveDate ?? new Date(),
          }))
        );
        await prisma.negotiationCase.updateMany({
          where: { id: { in: pushable.map((c) => c.id) } },
          data: { tariffPushedAt: new Date() },
        });
        console.error(`[case-actions] tariff review push succeeded for provider ${existing.providerId}: ${pushable.map((c) => c.serviceCode).join(", ")}`);
      } catch (err) {
        failureNote = `Failed to submit tariff review to Prognosis: ${err instanceof Error ? err.message : "Unknown error"}`;
        console.error("[case-actions] tariff review push failed:", err);
      }

      await Promise.all(
        pushable.map((c) =>
          prisma.caseUpdate.create({
            data: {
              caseId: c.id,
              userId: session.user.id,
              type: "NOTE",
              note:
                failureNote ??
                `Tariff review submitted to Prognosis${pushable.length > 1 ? ` (batch of ${pushable.length})` : ""}: ${c.serviceCode} → ${c.finalAgreedAmount}. Tariff schedule: ${tariffScheduleName || "none found — sent blank"}.`,
            },
          })
        )
      );
    }
  }

  revalidatePath(`/negotiations/${data.caseId}`);
  revalidatePath("/negotiations/queue");
  revalidatePath("/negotiations/completed");
  revalidatePath("/dashboard");
  redirectWithToast(`/negotiations/${data.caseId}`, { type: "success", message: `Status updated to ${CASE_STATUS_LABELS[data.status]}.` });
}

export async function addNote(formData: FormData) {
  const session = await requireSession();
  const caseId = String(formData.get("caseId"));
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
  requestedItem: string;
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
 * Sends the member email/SMS for a case and records a MemberNotification per
 * channel. Called exactly once, from createCase() below — member comms only
 * go out at the moment Contact Centre logs the request, never on later
 * status changes or any other action.
 */
async function dispatchMemberNotifications(params: DispatchNotificationsParams): Promise<string[]> {
  const emailMessage = buildEmailMessage(params.template, params.enrolleeName, params.providerName);
  const smsMessage = buildSmsMessage(params.template, params.providerName);
  const subject = `Update on your care at ${params.providerName}`;
  const emailHtml = buildMemberNotificationEmailHtml({
    baseUrl: process.env.NEXTAUTH_URL ?? "https://tariff-negotiation-tracker.onrender.com",
    urgency: params.template,
    title: params.template === "URGENT" ? "We're urgently resolving a delay in your care" : "Your requested service may be delayed",
    message: emailMessage,
    caseNumber: params.caseNumber,
    enrolleeId: params.enrolleeId,
    memberName: params.enrolleeName,
    serviceTypeLabel: SERVICE_TYPE_LABELS[params.serviceType],
    requestedItem: params.requestedItem,
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
        .then(() => ({ status: "SENT" as const, errorMessage: null }))
        .catch((err) => ({
          status: "FAILED" as const,
          errorMessage: err instanceof Error ? err.message : "Unknown error sending SMS",
        }))
        .then(async ({ status, errorMessage }) => {
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
    return `Dear ${memberName}, we know how important it is for your care to move forward without delay, and we want you to know that Leadway Health is ready to approve it right away. The holdup is on ${hospitalName}'s side — they are currently renegotiating tariff rates that were already pre-agreed with us for this service, and that is what's causing this delay, not any decision on our part. We are treating this as a priority, engaging the hospital directly, and following up continuously until it is resolved. Thank you for your patience and trust — we are doing everything possible to close this out quickly.`;
  }
  return `Dear ${memberName}, please be assured that Leadway Health would like nothing more than to approve your requested care immediately. The short delay you may experience is because ${hospitalName} is currently renegotiating tariff rates that were already pre-agreed with us for this service — this is not a delay on our end. Our team is actively engaging the hospital and following up to close this out as quickly as possible so your care isn't held up any longer than necessary. Thank you for your patience and understanding.`;
}

function buildSmsMessage(template: "ROUTINE" | "URGENT", hospitalName: string): string {
  if (template === "URGENT") {
    return `Dear Member, your care is approved on our end. ${hospitalName} is renegotiating an already-agreed tariff, causing this urgent delay. We're pushing hard for an immediate resolution.`;
  }
  return `Dear Member, we're ready to approve your care now. ${hospitalName} is renegotiating an already-agreed tariff, causing the delay. We're following up to resolve this quickly.`;
}

