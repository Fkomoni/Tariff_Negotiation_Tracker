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
  method: "GET" | "POST" | "PUT" | "PATCH",
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Promise<Record<string, unknown> | null> {
  const call = async (token: string) =>
    fetch(`${PROGNOSIS_BASE}${path}`, {
      method,
      headers: {
        ...POSTMAN_HEADERS,
        ...extraHeaders,
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

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    console.error("[prognosis] service request failed", method, path, res.status, text.slice(0, 500));
    throw new Error(`${path} failed with status ${res.status}: ${text}`);
  }

  console.error("[prognosis] response", method, path, res.status, text.slice(0, 3000));

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function servicePost(path: string, body: unknown): Promise<void> {
  await serviceRequest("POST", path, body);
}

async function servicePut(path: string, body: unknown): Promise<void> {
  await serviceRequest("PUT", path, body);
}

async function servicePatch(path: string, body: unknown): Promise<void> {
  await serviceRequest("PATCH", path, body);
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
  // Prognosis's SMS gateway rejects unregistered Source/SourceId/TemplateId
  // combinations with a generic 500 ("Tariff Negotiation Tracker"/0/0 isn't
  // registered there). Falling back to the one confirmed-working combination we
  // have (the Drug Delivery OTP flow) until Provider Team registers a dedicated
  // Source for this app — check production logs after deploy to confirm this
  // actually delivers, and whether TemplateId 5 forces OTP wording over our
  // custom Message body.
  await servicePost("/api/Sms/SendSms", {
    To: params.to,
    Message: params.message,
    Source: "Drug Delivery",
    SourceId: 1,
    TemplateId: 5,
    PolicyNumber: "",
    ReferenceNo: params.referenceNo ?? "",
    UserId: 0,
  });
}

export interface UpdateProviderTariffParams {
  providerCode: string;
  serviceCode: string;
  oldPrice: number;
  newPrice: number;
  effectiveDate: Date;
}

/**
 * Pushes a negotiated tariff price straight to Prognosis's own tariff record
 * once Provider Team agrees a final amount, so the new rate takes effect
 * there without a separate manual update.
 */
export async function updateProviderTariff(params: UpdateProviderTariffParams): Promise<void> {
  await servicePut(
    `/api/Tariff/Provider/${encodeURIComponent(params.providerCode)}/Service/${encodeURIComponent(params.serviceCode)}`,
    {
      provider_code: params.providerCode,
      service_code: params.serviceCode,
      old_price: params.oldPrice,
      new_price: params.newPrice,
      effective_date: params.effectiveDate.toISOString(),
    }
  );
}

export interface BulkUpdateProviderTariffParams {
  providerCode: string;
  effectiveDate: Date;
  updates: Array<{
    serviceCode: string;
    oldPrice: number;
    newPrice: number;
  }>;
}

/**
 * Pushes several agreed tariff prices for the same provider to Prognosis in
 * one call, for when more than one service negotiated in the same visit
 * ("quick repeat") is completed together.
 */
export async function bulkUpdateProviderTariff(params: BulkUpdateProviderTariffParams): Promise<void> {
  await servicePatch(`/api/Tariff/Provider/${encodeURIComponent(params.providerCode)}/BulkUpdate`, {
    provider_code: params.providerCode,
    effective_date: params.effectiveDate.toISOString(),
    updates: params.updates.map((u) => ({
      provider_code: params.providerCode,
      service_code: u.serviceCode,
      old_price: u.oldPrice,
      new_price: u.newPrice,
      effective_date: params.effectiveDate.toISOString(),
    })),
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

export interface EnrolleeRecord {
  enrolleeId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  scheme: string | null;
  age: number | null;
  relationship: string | null;
}

function firstString(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

/** Some enrollee records have junk placeholder text (e.g. "Normal") in the
 * email slot rather than a real address, so only accept values that are
 * actually shaped like an email. */
function firstValidEmail(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim())) {
      return value.trim();
    }
  }
  return null;
}

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const monthDiff = now.getMonth() - parsed.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < parsed.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

function mapEnrolleeRecord(raw: Record<string, unknown>): EnrolleeRecord | null {
  const fullName =
    firstString(raw, ["FullName", "Fullname", "EnrolleeName", "Name", "MemberName"]) ??
    [
      firstString(raw, ["Member_FirstName", "FirstName", "Firstname"]),
      firstString(raw, ["Member_othernames", "Othernames", "MiddleName"]),
      firstString(raw, ["Member_Surname", "LastName", "Lastname", "Surname"]),
    ]
      .filter(Boolean)
      .join(" ");
  if (!fullName) return null;

  const ageRaw = firstString(raw, ["Member_Age", "Age"]);
  const age =
    ageRaw && !Number.isNaN(Number(ageRaw))
      ? Number(ageRaw)
      : ageFromDob(firstString(raw, ["Member_DateOfBirth", "DateOfBirth", "DOB", "Dob"]));

  return {
    enrolleeId: firstString(raw, ["Member_EnrolleeID", "EnrolleeID", "EnrolleeId", "EnrolleeCode", "MemberID", "MemberId"]),
    fullName,
    email: firstValidEmail(raw, [
      "Member_EmailAddress_One",
      "Member_EmailAddress_Two",
      "Member_Email",
      "Email",
      "EmailAddress",
    ]),
    phone: firstString(raw, [
      "Member_Phone_One",
      "Member_Phone_Two",
      "Member_Phone_Three",
      "Member_MobileNo",
      "Member_PhoneNo",
      "Member_Phone",
      "MobileNo",
      "MobileNumber",
      "PhoneNo",
      "Contact1",
      "Phone",
    ]),
    company: firstString(raw, [
      "Client_ClientName",
      "Member_CompanyName",
      "Member_GroupName",
      "Member_ClientName",
      "CompanyName",
      "Company",
      "GroupName",
      "ClientName",
    ]),
    scheme: firstString(raw, [
      "Member_Plan",
      "Product_schemeType",
      "Member_SchemeName",
      "Member_PlanName",
      "SchemeName",
      "Scheme",
      "PlanName",
      "Plan",
    ]),
    age,
    relationship: firstString(raw, [
      "Member_RelationshipToPrincipal",
      "RelationshipToPrincipal",
      "Relationship",
      "MemberType",
      "Type",
    ]),
  };
}

function extractEnrolleeRecords(payload: unknown): EnrolleeRecord[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;

  let raw: unknown = p.result ?? p.Result ?? p.data ?? p.Data ?? payload;
  if (!Array.isArray(raw)) raw = raw && typeof raw === "object" ? [raw] : [];

  const records: EnrolleeRecord[] = [];
  for (const item of raw as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const mapped = mapEnrolleeRecord(item as Record<string, unknown>);
    if (mapped) records.push(mapped);
  }
  return records;
}

const ENROLLEE_HEADERS = { Accept: "application/json" };

async function fetchEnrolleeEndpoint(path: string): Promise<EnrolleeRecord[]> {
  try {
    const payload = await serviceRequest("GET", path, undefined, ENROLLEE_HEADERS);
    return extractEnrolleeRecords(payload);
  } catch (err) {
    console.error(`[prognosis] enrollee lookup failed for ${path}:`, err);
    return [];
  }
}

/** Raw string concatenation on purpose — enrollee IDs contain a literal "/"
 * (e.g. 21000645/0) that must NOT be percent-encoded, or Prognosis returns
 * nothing for an otherwise-valid ID. */
function fetchByEnrolleeId(id: string): Promise<EnrolleeRecord[]> {
  return fetchEnrolleeEndpoint(`/api/EnrolleeProfile/GetEnrolleeBioDataByEnrolleeID?enrolleeid=${id}`);
}

type EnrolleeQueryType = "email" | "enrolleeId" | "phone" | "membershipRoot" | "name";

function classifyEnrolleeQuery(raw: string): { type: EnrolleeQueryType; value: string } | null {
  const q = raw.trim();
  if (q.length < 3) return null;

  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q)) return { type: "email", value: q };

  if (/^\d{3,}\s*\/\s*\d+$/.test(q)) return { type: "enrolleeId", value: q.replace(/\s+/g, "") };

  const compact = q.replace(/[\s-]/g, "");
  if (/^\+?(?:0\d{10}|234\d{10})$/.test(compact)) return { type: "phone", value: compact };

  if (/^\d{8,10}$/.test(compact)) return { type: "membershipRoot", value: compact };

  return { type: "name", value: q };
}

/** Prognosis is inconsistent about which mobile-number format it stored a
 * member under, so try 0-prefixed, 234-prefixed, and the bare local number
 * in turn, returning on the first variant that gets a hit. */
function phoneVariants(compact: string): string[] {
  const stripped = compact.replace(/^\+/, "");
  const local10 = stripped.startsWith("234") ? stripped.slice(3) : stripped.slice(1);
  return [`0${local10}`, `234${local10}`, local10];
}

async function searchByPhone(compact: string): Promise<EnrolleeRecord[]> {
  for (const variant of phoneVariants(compact)) {
    const records = await fetchEnrolleeEndpoint(
      `/api/EnrolleeProfile/GetEnrolleeBioDataByMobileNo?mobileno=${encodeURIComponent(variant)}`
    );
    if (records.length > 0) return records;
  }
  return [];
}

/** A bare 6-10 digit number with no "/" is a membership root, not a full
 * enrollee ID — the principal is {root}/0 and dependents are {root}/1..20,
 * so fan out across all of them concurrently and return every match. */
async function searchByMembershipRoot(root: string): Promise<EnrolleeRecord[]> {
  const suffixes = Array.from({ length: 21 }, (_, i) => i);
  const results = await Promise.all(suffixes.map((n) => fetchByEnrolleeId(`${root}/${n}`)));
  return results.flat();
}

/**
 * Searches Prognosis for an enrollee by whichever identifier the query looks
 * like — email, enrollee ID, phone, a bare membership number (fans out to
 * principal + dependents), or name — dispatching to the matching
 * GetEnrolleeBioDataBy* endpoint(s).
 */
export async function searchEnrollees(query: string): Promise<EnrolleeRecord[]> {
  const classified = classifyEnrolleeQuery(query);
  console.error("[prognosis] enrollee search classified", JSON.stringify(query), "as", classified);
  if (!classified) return [];

  switch (classified.type) {
    case "email":
      return fetchEnrolleeEndpoint(
        `/api/EnrolleeProfile/GetEnrolleeBioDataByEmail?email=${encodeURIComponent(classified.value)}`
      );
    case "enrolleeId":
      return fetchByEnrolleeId(classified.value);
    case "phone":
      return searchByPhone(classified.value);
    case "membershipRoot":
      return searchByMembershipRoot(classified.value);
    case "name":
      return fetchEnrolleeEndpoint(
        `/api/EnrolleeProfile/GetEnrolleeBioDataByName?fullname=${encodeURIComponent(classified.value)}`
      );
  }
}

export interface TariffItem {
  serviceCode: string;
  description: string;
  providerTariffCode: string | null;
  nomenclature: string | null;
  tariffName: string | null;
  minCost: number | null;
  maxCost: number | null;
  unitPrice: number | null;
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

const TARIFF_ENVELOPE_KEYS = ["tariff", "Tariff", "items", "Items", "data", "Data", "result", "Result"];

function extractTariffItems(payload: unknown): TariffItem[] {
  if (!payload) return [];

  // Unwrap nested envelopes — Prognosis wraps this one two levels deep:
  // { data: { provider_code, provider_name, tariff: [...] } }.
  let raw: unknown = payload;
  for (let depth = 0; depth < 4 && !Array.isArray(raw); depth++) {
    if (!raw || typeof raw !== "object") break;
    const p = raw as Record<string, unknown>;
    const envelopeKey = TARIFF_ENVELOPE_KEYS.find((key) => key in p);
    if (!envelopeKey) break;
    raw = p[envelopeKey];
  }
  if (!Array.isArray(raw)) raw = raw && typeof raw === "object" ? [raw] : [];

  const items: TariffItem[] = [];
  for (const entry of raw as unknown[]) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;

    const serviceCode = firstString(r, ["ProcedureCode"]);
    const description = firstString(r, ["ProcedureDescr"]);
    if (!serviceCode && !description) continue;

    const minCost = toNumberOrNull(r.MinCost);
    const maxCost = toNumberOrNull(r.MaxCost);

    items.push({
      serviceCode: serviceCode ?? "",
      description: description ?? serviceCode ?? "",
      providerTariffCode: firstString(r, ["ProviderTarrifCode", "ProviderTariffCode"]),
      nomenclature: firstString(r, ["ProviderNameClature"]),
      tariffName: firstString(r, ["TariffName"]),
      minCost,
      maxCost,
      unitPrice: maxCost ?? minCost,
    });
  }
  return items;
}

const TARIFF_TTL_MS = 60 * 60 * 1000;
const cachedTariffsByProvider = new Map<string, { data: TariffItem[]; expiresAt: number }>();
const inFlightTariffFetches = new Map<string, Promise<TariffItem[]>>();

async function fetchProviderTariffFromPrognosis(providerCode: string): Promise<TariffItem[]> {
  try {
    const payload = await serviceRequest(
      "GET",
      `/api/WellnessBenefit/GetProviderTariff?code=${encodeURIComponent(providerCode)}`
    );
    return extractTariffItems(payload);
  } catch (err) {
    console.error(`[prognosis] tariff lookup failed for provider ${providerCode}:`, err);
    return [];
  }
}

/** Returns the full tariff list for a provider, cached in memory per
 * provider code for TARIFF_TTL_MS. Prognosis has no per-service filter on
 * this endpoint, so it always returns everything and we filter client-side. */
async function getProviderTariff(providerCode: string): Promise<TariffItem[]> {
  const cached = cachedTariffsByProvider.get(providerCode);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  let inflight = inFlightTariffFetches.get(providerCode);
  if (!inflight) {
    inflight = fetchProviderTariffFromPrognosis(providerCode)
      .then((data) => {
        cachedTariffsByProvider.set(providerCode, { data, expiresAt: Date.now() + TARIFF_TTL_MS });
        return data;
      })
      .finally(() => {
        inFlightTariffFetches.delete(providerCode);
      });
    inFlightTariffFetches.set(providerCode, inflight);
  }
  return inflight;
}

export async function searchProviderTariff(providerCode: string, query: string, limit = 25): Promise<TariffItem[]> {
  if (!providerCode) return [];
  const items = await getProviderTariff(providerCode);
  const q = query.trim().toLowerCase();
  if (q.length < 2) return items.slice(0, limit);
  return items
    .filter((i) => i.description.toLowerCase().includes(q) || i.serviceCode.toLowerCase().includes(q))
    .slice(0, limit);
}
