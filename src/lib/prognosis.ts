const PROGNOSIS_BASE = process.env.PROGNOSIS_BASE ?? "https://prognosis-api.leadwayhealth.com/api";

const POSTMAN_HEADERS = {
  "Content-Type": "application/json",
  Accept: "*/*",
  "User-Agent": "PostmanRuntime/7.51.1",
};

const TOKEN_KEYS = [
  "accessToken",
  "token",
  "AccessToken",
  "Token",
  "bearer",
  "Bearer",
  "bearerToken",
  "BearerToken",
];

const ENVELOPE_KEYS = ["data", "Data", "result", "Result"];

function extractToken(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const candidates: unknown[] = [payload];
  for (const key of ENVELOPE_KEYS) {
    const value = (payload as Record<string, unknown>)[key];
    if (value && typeof value === "object") candidates.push(value);
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    for (const key of TOKEN_KEYS) {
      const value = (candidate as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }
  return null;
}

export class PrognosisAuthError extends Error {}

/**
 * Authenticates a single username/password pair against Prognosis.
 * Used both for validating staff sign-in and for the notification service account.
 */
export async function prognosisLogin(username: string, password: string): Promise<string> {
  const res = await fetch(`${PROGNOSIS_BASE}/ApiUsers/Login`, {
    method: "POST",
    headers: POSTMAN_HEADERS,
    body: JSON.stringify({ Username: username, Password: password }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new PrognosisAuthError(`Prognosis login failed with status ${res.status}`);
  }

  const payload = await res.json().catch(() => null);
  const token = extractToken(payload);
  if (!token) {
    throw new PrognosisAuthError("Prognosis login succeeded but no token was found in the response");
  }
  return token;
}

const TOKEN_TTL_MS = 5 * 60 * 60 * 1000;

let cachedServiceToken: { token: string; expiresAt: number } | null = null;

/**
 * Cached token for the dedicated notification service account, refreshed
 * automatically after TTL expiry or a 401 from a downstream call.
 */
async function getServiceToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedServiceToken && cachedServiceToken.expiresAt > Date.now()) {
    return cachedServiceToken.token;
  }

  const username = process.env.PROGNOSIS_SERVICE_USERNAME;
  const password = process.env.PROGNOSIS_SERVICE_PASSWORD;
  if (!username || !password) {
    throw new PrognosisAuthError(
      "PROGNOSIS_SERVICE_USERNAME / PROGNOSIS_SERVICE_PASSWORD are not configured"
    );
  }

  const token = await prognosisLogin(username, password);
  cachedServiceToken = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token;
}

/**
 * POSTs to a Prognosis endpoint using the cached service-account token,
 * retrying once with a freshly-issued token if the first attempt gets a 401.
 */
async function servicePost(path: string, body: unknown): Promise<void> {
  const call = async (token: string) =>
    fetch(`${PROGNOSIS_BASE}${path}`, {
      method: "POST",
      headers: {
        ...POSTMAN_HEADERS,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

  let token = await getServiceToken();
  let res = await call(token);

  if (res.status === 401) {
    token = await getServiceToken(true);
    res = await call(token);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} failed with status ${res.status}: ${text}`);
  }
}

export interface SendEmailAlertParams {
  emailAddress: string;
  subject: string;
  messageBody: string;
  reference?: string;
  cc?: string;
  bcc?: string;
}

/**
 * Sends a member-facing email through Prognosis's own EnrolleeProfile/SendEmailAlert
 * endpoint, so no separate SMTP/SendGrid account is needed.
 */
export async function sendEmailAlert(params: SendEmailAlertParams): Promise<void> {
  await servicePost("/EnrolleeProfile/SendEmailAlert", {
    EmailAddress: params.emailAddress,
    CC: params.cc ?? "",
    BCC: params.bcc ?? "",
    Subject: params.subject,
    MessageBody: params.messageBody,
    Attachments: null,
    Category: "Tariff Negotiation",
    UserId: 0,
    ProviderId: 0,
    ServiceId: 0,
    Reference: params.reference ?? "",
    TransactionType: "MemberNotification",
  });
}

export interface SendSmsParams {
  to: string;
  message: string;
  referenceNo?: string;
}

/**
 * Sends a member-facing SMS through Prognosis's own Sms/SendSms endpoint.
 */
export async function sendSms(params: SendSmsParams): Promise<void> {
  await servicePost("/Sms/SendSms", {
    To: params.to,
    Message: params.message,
    Source: "Tariff Negotiation Tracker",
    SourceId: 0,
    TemplateId: 0,
    PolicyNumber: "",
    ReferenceNo: params.referenceNo ?? "",
    UserId: 0,
  });
}
