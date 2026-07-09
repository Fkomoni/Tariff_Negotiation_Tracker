const PROGNOSIS_BASE = process.env.PROGNOSIS_BASE ?? "https://prognosis-api.leadwayhealth.com";

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
export class PrognosisUnavailableError extends Error {}

function getServiceCredentials(): { username: string; password: string } | null {
  const username =
    process.env.PROGNOSIS_SERVICE_USERNAME ||
    process.env.PROGNOSIS_USERNAME ||
    process.env.PROGNOSIS_SERVICE_USER;
  const password =
    process.env.PROGNOSIS_SERVICE_PASSWORD ||
    process.env.PROGNOSIS_PASSWORD ||
    process.env.PROGNOSIS_SERVICE_PW;
  if (!username || !password) return null;
  return { username, password };
}

interface StaffLoginResult {
  email: string;
  displayName: string | null;
  role: string | null;
}

function isFailureStatus(value: unknown): boolean {
  if (value === false) return true;
  if (typeof value === "string") return ["error", "fail", "failed"].includes(value.toLowerCase());
  return false;
}

/**
 * Authenticates a staff member against Prognosis's portal login endpoint.
 * This identifies our app to Prognosis via HTTP Basic auth (a shared service
 * account), while the staff member's own credentials travel in the JSON body.
 */
export async function prognosisStaffLogin(username: string, password: string): Promise<StaffLoginResult> {
  const service = getServiceCredentials();
  if (!service) {
    throw new PrognosisUnavailableError(
      "PROGNOSIS_SERVICE_USERNAME / PROGNOSIS_SERVICE_PASSWORD are not configured"
    );
  }

  const basicAuth = Buffer.from(`${service.username}:${service.password}`).toString("base64");

  let res: Response;
  try {
    res = await fetch(`${PROGNOSIS_BASE}/api/Account/ExternalPortalLogin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "PostmanRuntime/7.51.1",
        Authorization: `Basic ${basicAuth}`,
      },
      body: JSON.stringify({
        UserName: username,
        Email: username,
        Password: password,
        LogInSource: "Core",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch (err) {
    console.error("[prognosis] network error reaching", PROGNOSIS_BASE, err);
    throw new PrognosisUnavailableError(
      `Could not reach Prognosis at ${PROGNOSIS_BASE}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (res.status === 401 || res.status === 403) {
    console.error("[prognosis] staff login rejected", res.status);
    throw new PrognosisAuthError("Invalid email or password");
  }

  if (res.status >= 500) {
    const bodyText = await res.text().catch(() => "");
    console.error("[prognosis] staff directory unavailable", res.status, bodyText.slice(0, 500));
    throw new PrognosisUnavailableError(`Staff directory unavailable: ${res.status}`);
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    console.error("[prognosis] staff login failed", res.status, bodyText.slice(0, 500));
    throw new PrognosisAuthError(`Prognosis login failed with status ${res.status}: ${bodyText.slice(0, 200)}`);
  }

  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;

  if (payload && isFailureStatus(payload.status ?? payload.Status)) {
    console.error("[prognosis] staff login returned failure status", JSON.stringify(payload).slice(0, 500));
    throw new PrognosisAuthError("Invalid email or password");
  }

  const result = (payload?.result ?? payload?.Result) as unknown;
  const staffUser = Array.isArray(result) ? (result[0] as Record<string, unknown> | undefined) : undefined;

  if (!staffUser) {
    console.error("[prognosis] no result in staff login response", JSON.stringify(payload).slice(0, 500));
    throw new PrognosisAuthError("Invalid email or password");
  }

  const email =
    (staffUser.Email as string) || (staffUser.email as string) || (staffUser.UserName as string) || username;
  const displayName =
    (staffUser.FullName as string) ||
    (staffUser.Name as string) ||
    (staffUser.DisplayName as string) ||
    null;
  const role = (staffUser.Role as string) || (staffUser.RoleName as string) || null;

  return { email, displayName, role };
}

/**
 * Authenticates a single username/password pair against Prognosis.
 * Used for the notification service account (via ApiUsers/Login), which is
 * a separate flow from staff portal sign-in (ExternalPortalLogin above).
 */
export async function prognosisLogin(username: string, password: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${PROGNOSIS_BASE}/api/ApiUsers/Login`, {
      method: "POST",
      headers: POSTMAN_HEADERS,
      body: JSON.stringify({ Username: username, Password: password }),
      cache: "no-store",
    });
  } catch (err) {
    console.error("[prognosis] network error reaching", PROGNOSIS_BASE, err);
    throw new PrognosisAuthError(
      `Could not reach Prognosis at ${PROGNOSIS_BASE}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    console.error("[prognosis] login rejected", res.status, bodyText.slice(0, 500));
    throw new PrognosisAuthError(`Prognosis login failed with status ${res.status}: ${bodyText.slice(0, 200)}`);
  }

  const payload = await res.json().catch(() => null);
  const token = extractToken(payload);
  if (!token) {
    console.error("[prognosis] no token found in response", JSON.stringify(payload).slice(0, 500));
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

  const service = getServiceCredentials();
  if (!service) {
    throw new PrognosisAuthError(
      "PROGNOSIS_SERVICE_USERNAME / PROGNOSIS_SERVICE_PASSWORD are not configured"
    );
  }

  const token = await prognosisLogin(service.username, service.password);
  cachedServiceToken = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token;
}

/**
 * Calls a Prognosis endpoint using the cached service-account token,
 * retrying once with a freshly-issued token if the first attempt gets a 401.
 */
async function serviceRequest(
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<Record<string, unknown> | null> {
  const call = async (token: string) =>
    fetch(`${PROGNOSIS_BASE}${path}`, {
      method,
      headers: {
        ...POSTMAN_HEADERS,
        Authorization: `Bearer ${token}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
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
    console.error("[prognosis] service request failed", method, path, res.status, text.slice(0, 500));
    throw new Error(`${path} failed with status ${res.status}: ${text}`);
  }

  return res.json().catch(() => null);
}

async function servicePost(path: string, body: unknown): Promise<void> {
  await serviceRequest("POST", path, body);
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
  await servicePost("/api/EnrolleeProfile/SendEmailAlert", {
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
  await servicePost("/api/Sms/SendSms", {
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

export interface ProviderRecord {
  code: string;
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  phone2: string | null;
  address: string | null;
  scheme: string | null;
  specialty: string | null;
  status: string | null;
}

const PROVIDERS_TTL_MS = 6 * 60 * 60 * 1000;

let cachedProviders: { data: ProviderRecord[]; expiresAt: number } | null = null;
let inFlightProvidersFetch: Promise<ProviderRecord[]> | null = null;

async function fetchProvidersFromPrognosis(): Promise<ProviderRecord[]> {
  const payload = await serviceRequest(
    "GET",
    "/api/ListValues/GetProviders?MinimumID=1&NoOfRecords=20000&pageSize=20000"
  );
  const list = ((payload?.result ?? payload?.Result ?? []) as Record<string, unknown>[]) ?? [];

  const seen = new Set<string>();
  const providers: ProviderRecord[] = [];
  for (const p of list) {
    const code = String(p.ProviderCode ?? "").trim();
    const id = Number(p.ProviderID ?? 0);
    const key = code || String(id);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const name = String(p.FullName ?? "").trim();
    if (!name) continue;

    providers.push({
      code,
      id,
      name,
      email: (p.Email as string)?.trim() || null,
      phone: (p.Contact1 as string)?.trim() || null,
      phone2: (p.Contact2 as string)?.trim() || null,
      address: (p.add1 as string)?.trim() || null,
      scheme: (p.Schemes as string)?.trim() || null,
      specialty: (p.Specialty as string)?.trim() || null,
      status: (p.Status as string) || null,
    });
  }

  console.error(`[prognosis] loaded ${providers.length} providers (deduped from ${list.length} records)`);
  return providers;
}

/**
 * Returns the full provider list, cached in memory for PROVIDERS_TTL_MS.
 * Concurrent calls during a cold cache share the same in-flight fetch.
 */
async function getProviders(): Promise<ProviderRecord[]> {
  if (cachedProviders && cachedProviders.expiresAt > Date.now()) {
    return cachedProviders.data;
  }
  if (!inFlightProvidersFetch) {
    inFlightProvidersFetch = fetchProvidersFromPrognosis()
      .then((data) => {
        cachedProviders = { data, expiresAt: Date.now() + PROVIDERS_TTL_MS };
        return data;
      })
      .finally(() => {
        inFlightProvidersFetch = null;
      });
  }
  return inFlightProvidersFetch;
}

export async function searchProviders(query: string, limit = 20): Promise<ProviderRecord[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const providers = await getProviders();
  return providers.filter((p) => p.name.toLowerCase().includes(q)).slice(0, limit);
}
