import { database, json, readJson, requireSession, validCsrfRequest } from "../auth/_shared";

export const runtime = "edge";

async function rpc(name, body) {
  return database(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
}

export async function GET(request) {
  try {
    const session = await requireSession(request);
    if (session.error) return session.error;
    const result = await rpc("portal_interview_snapshot", { p_actor: session.user.id });
    return json(result, result.error ? result.status || 400 : 200);
  } catch {
    return json({ error: "Le suivi des entretiens est temporairement indisponible. Réessayez dans un instant." }, 503);
  }
}

export async function POST(request) {
  try {
    if (!validCsrfRequest(request)) return json({ error: "Rechargez la page pour actualiser votre connexion sécurisée." }, 403);
    const session = await requireSession(request);
    if (session.error) return session.error;
    const body = await readJson(request);
    const result = await rpc("portal_interview_action", {
      p_actor: session.user.id,
      p_action: String(body?.action || ""),
      p_data: body && typeof body === "object" ? body : {},
    });
    return json(result, result.error ? result.status || 400 : 200);
  } catch (error) {
    if (["INVALID_JSON", "INVALID_CONTENT_TYPE", "BODY_TOO_LARGE"].includes(error?.message)) return json({ error: "Le formulaire envoyé est invalide." }, 400);
    return json({ error: "L’enregistrement n’a pas pu être confirmé. Actualisez le suivi avant de réessayer." }, 503);
  }
}
