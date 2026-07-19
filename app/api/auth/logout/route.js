import { cookieValue, database, digest, expiredSessionCookie, json, validCsrfRequest } from "../_shared";

export const runtime = "edge";

export async function POST(request) {
  if (!validCsrfRequest(request)) return json({ error: "Jeton de sécurité invalide. Rechargez la page." }, 403);
  try {
    const token = cookieValue(request, "portal-so-session");
    if (token) {
      const hash = await digest(token);
      await database(`portal_sessions?token_hash=eq.${encodeURIComponent(hash)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    }
  } catch (error) {
    console.error("Portal logout failed", error instanceof Error ? error.message : "Unknown error");
  }
  return json({ ok: true }, 200, { "Set-Cookie": expiredSessionCookie(request) });
}
