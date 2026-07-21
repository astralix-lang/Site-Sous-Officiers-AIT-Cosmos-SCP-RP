import { discordConfig, oauthStateCookie, portalRedirect, randomState, redirect } from "./oauth";

export const runtime = "edge";

export async function GET(request) {
  const config = discordConfig(request);
  if (!config) return redirect(new URL("/?discord=not_configured", new URL(request.url).origin).toString());
  const state = randomState();
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("redirect_uri", config.redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "identify email");
  authorize.searchParams.set("state", state);
  return redirect(authorize.toString(), { "Set-Cookie": oauthStateCookie(state, request) });
}
