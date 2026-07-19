import {
  canManage, cleanGrade, cleanName, cleanPresence, cleanRole, createPasswordRecord, createSession, database,
  deleteSessionsForUser, json, listUsers, manager, normalizeEmail, passwordError, publicUser, readJson,
  requireSession, validCsrfRequest,
} from "../_shared";

export const runtime = "edge";

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowedRoles(actor) { return actor.role === "admin" ? new Set(["referent", "senior", "officer"]) : new Set(["senior", "officer"]); }
function errorResponse(error) {
  const message = error instanceof Error ? error.message : "";
  if (message === "INVALID_CONTENT_TYPE" || message === "INVALID_JSON") return json({ error: "Formulaire invalide." }, 400);
  if (message === "BODY_TOO_LARGE") return json({ error: "Formulaire trop volumineux." }, 413);
  console.error("Portal user action failed", message || "Unknown error");
  return json({ error: "La modification du compte a échoué." }, 500);
}

function identityPayload(body, role, existing = null) {
  const email = normalizeEmail(body?.email);
  const firstName = cleanName(body?.firstName);
  const lastName = cleanName(body?.lastName);
  const grade = cleanGrade(body?.grade);
  if (!email || !firstName || !lastName || !grade || !role) return { error: "Tous les champs d’identité sont obligatoires." };
  return {
    value: {
      email,
      first_name: firstName,
      last_name: lastName,
      grade,
      role,
      presence: ["senior", "officer"].includes(role) ? cleanPresence(body?.presence ?? existing?.presence) : null,
    },
  };
}

export async function GET(request) {
  const current = await requireSession(request);
  if (current.error) return current.error;
  try { return json({ session: publicUser(current.user, current.user), users: await listUsers(current.user) }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  if (!validCsrfRequest(request)) return json({ error: "Jeton de sécurité invalide. Rechargez la page." }, 403);
  const current = await requireSession(request);
  if (current.error) return current.error;
  if (!manager(current.user)) return json({ error: "Vous n’êtes pas autorisé à créer un compte." }, 403);
  try {
    const body = await readJson(request);
    const role = cleanRole(body?.role);
    if (!allowedRoles(current.user).has(role)) return json({ error: "Niveau d’accès non autorisé." }, 403);
    const identity = identityPayload(body, role);
    if (identity.error) return json({ error: identity.error }, 400);
    const password = String(body?.password || "");
    const passwordIssue = passwordError(password);
    if (passwordIssue) return json({ error: passwordIssue }, 400);
    const record = await createPasswordRecord(password);
    await database("portal_users", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...identity.value, blocked: false, ...record }) });
    return json({ ok: true, session: publicUser(current.user, current.user), users: await listUsers(current.user) }, 201);
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request) {
  if (!validCsrfRequest(request)) return json({ error: "Jeton de sécurité invalide. Rechargez la page." }, 403);
  const current = await requireSession(request);
  if (current.error) return current.error;
  try {
    const body = await readJson(request);
    const id = String(body?.id || "");
    if (!USER_ID.test(id)) return json({ error: "Compte invalide." }, 400);
    const rows = await database(`portal_users?id=eq.${encodeURIComponent(id)}&select=*`);
    const target = Array.isArray(rows) ? rows[0] : null;
    if (!target) return json({ error: "Compte introuvable." }, 404);
    const self = target.id === current.user.id;
    if (!self && !canManage(current.user, target)) return json({ error: "Vous n’êtes pas autorisé à modifier ce compte." }, 403);

    const requestedRole = cleanRole(body?.role);
    const role = self ? target.role : (allowedRoles(current.user).has(requestedRole) ? requestedRole : target.role);
    const identity = identityPayload({ ...body, grade: self && current.user.role !== "admin" ? target.grade : body?.grade }, role, target);
    if (identity.error) return json({ error: identity.error }, 400);
    if (self && !manager(current.user)) identity.value.email = target.email;
    if (self && current.user.role !== "admin") identity.value.grade = target.grade;
    const password = String(body?.password || "");
    const passwordIssue = password ? passwordError(password) : "";
    if (passwordIssue) return json({ error: passwordIssue }, 400);
    if (password) Object.assign(identity.value, await createPasswordRecord(password));
    const changedBlock = typeof body?.blocked === "boolean" && !self && current.user.role === "admin" && target.role !== "admin";
    if (changedBlock) identity.value.blocked = body.blocked;
    const updatedRows = await database(`portal_users?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(identity.value) });
    const updated = updatedRows?.[0];
    if (!updated) throw new Error("USER_NOT_UPDATED");
    let cookie = null;
    if ((!self && (changedBlock || password)) || (self && password)) await deleteSessionsForUser(target.id);
    if (self && password) cookie = await createSession(updated.id, request);
    const viewer = self ? updated : current.user;
    return json({ ok: true, session: publicUser(viewer, viewer), users: await listUsers(viewer) }, 200, cookie ? { "Set-Cookie": cookie } : {});
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request) {
  if (!validCsrfRequest(request)) return json({ error: "Jeton de sécurité invalide. Rechargez la page." }, 403);
  const current = await requireSession(request);
  if (current.error) return current.error;
  try {
    const body = await readJson(request);
    const id = String(body?.id || "");
    if (!USER_ID.test(id)) return json({ error: "Compte invalide." }, 400);
    const rows = await database(`portal_users?id=eq.${encodeURIComponent(id)}&select=*`);
    const target = Array.isArray(rows) ? rows[0] : null;
    if (!target) return json({ error: "Compte introuvable." }, 404);
    if (!canManage(current.user, target)) return json({ error: "Vous n’êtes pas autorisé à supprimer ce compte." }, 403);
    await database(`portal_users?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    return json({ ok: true, session: publicUser(current.user, current.user), users: await listUsers(current.user) });
  } catch (error) { return errorResponse(error); }
}
