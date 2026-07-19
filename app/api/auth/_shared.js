export const runtime = "edge";

// Keep password hashing compatible with the Edge Function runtime used in production.
const PASSWORD_ITERATIONS = 100000;
const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;
const MAX_JSON_BYTES = 16 * 1024;
const ROLES = new Set(["admin", "referent", "senior", "officer"]);
const GRADES = new Set([
  "Sergent", "Sergent-Chef", "Adjudant", "Adjudant-Chef", "Major", "Élève Officier", "Aspirant",
  "Sous-Lieutenant", "Lieutenant", "Capitaine", "Vice-Commandant", "Commandant", "Lieutenant-Colonel",
  "Colonel", "Général", "Maréchal",
]);

function config() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || "");
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !key) return null;
  return { url, key };
}

export function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0", ...headers } });
}

export function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const value = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : "";
}

export function sameValue(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export function validRequestSource(request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || fetchSite === "cross-site") return false;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}

export function validCsrfRequest(request) {
  return validRequestSource(request) && sameValue(cookieValue(request, "portal-so-csrf"), request.headers.get("x-csrf-token") || "");
}

export async function readJson(request, maxBytes = MAX_JSON_BYTES) {
  if ((request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() !== "application/json") throw new Error("INVALID_CONTENT_TYPE");
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) throw new Error("BODY_TOO_LARGE");
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > maxBytes) throw new Error("BODY_TOO_LARGE");
  try { return JSON.parse(rawBody); }
  catch { throw new Error("INVALID_JSON"); }
}

export async function database(path, init = {}) {
  const settings = config();
  if (!settings) throw new Error("DATABASE_NOT_CONFIGURED");
  let response;
  try {
    response = await fetch(`${settings.url}/rest/v1/${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      ...init,
      headers: {
        apikey: settings.key,
        Authorization: `Bearer ${settings.key}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
  } catch (error) {
    console.error("Supabase portal request timed out or failed", error instanceof Error ? error.name : "Unknown error");
    throw new Error("DATABASE_REQUEST_FAILED");
  }
  const responseText = await response.text().catch(() => "");
  if (!response.ok) {
    const detail = responseText;
    console.error("Supabase portal request failed", response.status, detail.slice(0, 300));
    throw new Error("DATABASE_REQUEST_FAILED");
  }
  // PostgREST may return 201 with an empty body for commands using
  // `return=minimal`. Treat any empty successful response as success.
  if (!responseText.trim()) return null;
  try { return JSON.parse(responseText); }
  catch { throw new Error("DATABASE_INVALID_RESPONSE"); }
}

export function isConfigured() { return Boolean(config()); }

export function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^.{1,254}@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function cleanName(value) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60);
}

export function cleanGrade(value) {
  return GRADES.has(value) ? value : "";
}

export function cleanRole(value) {
  return ROLES.has(value) ? value : "";
}

export function cleanPresence(value) {
  return value === "absent" ? "absent" : "present";
}

export function passwordError(value) {
  const password = String(value || "");
  if (password.length < 12 || password.length > 256) return "Le mot de passe doit contenir entre 12 et 256 caractères.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return "Le mot de passe doit contenir une minuscule, une majuscule, un chiffre et un caractère spécial.";
  return "";
}

function bytesToBase64(bytes) {
  let value = "";
  bytes.forEach((byte) => { value += String.fromCharCode(byte); });
  return btoa(value);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function passwordHash(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function createPasswordRecord(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await passwordHash(password, salt);
  return { password_hash: bytesToBase64(hash), password_salt: bytesToBase64(salt), password_iterations: PASSWORD_ITERATIONS };
}

export async function verifyPassword(row, password) {
  if (!row?.password_hash || !row?.password_salt || !password) return false;
  try {
    const expected = base64ToBytes(row.password_hash);
    const actual = await passwordHash(password, base64ToBytes(row.password_salt), Number(row.password_iterations) || PASSWORD_ITERATIONS);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
    return difference === 0;
  } catch { return false; }
}

export async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToBase64(new Uint8Array(hash));
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function sessionCookie(token, request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `portal-so-session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

export function expiredSessionCookie(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `portal-so-session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export async function createSession(userId, request) {
  const token = randomToken();
  const tokenHash = await digest(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  await database("portal_sessions", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ token_hash: tokenHash, user_id: userId, expires_at: expiresAt }) });
  return sessionCookie(token, request);
}

export async function deleteSessionsForUser(userId) {
  await database(`portal_sessions?user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
}

export async function getRawUser(id) {
  const rows = await database(`portal_users?id=eq.${encodeURIComponent(id)}&select=*`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function getSession(request) {
  const token = cookieValue(request, "portal-so-session");
  if (!token) return null;
  const tokenHash = await digest(token);
  const rows = await database(`portal_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}&select=*`);
  const session = Array.isArray(rows) ? rows[0] : null;
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await database(`portal_sessions?id=eq.${encodeURIComponent(session.id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    return null;
  }
  const user = await getRawUser(session.user_id);
  if (!user || user.blocked) {
    if (user?.id) await deleteSessionsForUser(user.id);
    return null;
  }
  return { user, session, tokenHash };
}

export function manager(user) { return ["admin", "referent"].includes(user?.role); }

export function canManage(actor, target) {
  if (!actor || !target || actor.id === target.id) return false;
  if (actor.role === "admin") return target.role !== "admin";
  return actor.role === "referent" && ["senior", "officer"].includes(target.role);
}

function dateLabel(value) {
  try { return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)); }
  catch { return ""; }
}

export function publicUser(row, viewer = null) {
  const canSeeEmail = Boolean(viewer && (viewer.id === row.id || manager(viewer)));
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: canSeeEmail ? row.email : "",
    role: row.role,
    grade: row.grade,
    presence: ["senior", "officer"].includes(row.role) ? (row.presence === "absent" ? "absent" : "present") : undefined,
    blocked: row.blocked === true,
    createdAtIso: row.created_at,
    createdAt: dateLabel(row.created_at),
  };
}

export async function listUsers(viewer = null) {
  const rows = await database("portal_users?select=id,email,first_name,last_name,role,grade,presence,blocked,created_at,updated_at&order=created_at.asc");
  return Array.isArray(rows) ? rows.map((row) => publicUser(row, viewer)) : [];
}

export async function hasUsers() {
  const rows = await database("portal_users?select=id&limit=1");
  return Array.isArray(rows) && rows.length > 0;
}

export async function requireSession(request) {
  const current = await getSession(request);
  if (!current) return { error: json({ error: "Votre session a expiré. Reconnectez-vous." }, 401, { "Set-Cookie": expiredSessionCookie(request) }) };
  return current;
}
