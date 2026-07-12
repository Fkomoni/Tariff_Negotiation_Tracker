import type { CaseStatus, CaseType, ProviderManagementCategory, RequestType, ServiceType, Urgency, Role } from "@prisma/client";

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  TARIFF_UPDATE: "Tariff Update",
  PROVIDER_MANAGEMENT: "Other Provider Management Request",
};

/// Shorter wording for compact badges (table cells, "at a glance" rows) —
/// the full CASE_TYPE_LABELS text is fine for a big clickable button but
/// wraps awkwardly in a small pill.
export const CASE_TYPE_BADGE_LABEL: Record<CaseType, string> = {
  TARIFF_UPDATE: "Tariff Update",
  PROVIDER_MANAGEMENT: "Provider Management",
};

export const CASE_TYPE_BADGE: Record<CaseType, string> = {
  TARIFF_UPDATE: "bg-ink-100 text-ink-700",
  PROVIDER_MANAGEMENT: "bg-sky-100 text-sky-800",
};

export const PM_CATEGORY_LABELS: Record<ProviderManagementCategory, string> = {
  PORTAL_LOGIN_ISSUE: "Provider Can't Log Into the Provider Portal",
  PROVIDER_SIGN_UP_REQUEST: "Provider Is Requesting to Be Signed Up",
  NEW_FACILITY_SIGN_ON: "New Facility Sign-On Request From Enrollee",
  CONTACT_INFO_UPDATE: "Provider Contact / Address Update",
  BANK_INFO_UPDATE: "Provider Bank Information Update",
  FACILITY_TIER_CHANGE: "Facility Tier / Category Change Request",
  FULL_TARIFF_REVIEW_REQUEST: "Provider Is Asking for a Full Tariff Review",
  PROVIDER_SUSPENDED_US: "Provider Has Suspended Us",
  PROVIDER_DEACTIVATION_REQUEST: "Provider Requesting to Exit the Network",
  COMPLIANCE_DOCUMENT_UPDATE: "Compliance Document Update (License / Accreditation)",
  REPORT_ABUSE_FRAUD: "Report a Provider for Abuse / Fraud",
  REPORT_POOR_ENROLLEE_EXPERIENCE: "Report a Provider for Poor Enrollee Experience",
  OTHER: "Other (Specify in Details Below)",
};

/// Categories are grouped into mini-categories purely for the picker UI and
/// for reporting breakdowns — the underlying enum stays flat.
export const PM_CATEGORY_GROUPS: { group: string; categories: ProviderManagementCategory[] }[] = [
  {
    group: "Access & Onboarding",
    categories: ["PORTAL_LOGIN_ISSUE", "PROVIDER_SIGN_UP_REQUEST", "NEW_FACILITY_SIGN_ON"],
  },
  {
    group: "Provider Records",
    categories: ["CONTACT_INFO_UPDATE", "BANK_INFO_UPDATE", "FACILITY_TIER_CHANGE", "COMPLIANCE_DOCUMENT_UPDATE"],
  },
  {
    group: "Tariff & Network Status",
    categories: ["FULL_TARIFF_REVIEW_REQUEST", "PROVIDER_SUSPENDED_US", "PROVIDER_DEACTIVATION_REQUEST"],
  },
  {
    group: "Complaints",
    categories: ["REPORT_ABUSE_FRAUD", "REPORT_POOR_ENROLLEE_EXPERIENCE"],
  },
  {
    group: "Other",
    categories: ["OTHER"],
  },
];

/// Only this category needs a supporting document today — used to
/// conditionally show the attachment upload in the logging form.
export const PM_CATEGORIES_REQUIRING_ATTACHMENT: ProviderManagementCategory[] = ["BANK_INFO_UPDATE"];

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  EXISTING_TARIFF_UPDATE: "Update Existing Tariff",
  NEW_SERVICE: "New Service",
};

export const REQUEST_TYPE_BADGE: Record<RequestType, string> = {
  EXISTING_TARIFF_UPDATE: "bg-ink-100 text-ink-700",
  NEW_SERVICE: "bg-violet-100 text-violet-800",
};

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  CONSULTATION: "Consultation",
  MEDICATIONS: "Medications",
  INVESTIGATIONS: "Investigations",
  ADMISSION_RELATED_SERVICES: "Admission Related Services",
  PROCEDURES_AND_SERVICES: "Procedures and Services",
  SURGERIES: "Surgeries",
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
  NEW_REQUEST: ["UNDER_REVIEW", "NEGOTIATING", "AWAITING_PROVIDER_FEEDBACK", "AWAITING_INTERNAL_APPROVAL", "ESCALATED", "COMPLETED", "DECLINED"],
  UNDER_REVIEW: ["NEGOTIATING", "AWAITING_PROVIDER_FEEDBACK", "AWAITING_INTERNAL_APPROVAL", "ESCALATED", "COMPLETED", "DECLINED"],
  NEGOTIATING: ["UNDER_REVIEW", "AWAITING_PROVIDER_FEEDBACK", "AWAITING_INTERNAL_APPROVAL", "ESCALATED", "COMPLETED", "DECLINED"],
  AWAITING_PROVIDER_FEEDBACK: ["UNDER_REVIEW", "NEGOTIATING", "AWAITING_INTERNAL_APPROVAL", "ESCALATED", "COMPLETED", "DECLINED"],
  AWAITING_INTERNAL_APPROVAL: ["UNDER_REVIEW", "NEGOTIATING", "AWAITING_PROVIDER_FEEDBACK", "ESCALATED", "COMPLETED", "DECLINED"],
  ESCALATED: ["UNDER_REVIEW", "NEGOTIATING", "AWAITING_PROVIDER_FEEDBACK", "AWAITING_INTERNAL_APPROVAL", "COMPLETED", "DECLINED"],
  COMPLETED: [],
  DECLINED: ["UNDER_REVIEW", "NEGOTIATING", "AWAITING_PROVIDER_FEEDBACK", "AWAITING_INTERNAL_APPROVAL", "ESCALATED"],
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
