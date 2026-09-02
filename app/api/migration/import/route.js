export const runtime = "edge";

const DATABASE_URL = "http://database-api:3000";
const TABLES = new Map([
  ["portal_users", "id"],
  ["portal_notifications", "id"],
  ["portal_chats", "id"],
  ["portal_chat_messages", "id"],
  ["portal_sessions", "id"],
  ["portal_audit_logs", "id"],
  ["portal_notification_dismissals", "notification_id,user_id"],
]);
const MAX_BYTES = 6 * 1024 * 1024;

function sameValue(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function response(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

// Endpoint strictement temporaire de migration. Il n'est actif que lorsqu'un
// jeton à usage unique est défini sur le VPS et ne peut écrire que les tables
// du portail dans la base locale privée.
export async function POST(request) {
  const token = String(process.env.PORTAL_MIGRATION_TOKEN || "");
  const localUrl = String(process.env.PORTAL_LOCAL_DATABASE_URL || "").replace(/\/+$/, "");
  if (!token || localUrl !== DATABASE_URL || !sameValue(token, request.headers.get("x-portal-migration-token") || "")) {
    return response({ error: "Indisponible." }, 404);
  }

  const size = Number(request.headers.get("content-length") || 0);
  if (size > MAX_BYTES) return response({ error: "Lot trop volumineux." }, 413);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BYTES) return response({ error: "Lot trop volumineux." }, 413);

  let payload;
  try { payload = JSON.parse(raw); }
  catch { return response({ error: "Format invalide." }, 400); }

  const table = String(payload?.table || "");
  const conflict = TABLES.get(table);
  const rows = Array.isArray(payload?.rows) ? payload.rows : null;
  if (!conflict || !rows || rows.length > 200 || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    return response({ error: "Lot invalide." }, 400);
  }
  if (!rows.length) return response({ ok: true, imported: 0 });

  let result;
  try {
    result = await fetch(`${DATABASE_URL}/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return response({ error: "Base locale indisponible." }, 503);
  }
  if (!result.ok) {
    console.error("Migration import failed", table, result.status);
    return response({ error: "Import impossible." }, 502);
  }
  return response({ ok: true, imported: rows.length });
}
