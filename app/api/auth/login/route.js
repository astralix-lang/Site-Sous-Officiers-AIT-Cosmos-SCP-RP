import { createSession, database, expiredSessionCookie, isConfigured, json, normalizeEmail, passwordError, readJson, validCsrfRequest, verifyPassword } from "../_shared";

export const runtime = "edge";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = globalThis.__portalSoLoginAttempts || new Map();
globalThis.__portalSoLoginAttempts = attempts;

function permitted(request) {
  const now = Date.now();
  const ip = (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) { attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS }); return true; }
  current.count += 1;
  if (attempts.size > 1000) for (const [key, value] of attempts) if (value.resetAt <= now) attempts.delete(key);
  return current.count <= MAX_ATTEMPTS;
}

export async function POST(request) {
  if (!isConfigured()) return json({ error: "La base des comptes n’est pas configurée." }, 503);
  if (!validCsrfRequest(request)) return json({ error: "Jeton de sécurité invalide. Rechargez la page." }, 403);
  if (!permitted(request)) return json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, 429);
  try {
    const body = await readJson(request);
    const email = normalizeEmail(body?.email);
    const password = String(body?.password || "");
    if (!email || !password || password.length > 256) return json({ error: "Identifiants incorrects." }, 401);
    const rows = await database(`portal_users?email=eq.${encodeURIComponent(email)}&select=*`);
    const user = Array.isArray(rows) ? rows[0] : null;
    const valid = user ? await verifyPassword(user, password) : false;
    if (!user || !valid) return json({ error: "Identifiants incorrects." }, 401);
    if (user.blocked) return json({ error: "Ce compte est bloqué. Contactez un administrateur." }, 403, { "Set-Cookie": expiredSessionCookie(request) });
    const { listUsers, publicUser } = await import("../_shared");
    const cookie = await createSession(user.id, request);
    return json({ ok: true, session: publicUser(user, user), users: await listUsers(user) }, 200, { "Set-Cookie": cookie });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_CONTENT_TYPE" || message === "INVALID_JSON") return json({ error: "Formulaire invalide." }, 400);
    if (message === "BODY_TOO_LARGE") return json({ error: "Formulaire trop volumineux." }, 413);
    console.error("Portal login failed", message || "Unknown error");
    return json({ error: "Connexion momentanément indisponible." }, 503);
  }
}
