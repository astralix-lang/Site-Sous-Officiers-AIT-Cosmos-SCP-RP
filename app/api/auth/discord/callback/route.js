import { createSession, database, cleanGrade, recordAuditLog } from "../../_shared";
import { discordAvatarUrl, discordConfig, discordDisplayName, discordUser, expiredOauthStateCookie, hasValidState, portalRedirect, redirect } from "../oauth";

export const runtime = "edge";

function discordEmail(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  return user?.verified === true && /^.{1,254}@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

async function firstAdminMissing() {
  const rows = await database("portal_users?role=eq.admin&select=id&limit=1");
  return !Array.isArray(rows) || rows.length === 0;
}

function redirectWithSession(location, request, sessionCookie) {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store, max-age=0" });
  headers.append("Set-Cookie", expiredOauthStateCookie(request));
  headers.append("Set-Cookie", sessionCookie);
  return new Response(null, { status: 302, headers });
}

export async function GET(request) {
  const config = discordConfig(request);
  if (!config) return redirect(new URL("/?discord=not_configured", new URL(request.url).origin).toString());
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const clearState = { "Set-Cookie": expiredOauthStateCookie(request) };
  if (!hasValidState(request, state) || !code) return redirect(portalRedirect(config, "invalid_link"), clearState);
  try {
    const discord = await discordUser(config, code);
    const profile = discord.user;
    const discordId = String(profile.id);
    const email = discordEmail(profile);
    if (!email) return redirect(portalRedirect(config, "email_required"), clearState);
    const byDiscord = await database(`portal_users?discord_id=eq.${encodeURIComponent(discordId)}&select=*`);
    let user = Array.isArray(byDiscord) ? byDiscord[0] : null;
    if (!user) {
      const byEmail = await database(`portal_users?email=eq.${encodeURIComponent(email)}&select=*`);
      user = Array.isArray(byEmail) ? byEmail[0] : null;
    }
    const name = discordDisplayName(profile);
    const bootstrapId = String(process.env.DISCORD_BOOTSTRAP_USER_ID || "").trim();
    const isBootstrapUser = bootstrapId === discordId;
    if (!user && isBootstrapUser) {
      const admins = await database("portal_users?role=eq.admin&discord_id=is.null&select=*&order=created_at.asc&limit=1");
      user = Array.isArray(admins) ? admins[0] : null;
    }
    const existingUser = Boolean(user);
    if (user) {
      const rows = await database(`portal_users?id=eq.${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          discord_id: discordId,
          discord_contact_id: user.discord_contact_id || discordId,
          discord_username: name,
          discord_avatar_url: discordAvatarUrl(profile),
          discord_refresh_token: discord.refreshToken || user.discord_refresh_token || null,
          discord_token_expires_at: discord.tokenExpiresAt,
          approval_status: user.approval_status || "approved",
        }),
      });
      user = Array.isArray(rows) ? rows[0] : user;
    } else {
      const bootstrap = isBootstrapUser && await firstAdminMissing();
      const rows = await database("portal_users", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          email,
          first_name: name,
          last_name: "",
          role: bootstrap ? "admin" : "officer",
          grade: bootstrap ? (cleanGrade(process.env.DISCORD_BOOTSTRAP_GRADE) || "Sergent") : "Sergent",
          presence: bootstrap ? null : "present",
          blocked: false,
          approval_status: bootstrap ? "approved" : "pending",
          discord_id: discordId,
          discord_contact_id: discordId,
          discord_username: name,
          discord_avatar_url: discordAvatarUrl(profile),
          discord_refresh_token: discord.refreshToken || null,
          discord_token_expires_at: discord.tokenExpiresAt,
        }),
      });
      user = Array.isArray(rows) ? rows[0] : null;
    }
    if (!existingUser && user) {
      const details = user.role === "admin" ? "Premier administrateur cr\u00e9\u00e9 et li\u00e9 \u00e0 Discord." : "Demande d\u2019acc\u00e8s cr\u00e9\u00e9e et en attente de validation.";
      await recordAuditLog({ actor: user, category: "account", action: "Compte cr\u00e9\u00e9 avec Discord", details }).catch(() => {});
    }
    if (!user || user.blocked) return redirect(portalRedirect(config, "blocked"), clearState);
    if (user.approval_status !== "approved") return redirect(portalRedirect(config, user.approval_status === "rejected" ? "rejected" : "pending"), clearState);
    const cookie = await createSession(user.id, request);
    await recordAuditLog({ actor: user, category: "auth", action: "Connexion Discord", details: "Connexion au portail r\u00e9ussie." }).catch(() => {});
    return redirectWithSession(portalRedirect(config, "connected"), request, cookie);
  } catch (error) {
    console.error("Discord authentication failed", error instanceof Error ? error.message : "Unknown error");
    return redirect(portalRedirect(config, "failed"), clearState);
  }
}
