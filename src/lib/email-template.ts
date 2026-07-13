const BRAND_ORANGE = "#F2661B";
const BRAND_RED = "#E31837";
const INK_900 = "#171316";
const INK_500 = "#6b6470";
const INK_300 = "#9a94a1";
const BORDER = "#ece7ea";
const HIGHLIGHT_YELLOW = "#f5e37a";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Wraps the first occurrence of `word` in `text` with a yellow highlight —
 * mirrors the reference template's title treatment (e.g. "Your
 * [Reimbursement] Code is Ready"). Falls back to the plain escaped title if
 * the word isn't found. */
function highlightWord(text: string, word: string | undefined): string {
  const escaped = escapeHtml(text);
  if (!word) return escaped;
  const escapedWord = escapeHtml(word);
  const idx = escaped.indexOf(escapedWord);
  if (idx === -1) return escaped;
  return (
    escaped.slice(0, idx) +
    `<span style="background:${HIGHLIGHT_YELLOW};padding:0 3px;border-radius:3px;">${escapedWord}</span>` +
    escaped.slice(idx + escapedWord.length)
  );
}

function infoRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:11px 14px;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${INK_300};background:#f7f6f7;border-bottom:1px solid ${BORDER};width:42%;">${escapeHtml(label)}</td>
      <td style="padding:11px 14px;font-size:13px;font-weight:700;color:${INK_900};background:#f7f6f7;border-bottom:1px solid ${BORDER};">${escapeHtml(value)}</td>
    </tr>`;
}

export interface EmailShellParams {
  baseUrl: string;
  /** Header block background — brand orange for routine notices, brand red for anything security- or urgency-flavored. */
  accentColor?: string;
  eyebrow: string;
  title: string;
  /** Substring of `title` to render with a yellow highlight, matching the reference template. */
  highlightedWord?: string;
  intro?: string;
  /** Large centered code display in a dashed, tinted box — used for OTPs, claim/reimbursement codes, etc. */
  codeBox?: { label: string; code: string };
  /** Label/value rows rendered as a light zebra table (expiry/validity, case details, etc.). */
  infoRows?: { label: string; value: string }[];
  ctaButton?: { label: string; url: string };
  copyLink?: { label: string; url: string };
  /** Short warning/notice lines, each already including any leading emoji the caller wants. */
  notices?: string[];
  termsSection?: { title: string; items: string[] };
  /** Small print shown just above the award banner (e.g. "If you didn't request this..."). */
  footerNote: string;
}

/**
 * Shared chrome for every outbound email this app sends — logo header,
 * colored title block, optional content sections, and the standard
 * Leadway Health footer (copyright + NHEA award banner). Keeping this in
 * one place means every email this app sends (member notifications, MFA
 * codes, and anything added later) looks like it came from the same
 * system, instead of each call site hand-rolling its own layout.
 */
export function buildEmailShell(params: EmailShellParams): string {
  const {
    baseUrl,
    accentColor = BRAND_ORANGE,
    eyebrow,
    title,
    highlightedWord,
    intro,
    codeBox,
    infoRows,
    ctaButton,
    copyLink,
    notices,
    termsSection,
    footerNote,
  } = params;

  const introBlock = intro
    ? `<tr><td style="padding:22px 32px 0 32px;">
         <p style="margin:0;font-size:13.5px;line-height:1.6;color:${INK_500};">${escapeHtml(intro)}</p>
       </td></tr>`
    : "";

  const codeBoxBlock = codeBox
    ? `<tr><td style="padding:24px 32px 0 32px;">
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdece9;border:1.5px dashed ${BRAND_RED}55;border-radius:10px;">
           <tr><td align="center" style="padding:20px 18px;">
             <p style="margin:0 0 8px 0;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${INK_300};">${escapeHtml(codeBox.label)}</p>
             <p style="margin:0;font-size:26px;font-weight:800;letter-spacing:.1em;color:${BRAND_RED};font-family:'Courier New',monospace;">${escapeHtml(codeBox.code)}</p>
           </td></tr>
         </table>
       </td></tr>`
    : "";

  const infoRowsBlock =
    infoRows && infoRows.length > 0
      ? `<tr><td style="padding:20px 32px 0 32px;">
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">
             ${infoRows.map((r) => infoRow(r.label, r.value)).join("")}
           </table>
         </td></tr>`
      : "";

  const ctaBlock = ctaButton
    ? `<tr><td align="center" style="padding:26px 32px 0 32px;">
         <a href="${ctaButton.url}" style="display:inline-block;background:${BRAND_RED};color:#ffffff;font-size:13.5px;font-weight:700;text-decoration:none;padding:13px 28px;border-radius:8px;">${escapeHtml(ctaButton.label)} &rarr;</a>
       </td></tr>`
    : "";

  const copyLinkBlock = copyLink
    ? `<tr><td style="padding:18px 32px 0 32px;">
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f7;border:1px solid ${BORDER};border-radius:8px;">
           <tr><td style="padding:12px 16px;">
             <p style="margin:0 0 4px 0;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${INK_300};">${escapeHtml(copyLink.label)}</p>
             <a href="${copyLink.url}" style="font-size:12px;color:${BRAND_RED};word-break:break-all;">${escapeHtml(copyLink.url)}</a>
           </td></tr>
         </table>
       </td></tr>`
    : "";

  const noticesBlock =
    notices && notices.length > 0
      ? `<tr><td style="padding:18px 32px 0 32px;">
           ${notices.map((n) => `<p style="margin:0 0 6px 0;font-size:12px;line-height:1.6;color:${INK_500};">${escapeHtml(n)}</p>`).join("")}
         </td></tr>`
      : "";

  const termsBlock = termsSection
    ? `<tr><td style="padding:24px 0 0 0;">
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8e3;">
           <tr><td style="padding:20px 32px;">
             <p style="margin:0 0 10px 0;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8a6d1a;">${escapeHtml(termsSection.title)}</p>
             <ul style="margin:0;padding-left:18px;">
               ${termsSection.items.map((item) => `<li style="font-size:12px;line-height:1.7;color:#6b5a1e;margin-bottom:4px;">${escapeHtml(item)}</li>`).join("")}
             </ul>
           </td></tr>
         </table>
       </td></tr>`
    : "";

  const year = new Date().getFullYear();

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f2f3;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2f3;padding:28px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${BORDER};">
            <tr>
              <td style="background:${accentColor};padding:26px 32px;">
                <p style="margin:0 0 6px 0;font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#ffffffcc;">${escapeHtml(eyebrow)}</p>
                <h1 style="margin:0;font-size:23px;line-height:1.3;font-weight:800;color:#ffffff;">${highlightWord(title, highlightedWord)}</h1>
              </td>
            </tr>
            ${introBlock}
            ${codeBoxBlock}
            ${infoRowsBlock}
            ${ctaBlock}
            ${copyLinkBlock}
            ${noticesBlock}
            ${termsBlock}
            <tr>
              <td style="padding:24px 32px 20px 32px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:${INK_300};">${escapeHtml(footerNote)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0;">
                <img src="${baseUrl}/email-footer-banner.png" alt="Leadway Health" width="600" style="width:100%;display:block;" />
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 26px 32px;background:#ffffff;">
                <p style="margin:0 0 4px 0;font-size:11.5px;color:${INK_300};">
                  © ${year} Leadway Health Limited &middot; <a href="mailto:healthcare@leadwayhealth.com" style="color:${INK_500};text-decoration:underline;">healthcare@leadwayhealth.com</a>
                </p>
                <p style="margin:0;font-size:11.5px;color:${INK_300};">
                  121/123 Funsho Williams Avenue, Iponri, Surulere, Lagos
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export interface MemberNotificationEmailParams {
  baseUrl: string;
  urgency: "ROUTINE" | "URGENT";
  eyebrow: string;
  title: string;
  intro: string;
  calloutMessage: string;
  caseNumber: string;
  enrolleeId?: string | null;
  memberName: string;
  serviceTypeLabel: string;
  requestedItem: string;
  providerName: string;
  submittedAt: Date;
}

/**
 * Builds the member-facing tariff-delay notification email on the shared
 * shell above.
 */
export function buildMemberNotificationEmailHtml(params: MemberNotificationEmailParams): string {
  const submitted = params.submittedAt.toLocaleString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return buildEmailShell({
    baseUrl: params.baseUrl,
    accentColor: params.urgency === "URGENT" ? BRAND_RED : BRAND_ORANGE,
    eyebrow: params.urgency === "URGENT" ? "Urgent Update" : "Routine Update",
    title: params.title,
    intro: `${params.intro} ${params.calloutMessage}`,
    infoRows: [
      { label: "Request ID", value: params.caseNumber },
      ...(params.enrolleeId ? [{ label: "Enrollee ID", value: params.enrolleeId }] : []),
      { label: "Member", value: params.memberName },
      { label: "Service Type", value: params.serviceTypeLabel },
      { label: "Requested Item", value: params.requestedItem },
      { label: "Provider / Hospital", value: params.providerName },
      { label: "Submitted", value: submitted },
    ],
    footerNote:
      "This is an automated notification from Leadway Health's Provider Tariff Negotiation Tracker. If you have questions about this request, please contact us using the details below.",
  });
}

/** Builds the MFA sign-in code email on the shared shell, matching the
 * layout used for every other Leadway Health email (logo header, code
 * box, footer banner, copyright) instead of the bare-bones version this
 * used to be. */
export function buildMfaCodeEmailHtml(params: { baseUrl: string; code: string; purpose: "sign in to" }): string {
  return buildEmailShell({
    baseUrl: params.baseUrl,
    accentColor: BRAND_RED,
    eyebrow: "Security Verification",
    title: "Your Sign-In Code Is Ready",
    highlightedWord: "Sign-In",
    intro: `Use this code to ${params.purpose} the Provider Tariff Negotiation Tracker.`,
    codeBox: { label: "Verification Code", code: params.code },
    notices: ["⏰ This code expires in 10 minutes.", "🔒 It's single-use and tied to your account only."],
    footerNote: "If you didn't request this, you can ignore this email — no changes were made to your account.",
  });
}
