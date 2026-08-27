import { createSession, database, json, recordAuditLog } from "../_shared";

export const runtime = "edge";

const PREVIEW_HOST = "portail-sous-officiers.astralix964336.chatgpt.site";

function isOpenAiPreview(request) {
  try {
    return process.env.OPENAI_PREVIEW_ACCESS === "enabled" && new URL(request.url).hostname === PREVIEW_HOST;
  } catch {
    return false;
  }
}

export async function GET(request) {
  if (!isOpenAiPreview(request)) return json({ error: "Cet accès est réservé à l’aperçu OpenAI." }, 404);

  try {
    const rows = await database("portal_users?role=eq.admin&select=*&order=created_at.asc");
    const admin = Array.isArray(rows) ? rows.find((user) => !user.blocked && (!user.approval_status || user.approval_status === "approved")) : null;
    if (!admin?.id) return json({ error: "Aucun compte administrateur actif n’est disponible pour l’aperçu." }, 503);

    const sessionCookie = await createSession(admin.id, request);
    await recordAuditLog({ actor: admin, category: "auth", action: "Accès aperçu OpenAI", details: "Ouverture temporaire du portail sans connexion Discord." }).catch(() => {});
    return new Response(null, {
      status: 302,
      headers: {
        Location: new URL("/", request.url).toString(),
        "Set-Cookie": sessionCookie,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("OpenAI preview access failed", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "L’aperçu n’a pas pu être ouvert. Réessayez dans un instant." }, 503);
  }
}
