import { hasUsers, isConfigured, json, listUsers } from "../_shared";

export const runtime = "edge";

export async function GET(request) {
  if (!isConfigured()) return json({ configured: false, hasUsers: false, session: null, users: [] }, 503);
  try {
    const { getSession, publicUser } = await import("../_shared");
    const current = await getSession(request);
    if (!current) return json({ configured: true, hasUsers: await hasUsers(), session: null, users: [], authProvider: "discord" });
    return json({ configured: true, hasUsers: true, session: publicUser(current.user), users: await listUsers(), authProvider: "discord" });
  } catch (error) {
    console.error("Portal bootstrap failed", error instanceof Error ? error.message : "Unknown error");
    return json({ configured: false, hasUsers: false, session: null, users: [], error: "La base des comptes est momentanement indisponible." }, 503);
  }
}

export async function POST() {
  return json({ error: "La creation manuelle de compte a ete remplacee par Discord." }, 410);
}
