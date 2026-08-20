import { database, recordAuditLog, requireSession } from "../auth/_shared";

export const runtime = "edge";

const TYPE_CONFIG = {
  recommendation: { title: "🏅 Nouvelle recommandation", color: 0x2d66d5, envKey: "DISCORD_WEBHOOK_RECOMMENDATION", aitLabel: "AIT recommandé" },
  pcs_exp: { title: "🎯 Nouvelle recommandation PCS EXP", color: 0xb97918, envKey: "DISCORD_WEBHOOK_PCS_EXP", aitLabel: "AIT recommandé" },
  observation_hdr: { title: "📝 Nouvelle observation HDR", color: 0x20896b, envKey: "DISCORD_WEBHOOK_OBSERVATION_HDR", aitLabel: "AIT observé" },
  observation_so: { title: "👁️ Nouvelle observation SO", color: 0x7957c8, envKey: "DISCORD_WEBHOOK_OBSERVATION_SO", aitLabel: "Nom de l’AIT" },
  sergeant_report: { title: "📋 Rapport nouveau Sous-Officier", color: 0xb97918, envKey: "DISCORD_WEBHOOK_SERGEANT_REPORT" },
};

const ROLE_LABELS = {
  admin: "Admin",
  management: "Gérance",
  referent: "Référent SO",
  senior: "Sous-Officier Supérieur",
  officer: "Sous-Officier",
};

// Keep variable names explicit: Next.js then makes the secrets available to
// Vercel Edge Functions without exposing them to the browser.
function webhookFor(type) {
  switch (type) {
    case "recommendation": return process.env.DISCORD_WEBHOOK_RECOMMENDATION;
    case "pcs_exp": return process.env.DISCORD_WEBHOOK_PCS_EXP;
    case "observation_hdr": return process.env.DISCORD_WEBHOOK_OBSERVATION_HDR;
    case "observation_so": return process.env.DISCORD_WEBHOOK_OBSERVATION_SO;
    case "sergeant_report": return process.env.DISCORD_WEBHOOK_SERGEANT_REPORT;
    default: return "";
  }
}

const REPORT_CONCLUSIONS = [
  "Passage confirmé en sergent",
  "Prolongation de la semaine de test",
  "Retour caporal-chef",
];
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

function validRequestSource(request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || fetchSite === "cross-site") return false;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
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

function validWebhookUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "discord.com" && !url.username && !url.password && /^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname);
  } catch {
    return false;
  }
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
    const webhookUrl = webhookFor(body.type);
    if (!webhookUrl || !validWebhookUrl(webhookUrl)) return json({ error: "Le salon Discord de cette catégorie n’est pas configuré." }, 503);

    let fields;
    let embedColor = config.color;
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
      embedColor = conclusion === "Passage confirmé en sergent" ? 0x20896b : conclusion === "Retour caporal-chef" ? 0xd64550 : 0xe0a526;
      const conclusionIcon = conclusion === "Passage confirmé en sergent" ? "🟢" : conclusion === "Retour caporal-chef" ? "🔴" : "🟡";
      fields = [
        { name: "👤 Nom du Sergent", value: sergeantName, inline: false },
        { name: "✅ Point positif", value: positivePoints, inline: false },
        { name: "⚠️ Point négatif", value: negativePoints, inline: false },
        { name: "🧭 Avis global", value: globalOpinion, inline: false },
        { name: `${conclusionIcon} Conclusion`, value: `**${conclusion}**`, inline: false },
      ];
      storedValues = { sergeantName, positivePoints, negativePoints, globalOpinion, conclusion };
    } else {
      const aitName = clean(body.values?.aitName, 100);
      const author = clean(body.values?.author, 100);
      const reason = clean(body.values?.reason, 950);
      const negative = body.values?.observation === "negative";
      const isObservation = ["observation_hdr", "observation_so"].includes(body.type);
      embedColor = isObservation ? (negative ? 0xd64550 : 0x20896b) : config.color;
      if (!aitName || !author || !reason) return json({ error: "Veuillez remplir tous les champs obligatoires." }, 400);
      fields = [
        { name: `👤 ${config.aitLabel}`, value: aitName, inline: false },
        { name: body.type === "observation_hdr" ? "🎖️ S-OFF/-SUP faisant l’observation" : body.type === "observation_so" ? "🎖️ S-OFF SUP faisant l’observation" : "🎖️ S-OFF/-SUP à l’origine", value: author, inline: false },
        ...(isObservation
          ? [{ name: "📌 Nature de l’observation", value: negative ? "❌ Négative" : "✅ Positive", inline: false }, { name: "📝 Raison", value: reason, inline: false }]
          : [{ name: "📝 Raison", value: reason, inline: false }]),
      ];
      storedValues = { aitName, author, reason, ...(isObservation ? { observation: negative ? "negative" : "positive" } : {}) };
    }

    fields = fields.map((field, index) => ({
      ...field,
      name: `${field.name} :`,
      value: `\u200b\n${field.value}${index < fields.length - 1 ? "\n━━━━━━━━━━━━━━━━━━━━" : ""}`,
    }));
    const senderName = `${actor.first_name || ""} ${actor.last_name || ""}`.trim() || "Utilisateur du portail";
    // Le rôle est une valeur technique (ex. "senior"). On privilégie le
    // grade pour Discord et, à défaut, un libellé français compréhensible.
    const senderPosition = clean(actor.grade, 60) || ROLE_LABELS[actor.role] || "";
    const discordResponse = await fetch(webhookUrl, {
      method: "POST",
      // Cloudflare Workers n'accepte que "follow" ou "manual".
      // Le statut HTTP est déjà vérifié juste après l'appel.
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Portail Sous-Officiers",
        allowed_mentions: { parse: [] },
        embeds: [{
          author: { name: "🛡️ Portail Sous-Officiers • Transmission officielle" },
          title: config.title,
          description: "━━━━━━━━━━━━━━━━━━━━",
          color: embedColor,
          fields,
          footer: { text: `🔒 Transmis par ${senderName}${senderPosition ? ` • ${senderPosition}` : ""}` },
          timestamp: new Date().toISOString(),
        }],
      }),
    });
    if (!discordResponse.ok) {
      console.error("Discord webhook rejected submission", discordResponse.status);
      return json({ error: "Discord n’a pas accepté le message. Réessayez dans un instant." }, 502);
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
        body: "Votre formulaire a été transmis sur Discord.",
        target: body.type,
      }),
    });
    return json({ ok: true });
  } catch (error) {
    console.error("Submission failed", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Impossible de transmettre le message." }, 500);
  }
}
