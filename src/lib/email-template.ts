const BRAND_ORANGE = "#F2661B";
const BRAND_RED = "#E31837";
const INK_900 = "#171316";
const INK_500 = "#6b6470";
const INK_300 = "#9a94a1";
const BORDER = "#ece7ea";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function detailRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:9px 0;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${INK_300};width:38%;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:9px 0;font-size:13.5px;font-weight:600;color:${INK_900};vertical-align:top;">${escapeHtml(value)}</td>
    </tr>`;
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
 * Builds the member-facing notification email as self-contained HTML with inline
 * styles (email clients strip <style> blocks unreliably) — white background, dark
 * text, matching Leadway Health's other member emails.
 */
export function buildMemberNotificationEmailHtml(params: MemberNotificationEmailParams): string {
  const {
    baseUrl,
    urgency,
    eyebrow,
    title,
    intro,
    calloutMessage,
    caseNumber,
    enrolleeId,
    memberName,
    serviceTypeLabel,
    requestedItem,
    providerName,
    submittedAt,
  } = params;

  const accent = urgency === "URGENT" ? BRAND_RED : BRAND_ORANGE;
  const calloutBg = urgency === "URGENT" ? "#fdece9" : "#fff2e6";
  const submitted = submittedAt.toLocaleString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const rows = [
    detailRow("Request ID", caseNumber),
    enrolleeId ? detailRow("Enrollee ID", enrolleeId) : "",
    detailRow("Member", memberName),
    detailRow("Service Type", serviceTypeLabel),
    detailRow("Requested Item", requestedItem),
    detailRow("Provider / Hospital", providerName),
    detailRow("Submitted", submitted),
  ].join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f2f3;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2f3;padding:28px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${BORDER};">
            <tr>
              <td style="padding:24px 32px 16px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td valign="middle">
                      <img src="${baseUrl}/leadway-logo.png" alt="Leadway Health" height="28" style="height:28px;display:block;" />
                    </td>
                    <td valign="middle" align="right" style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${INK_300};">
                      Provider Tariff Negotiation
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="height:3px;background:${accent};line-height:3px;font-size:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 32px 4px 32px;">
                <p style="margin:0 0 8px 0;font-size:11.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${accent};">
                  ${escapeHtml(eyebrow)}
                </p>
                <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:800;color:${INK_900};">
                  ${escapeHtml(title)}
                </h1>
                <p style="margin:0;font-size:13.5px;line-height:1.6;color:${INK_500};">
                  ${escapeHtml(intro)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 4px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${calloutBg};border-radius:8px;">
                  <tr>
                    <td style="border-left:3px solid ${accent};padding:16px 18px;font-size:13.5px;line-height:1.6;color:${INK_900};">
                      ${escapeHtml(calloutMessage)}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${BORDER};">
                  ${rows}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 28px 32px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:${INK_300};">
                  This is an automated notification from Leadway Health's Provider Tariff Negotiation Tracker.
                  If you have questions about this request, please contact us using the details below.
                </p>
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
                  © ${submittedAt.getFullYear()} Leadway Health Limited &middot; <a href="mailto:healthcare@leadwayhealth.com" style="color:${INK_500};text-decoration:underline;">healthcare@leadwayhealth.com</a>
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
