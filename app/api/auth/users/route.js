import {
  adminAccess, canManage, cleanApprovalStatus, cleanGrade, cleanName, cleanPresence, cleanRole, database,
  deleteSessionsForUser, json, listUsers, manager, publicUser, readJson, requireSession, validCsrfRequest,
} from "../_shared";

export const runtime = "edge";

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STEAM_ID_64 = /^\d{17}$/;
const DISCORD_ID = /^\d{17,20}$/;
const SPECIALIZATION_FIELDS = {
  specializationInstruction: { column: "specialization_instruction", values: new Set(["Aucune", "Resp Instr", "Instr CATI", "Instr"]) },
  specializationPm: { column: "specialization_pm", values: new Set(["Aucune", "Resp PM", "Référent PM", "PM"]) },
  specializationMdc: { column: "specialization_mdc", values: new Set(["Aucune", "Resp MDC", "Forma MDC", "MDC"]) },
  specializationIng: { column: "specialization_ing", values: new Set(["Aucune", "Resp ING", "Cadre ING", "ING"]) },
};

function allowedRoles(actor) {
  if (actor.role === "admin") return new Set(["management", "referent", "senior", "officer"]);
  return actor.role === "management" ? new Set(["referent", "senior", "officer"]) : new Set(["senior", "officer"]);
}

function errorResponse(error) {
  const message = error instanceof Error ? error.message : "";
  if (message === "INVALID_CONTENT_TYPE" || message === "INVALID_JSON") return json({ error: "Formulaire invalide." }, 400);
  if (message === "BODY_TOO_LARGE") return json({ error: "Formulaire trop volumineux." }, 413);
  if (message === "DATABASE_REQUEST_FAILED" || message === "DATABASE_INVALID_RESPONSE") return json({ error: "La modification est temporairement indisponible. Reessayez dans quelques minutes." }, 503);
  console.error("Portal user action failed", message || "Unknown error");
  return json({ error: "La modification du compte a echoue." }, 500);
}

function identityPayload(body, role, existing, canChangeGrade, canChangeSpecializations) {
  const firstName = cleanName(body?.firstName ?? existing.first_name);
  const lastName = cleanName(body?.lastName ?? existing.last_name);
  const requestedGrade = cleanGrade(body?.grade);
  const grade = canChangeGrade && requestedGrade ? requestedGrade : existing.grade;
  if (!firstName || !grade || !role) return { error: "Le prenom, le grade et le niveau d'acces sont obligatoires." };
  const steamId64 = String(body?.steamId64 ?? existing.steam_id_64 ?? "").replace(/\D/g, "").slice(0, 17);
  const discordContactId = String(body?.discordContactId ?? existing.discord_contact_id ?? existing.discord_id ?? "").replace(/\D/g, "").slice(0, 20);
  if (steamId64 && !STEAM_ID_64.test(steamId64)) return { error: "Le Steam ID 64 doit contenir exactement 17 chiffres." };
  if (discordContactId && !DISCORD_ID.test(discordContactId)) return { error: "L’identifiant Discord doit contenir entre 17 et 20 chiffres." };
  const specializations = {};
  for (const [key, definition] of Object.entries(SPECIALIZATION_FIELDS)) {
    const requested = canChangeSpecializations ? (body?.[key] ?? existing[definition.column] ?? "Aucune") : (existing[definition.column] ?? "Aucune");
    specializations[definition.column] = definition.values.has(requested) ? requested : "Aucune";
  }
  return {
    value: {
      first_name: firstName,
      last_name: lastName,
      grade,
      role,
      presence: ["senior", "officer"].includes(role) ? cleanPresence(body?.presence ?? existing.presence) : null,
      steam_id_64: steamId64 || null,
      discord_contact_id: discordContactId || null,
      ...specializations,
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
    if (!self && requestedStatus && requestedStatus !== targetStatus && !adminAccess(current.user)) {
      return json({ error: "Seul un administrateur peut valider ou refuser une demande Discord." }, 403);
    }
    if (self && requestedStatus && requestedStatus !== targetStatus) return json({ error: "Vous ne pouvez pas modifier le statut de votre demande." }, 403);

    const requestedRole = cleanRole(body?.role);
    const role = self ? target.role : (allowedRoles(current.user).has(requestedRole) ? requestedRole : target.role);
    const canChangeGrade = self ? adminAccess(current.user) : manager(current.user);
    const identity = identityPayload(body, role, target, canChangeGrade, !self || manager(current.user));
    if (identity.error) return json({ error: identity.error }, 400);
    const approvalStatus = self ? targetStatus : (requestedStatus || targetStatus);
    identity.value.approval_status = approvalStatus;
    const changedBlock = typeof body?.blocked === "boolean" && !self && adminAccess(current.user) && target.role !== "admin";
    if (changedBlock) identity.value.blocked = body.blocked;

    const updatedRows = await database(`portal_users?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(identity.value),
    });
    const updated = updatedRows?.[0];
    if (!updated) throw new Error("USER_NOT_UPDATED");
    if ((!self && (changedBlock || approvalStatus !== targetStatus)) || approvalStatus !== "approved") await deleteSessionsForUser(target.id);
    return json({ ok: true, session: self ? publicUser(updated) : publicUser(current.user), users: await listUsers() });
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
