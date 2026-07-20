import {
  canManage, cleanApprovalStatus, cleanGrade, cleanName, cleanPresence, cleanRole, database,
  deleteSessionsForUser, json, listUsers, manager, publicUser, readJson, requireSession, validCsrfRequest,
} from "../_shared";

export const runtime = "edge";

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowedRoles(actor) {
  return actor.role === "admin" ? new Set(["referent", "senior", "officer"]) : new Set(["senior", "officer"]);
}

function errorResponse(error) {
  const message = error instanceof Error ? error.message : "";
  if (message === "INVALID_CONTENT_TYPE" || message === "INVALID_JSON") return json({ error: "Formulaire invalide." }, 400);
  if (message === "BODY_TOO_LARGE") return json({ error: "Formulaire trop volumineux." }, 413);
  if (message === "DATABASE_REQUEST_FAILED" || message === "DATABASE_INVALID_RESPONSE") return json({ error: "La modification est temporairement indisponible. Reessayez dans quelques minutes." }, 503);
  console.error("Portal user action failed", message || "Unknown error");
  return json({ error: "La modification du compte a echoue." }, 500);
}

function identityPayload(body, role, existing, canChangeGrade) {
  const firstName = cleanName(body?.firstName ?? existing.first_name);
  const lastName = cleanName(body?.lastName ?? existing.last_name);
  const requestedGrade = cleanGrade(body?.grade);
  const grade = canChangeGrade && requestedGrade ? requestedGrade : existing.grade;
  if (!firstName || !grade || !role) return { error: "Le prenom, le grade et le niveau d'acces sont obligatoires." };
  return {
    value: {
      first_name: firstName,
      last_name: lastName,
      grade,
      role,
      presence: ["senior", "officer"].includes(role) ? cleanPresence(body?.presence ?? existing.presence) : null,
    },
  };
}

export async function GET(request) {
  const current = await requireSession(request);
  if (current.error) return current.error;
  try { return json({ session: publicUser(current.user), users: await listUsers() }); }
  catch (error) { return errorResponse(error); }
}

export async function POST() {
  return json({ error: "Les comptes sont crees exclusivement lors de la connexion Discord." }, 405);
}

export async function PATCH(request) {
  if (!validCsrfRequest(request)) return json({ error: "Jeton de securite invalide. Rechargez la page." }, 403);
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
    if (!self && !canManage(current.user, target)) return json({ error: "Vous n'etes pas autorise a modifier ce compte." }, 403);

    const targetStatus = cleanApprovalStatus(target.approval_status) || "approved";
    const requestedStatus = cleanApprovalStatus(body?.approvalStatus);
    if (!self && requestedStatus && requestedStatus !== targetStatus && current.user.role !== "admin") {
      return json({ error: "Seul un administrateur peut valider ou refuser une demande Discord." }, 403);
    }
    if (self && requestedStatus && requestedStatus !== targetStatus) return json({ error: "Vous ne pouvez pas modifier le statut de votre demande." }, 403);

    const requestedRole = cleanRole(body?.role);
    const role = self ? target.role : (allowedRoles(current.user).has(requestedRole) ? requestedRole : target.role);
    const canChangeGrade = self ? current.user.role === "admin" : manager(current.user);
    const identity = identityPayload(body, role, target, canChangeGrade);
    if (identity.error) return json({ error: identity.error }, 400);
    const approvalStatus = self ? targetStatus : (requestedStatus || targetStatus);
    identity.value.approval_status = approvalStatus;
    const changedBlock = typeof body?.blocked === "boolean" && !self && current.user.role === "admin" && target.role !== "admin";
    if (changedBlock) identity.value.blocked = body.blocked;

    const updatedRows = await database(`portal_users?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(identity.value),
    });
    const updated = updatedRows?.[0];
    if (!updated) throw new Error("USER_NOT_UPDATED");
    if ((!self && (changedBlock || approvalStatus !== targetStatus)) || approvalStatus !== "approved") await deleteSessionsForUser(target.id);
    return json({ ok: true, session: publicUser(current.user), users: await listUsers() });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request) {
  if (!validCsrfRequest(request)) return json({ error: "Jeton de securite invalide. Rechargez la page." }, 403);
  const current = await requireSession(request);
  if (current.error) return current.error;
  try {
    const body = await readJson(request);
    const id = String(body?.id || "");
    if (!USER_ID.test(id)) return json({ error: "Compte invalide." }, 400);
    const rows = await database(`portal_users?id=eq.${encodeURIComponent(id)}&select=*`);
    const target = Array.isArray(rows) ? rows[0] : null;
    if (!target) return json({ error: "Compte introuvable." }, 404);
    if (!canManage(current.user, target)) return json({ error: "Vous n'etes pas autorise a supprimer ce compte." }, 403);
    await database(`portal_users?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    return json({ ok: true, session: publicUser(current.user), users: await listUsers() });
  } catch (error) { return errorResponse(error); }
}
