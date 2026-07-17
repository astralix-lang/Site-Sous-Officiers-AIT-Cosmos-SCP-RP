const TYPE_CONFIG = {
  recommendation: {
    title: "🏅 Nouvelle recommandation",
    color: 0x2d66d5,
    envKey: "DISCORD_WEBHOOK_RECOMMENDATION",
    aitLabel: "AIT recommandé",
  },
  pcs_exp: {
    title: "🎯 Nouvelle recommandation PCS EXP",
    color: 0xb97918,
    envKey: "DISCORD_WEBHOOK_PCS_EXP",
    aitLabel: "AIT recommandé",
  },
  observation_hdr: {
    title: "📝 Nouvelle observation HDR",
    color: 0x20896b,
    envKey: "DISCORD_WEBHOOK_OBSERVATION_HDR",
    aitLabel: "AIT observé",
  },
  observation_so: {
    title: "👁️ Nouvelle observation SO",
    color: 0x7957c8,
    envKey: "DISCORD_WEBHOOK_OBSERVATION_SO",
    aitLabel: "Nom de l’AIT",
  },
  sergeant_report: {
    title: "📋 Rapport nouveau Sous-Officier",
    color: 0xb97918,
    envKey: "DISCORD_WEBHOOK_SERGEANT_REPORT",
  },
};

const REPORT_CONCLUSIONS = [
  "Passage confirmé en sergent",
  "Prolongation de la semaine de test",
  "Retour caporal-chef",
];

function clean(value, maxLength = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request) {
  try {
    const body = await request.json();
    const config = TYPE_CONFIG[body.type];
    if (!config) return Response.json({ error: "Catégorie inconnue." }, { status: 400 });

    const webhookUrl = process.env[config.envKey];
    if (!webhookUrl) return Response.json({ error: "Le salon Discord de cette catégorie n’est pas configuré." }, { status: 503 });

    let fields;
    let embedColor = config.color;
    if (body.type === "sergeant_report") {
      const sergeantName = clean(body.values?.sergeantName, 100);
      const positivePoints = clean(body.values?.positivePoints, 1000);
      const negativePoints = clean(body.values?.negativePoints, 1000);
      const globalOpinion = clean(body.values?.globalOpinion, 1000);
      const conclusion = clean(body.values?.conclusion, 100);
      if (!sergeantName || !positivePoints || !negativePoints || !globalOpinion || !REPORT_CONCLUSIONS.includes(conclusion)) {
        return Response.json({ error: "Veuillez remplir tous les champs du rapport." }, { status: 400 });
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
    } else {
      const aitName = clean(body.values?.aitName, 100);
      const author = clean(body.values?.author, 100);
      const reason = clean(body.values?.reason, 1000);
      const observation = body.values?.observation === "negative" ? "Négative" : "Positive";
      const isObservation = ["observation_hdr", "observation_so"].includes(body.type);
      embedColor = isObservation ? (body.values?.observation === "negative" ? 0xd64550 : 0x20896b) : config.color;
      if (!aitName || !author || !reason) {
        return Response.json({ error: "Veuillez remplir tous les champs obligatoires." }, { status: 400 });
      }
      fields = [
        { name: `👤 ${config.aitLabel}`, value: aitName, inline: false },
        { name: body.type === "observation_hdr" ? "🎖️ S-OFF/-SUP faisant l’observation" : body.type === "observation_so" ? "🎖️ S-OFF SUP faisant l’observation" : "🎖️ S-OFF/-SUP à l’origine", value: author, inline: false },
        ...(isObservation
          ? [{ name: "📌 Nature de l’observation", value: observation === "Négative" ? "❌ Négative" : "✅ Positive", inline: false }, { name: "📝 Raison", value: reason, inline: false }]
          : [{ name: "📝 Raison", value: reason, inline: false }]),
      ];
    }

    fields = fields.map((field, index) => ({
      ...field,
      name: `${field.name} :`,
      value: `\u200b\n${field.value}${index < fields.length - 1 ? "\n━━━━━━━━━━━━━━━━━━━━" : ""}`,
    }));

    const senderName = clean(body.submittedBy?.name, 100) || "Utilisateur du portail";
    const senderRole = clean(body.submittedBy?.role, 100);
    const discordResponse = await fetch(webhookUrl, {
      method: "POST",
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
          footer: { text: `🔒 Transmis par ${senderName}${senderRole ? ` • ${senderRole}` : ""}` },
          timestamp: new Date().toISOString(),
        }],
      }),
    });

    if (!discordResponse.ok) {
      console.error("Discord webhook rejected submission", discordResponse.status);
      return Response.json({ error: "Discord n’a pas accepté le message. Réessayez dans un instant." }, { status: 502 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Submission failed", error);
    return Response.json({ error: "Impossible de transmettre le message." }, { status: 500 });
  }
}
