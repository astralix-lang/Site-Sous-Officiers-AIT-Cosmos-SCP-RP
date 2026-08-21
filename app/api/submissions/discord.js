const TYPE_CONFIG = {
  recommendation: { title: "🏅 Nouvelle recommandation", color: 0x2d66d5, aitLabel: "AIT recommandé" },
  pcs_exp: { title: "🎯 Nouvelle recommandation PCS EXP", color: 0xb97918, aitLabel: "AIT recommandé" },
  observation_hdr: { title: "📝 Nouvelle observation HDR", color: 0x20896b, aitLabel: "AIT observé" },
  observation_so: { title: "👁️ Nouvelle observation SO", color: 0x7957c8, aitLabel: "Nom de l’AIT" },
  sergeant_report: { title: "📋 Rapport nouveau Sous-Officier", color: 0xb97918 },
};

const ROLE_LABELS = {
  admin: "Admin",
  management: "Gérance",
  referent: "Référent SO",
  senior: "Sous-Officier Supérieur",
  officer: "Sous-Officier",
};

const REPORT_CONCLUSIONS = [
  "Passage confirmé en sergent",
  "Prolongation de la semaine de test",
  "Retour caporal-chef",
];

function clean(value, maxLength = 1000) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/@(everyone|here)/gi, "@\u200b$1").trim().slice(0, maxLength)
    : "";
}

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

function validWebhookUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "discord.com" && !url.username && !url.password && /^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname);
  } catch {
    return false;
  }
}

function configFor(type) {
  const config = TYPE_CONFIG[type];
  const webhookUrl = webhookFor(type);
  if (!config || !webhookUrl || !validWebhookUrl(webhookUrl)) throw new Error("DISCORD_WEBHOOK_UNAVAILABLE");
  return { config, webhookUrl };
}

function discordPayload(type, values, senderName, senderPosition) {
  const { config } = configFor(type);
  const safeSenderName = clean(senderName, 120) || "Utilisateur du portail";
  const safeSenderPosition = clean(senderPosition, 60);
  let color = config.color;
  let fields;

  if (type === "sergeant_report") {
    const sergeantName = clean(values?.sergeantName, 100);
    const positivePoints = clean(values?.positivePoints, 950);
    const negativePoints = clean(values?.negativePoints, 950);
    const globalOpinion = clean(values?.globalOpinion, 950);
    const conclusion = clean(values?.conclusion, 100);
    if (!sergeantName || !positivePoints || !negativePoints || !globalOpinion || !REPORT_CONCLUSIONS.includes(conclusion)) throw new Error("DISCORD_SUBMISSION_INVALID");
    color = conclusion === "Passage confirmé en sergent" ? 0x20896b : conclusion === "Retour caporal-chef" ? 0xd64550 : 0xe0a526;
    const conclusionIcon = conclusion === "Passage confirmé en sergent" ? "🟢" : conclusion === "Retour caporal-chef" ? "🔴" : "🟡";
    fields = [
      { name: "👤 Nom du Sergent", value: sergeantName, inline: false },
      { name: "✅ Point positif", value: positivePoints, inline: false },
      { name: "⚠️ Point négatif", value: negativePoints, inline: false },
      { name: "🧭 Avis global", value: globalOpinion, inline: false },
      { name: `${conclusionIcon} Conclusion`, value: `**${conclusion}**`, inline: false },
    ];
  } else {
    const aitName = clean(values?.aitName, 100);
    const author = clean(values?.author, 100);
    const reason = clean(values?.reason, 950);
    const negative = values?.observation === "negative";
    const isObservation = ["observation_hdr", "observation_so"].includes(type);
    if (!aitName || !author || !reason) throw new Error("DISCORD_SUBMISSION_INVALID");
    color = isObservation ? (negative ? 0xd64550 : 0x20896b) : config.color;
    fields = [
      { name: `👤 ${config.aitLabel}`, value: aitName, inline: false },
      { name: type === "observation_hdr" ? "🎖️ S-OFF/-SUP faisant l’observation" : type === "observation_so" ? "🎖️ S-OFF SUP faisant l’observation" : "🎖️ S-OFF/-SUP à l’origine", value: author, inline: false },
      ...(isObservation
        ? [{ name: "📌 Nature de l’observation", value: negative ? "❌ Négative" : "✅ Positive", inline: false }, { name: "📝 Raison", value: reason, inline: false }]
        : [{ name: "📝 Raison", value: reason, inline: false }]),
    ];
  }

  return {
    username: "Portail Sous-Officiers",
    allowed_mentions: { parse: [] },
    embeds: [{
      author: { name: "🛡️ Portail Sous-Officiers • Transmission officielle" },
      title: config.title,
      description: "━━━━━━━━━━━━━━━━━━━━",
      color,
      fields: fields.map((field, index) => ({
        ...field,
        name: `${field.name} :`,
        value: `\u200b\n${field.value}${index < fields.length - 1 ? "\n━━━━━━━━━━━━━━━━━━━━" : ""}`,
      })),
      footer: { text: `🔒 Transmis par ${safeSenderName}${safeSenderPosition ? ` • ${safeSenderPosition}` : ""}` },
      timestamp: new Date().toISOString(),
    }],
  };
}

async function requestDiscord(url, method, payload) {
  const response = await fetch(url, {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("DISCORD_REJECTED");
  return response;
}

export async function sendDiscordSubmission({ type, values, senderName, senderPosition }) {
  const { webhookUrl } = configFor(type);
  const endpoint = new URL(webhookUrl);
  endpoint.searchParams.set("wait", "true");
  const response = await requestDiscord(endpoint.toString(), "POST", discordPayload(type, values, senderName, senderPosition));
  const message = await response.json().catch(() => null);
  return { messageId: /^\d{17,20}$/.test(String(message?.id || "")) ? String(message.id) : "" };
}

export async function updateDiscordSubmission({ type, values, senderName, senderPosition, messageId }) {
  if (!/^\d{17,20}$/.test(String(messageId || ""))) return { updated: false };
  const { webhookUrl } = configFor(type);
  const endpoint = new URL(webhookUrl);
  endpoint.pathname = `${endpoint.pathname}/messages/${encodeURIComponent(String(messageId))}`;
  await requestDiscord(endpoint.toString(), "PATCH", discordPayload(type, values, senderName, senderPosition));
  return { updated: true };
}

export function discordErrorMessage(error) {
  if (error instanceof Error && error.message === "DISCORD_WEBHOOK_UNAVAILABLE") return "Le salon Discord de cette catégorie n’est pas configuré.";
  if (error instanceof Error && error.message === "DISCORD_SUBMISSION_INVALID") return "Les données du formulaire sont invalides.";
  return "Discord n’a pas accepté le message. Réessayez dans un instant.";
}

export { ROLE_LABELS, REPORT_CONCLUSIONS, TYPE_CONFIG };
