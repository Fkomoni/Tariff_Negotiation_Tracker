"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmailAlert, sendSms } from "@/lib/prognosis";
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

  if ((data.status === "COMPLETED" || data.status === "DECLINED") && !data.finalAgreedAmount && data.status === "COMPLETED") {
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

  revalidatePath(`/negotiations/${data.caseId}`);
  revalidatePath("/negotiations/queue");
  revalidatePath("/negotiations/completed");
  revalidatePath("/dashboard");
  redirect(`/negotiations/${data.caseId}`);
}

export async function claimCase(formData: FormData) {
  const session = await requireSession();
  const caseId = String(formData.get("caseId"));
  if (!["PROVIDER_TEAM", "ADMIN"].includes(session.user.role)) {
    throw new Error("Only the Provider Team can claim cases");
  }

  const existing = await prisma.negotiationCase.findUnique({ where: { id: caseId } });
  if (!existing) throw new Error("Case not found");

  if (!existing.ownerUserId) {
    await prisma.negotiationCase.update({
      where: { id: caseId },
      data: {
        ownerUserId: session.user.id,
        firstActionAt: existing.firstActionAt ?? new Date(),
        updates: {
          create: {
            userId: session.user.id,
            type: "OWNER_CHANGE",
            note: "Claimed by Provider Team",
          },
        },
      },
    });
  }

  revalidatePath(`/negotiations/${caseId}`);
  revalidatePath("/negotiations/queue");
  redirect(`/negotiations/${caseId}`);
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

  const emailMessage = buildEmailMessage(template, negotiationCase.enrolleeName, negotiationCase.providerName);
  const smsMessage = buildSmsMessage(template, negotiationCase.providerName);
  const subject = `Update on your care at ${negotiationCase.providerName}`;
  const emailHtml = buildMemberNotificationEmailHtml({
    baseUrl: process.env.NEXTAUTH_URL ?? "https://tariff-negotiation-tracker.onrender.com",
    urgency: template,
    eyebrow: template === "URGENT" ? "Urgent Update" : "Routine Update",
    title: template === "URGENT" ? "We're urgently resolving a delay in your care" : "Your requested service may be delayed",
    intro:
      template === "URGENT"
        ? "Our Provider Team is actively engaging the hospital to resolve this as quickly as possible. We're treating this as a priority."
        : "This request is currently being reviewed by our Provider Team — no action is needed from you right now.",
    calloutMessage: emailMessage,
    caseNumber: negotiationCase.caseNumber,
    enrolleeId: negotiationCase.enrolleeId,
    memberName: negotiationCase.enrolleeName,
    serviceTypeLabel: SERVICE_TYPE_LABELS[negotiationCase.serviceType as ServiceType],
    requestedItem: negotiationCase.requestedItem,
    providerName: negotiationCase.providerName,
    submittedAt: negotiationCase.loggedAt,
  });

  const tasks: Promise<string>[] = [];

  if (wantsEmail && email) {
    tasks.push(
      sendEmailAlert({ emailAddress: email, subject, messageBody: emailHtml, reference: negotiationCase.caseNumber })
        .then(() => ({ status: "SENT" as const, errorMessage: null }))
        .catch((err) => ({
          status: "FAILED" as const,
          errorMessage: err instanceof Error ? err.message : "Unknown error sending email",
        }))
        .then(async ({ status, errorMessage }) => {
          await prisma.memberNotification.create({
            data: { caseId, sentByUserId: session.user.id, template, channel: "EMAIL", message: emailMessage, recipientEmail: email, status, errorMessage },
          });
          return status === "SENT" ? "email sent" : `email failed: ${errorMessage}`;
        })
    );
  }

  if (wantsSms && phone) {
    tasks.push(
      sendSms({ to: phone, message: smsMessage, referenceNo: negotiationCase.caseNumber })
        .then(() => ({ status: "SENT" as const, errorMessage: null }))
        .catch((err) => ({
          status: "FAILED" as const,
          errorMessage: err instanceof Error ? err.message : "Unknown error sending SMS",
        }))
        .then(async ({ status, errorMessage }) => {
          await prisma.memberNotification.create({
            data: { caseId, sentByUserId: session.user.id, template, channel: "SMS", message: smsMessage, recipientPhone: phone, status, errorMessage },
          });
          return status === "SENT" ? "SMS sent" : `SMS failed: ${errorMessage}`;
        })
    );
  }

  const results = await Promise.all(tasks);

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
