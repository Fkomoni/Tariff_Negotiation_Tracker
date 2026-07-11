"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmailAlert, sendSms, addTariffReviews } from "@/lib/prognosis";
import { generateCaseNumber, CASE_STATUS_LABELS, SERVICE_TYPE_LABELS } from "@/lib/domain";
import type { CaseStatus, ServiceType } from "@prisma/client";
import { STATUS_TRANSITIONS } from "@/lib/domain";
import { buildMemberNotificationEmailHtml } from "@/lib/email-template";

async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  return session;
}

const createCaseSchema = z.object({
  providerName: z.string().min(2, "Provider/Hospital name is required"),
  providerCode: z.string().optional(),
  providerId: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.coerce.number().int().optional()
  ),
  providerEmail: z.string().email("Enter a valid provider email").optional().or(z.literal("")),
  providerPhone: z.string().optional(),
  enrolleeName: z.string().min(2, "Enrollee name is required"),
  enrolleeId: z.string().optional(),
  enrolleeEmail: z.string().email("Enter a valid email").optional().or(z.literal("")),
  enrolleePhone: z.string().optional(),
  enrolleeCompany: z.string().optional(),
  enrolleeScheme: z.string().optional(),
  enrolleeAge: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.coerce.number().int().min(0).optional()
  ),
  serviceType: z.enum([
    "CONSULTATION",
    "MEDICATIONS",
    "INVESTIGATIONS",
    "ADMISSION_RELATED_SERVICES",
    "PROCEDURES_AND_SERVICES",
    "SURGERIES",
  ]),
  requestedItem: z.string().min(2, "Requested service/item is required"),
  serviceCode: z.string().optional(),
  providerTariffCode: z.string().optional(),
  currentTariff: z.coerce.number().min(0, "Current tariff must be 0 or more"),
  providerRequestedAmount: z.coerce.number().min(0, "Provider requested amount must be 0 or more"),
  reason: z.string().min(3, "Reason is required"),
  urgency: z.enum(["ROUTINE", "URGENT", "EMERGENCY"]),
  notes: z.string().optional(),
  sessionGroupId: z.string().optional(),
});

export async function createCase(formData: FormData) {
  const session = await requireSession();

  const raw = Object.fromEntries(formData.entries());
  const parsed = createCaseSchema.safeParse(raw);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/negotiations/new?error=${encodeURIComponent(message)}`);
  }

  const data = parsed.data;

  const created = await prisma.negotiationCase.create({
    data: {
      caseNumber: generateCaseNumber(),
      providerName: data.providerName,
      providerCode: data.providerCode || null,
      providerId: data.providerId ?? null,
      providerEmail: data.providerEmail || null,
      providerPhone: data.providerPhone || null,
      enrolleeName: data.enrolleeName,
      enrolleeId: data.enrolleeId || null,
      enrolleeEmail: data.enrolleeEmail || null,
      enrolleePhone: data.enrolleePhone || null,
      enrolleeCompany: data.enrolleeCompany || null,
      enrolleeScheme: data.enrolleeScheme || null,
      enrolleeAge: data.enrolleeAge ?? null,
      serviceType: data.serviceType,
      requestedItem: data.requestedItem,
      serviceCode: data.serviceCode || null,
      providerTariffCode: data.providerTariffCode || null,
      currentTariff: data.currentTariff,
      providerRequestedAmount: data.providerRequestedAmount,
      reason: data.reason,
      urgency: data.urgency,
      notes: data.notes || null,
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
      serviceType: created.serviceType,
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

  revalidatePath("/negotiations/queue");
  revalidatePath("/dashboard");
  redirect(`/negotiations/${created.id}`);
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
  finalAgreedAmount: z.coerce.number().optional(),
  approvalReason: z.string().optional(),
});

export async function updateCaseStatus(formData: FormData) {
  const session = await requireSession();
  if (!["PROVIDER_TEAM", "ADMIN"].includes(session.user.role)) {
    throw new Error("Only the Provider Team can update negotiation status");
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = updateStatusSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/negotiations/${raw.caseId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }
  const data = parsed.data;

  const existing = await prisma.negotiationCase.findUnique({ where: { id: data.caseId } });
  if (!existing) throw new Error("Case not found");

  const allowed = STATUS_TRANSITIONS[existing.status as CaseStatus];
  if (existing.status !== data.status && !allowed.includes(data.status)) {
    redirect(
      `/negotiations/${data.caseId}?error=${encodeURIComponent(
        `Cannot move from ${CASE_STATUS_LABELS[existing.status]} to ${CASE_STATUS_LABELS[data.status]}`
      )}`
    );
  }

  if (data.status === "COMPLETED" && !data.finalAgreedAmount) {
    redirect(`/negotiations/${data.caseId}?error=${encodeURIComponent("Final agreed amount is required to mark as Completed")}`);
  }

  const now = new Date();
  await prisma.negotiationCase.update({
    where: { id: data.caseId },
    data: {
      status: data.status,
      finalAgreedAmount: data.finalAgreedAmount ?? existing.finalAgreedAmount ?? undefined,
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

  if (data.status === "COMPLETED" && data.finalAgreedAmount) {
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

      let failureNote: string | null = null;
      try {
        await addTariffReviews(
          pushable.map((c) => ({
            procedureId: c.serviceCode!,
            procedureName: c.requestedItem,
            newPrice: Number(c.finalAgreedAmount),
            providerId: c.providerId!,
            tariffScheduleName: "",
            userEmail,
            requestorMobile: "",
            action: "Insert",
            providerTariffCode: c.providerTariffCode ?? "",
            providerTariffName: "",
            zeroRate: false,
          }))
        );
        await prisma.negotiationCase.updateMany({
          where: { id: { in: pushable.map((c) => c.id) } },
          data: { tariffPushedAt: new Date() },
        });
      } catch (err) {
        failureNote = `Failed to submit tariff review to Prognosis: ${err instanceof Error ? err.message : "Unknown error"}`;
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
                `Tariff review submitted to Prognosis${pushable.length > 1 ? ` (batch of ${pushable.length})` : ""}: ${c.serviceCode} → ${c.finalAgreedAmount}.`,
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
  redirect(`/negotiations/${data.caseId}`);
}

export async function addNote(formData: FormData) {
  const session = await requireSession();
  const caseId = String(formData.get("caseId"));
  const note = String(formData.get("note") ?? "").trim();
  if (!note) redirect(`/negotiations/${caseId}?error=${encodeURIComponent("Note cannot be empty")}`);

  await prisma.caseUpdate.create({
    data: { caseId, userId: session.user.id, type: "NOTE", note },
  });

  revalidatePath(`/negotiations/${caseId}`);
  redirect(`/negotiations/${caseId}`);
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
 * Sends the member email/SMS for a case and records a MemberNotification
 * per channel. Shared by the auto-notify-on-log flow and the manual
 * "Notify Member" form so both produce identical, auditable results.
 */
async function dispatchMemberNotifications(params: DispatchNotificationsParams): Promise<string[]> {
  const emailMessage = buildEmailMessage(params.template, params.enrolleeName, params.providerName);
  const smsMessage = buildSmsMessage(params.template, params.providerName);
  const subject = `Update on your care at ${params.providerName}`;
  const emailHtml = buildMemberNotificationEmailHtml({
    baseUrl: process.env.NEXTAUTH_URL ?? "https://tariff-negotiation-tracker.onrender.com",
    urgency: params.template,
    eyebrow: params.template === "URGENT" ? "Urgent Update" : "Routine Update",
    title: params.template === "URGENT" ? "We're urgently resolving a delay in your care" : "Your requested service may be delayed",
    intro:
      params.template === "URGENT"
        ? "Our Provider Team is actively engaging the hospital to resolve this as quickly as possible. We're treating this as a priority."
        : "This request is currently being reviewed by our Provider Team — no action is needed from you right now.",
    calloutMessage: emailMessage,
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
    return `Leadway Health: Your care is approved on our end. ${hospitalName} is renegotiating an already-agreed tariff, causing this urgent delay. We're pushing hard for an immediate resolution.`;
  }
  return `Leadway Health: We're ready to approve your care now. ${hospitalName} is renegotiating an already-agreed tariff, causing the delay. We're following up to resolve this quickly.`;
}

export async function notifyMember(formData: FormData) {
  const session = await requireSession();
  if (!["CONTACT_CENTER", "ADMIN"].includes(session.user.role)) {
    throw new Error("Only Contact Centre can notify the member");
  }
  const caseId = String(formData.get("caseId"));
  const template = String(formData.get("template") ?? "ROUTINE") as "ROUTINE" | "URGENT";
  const channels = formData.getAll("channel").map(String) as Array<"EMAIL" | "SMS">;
  const overrideEmail = String(formData.get("email") ?? "").trim();
  const overridePhone = String(formData.get("phone") ?? "").trim();

  const negotiationCase = await prisma.negotiationCase.findUnique({ where: { id: caseId } });
  if (!negotiationCase) throw new Error("Case not found");

  const email = overrideEmail || negotiationCase.enrolleeEmail;
  const phone = overridePhone || negotiationCase.enrolleePhone;

  const wantsEmail = channels.includes("EMAIL");
  const wantsSms = channels.includes("SMS");

  if (!wantsEmail && !wantsSms) {
    redirect(`/negotiations/${caseId}?error=${encodeURIComponent("Choose at least one channel (Email or SMS) to notify the member.")}`);
  }
  if (wantsEmail && !email) {
    redirect(`/negotiations/${caseId}?error=${encodeURIComponent("No member email on file. Add one to send an email notification.")}`);
  }
  if (wantsSms && !phone) {
    redirect(`/negotiations/${caseId}?error=${encodeURIComponent("No member phone number on file. Add one to send an SMS notification.")}`);
  }

  const results = await dispatchMemberNotifications({
    caseId,
    caseNumber: negotiationCase.caseNumber,
    providerName: negotiationCase.providerName,
    enrolleeName: negotiationCase.enrolleeName,
    enrolleeId: negotiationCase.enrolleeId,
    requestedItem: negotiationCase.requestedItem,
    serviceType: negotiationCase.serviceType as ServiceType,
    loggedAt: negotiationCase.loggedAt,
    template,
    wantsEmail,
    wantsSms,
    email,
    phone,
    sentByUserId: session.user.id,
  });

  await prisma.caseUpdate.create({
    data: {
      caseId,
      userId: session.user.id,
      type: "NOTIFICATION",
      note: `Member notification (${template.toLowerCase()} template): ${results.join(", ")}`,
    },
  });

  revalidatePath(`/negotiations/${caseId}`);
  redirect(`/negotiations/${caseId}?notified=${encodeURIComponent(results.join(", "))}`);
}
