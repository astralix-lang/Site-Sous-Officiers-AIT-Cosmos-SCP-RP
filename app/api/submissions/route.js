import { database, recordAuditLog, requireSession, validRequestSource } from "../auth/_shared";
import { discordErrorMessage, ROLE_LABELS, REPORT_CONCLUSIONS, sendDiscordSubmission, TYPE_CONFIG } from "./discord";

export const runtime = "edge";
const MAX_BODY_SIZE = 16 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_REQUESTS = 12;
const rateLimits = globalThis.__portalSoSubmissionRateLimits || new Map();
globalThis.__portalSoSubmissionRateLimits = rateLimits;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

function clean(value, maxLength = 1000) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/@(everyone|here)/gi, "@\u200b$1")
    .trim()
    .slice(0, maxLength);
}

function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const item = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}

function sameValue(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function allowedByRateLimit(request) {
  const now = Date.now();
  const ip = (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const current = rateLimits.get(ip);
  if (!current || current.resetAt <= now) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  current.count += 1;
  if (rateLimits.size > 1000) {
    for (const [key, value] of rateLimits) if (value.resetAt <= now) rateLimits.delete(key);
  }
  return current.count <= RATE_MAX_REQUESTS;
}

export async function POST(request) {
  try {
    if (!validRequestSource(request)) return json({ error: "Origine de la requête refusée." }, 403);
    const cookieToken = cookieValue(request, "portal-so-csrf");
    const headerToken = request.headers.get("x-csrf-token") || "";
    if (!sameValue(cookieToken, headerToken)) return json({ error: "Jeton de sécurité invalide. Rechargez la page." }, 403);
    if (!allowedByRateLimit(request)) return json({ error: "Trop d’envois rapprochés. Réessayez dans quelques minutes." }, 429);
    if ((request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() !== "application/json") {
      return json({ error: "Format de requête invalide." }, 415);
    }
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > MAX_BODY_SIZE) return json({ error: "Le formulaire est trop volumineux." }, 413);
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > MAX_BODY_SIZE) return json({ error: "Le formulaire est trop volumineux." }, 413);
    let body;
    try { body = JSON.parse(rawBody); }
    catch { return json({ error: "Corps JSON invalide." }, 400); }

    const config = TYPE_CONFIG[body?.type];
    if (!config) return json({ error: "Catégorie inconnue." }, 400);
    const current = await requireSession(request);
    if (current.error) return current.error;
    const actor = current.user;
    if (body.type === "sergeant_report" && actor.role !== "senior") return json({ error: "Seul le Sous-Officier Supérieur assigné peut envoyer ce rapport." }, 403);

    let storedValues;
    if (body.type === "sergeant_report") {
      const sergeantName = clean(body.values?.sergeantName, 100);
      const positivePoints = clean(body.values?.positivePoints, 950);
      const negativePoints = clean(body.values?.negativePoints, 950);
      const globalOpinion = clean(body.values?.globalOpinion, 950);
      const conclusion = clean(body.values?.conclusion, 100);
      if (!sergeantName || !positivePoints || !negativePoints || !globalOpinion || !REPORT_CONCLUSIONS.includes(conclusion)) {
        return json({ error: "Veuillez remplir tous les champs du rapport." }, 400);
      }
      storedValues = { sergeantName, positivePoints, negativePoints, globalOpinion, conclusion };
    } else {
      const aitName = clean(body.values?.aitName, 100);
      const author = clean(body.values?.author, 100);
      const reason = clean(body.values?.reason, 950);
      const isObservation = ["observation_hdr", "observation_so"].includes(body.type);
      if (!aitName || !author || !reason) return json({ error: "Veuillez remplir tous les champs obligatoires." }, 400);
      storedValues = { aitName, author, reason, ...(isObservation ? { observation: body.values?.observation === "negative" ? "negative" : "positive" } : {}) };
    }

    const senderName = `${actor.first_name || ""} ${actor.last_name || ""}`.trim() || "Utilisateur du portail";
    // Le rôle est une valeur technique (ex. "senior"). On privilégie le
    // grade pour Discord et, à défaut, un libellé français compréhensible.
    const senderPosition = clean(actor.grade, 60) || ROLE_LABELS[actor.role] || "";
    let discordMessage;
    let discordDelivered = true;
    let deliveryWarning = "";
    try {
      discordMessage = await sendDiscordSubmission({ type: body.type, values: storedValues, senderName, senderPosition });
    } catch (error) {
      // Le portail reste la source fiable de l'historique : une configuration
      // Discord manquante ne doit jamais faire perdre le formulaire rempli.
      if (error instanceof Error && error.message === "DISCORD_WEBHOOK_UNAVAILABLE") {
        discordDelivered = false;
        deliveryWarning = "Le formulaire est enregistré dans le portail, mais le salon Discord de cette catégorie doit encore être configuré.";
      } else {
        return json({ error: discordErrorMessage(error) }, 502);
      }
    }
    await database("portal_notifications", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        recipient_ids: [actor.id],
        kind: "info",
        title: "Historique interne de formulaire",
        body: JSON.stringify({
          values: storedValues,
          authorId: actor.id,
          authorName: senderName,
          authorGrade: clean(actor.grade, 60),
          authorRole: clean(actor.role, 40),
          discordMessageId: discordMessage?.messageId || "",
          discordDelivered,
        }),
        target: `__portal_submission_${body.type}`,
      }),
    });
    await recordAuditLog({ actor, category: "form", action: "Formulaire envoyé", details: config.title });
    await database("portal_notifications", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        recipient_ids: [actor.id],
        kind: "form",
        title: `Formulaire envoyé — ${config.title.replace(/^\S+\s+/, "")}`,
        body: discordDelivered ? "Votre formulaire a été transmis sur Discord." : "Votre formulaire a été enregistré dans le portail. L’envoi Discord doit encore être configuré.",
        target: body.type,
      }),
    });
    return json({ ok: true, discordDelivered, ...(deliveryWarning ? { warning: deliveryWarning } : {}) });
  } catch (error) {
    console.error("Submission failed", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Impossible de transmettre le message." }, 500);
  }
}
