import { cookieValue, sameValue } from "../_shared";

const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_ME_URL = "https://discord.com/api/users/@me";

function secureCookie(request) {
  return new URL(request.url).protocol === "https:" ? "; Secure" : "";
}

export function discordConfig(request) {
  const clientId = String(process.env.DISCORD_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.DISCORD_CLIENT_SECRET || "").trim();
  const redirectUri = String(process.env.DISCORD_REDIRECT_URI || "").trim();
  if (!/^\d{17,20}$/.test(clientId) || !clientSecret || !redirectUri) return null;
  try {
    const url = new URL(redirectUri);
    const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((!isLocal && url.protocol !== "https:") || !url.pathname.endsWith("/api/auth/discord/callback")) return null;
    return { clientId, clientSecret, redirectUri: url.toString(), portalOrigin: url.origin };
  } catch { return null; }
}

export function portalRedirect(config, status) {
  const target = new URL("/", config.portalOrigin);
  if (status) target.searchParams.set("discord", status);
  return target.toString();
}

export function redirect(location, headers = {}) {
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store, max-age=0", ...headers } });
}

export function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function oauthStateCookie(state, request) {
  return `portal-so-discord-state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secureCookie(request)}`;
}

export function expiredOauthStateCookie(request) {
  return `portal-so-discord-state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie(request)}`;
}

export function hasValidState(request, state) {
  return /^[a-f0-9]{64}$/i.test(String(state || "")) && sameValue(cookieValue(request, "portal-so-discord-state"), String(state));
}

export async function discordUser(config, code) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code: String(code || ""),
    redirect_uri: config.redirectUri,
  });
  const tokenResponse = await fetch(DISCORD_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const token = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok || !token?.access_token) throw new Error("DISCORD_TOKEN_FAILED");
  const userResponse = await fetch(DISCORD_ME_URL, {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const user = await userResponse.json().catch(() => null);
  if (!userResponse.ok || !/^\d{17,20}$/.test(String(user?.id || ""))) throw new Error("DISCORD_PROFILE_FAILED");
  return user;
}

export function discordDisplayName(user) {
  return String(user?.global_name || user?.username || "Membre Discord").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60) || "Membre Discord";
}
