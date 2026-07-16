const TYPE_CONFIG = {
  recommendation: {
    title: "Nouvelle recommandation",
    color: 0x2d66d5,
    envKey: "DISCORD_WEBHOOK_RECOMMENDATION",
    aitLabel: "AIT recommandé",
  },
  pcs_exp: {
    title: "Nouvelle recommandation PCS EXP",
    color: 0xb97918,
    envKey: "DISCORD_WEBHOOK_PCS_EXP",
    aitLabel: "AIT recommandé",
  },
  observation_hdr: {
    title: "Nouvelle observation HDR",
    color: 0x20896b,
    envKey: "DISCORD_WEBHOOK_OBSERVATION_HDR",
    aitLabel: "AIT observé",
  },
  observation_so: {
    title: "Nouvelle observation SO",
    color: 0x7957c8,
    envKey: "DISCORD_WEBHOOK_OBSERVATION_SO",
    aitLabel: "Nom de l’AIT",
  },
};

function clean(value, maxLength = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request) {
  try {
    const body = await request.json();
    const config = TYPE_CONFIG[body.type];
    if (!config) return Response.json({ error: "Catégorie inconnue." }, { status: 400 });

    const aitName = clean(body.values?.aitName, 100);
    const author = clean(body.values?.author, 100);
    const reason = clean(body.values?.reason, 1000);
    const observation = body.values?.observation === "negative" ? "Négative" : "Positive";
    const isObservation = ["observation_hdr", "observation_so"].includes(body.type);
    if (!aitName || !author || !reason) {
      return Response.json({ error: "Veuillez remplir tous les champs obligatoires." }, { status: 400 });
    }

    const webhookUrl = process.env[config.envKey];
    if (!webhookUrl) return Response.json({ error: "Le salon Discord de cette catégorie n’est pas configuré." }, { status: 503 });

    const fields = [
      { name: config.aitLabel, value: aitName, inline: false },
      { name: body.type === "observation_hdr" ? "S-OFF/-SUP faisant l’observation" : body.type === "observation_so" ? "S-OFF SUP faisant l’observation" : "S-OFF/-SUP à l’origine", value: author, inline: false },
      ...(isObservation
        ? [{ name: "Observation", value: observation, inline: true }, { name: "Raison", value: reason, inline: false }]
        : [{ name: "Raison", value: reason, inline: false }]),
    ];

    const senderName = clean(body.submittedBy?.name, 100) || "Utilisateur du portail";
    const senderRole = clean(body.submittedBy?.role, 100);
    const senderEmail = clean(body.submittedBy?.email, 150);
    const discordResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Portail Sous-Officiers",
        allowed_mentions: { parse: [] },
        embeds: [{
          title: config.title,
          color: config.color,
          fields,
          footer: { text: `Transmis par ${senderName}${senderRole ? ` • ${senderRole}` : ""}${senderEmail ? ` • ${senderEmail}` : ""}` },
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
