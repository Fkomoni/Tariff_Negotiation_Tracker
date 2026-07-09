import type { CaseStatus, ServiceType, Urgency, Role } from "@prisma/client";

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  MEDICATION: "Medication",
  DELIVERY: "Delivery",
  SURGERY: "Surgery",
  LAB: "Lab",
  SCAN: "Scan",
  ADMISSION: "Admission",
  PROCEDURE: "Procedure",
  OTHERS: "Others",
};

export const URGENCY_LABELS: Record<Urgency, string> = {
  ROUTINE: "Routine",
  URGENT: "Urgent",
  EMERGENCY: "Emergency",
};

export const URGENCY_BADGE: Record<Urgency, string> = {
  ROUTINE: "bg-ink-100 text-ink-700",
  URGENT: "bg-amber-100 text-amber-800",
  EMERGENCY: "bg-brand-100 text-brand-700",
};

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  NEW_REQUEST: "New Request",
  UNDER_REVIEW: "Under Review",
  NEGOTIATING: "Negotiating",
  AWAITING_PROVIDER_FEEDBACK: "Awaiting Provider Feedback",
  AWAITING_INTERNAL_APPROVAL: "Awaiting Internal Approval",
  COMPLETED: "Completed",
  DECLINED: "Declined",
  ESCALATED: "Escalated",
};

export const CASE_STATUS_BADGE: Record<CaseStatus, string> = {
  NEW_REQUEST: "bg-sky-100 text-sky-800",
  UNDER_REVIEW: "bg-indigo-100 text-indigo-800",
  NEGOTIATING: "bg-amber-100 text-amber-800",
  AWAITING_PROVIDER_FEEDBACK: "bg-amber-100 text-amber-800",
  AWAITING_INTERNAL_APPROVAL: "bg-indigo-100 text-indigo-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  DECLINED: "bg-ink-200 text-ink-700",
  ESCALATED: "bg-brand-100 text-brand-700",
};

export const OPEN_STATUSES: CaseStatus[] = [
  "NEW_REQUEST",
  "UNDER_REVIEW",
  "NEGOTIATING",
  "AWAITING_PROVIDER_FEEDBACK",
  "AWAITING_INTERNAL_APPROVAL",
  "ESCALATED",
];

export const CLOSED_STATUSES: CaseStatus[] = ["COMPLETED", "DECLINED"];

export const STATUS_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  NEW_REQUEST: ["UNDER_REVIEW", "NEGOTIATING", "ESCALATED"],
  UNDER_REVIEW: ["NEGOTIATING", "AWAITING_PROVIDER_FEEDBACK", "ESCALATED", "DECLINED"],
  NEGOTIATING: ["AWAITING_PROVIDER_FEEDBACK", "AWAITING_INTERNAL_APPROVAL", "ESCALATED", "DECLINED"],
  AWAITING_PROVIDER_FEEDBACK: ["NEGOTIATING", "AWAITING_INTERNAL_APPROVAL", "ESCALATED", "DECLINED"],
  AWAITING_INTERNAL_APPROVAL: ["NEGOTIATING", "COMPLETED", "ESCALATED", "DECLINED"],
  ESCALATED: ["NEGOTIATING", "AWAITING_INTERNAL_APPROVAL", "COMPLETED", "DECLINED"],
  COMPLETED: [],
  DECLINED: ["UNDER_REVIEW"],
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  CONTACT_CENTER: "Contact Centre",
  PROVIDER_TEAM: "Provider Team",
  PENDING: "Pending Assignment",
};

export function formatCurrency(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms) || ms < 0) return "—";
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);
  return parts.join(" ");
}

export function generateCaseNumber(): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  const year = new Date().getFullYear();
  return `TN-${rand}-${year}`;
}

export function amountDifference(current: number | string, requested: number | string): number {
  return Number(requested) - Number(current);
}
