import {
  cleanGrade, cleanName, createPasswordRecord, createSession, hasUsers, isConfigured, json, listUsers,
  normalizeEmail, passwordError, readJson, validCsrfRequest,
} from "../_shared";

export const runtime = "edge";

export async function GET(request) {
  if (!isConfigured()) return json({ configured: false, hasUsers: false, session: null, users: [] }, 503);
  try {
    const { getSession, publicUser } = await import("../_shared");
    const exists = await hasUsers();
    const current = await getSession(request);
    if (!current) return json({ configured: true, hasUsers: exists, session: null, users: [] });
    return json({ configured: true, hasUsers: true, session: publicUser(current.user, current.user), users: await listUsers(current.user) });
  } catch (error) {
    console.error("Portal bootstrap failed", error instanceof Error ? error.message : "Unknown error");
    return json({ configured: false, hasUsers: false, session: null, users: [], error: "La base des comptes est momentanément indisponible." }, 503);
  }
}

export async function POST(request) {
  if (!isConfigured()) return json({ error: "La base des comptes n’est pas configurée." }, 503);
  if (!validCsrfRequest(request)) return json({ error: "Jeton de sécurité invalide. Rechargez la page." }, 403);
  try {
    if (await hasUsers()) return json({ error: "La configuration initiale est déjà terminée." }, 409);
    const body = await readJson(request);
    if (!process.env.PORTAL_SETUP_CODE || String(body?.setupCode || "") !== process.env.PORTAL_SETUP_CODE) return json({ error: "Code de configuration invalide." }, 403);
    const email = normalizeEmail(body?.email);
    const firstName = cleanName(body?.firstName);
    const lastName = cleanName(body?.lastName);
    const grade = cleanGrade(body?.grade);
    const password = String(body?.password || "");
    const passwordIssue = passwordError(password);
    if (!email || !firstName || !grade || passwordIssue) return json({ error: passwordIssue || "Le prénom, l’adresse e-mail et le grade sont obligatoires." }, 400);
    const { database, publicUser, listUsers } = await import("../_shared");
    const record = await createPasswordRecord(password);
    const rows = await database("portal_users", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ email, first_name: firstName, last_name: lastName, role: "admin", grade, presence: null, ...record }) });
    const user = rows?.[0];
    if (!user) throw new Error("USER_NOT_CREATED");
    const cookie = await createSession(user.id, request);
    return json({ ok: true, session: publicUser(user, user), users: await listUsers(user) }, 201, { "Set-Cookie": cookie });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_CONTENT_TYPE" || message === "INVALID_JSON") return json({ error: "Formulaire invalide." }, 400);
    if (message === "BODY_TOO_LARGE") return json({ error: "Formulaire trop volumineux." }, 413);
    console.error("Portal initial setup failed", message || "Unknown error");
    return json({ error: "Impossible de créer le premier compte." }, 500);
  }
}
