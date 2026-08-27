import { dashboardAccess, database, json, listUsers, publicUser, recordAuditLog, requireSession, validCsrfRequest } from "../../_shared";
import { discordAvatarUrl, discordConfig, discordDisplayName, refreshDiscordUser } from "../oauth";

export const runtime = "edge";

function errorResponse(error) {
  const message = error instanceof Error ? error.message : "";
  if (message === "DATABASE_REQUEST_FAILED" || message === "DATABASE_INVALID_RESPONSE") {
    return json({ error: "La synchronisation des photos est temporairement indisponible. Réessayez dans quelques minutes." }, 503);
  }
  console.error("Discord avatar sync failed", message || "Unknown error");
  return json({ error: "La synchronisation des photos n’a pas pu être finalisée." }, 500);
}

export async function POST(request) {
  if (!validCsrfRequest(request)) return json({ error: "Jeton de sécurité invalide. Rechargez la page." }, 403);
  const current = await requireSession(request);
  if (current.error) return current.error;
  if (!dashboardAccess(current.user)) return json({ error: "Seuls les responsables peuvent synchroniser les photos Discord." }, 403);
  const config = discordConfig(request);
  if (!config) return json({ error: "La connexion Discord n’est pas configurée." }, 503);

  try {
    const rows = await database("portal_users?select=id,discord_id,discord_refresh_token,discord_avatar_url");
    const members = Array.isArray(rows) ? rows : [];
    let updated = 0;
    let reconnectRequired = 0;
    let unavailable = 0;

    for (const member of members) {
      const discordId = String(member.discord_id || "");
      const refreshToken = String(member.discord_refresh_token || "");
      if (!/^\d{17,20}$/.test(discordId) || !refreshToken) {
        reconnectRequired += 1;
        continue;
      }
      try {
        const discord = await refreshDiscordUser(config, refreshToken);
        if (String(discord.user?.id || "") !== discordId) {
          unavailable += 1;
          continue;
        }
        const avatarUrl = discordAvatarUrl(discord.user);
        await database(`portal_users?id=eq.${encodeURIComponent(member.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            discord_username: discordDisplayName(discord.user),
            discord_avatar_url: avatarUrl,
            discord_refresh_token: discord.refreshToken || refreshToken,
            discord_token_expires_at: discord.tokenExpiresAt,
          }),
        });
        updated += 1;
      } catch (error) {
        console.warn("Discord avatar refresh skipped", member.id, error instanceof Error ? error.message : "Unknown error");
        unavailable += 1;
      }
    }

    await recordAuditLog({
      actor: current.user,
      category: "profile",
      action: "Photos Discord synchronisées",
      details: `${updated} profil${updated > 1 ? "s" : ""} actualisé${updated > 1 ? "s" : ""} · ${reconnectRequired} reconnexion${reconnectRequired > 1 ? "s" : ""} nécessaire${reconnectRequired > 1 ? "s" : ""}.`,
    }).catch(() => {});

    const users = await listUsers();
    const session = users.find((user) => user.id === current.user.id) || publicUser(current.user);
    return json({ ok: true, updated, reconnectRequired, unavailable, users, session });
  } catch (error) {
    return errorResponse(error);
  }
}
