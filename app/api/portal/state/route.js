import { adminAccess, database, json, readJson, recordAuditLog, requireSession, validCsrfRequest } from "../../auth/_shared";
import { discordErrorMessage, updateDiscordSubmission } from "../../submissions/discord";

export const runtime = "edge";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_SIZE = 1024 * 1024;
const SUBMISSION_TYPES = new Set(["recommendation", "pcs_exp", "observation_hdr", "observation_so", "sergeant_report"]);
const QUOTA_CATEGORIES = new Set(["recommendation", "pcs_exp", "observations", "mission_internal"]);
const DEFAULT_QUOTA_TARGETS = { recommendation: 1, pcs_exp: 1, observations: 1, mission_internal: 0 };
const SUBMISSION_TARGET_PREFIX = "__portal_submission_";
const ANNOUNCEMENT_TARGET_PREFIX = "__portal_announcement_";
const ABSENCE_TARGET_PREFIX = "__portal_absence_";
const QUOTA_SETTINGS_ID = "f51a7616-15ea-40c8-aac0-7e265c913521";
const QUOTA_SETTINGS_TARGET = "__portal_quota_settings";
const SUMMARY_SETTINGS_ID = "a148a81a-6d81-46a4-8c82-fd09391b76cc";
const SUMMARY_SETTINGS_TARGET = "__portal_summary_settings";
const ASSIGNMENTS_ID = "c90a8db5-8c52-4a2b-b2a7-503c95dcb2e2";
const ASSIGNMENTS_TARGET = "__portal_sergeant_assignments";
const MISSIONS_ID = "34d09213-9ed9-420f-a3dc-3d730524a3e2";
const MISSIONS_TARGET = "__portal_internal_missions";
const MISSION_TARGET_PREFIX = "__portal_internal_mission_";
const MANAGEMENT_REPORTS_ID = "5b5254f3-f22b-4cb4-935f-cffd73e8bba7";
const MANAGEMENT_REPORTS_TARGET = "__portal_management_reports";
const MANAGEMENT_SETTINGS_ID = "b8d9ba07-0f50-4558-b0af-173790f89ab4";
const MANAGEMENT_SETTINGS_TARGET = "__portal_management_settings";
const SO_MEETING_ID = "cb94e8d0-2fc4-40f3-8504-3e43b7c8a46b";
const SO_MEETING_TARGET = "__portal_so_meeting";
const SO_MEETING_HISTORY_ID = "4e59f012-30d6-4e63-8092-5d4eb2c60262";
const SO_MEETING_HISTORY_TARGET = "__portal_so_meeting_history";
const MEETING_ATTENDANCE_STATUSES = new Set(["present", "absent", "late"]);
const CAPORAL_VOTE_VALUES = new Set(["favorable", "mitige", "defavorable", "sanction"]);
const FILE_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/plain",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function clean(value, max = 1000) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

// Les annonces sont des messages de lecture : contrairement aux champs courts,
// elles conservent volontairement les paragraphes et les listes écrits par le
// responsable. On ne retire que les caractères de contrôle dangereux.
function cleanMultiline(value, max = 1000) {
  return typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max)
    : "";
}

function calendarDate(value) {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : "";
}

function todayInParis() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function numberInRange(value, minimum = 0, maximum = 100) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : minimum;
}

function objectValue(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

function jsonValue(value, fallback) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

function isManager(user) { return ["admin", "management", "referent"].includes(user?.role); }
// Supabase renvoie normalement les colonnes JSON sous forme de tableaux. Des
// anciennes discussions peuvent toutefois contenir ce même tableau encodé en
// texte : on le normalise ici pour que tous leurs membres restent visibles.
function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function uniqueIds(values) { return [...new Set(parseArray(values).map(String).filter((value) => UUID.test(value)))]; }
function chatParticipantIds(chat) { return uniqueIds(chat?.participants); }
// Les routes Vercel s’exécutent en UTC. Toutes les heures affichées par le
// portail sont donc explicitement converties à l’heure française.
function label(date) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(date));
}

function attachmentList(value) {
  const entries = parseArray(value).slice(0, MAX_ATTACHMENTS);
  const result = [];
  for (const item of entries) {
    const type = String(item?.type || "").toLowerCase();
    const name = clean(item?.name, 120).replace(/[<>:"/\\|?*]/g, "_");
    const size = Number(item?.size || 0);
    const dataUrl = String(item?.dataUrl || "");
    const header = new RegExp(`^data:${type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")};base64,`, "i");
    if (!FILE_TYPES.has(type) || !name || !Number.isFinite(size) || size < 1 || size > MAX_ATTACHMENT_SIZE || !header.test(dataUrl)) continue;
    if (dataUrl.length > Math.ceil(MAX_ATTACHMENT_SIZE * 1.38) + 128) continue;
    result.push({ id: UUID.test(String(item?.id || "")) ? String(item.id) : crypto.randomUUID(), name, type, size: Math.floor(size), dataUrl });
  }
  return result;
}

function allowedChat(chat, user) {
  return Boolean(chat && (isManager(user) || chatParticipantIds(chat).includes(String(user.id))));
}

function messageFromRow(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    html: row.html || "",
    text: row.text_content || "",
    attachments: parseArray(row.attachments),
    sentAt: label(row.created_at),
    editedAt: row.edited_at || null,
  };
}

async function allChats(user) {
  const rows = await database("portal_chats?select=*&order=updated_at.desc");
  const chats = parseArray(rows).filter((chat) => allowedChat(chat, user));
  if (!chats.length) return [];
  const messages = parseArray(await database("portal_chat_messages?select=*&order=created_at.asc"));
  return chats.map((chat) => ({
    id: chat.id,
    type: chat.type,
    name: chat.name || "",
    createdBy: chat.created_by,
    participants: chatParticipantIds(chat),
    messages: messages.filter((message) => message.chat_id === chat.id).map(messageFromRow),
    updatedAt: chat.updated_at,
  }));
}

function canReceive(row, userId) {
  const recipients = row.recipient_ids;
  return recipients === null || recipients === undefined || (Array.isArray(recipients) && recipients.includes(userId));
}

function canSeeNotification(row, user) {
  // Les formulaires sont privés par défaut. Les responsables et les SO Sup
  // disposent toutefois d'une vue de supervision complète.
  if (row.kind === "form") {
    if (["admin", "management", "referent", "senior"].includes(user?.role)) return true;
    return Array.isArray(row.recipient_ids) && row.recipient_ids.includes(user.id);
  }
  return canReceive(row, user.id);
}

function announcementFromRow(row, acknowledgedBy, activeMemberIds, userId) {
  const payload = objectValue(jsonValue(row.body, {}));
  const readers = new Set(parseArray(acknowledgedBy).filter((id) => activeMemberIds.has(id)));
  return {
    id: row.id,
    title: String(row.title || "Annonce sans titre").slice(0, 140),
    content: cleanMultiline(payload.content, 2_400),
    pinned: payload.pinned === true,
    publishedBy: clean(payload.publishedBy, 120) || "Responsable du portail",
    publishedAt: row.created_at,
    updatedAt: payload.updatedAt || null,
    read: readers.has(String(userId)),
    readCount: readers.size,
    audienceCount: activeMemberIds.size,
  };
}

async function announcementsFor(user) {
  const [rows, receipts, users] = await Promise.all([
    database("portal_notifications?select=*&order=created_at.desc&limit=200"),
    database("portal_notification_dismissals?select=notification_id,user_id"),
    database("portal_users?select=id,blocked,approval_status"),
  ]);
  const activeMemberIds = new Set(parseArray(users)
    .filter((member) => !member.blocked && (!member.approval_status || member.approval_status === "approved"))
    .map((member) => String(member.id)));
  const receiptMap = new Map();
  for (const receipt of parseArray(receipts)) {
    const announcementId = String(receipt.notification_id || "");
    if (!announcementId || !activeMemberIds.has(String(receipt.user_id || ""))) continue;
    if (!receiptMap.has(announcementId)) receiptMap.set(announcementId, []);
    receiptMap.get(announcementId).push(String(receipt.user_id));
  }
  return parseArray(rows)
    .filter((row) => String(row.target || "").startsWith(ANNOUNCEMENT_TARGET_PREFIX))
    .map((row) => announcementFromRow(row, receiptMap.get(String(row.id)) || [], activeMemberIds, user.id))
    .sort((left, right) => Number(right.pinned) - Number(left.pinned) || new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime());
}

async function notificationsFor(user) {
  const [rows, dismissed] = await Promise.all([
    database("portal_notifications?select=*&order=created_at.desc&limit=200"),
    database(`portal_notification_dismissals?user_id=eq.${encodeURIComponent(user.id)}&select=notification_id`),
  ]);
  const dismissedIds = new Set(parseArray(dismissed).map((row) => row.notification_id));
  return parseArray(rows).filter((row) => !String(row.target || "").startsWith("__portal_") && canSeeNotification(row, user) && !dismissedIds.has(row.id)).map((row) => ({
    id: row.id,
    recipients: row.recipient_ids === null ? null : parseArray(row.recipient_ids),
    kind: row.kind,
    title: row.title,
    text: row.body,
    target: row.target,
    createdAt: row.created_at,
  }));
}

function auditLogFromRow(row) {
  return {
    id: row.id,
    actorId: row.actor_id || "system",
    actorName: row.actor_name || "Syst\u00e8me",
    actorRole: row.actor_role || "",
    category: row.category || "system",
    action: row.action || "Action du portail",
    details: row.details || "",
    createdAt: row.created_at,
    displayAt: label(row.created_at),
  };
}

async function auditLogsFor(user) {
  try {
    const rows = parseArray(await database("portal_audit_logs?select=*&order=created_at.desc&limit=500"));
    const logs = rows.map(auditLogFromRow);
    return isManager(user) ? logs : logs.filter((entry) => entry.actorId === user.id);
  } catch (error) {
    console.error("Portal audit log read failed", error instanceof Error ? error.message : "Unknown error");
    return [];
  }
}

function submissionFromRow(row) {
  let payload = {};
  try { payload = objectValue(JSON.parse(row.body || "{}")); } catch { payload = {}; }
  return {
    id: row.id,
    type: String(row.target || "").slice(SUBMISSION_TARGET_PREFIX.length),
    values: objectValue(payload.values),
    authorId: payload.authorId || "",
    authorName: payload.authorName || "Membre du portail",
    authorGrade: payload.authorGrade || "",
    authorRole: payload.authorRole || "",
    createdAt: row.created_at,
    displayAt: label(row.created_at),
    editedAt: payload.editedAt || null,
    editedBy: payload.editedBy || null,
  };
}

async function submissionsFor() {
  const rows = await database("portal_notifications?select=*&order=created_at.desc&limit=1000");
  return parseArray(rows).filter((row) => SUBMISSION_TYPES.has(String(row.target || "").slice(SUBMISSION_TARGET_PREFIX.length))).map(submissionFromRow);
}

function absenceValues(value) {
  const source = objectValue(value);
  const startDate = calendarDate(source.startDate);
  const endDate = calendarDate(source.endDate);
  const reason = cleanMultiline(source.reason, 1_500);
  return startDate && endDate && startDate <= endDate && reason ? { startDate, endDate, reason } : null;
}

function absenceFromRow(row) {
  const payload = objectValue(jsonValue(row?.body, {}));
  const values = absenceValues(payload);
  if (!values || !UUID.test(String(row?.id || "")) || !UUID.test(String(payload.authorId || ""))) return null;
  return {
    id: row.id,
    authorId: payload.authorId,
    authorName: clean(payload.authorName, 120) || "Membre du portail",
    authorGrade: clean(payload.authorGrade, 60),
    authorRole: clean(payload.authorRole, 40),
    ...values,
    createdAt: Number.isFinite(new Date(row.created_at).getTime()) ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

async function absencesFor() {
  const rows = await database("portal_notifications?select=*&order=created_at.desc&limit=1000");
  return parseArray(rows)
    .filter((row) => String(row?.target || "").startsWith(ABSENCE_TARGET_PREFIX))
    .map(absenceFromRow)
    .filter(Boolean)
    .sort((left, right) => right.startDate.localeCompare(left.startDate) || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function absenceIsActive(absence, day = todayInParis()) {
  return absence?.startDate <= day && absence?.endDate >= day;
}

async function saveAbsence(absence) {
  const values = absenceValues(absence);
  if (!values || !UUID.test(String(absence?.id || "")) || !UUID.test(String(absence?.authorId || ""))) throw new Error("Absence invalide.");
  await database("portal_notifications", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id: absence.id,
      recipient_ids: [absence.authorId],
      kind: "info",
      title: `Absence — ${clean(absence.authorName, 120) || "Membre du portail"}`,
      body: JSON.stringify({ ...values, authorId: absence.authorId, authorName: clean(absence.authorName, 120), authorGrade: clean(absence.authorGrade, 60), authorRole: clean(absence.authorRole, 40) }),
      target: `${ABSENCE_TARGET_PREFIX}${absence.id}`,
    }),
  });
}

// Les absences sont une source commune pour l'effectif et la réunion SO.
// Leur suppression passe par ce point unique afin de retirer aussi les
// éventuels accusés de lecture liés à la déclaration.
async function removeAbsence(id) {
  const target = `${ABSENCE_TARGET_PREFIX}${id}`;
  const rows = await database(`portal_notifications?id=eq.${encodeURIComponent(id)}&target=eq.${encodeURIComponent(target)}&select=*`);
  const row = parseArray(rows)[0];
  if (!row) return null;
  await database(`portal_notification_dismissals?notification_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  await database(`portal_notifications?id=eq.${encodeURIComponent(id)}&target=eq.${encodeURIComponent(target)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  const remaining = parseArray(await database(`portal_notifications?id=eq.${encodeURIComponent(id)}&target=eq.${encodeURIComponent(target)}&select=id`));
  if (remaining.length) throw new Error("ABSENCE_DELETE_NOT_CONFIRMED");
  return absenceFromRow(row);
}

// Les transmissions servent à la fois d'historique, de source du résumé et de
// compteur de quotas. La suppression passe donc par ce point unique : on
// retire aussi les accusés de lecture associés, puis on vérifie que la ligne a
// bien disparu avant de renvoyer l'état recalculé au portail.
async function removeSubmission(id, type) {
  const target = `${SUBMISSION_TARGET_PREFIX}${type}`;
  const rows = await database(`portal_notifications?id=eq.${encodeURIComponent(id)}&target=eq.${encodeURIComponent(target)}&select=*`);
  const submission = parseArray(rows)[0];
  if (!submission) return null;
  await database(`portal_notification_dismissals?notification_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  await database(`portal_notifications?id=eq.${encodeURIComponent(id)}&target=eq.${encodeURIComponent(target)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  const remaining = parseArray(await database(`portal_notifications?id=eq.${encodeURIComponent(id)}&target=eq.${encodeURIComponent(target)}&select=id`));
  if (remaining.length) throw new Error("SUBMISSION_DELETE_NOT_CONFIRMED");
  return submissionFromRow(submission);
}

async function removeSubmissionsByType(type) {
  const target = `${SUBMISSION_TARGET_PREFIX}${type}`;
  const rows = parseArray(await database(`portal_notifications?target=eq.${encodeURIComponent(target)}&select=id`));
  await Promise.all(rows.map(async (row) => {
    if (!UUID.test(String(row.id || ""))) return;
    await database(`portal_notification_dismissals?notification_id=eq.${encodeURIComponent(row.id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  }));
  await database(`portal_notifications?target=eq.${encodeURIComponent(target)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  return rows.length;
}

function normalizeQuotaTargets(value) {
  const source = objectValue(value);
  return Object.fromEntries(Object.keys(DEFAULT_QUOTA_TARGETS).map((key) => [key, numberInRange(source[key] ?? DEFAULT_QUOTA_TARGETS[key]) ]));
}

function normalizeExemptions(value) {
  return Object.fromEntries(Object.entries(objectValue(value)).filter(([id, enabled]) => UUID.test(id) && enabled === true));
}

async function quotaState(submissions) {
  const settings = await currentQuotaSettings();
  const resetAt = settings.reset_at ? new Date(settings.reset_at).getTime() : 0;
  const counts = {};
  for (const submission of submissions) {
    if (new Date(submission.createdAt).getTime() < resetAt) continue;
    if (!counts[submission.authorId]) counts[submission.authorId] = {};
    const memberCounts = counts[submission.authorId];
    memberCounts[submission.type] = (memberCounts[submission.type] || 0) + 1;
    if (["observation_hdr", "observation_so"].includes(submission.type)) {
      memberCounts.observations = (memberCounts.observations || 0) + 1;
    }
  }
  const missionCounts = objectValue(settings.mission_counts);
  for (const [userId, value] of Object.entries(missionCounts)) {
    if (!UUID.test(userId)) continue;
    if (!counts[userId]) counts[userId] = {};
    counts[userId].mission_internal = numberInRange(value);
  }
  return {
    targets: normalizeQuotaTargets(settings.targets),
    counts,
    exemptions: normalizeExemptions(settings.exemptions),
    resetAt: settings.reset_at || null,
  };
}

async function stateFor(user) {
  const [chats, notifications, announcements, auditLogs, allSubmissions, summarySettings, sergeantAssignments, allMissions, allManagementReports, managementReportSettings, loadedMeeting, soMeetingHistory, allAbsences] = await Promise.all([
    allChats(user), notificationsFor(user), announcementsFor(user), auditLogsFor(user), submissionsFor(), summarySettingsFor(), assignmentsFor(), missionsFor(), managementReportsFor(), managementReportSettingsFor(), meetingFor(), meetingHistoryFor(), absencesFor(),
  ]);
  const soMeeting = await resetArchivedMeetingDraft(loadedMeeting, soMeetingHistory);
  const assignedSergeants = new Set(sergeantAssignments.filter((assignment) => assignment.observerId === user.id).map((assignment) => assignment.sergeantId));
  const managementReports = isManager(user) ? allManagementReports : allManagementReports.filter((report) => report.authorId === user.id || (user.role === "senior" && assignedSergeants.has(report.authorId)));
  const missions = isManager(user) ? allMissions : allMissions.filter((mission) => mission.userId === user.id);
  const absences = isManager(user) ? allAbsences : allAbsences.filter((absence) => absence.authorId === user.id);
  return { chats, notifications, announcements, auditLogs, submissions: allSubmissions, quotas: await quotaState(allSubmissions), summarySettings, sergeantAssignments, missions, managementReports, managementReportSettings, soMeeting, soMeetingHistory, absences };
}

function canReviewManagementReport(actor, report, assignments) {
  return isManager(actor) || (actor?.role === "senior" && assignments.some((assignment) => assignment.observerId === actor.id && assignment.sergeantId === report?.authorId));
}

async function chatById(id) {
  if (!UUID.test(id)) return null;
  const rows = await database(`portal_chats?id=eq.${encodeURIComponent(id)}&select=*`);
  const chat = parseArray(rows)[0];
  return chat ? { ...chat, participants: chatParticipantIds(chat) } : null;
}

async function validMembers(ids, actorId) {
  const allowed = uniqueIds(ids).filter((id) => id !== actorId);
  if (!allowed.length) return [];
  const rows = await database("portal_users?select=id,blocked,approval_status");
  const active = new Set(parseArray(rows).filter((row) => !row.blocked && (!row.approval_status || row.approval_status === "approved")).map((row) => row.id));
  return allowed.filter((id) => active.has(id));
}

async function portalUser(id) {
  if (!UUID.test(id)) return null;
  const rows = await database(`portal_users?id=eq.${encodeURIComponent(id)}&select=id,role,grade,presence,blocked,approval_status,first_name,last_name`);
  const user = parseArray(rows)[0];
  return user && !user.blocked && (!user.approval_status || user.approval_status === "approved") ? user : null;
}

async function createChatOnFirstMessage(chatId, draft, actor) {
  if (!UUID.test(chatId)) return null;
  const type = draft?.type === "group" ? "group" : draft?.type === "direct" ? "direct" : "";
  if (!type) return null;
  const members = await validMembers(draft?.memberIds, actor.id);
  if ((type === "direct" && members.length !== 1) || (type === "group" && members.length < 2)) return null;
  const name = type === "group" ? clean(draft?.name, 60) : null;
  if (type === "group" && !name) return null;
  const payload = { id: chatId, type, name, created_by: actor.id, participants: [actor.id, ...members] };
  await database("portal_chats", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload) });
  return payload;
}

async function createNotification({ recipients = null, kind = "info", title, text, target = "home" }) {
  const payload = {
    id: crypto.randomUUID(),
    recipient_ids: recipients === null ? null : uniqueIds(recipients),
    kind: ["form", "message", "info"].includes(kind) ? kind : "info",
    title: clean(title, 140),
    body: clean(text, 360),
    target: clean(target, 60) || "home",
  };
  if (!payload.title || !payload.body) return;
  await database("portal_notifications", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload) });
}

function submissionValues(type, value) {
  const values = objectValue(value);
  if (!SUBMISSION_TYPES.has(type)) return null;
  if (type === "sergeant_report") {
    const result = {
      sergeantName: clean(values.sergeantName, 100),
      positivePoints: clean(values.positivePoints, 950),
      negativePoints: clean(values.negativePoints, 950),
      globalOpinion: clean(values.globalOpinion, 950),
      conclusion: clean(values.conclusion, 100),
    };
    return Object.values(result).every(Boolean) ? result : null;
  }
  const result = {
    aitName: clean(values.aitName, 100),
    author: clean(values.author, 100),
    reason: clean(values.reason, 950),
  };
  if (["observation_hdr", "observation_so"].includes(type)) result.observation = values.observation === "negative" ? "negative" : "positive";
  return result.aitName && result.author && result.reason ? result : null;
}

async function updateQuotaSettings(values) {
  const current = await currentQuotaSettings();
  await database(`portal_notifications?id=eq.${encodeURIComponent(QUOTA_SETTINGS_ID)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ body: JSON.stringify({ ...current, ...values, updated_at: new Date().toISOString() }) }),
  });
}

async function sharedRecord(id, target, title, fallback) {
  const rows = await database(`portal_notifications?id=eq.${encodeURIComponent(id)}&select=*`);
  const row = parseArray(rows)[0];
  if (row) return jsonValue(row.body, fallback);
  try {
    await database("portal_notifications", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ id, recipient_ids: null, kind: "info", title, body: JSON.stringify(fallback), target }),
    });
  } catch { /* Création concurrente : la valeur par défaut est sûre. */ }
  return fallback;
}

async function saveSharedRecord(id, target, title, value) {
  await sharedRecord(id, target, title, value);
  await database(`portal_notifications?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ body: JSON.stringify(value), target, title }),
  });
}

async function currentQuotaSettings() {
  const rows = await database(`portal_notifications?id=eq.${encodeURIComponent(QUOTA_SETTINGS_ID)}&select=*`);
  const row = parseArray(rows)[0];
  if (row) {
    try { return { targets: DEFAULT_QUOTA_TARGETS, exemptions: {}, mission_counts: {}, ...objectValue(JSON.parse(row.body || "{}")) }; }
    catch { return { targets: DEFAULT_QUOTA_TARGETS, exemptions: {}, mission_counts: {} }; }
  }
  const initial = { targets: DEFAULT_QUOTA_TARGETS, exemptions: {}, mission_counts: {} };
  try {
    await database("portal_notifications", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ id: QUOTA_SETTINGS_ID, recipient_ids: null, kind: "info", title: "Réglages internes de quotas", body: JSON.stringify(initial), target: QUOTA_SETTINGS_TARGET }),
    });
  } catch { /* Une autre requête a pu créer la ligne au même instant. */ }
  return initial;
}

async function summarySettingsFor() {
  const value = await sharedRecord(SUMMARY_SETTINGS_ID, SUMMARY_SETTINGS_TARGET, "Réglages internes du résumé", { activityResetAt: null, rankingResetAt: null });
  return { activityResetAt: typeof value?.activityResetAt === "string" ? value.activityResetAt : null, rankingResetAt: typeof value?.rankingResetAt === "string" ? value.rankingResetAt : null };
}

async function assignmentsFor() {
  const value = await sharedRecord(ASSIGNMENTS_ID, ASSIGNMENTS_TARGET, "Assignations internes des Sergents", []);
  return parseArray(value).filter((assignment) => UUID.test(String(assignment?.id || "")) && UUID.test(String(assignment?.sergeantId || "")) && UUID.test(String(assignment?.observerId || ""))).map((assignment) => ({
    id: assignment.id,
    sergeantId: assignment.sergeantId,
    observerId: assignment.observerId,
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(assignment.dueDate || "")) ? assignment.dueDate : "",
    status: assignment.status === "completed" ? "completed" : "active",
    assignedAt: typeof assignment.assignedAt === "string" ? assignment.assignedAt : null,
    reminderAt: typeof assignment.reminderAt === "string" ? assignment.reminderAt : null,
    completedAt: typeof assignment.completedAt === "string" ? assignment.completedAt : null,
  }));
}

async function saveAssignments(assignments) {
  await saveSharedRecord(ASSIGNMENTS_ID, ASSIGNMENTS_TARGET, "Assignations internes des Sergents", assignments);
}

function missionDocumentUrl(value) {
  try {
    const url = new URL(clean(value, 1600));
    const isGoogleDocument = url.hostname === "docs.google.com" && url.pathname.startsWith("/document/d/");
    const isGoogleDrive = url.hostname === "drive.google.com";
    return url.protocol === "https:" && !url.username && !url.password && (isGoogleDocument || isGoogleDrive) ? url.toString() : "";
  } catch {
    return "";
  }
}

function missionValues(value) {
  const source = objectValue(value);
  const title = clean(source.title, 100);
  const documentUrl = missionDocumentUrl(source.documentUrl);
  return title && documentUrl ? { title, documentUrl } : null;
}

function missionsFromValue(value) {
  return parseArray(value).filter((mission) => UUID.test(String(mission?.id || "")) && UUID.test(String(mission?.userId || ""))).map((mission) => {
    const created = new Date(mission.createdAt || mission.submittedAt || "");
    const createdAt = Number.isFinite(created.getTime()) ? created.toISOString() : new Date().toISOString();
    const status = mission.status === "validated" ? "validated" : mission.status === "rejected" ? "rejected" : "pending";
    return {
      id: mission.id,
      userId: mission.userId,
      userName: clean(mission.userName, 120) || "Membre du portail",
      grade: clean(mission.grade, 60),
      title: clean(mission.title, 100),
      documentUrl: missionDocumentUrl(mission.documentUrl),
      status,
      createdAt,
      submittedAt: label(createdAt),
      validatedBy: status === "validated" ? clean(mission.validatedBy, 120) : "",
      validatedAt: status === "validated" && Number.isFinite(new Date(mission.validatedAt).getTime()) ? new Date(mission.validatedAt).toISOString() : null,
      rejectedBy: status === "rejected" ? clean(mission.rejectedBy, 120) : "",
      rejectedAt: status === "rejected" && Number.isFinite(new Date(mission.rejectedAt).getTime()) ? new Date(mission.rejectedAt).toISOString() : null,
    };
  }).filter((mission) => mission.title && mission.documentUrl).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function missionTarget(id) { return `${MISSION_TARGET_PREFIX}${id}`; }

function missionFromRow(row) {
  const payload = objectValue(jsonValue(row?.body, {}));
  return missionsFromValue([{ ...payload, id: row?.id, title: row?.title || payload.title, createdAt: payload.createdAt || row?.created_at }])[0] || null;
}

async function legacyMissionsFor() {
  return missionsFromValue(await sharedRecord(MISSIONS_ID, MISSIONS_TARGET, "Documents de missions internes", []));
}

async function missionRows() {
  const rows = await database("portal_notifications?select=*&order=created_at.desc&limit=1000");
  return parseArray(rows).filter((row) => String(row?.target || "").startsWith(MISSION_TARGET_PREFIX)).map(missionFromRow).filter(Boolean);
}

// Chaque mission possède maintenant sa propre ligne. L’ancien document JSON
// reste seulement une source de compatibilité, afin qu’un envoi simultané ne
// puisse plus écraser la mission d’un autre membre.
async function missionsFor() {
  const [legacy, individual] = await Promise.all([legacyMissionsFor(), missionRows()]);
  const combined = new Map();
  for (const mission of legacy) combined.set(mission.id, mission);
  for (const mission of individual) combined.set(mission.id, mission);
  return [...combined.values()].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

async function saveMission(mission) {
  const normalized = missionsFromValue([mission])[0];
  if (!normalized) throw new Error("Mission interne invalide.");
  await database("portal_notifications?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: normalized.id,
      recipient_ids: [normalized.userId],
      kind: "info",
      title: normalized.title,
      body: JSON.stringify(normalized),
      target: missionTarget(normalized.id),
    }),
  });
}

async function removeMission(missionId) {
  await database(`portal_notifications?id=eq.${encodeURIComponent(missionId)}&target=eq.${encodeURIComponent(missionTarget(missionId))}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  const legacy = await legacyMissionsFor();
  if (legacy.some((mission) => mission.id === missionId)) {
    await saveSharedRecord(MISSIONS_ID, MISSIONS_TARGET, "Documents de missions internes", legacy.filter((mission) => mission.id !== missionId));
  }
}

async function clearMissions() {
  const rows = await missionRows();
  await Promise.all(rows.map((mission) => database(`portal_notifications?id=eq.${encodeURIComponent(mission.id)}&target=eq.${encodeURIComponent(missionTarget(mission.id))}`, { method: "DELETE", headers: { Prefer: "return=minimal" } })));
  await saveSharedRecord(MISSIONS_ID, MISSIONS_TARGET, "Documents de missions internes", []);
}

function managementReportValues(value) {
  const source = objectValue(value);
  const occurred = new Date(String(source.occurredAt || ""));
  if (!Number.isFinite(occurred.getTime())) return null;
  const result = {
    occurredAt: occurred.toISOString(),
    managementType: clean(source.managementType, 100),
    description: clean(source.description, 1500),
    positivePoint: clean(source.positivePoint, 950),
    negativePoint: clean(source.negativePoint, 950),
  };
  return Object.values(result).every(Boolean) ? result : null;
}

function managementReportsFromValue(value) {
  return parseArray(value).filter((report) => UUID.test(String(report?.id || "")) && UUID.test(String(report?.authorId || "")) && Number.isFinite(new Date(report?.occurredAt).getTime())).map((report) => ({
    id: report.id,
    authorId: report.authorId,
    authorName: clean(report.authorName, 120) || "Membre du portail",
    authorGrade: clean(report.authorGrade, 60),
    authorRole: clean(report.authorRole, 40),
    occurredAt: new Date(report.occurredAt).toISOString(),
    managementType: clean(report.managementType, 100),
    description: clean(report.description, 1500),
    positivePoint: clean(report.positivePoint, 950),
    negativePoint: clean(report.negativePoint, 950),
    createdAt: typeof report.createdAt === "string" ? report.createdAt : new Date().toISOString(),
    comments: parseArray(report.comments).filter((comment) => UUID.test(String(comment?.id || "")) && UUID.test(String(comment?.authorId || "")) && clean(comment?.content, 1000)).map((comment) => ({
      id: comment.id,
      authorId: comment.authorId,
      authorName: clean(comment.authorName, 120) || "Responsable",
      authorGrade: clean(comment.authorGrade, 60),
      authorRole: clean(comment.authorRole, 40),
      content: clean(comment.content, 1000),
      createdAt: typeof comment.createdAt === "string" ? comment.createdAt : new Date().toISOString(),
      editedAt: typeof comment.editedAt === "string" ? comment.editedAt : null,
    })),
  })).filter((report) => report.managementType && report.description && report.positivePoint && report.negativePoint);
}

async function managementReportsFor() {
  return managementReportsFromValue(await sharedRecord(MANAGEMENT_REPORTS_ID, MANAGEMENT_REPORTS_TARGET, "Rapports internes de gérance", []));
}

async function saveManagementReports(reports) {
  await saveSharedRecord(MANAGEMENT_REPORTS_ID, MANAGEMENT_REPORTS_TARGET, "Rapports internes de gérance", reports);
}

async function managementReportSettingsFor() {
  const value = await sharedRecord(MANAGEMENT_SETTINGS_ID, MANAGEMENT_SETTINGS_TARGET, "Réglages internes des rapports de gérance", { rankingResetAt: null });
  return { rankingResetAt: typeof value?.rankingResetAt === "string" ? value.rankingResetAt : null };
}

async function saveManagementReportSettings(value) {
  await saveSharedRecord(MANAGEMENT_SETTINGS_ID, MANAGEMENT_SETTINGS_TARGET, "Réglages internes des rapports de gérance", { rankingResetAt: value?.rankingResetAt || null });
}

function meetingAttendanceFromValue(value) {
  return parseArray(value).filter((entry) => UUID.test(String(entry?.userId || ""))).slice(0, 300).map((entry) => ({
    userId: entry.userId,
    status: MEETING_ATTENDANCE_STATUSES.has(entry.status) ? entry.status : "present",
    note: clean(entry.note, 1200),
  }));
}

function meetingCaporalVotesFromValue(value) {
  return parseArray(value).slice(0, 100).map((entry) => ({
    id: UUID.test(String(entry?.id || "")) ? entry.id : crypto.randomUUID(),
    name: clean(entry?.name, 140),
    vote: CAPORAL_VOTE_VALUES.has(entry?.vote) ? entry.vote : "favorable",
    note: clean(entry?.note, 1200),
  }));
}

function meetingFromValue(value) {
  const source = objectValue(value);
  const occurredAt = Number.isFinite(new Date(source.occurredAt).getTime()) ? new Date(source.occurredAt).toISOString() : new Date().toISOString();
  return {
    occurredAt,
    attendance: meetingAttendanceFromValue(source.attendance),
    improvementAxes: clean(source.improvementAxes, 6000),
    caporalVotes: meetingCaporalVotesFromValue(source.caporalVotes),
    suggestions: clean(source.suggestions, 6000),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
    updatedBy: UUID.test(String(source.updatedBy || "")) ? source.updatedBy : "",
  };
}

async function meetingFor() {
  return meetingFromValue(await sharedRecord(SO_MEETING_ID, SO_MEETING_TARGET, "Réunion SO en cours", {
    occurredAt: new Date().toISOString(), attendance: [], improvementAxes: "", caporalVotes: [], suggestions: "", updatedAt: null, updatedBy: "",
  }));
}

async function meetingWithPresenceSynced(value) {
  const meeting = meetingFromValue(value);
  const absentIds = new Set((await absencesFor())
    .filter((absence) => absenceIsActive(absence))
    .map((absence) => absence.authorId)
    .filter((id) => UUID.test(String(id))));
  if (!absentIds.size) return meeting;
  const attendance = meeting.attendance.map((entry) => absentIds.has(entry.userId) ? { ...entry, status: "absent" } : entry);
  const presentIds = new Set(attendance.map((entry) => entry.userId));
  absentIds.forEach((userId) => { if (!presentIds.has(userId)) attendance.push({ userId, status: "absent", note: "" }); });
  return { ...meeting, attendance };
}

async function saveMeeting(value) {
  await saveSharedRecord(SO_MEETING_ID, SO_MEETING_TARGET, "Réunion SO en cours", meetingFromValue(value));
}

function emptyMeeting(updatedBy = "") {
  const now = new Date().toISOString();
  return { occurredAt: now, attendance: [], improvementAxes: "", caporalVotes: [], suggestions: "", updatedAt: now, updatedBy };
}

function meetingHistoryFromValue(value) {
  return parseArray(value).filter((entry) => UUID.test(String(entry?.id || "")) && Number.isFinite(new Date(entry?.savedAt).getTime())).slice(0, 30).map((entry) => ({
    id: entry.id,
    savedAt: new Date(entry.savedAt).toISOString(),
    savedBy: UUID.test(String(entry.savedBy || "")) ? entry.savedBy : "",
    savedByName: clean(entry.savedByName, 120) || "Responsable SO",
    googleDocumentUrl: missionDocumentUrl(entry.googleDocumentUrl),
    ...meetingFromValue(entry),
  }));
}

async function meetingHistoryFor() {
  return meetingHistoryFromValue(await sharedRecord(SO_MEETING_HISTORY_ID, SO_MEETING_HISTORY_TARGET, "Historique des réunions SO", []));
}

async function saveMeetingHistory(history) {
  await saveSharedRecord(SO_MEETING_HISTORY_ID, SO_MEETING_HISTORY_TARGET, "Historique des réunions SO", meetingHistoryFromValue(history));
}

async function resetArchivedMeetingDraft(meeting, history) {
  const latest = parseArray(history)[0];
  // Migrate the meeting that was saved before automatic clearing existed.
  // A matching current draft means it is already safely present in the archive.
  if (!latest || !meeting?.updatedAt || meeting.updatedAt !== latest.updatedAt || meeting.updatedBy !== latest.updatedBy || meeting.occurredAt !== latest.occurredAt) return meeting;
  const reset = emptyMeeting();
  await saveMeeting(reset);
  return meetingFromValue(reset);
}

function failure(error) {
  const message = error instanceof Error ? error.message : "";
  if (message === "INVALID_CONTENT_TYPE" || message === "INVALID_JSON") return json({ error: "Requête invalide." }, 400);
  if (message === "BODY_TOO_LARGE") return json({ error: "Le message ou ses pièces jointes sont trop volumineux." }, 413);
  console.error("Shared portal state failed", message || "Unknown error");
  return json({ error: "La synchronisation est temporairement indisponible. Réessayez dans quelques instants." }, 503);
}

export async function GET(request) {
  const current = await requireSession(request);
  if (current.error) return current.error;
  try { return json({ ok: true, ...(await stateFor(current.user)) }); }
  catch (error) { return failure(error); }
}

export async function POST(request) {
  if (!validCsrfRequest(request)) return json({ error: "Jeton de sécurité invalide. Rechargez la page." }, 403);
  const current = await requireSession(request);
  if (current.error) return current.error;
  try {
    const body = await readJson(request, MAX_MESSAGE_BYTES);
    const action = String(body?.action || "");
    const actor = current.user;
    const result = {};

    if (action === "create_absence") {
      const values = absenceValues(body?.values);
      if (!values) return json({ error: "Indiquez une période valide et le motif de votre absence." }, 400);
      const requestedUserId = String(body?.values?.userId || actor.id);
      if (!UUID.test(requestedUserId)) return json({ error: "Membre invalide." }, 400);
      if (requestedUserId !== actor.id && !isManager(actor)) return json({ error: "Seuls les responsables peuvent déclarer l’absence d’un autre membre." }, 403);
      const absentMember = requestedUserId === actor.id ? actor : await portalUser(requestedUserId);
      if (!absentMember) return json({ error: "Ce membre n’est plus disponible." }, 404);
      const absence = {
        id: crypto.randomUUID(),
        ...values,
        authorId: absentMember.id,
        authorName: `${absentMember.first_name} ${absentMember.last_name || ""}`.trim(),
        authorGrade: absentMember.grade || "",
        authorRole: absentMember.role || "",
      };
      await saveAbsence(absence);
      await recordAuditLog({ actor, category: "absence", action: requestedUserId === actor.id ? "Absence déclarée" : "Absence déclarée pour un membre", details: `${absence.authorName} · du ${values.startDate} au ${values.endDate}` });
    } else if (action === "delete_absence") {
      if (!isManager(actor)) return json({ error: "Seuls les Référents SO et les accès supérieurs peuvent supprimer une absence." }, 403);
      const absenceId = String(body?.absenceId || "");
      if (!UUID.test(absenceId)) return json({ error: "Absence invalide." }, 400);
      const removed = await removeAbsence(absenceId);
      if (!removed) return json({ error: "Absence introuvable ou déjà supprimée." }, 404);
      result.deletedAbsenceId = removed.id;
      await recordAuditLog({ actor, category: "absence", action: "Absence supprimée", details: `${removed.authorName} · du ${removed.startDate} au ${removed.endDate}` });
    } else if (action === "start_direct") {
      const otherUserId = String(body?.otherUserId || "");
      if (!UUID.test(otherUserId) || otherUserId === actor.id) return json({ error: "Destinataire invalide." }, 400);
      const members = await validMembers([otherUserId], actor.id);
      if (members.length !== 1) return json({ error: "Ce membre n’est plus disponible." }, 404);
      const existingRows = parseArray(await database("portal_chats?type=eq.direct&select=*"));
      const existing = existingRows.find((chat) => {
        const participants = chatParticipantIds(chat);
        return participants.length === 2 && participants.includes(actor.id) && participants.includes(otherUserId);
      });
      if (!existing) {
        const id = UUID.test(String(body?.chatId || "")) ? String(body.chatId) : crypto.randomUUID();
        await database("portal_chats", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id, type: "direct", name: null, created_by: actor.id, participants: [actor.id, otherUserId] }) });
      }
    } else if (action === "create_group") {
      const name = clean(body?.name, 60);
      const members = await validMembers(body?.memberIds, actor.id);
      if (!name || members.length < 2) return json({ error: "Un groupe doit comporter au moins trois membres, créateur inclus." }, 400);
      const id = UUID.test(String(body?.chatId || "")) ? String(body.chatId) : crypto.randomUUID();
      await database("portal_chats", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id, type: "group", name, created_by: actor.id, participants: [actor.id, ...members] }) });
    } else if (action === "update_group") {
      const chat = await chatById(String(body?.chatId || ""));
      if (!chat || chat.type !== "group" || chat.created_by !== actor.id) return json({ error: "Vous ne pouvez pas gérer ce groupe." }, 403);
      const members = await validMembers(body?.memberIds, actor.id);
      if (members.length < 2) return json({ error: "Le groupe doit conserver au moins trois membres." }, 400);
      await database(`portal_chats?id=eq.${encodeURIComponent(chat.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ participants: [actor.id, ...members], updated_at: new Date().toISOString() }) });
    } else if (action === "delete_chat") {
      const chat = await chatById(String(body?.chatId || ""));
      const canDelete = chat && (isManager(actor) || (chat.type === "group" ? chat.created_by === actor.id : chatParticipantIds(chat).includes(actor.id)));
      if (!canDelete) return json({ error: "Vous ne pouvez pas supprimer cette discussion." }, 403);
      await database(`portal_chats?id=eq.${encodeURIComponent(chat.id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    } else if (action === "send_message") {
      const chatId = String(body?.chatId || "");
      let chat = await chatById(chatId);
      if (!chat) chat = await createChatOnFirstMessage(chatId, body?.draft, actor);
      if (!chat || !chatParticipantIds(chat).includes(actor.id)) return json({ error: "Discussion introuvable ou destinataire indisponible." }, 404);
      const html = clean(body?.html, 10000);
      const text = clean(body?.text, 10000);
      const attachments = attachmentList(body?.attachments);
      if (!text && !html && !attachments.length) return json({ error: "Le message est vide." }, 400);
      const now = new Date().toISOString();
      await database("portal_chat_messages", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id: crypto.randomUUID(), chat_id: chat.id, sender_id: actor.id, sender_name: `${actor.first_name} ${actor.last_name || ""}`.trim(), html, text_content: text, attachments, created_at: now }) });
      await database(`portal_chats?id=eq.${encodeURIComponent(chat.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ updated_at: now }) });
      await createNotification({ recipients: chatParticipantIds(chat).filter((id) => id !== actor.id), kind: "message", title: `Nouveau message de ${actor.first_name} ${actor.last_name || ""}`.trim(), text: chat.type === "group" ? `Dans le groupe « ${chat.name || "Sans nom"} »` : "Dans une discussion privée.", target: "chat" });
    } else if (action === "edit_message") {
      const id = String(body?.messageId || "");
      if (!UUID.test(id)) return json({ error: "Message invalide." }, 400);
      const rows = await database(`portal_chat_messages?id=eq.${encodeURIComponent(id)}&select=*`);
      const message = parseArray(rows)[0];
      const chat = message ? await chatById(message.chat_id) : null;
      if (!message || !chat || message.sender_id !== actor.id || !chatParticipantIds(chat).includes(actor.id)) return json({ error: "Vous ne pouvez pas modifier ce message." }, 403);
      const html = clean(body?.html, 10000);
      const text = clean(body?.text, 10000);
      if (!text && !html) return json({ error: "Le message est vide." }, 400);
      const now = new Date().toISOString();
      await database(`portal_chat_messages?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ html, text_content: text, edited_at: now }) });
      await database(`portal_chats?id=eq.${encodeURIComponent(chat.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ updated_at: now }) });
    } else if (action === "delete_message") {
      const id = String(body?.messageId || "");
      if (!UUID.test(id)) return json({ error: "Message invalide." }, 400);
      const rows = await database(`portal_chat_messages?id=eq.${encodeURIComponent(id)}&select=*`);
      const message = parseArray(rows)[0];
      const chat = message ? await chatById(message.chat_id) : null;
      if (!message || !chat || (message.sender_id !== actor.id && !isManager(actor))) return json({ error: "Vous ne pouvez pas supprimer ce message." }, 403);
      await database(`portal_chat_messages?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await database(`portal_chats?id=eq.${encodeURIComponent(chat.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ updated_at: new Date().toISOString() }) });
    } else if (action === "reset_summary") {
      if (!adminAccess(actor)) return json({ error: "Seul un administrateur ou la gérance peut réinitialiser le résumé." }, 403);
      const scope = body?.scope === "ranking" ? "ranking" : "activity";
      const settings = await summarySettingsFor();
      const now = new Date().toISOString();
      const next = scope === "ranking" ? { ...settings, rankingResetAt: now } : { ...settings, activityResetAt: now };
      await saveSharedRecord(SUMMARY_SETTINGS_ID, SUMMARY_SETTINGS_TARGET, "Réglages internes du résumé", next);
      await recordAuditLog({ actor, category: "summary", action: scope === "ranking" ? "Classement d’activité réinitialisé" : "Graphiques d’activité réinitialisés" });
    } else if (action === "create_management_report") {
      if (!["senior", "officer"].includes(actor.role)) return json({ error: "Seuls les Sous-Officiers peuvent remplir ce rapport." }, 403);
      const values = managementReportValues(body?.values);
      if (!values) return json({ error: "Tous les champs du rapport de gérance sont obligatoires." }, 400);
      const reports = await managementReportsFor();
      const report = {
        id: crypto.randomUUID(),
        ...values,
        authorId: actor.id,
        authorName: `${actor.first_name} ${actor.last_name || ""}`.trim(),
        authorGrade: actor.grade || "",
        authorRole: actor.role,
        createdAt: new Date().toISOString(),
        comments: [],
      };
      await saveManagementReports([report, ...reports].slice(0, 800));
      await createNotification({ recipients: [actor.id], kind: "form", title: "Rapport de gérance enregistré", text: "Votre auto-évaluation a été transmise aux responsables.", target: "management_report" });
      await recordAuditLog({ actor, category: "management", action: "Rapport de gérance envoyé", details: values.managementType });
    } else if (action === "comment_management_report") {
      const reportId = String(body?.reportId || "");
      const content = clean(body?.content, 1000);
      if (!UUID.test(reportId) || !content) return json({ error: "Votre avis est invalide." }, 400);
      const reports = await managementReportsFor();
      const report = reports.find((item) => item.id === reportId);
      if (!report) return json({ error: "Rapport introuvable." }, 404);
      const assignments = await assignmentsFor();
      if (!canReviewManagementReport(actor, report, assignments)) return json({ error: "Seuls les responsables ou le Sous-Officier Supérieur référent assigné peuvent donner un avis sur ce rapport." }, 403);
      const comment = {
        id: crypto.randomUUID(),
        authorId: actor.id,
        authorName: `${actor.first_name} ${actor.last_name || ""}`.trim(),
        authorGrade: actor.grade || "",
        authorRole: actor.role,
        content,
        createdAt: new Date().toISOString(),
      };
      await saveManagementReports(reports.map((item) => item.id === report.id ? { ...item, comments: [...parseArray(item.comments), comment].slice(-50) } : item));
      await createNotification({ recipients: [report.authorId], kind: "info", title: "Avis ajouté à votre rapport de gérance", text: `${comment.authorGrade ? `${comment.authorGrade} ` : ""}${comment.authorName} a laissé un retour.`, target: "management_report" });
      await recordAuditLog({ actor, category: "management", action: "Avis ajouté à un rapport de gérance", details: report.authorName });
    } else if (action === "update_management_comment") {
      const reportId = String(body?.reportId || "");
      const commentId = String(body?.commentId || "");
      const content = clean(body?.content, 1000);
      if (!UUID.test(reportId) || !UUID.test(commentId) || !content) return json({ error: "Votre avis est invalide." }, 400);
      const reports = await managementReportsFor();
      const report = reports.find((item) => item.id === reportId);
      const comment = report?.comments?.find((item) => item.id === commentId);
      if (!report || !comment) return json({ error: "Avis introuvable." }, 404);
      const assignments = await assignmentsFor();
      if (!canReviewManagementReport(actor, report, assignments)) return json({ error: "Vous n’êtes pas autorisé à modifier un avis sur ce rapport." }, 403);
      if (!adminAccess(actor) && comment.authorId !== actor.id) return json({ error: "Vous ne pouvez modifier que vos propres avis." }, 403);
      const editedAt = new Date().toISOString();
      await saveManagementReports(reports.map((item) => item.id === report.id ? { ...item, comments: parseArray(item.comments).map((entry) => entry.id === comment.id ? { ...entry, content, editedAt } : entry) } : item));
      await recordAuditLog({ actor, category: "management", action: "Avis de gérance modifié", details: report.authorName });
    } else if (action === "delete_management_comment") {
      const reportId = String(body?.reportId || "");
      const commentId = String(body?.commentId || "");
      if (!UUID.test(reportId) || !UUID.test(commentId)) return json({ error: "Avis invalide." }, 400);
      const reports = await managementReportsFor();
      const report = reports.find((item) => item.id === reportId);
      const comment = report?.comments?.find((item) => item.id === commentId);
      if (!report || !comment) return json({ error: "Avis introuvable." }, 404);
      const assignments = await assignmentsFor();
      if (!canReviewManagementReport(actor, report, assignments)) return json({ error: "Vous n’êtes pas autorisé à supprimer un avis sur ce rapport." }, 403);
      if (!adminAccess(actor) && comment.authorId !== actor.id) return json({ error: "Vous ne pouvez supprimer que vos propres avis." }, 403);
      await saveManagementReports(reports.map((item) => item.id === report.id ? { ...item, comments: parseArray(item.comments).filter((entry) => entry.id !== comment.id) } : item));
      await recordAuditLog({ actor, category: "management", action: "Avis de gérance supprimé", details: report.authorName });
    } else if (action === "delete_management_report") {
      if (!isManager(actor)) return json({ error: "Seuls les Référents SO et les accès supérieurs peuvent supprimer un rapport." }, 403);
      const reportId = String(body?.reportId || "");
      if (!UUID.test(reportId)) return json({ error: "Rapport invalide." }, 400);
      const reports = await managementReportsFor();
      const report = reports.find((item) => item.id === reportId);
      if (!report) return json({ error: "Rapport introuvable." }, 404);
      await saveManagementReports(reports.filter((item) => item.id !== report.id));
      if (report.authorId !== actor.id) await createNotification({ recipients: [report.authorId], kind: "info", title: "Rapport de gérance supprimé", text: "Un responsable a supprimé votre rapport de gérance.", target: "management_report" });
      await recordAuditLog({ actor, category: "management", action: "Rapport de gérance supprimé", details: `${report.managementType} · ${report.authorName}` });
    } else if (action === "reset_management_ranking") {
      if (actor.role !== "admin") return json({ error: "Seul l’Admin peut réinitialiser ce classement." }, 403);
      await saveManagementReportSettings({ rankingResetAt: new Date().toISOString() });
      await recordAuditLog({ actor, category: "management", action: "Classement des gérances réinitialisé" });
    } else if (action === "save_so_meeting" || action === "save_so_meeting_draft") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent enregistrer cette réunion." }, 403);
      const source = objectValue(body?.meeting);
      const meeting = await meetingWithPresenceSynced({ ...source, updatedAt: new Date().toISOString(), updatedBy: actor.id });
      await saveMeeting(meeting);
      if (action === "save_so_meeting") {
        const history = await meetingHistoryFor();
        const savedAt = new Date().toISOString();
        await saveMeetingHistory([{
          ...meeting,
          id: crypto.randomUUID(),
          savedAt,
          savedBy: actor.id,
          savedByName: `${actor.grade || ""} ${actor.first_name || ""} ${actor.last_name || ""}`.trim() || "Responsable SO",
        }, ...history].slice(0, 30));
        await saveMeeting(emptyMeeting(actor.id));
        await recordAuditLog({ actor, category: "meeting", action: "Réunion SO enregistrée dans l’historique", details: `${meeting.attendance.length} membre(s) suivi(s)` });
      }
    } else if (action === "delete_so_meeting_history") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent supprimer un compte rendu de réunion." }, 403);
      const meetingId = String(body?.meetingId || "");
      if (!UUID.test(meetingId)) return json({ error: "Compte rendu invalide." }, 400);
      const history = await meetingHistoryFor();
      const savedMeeting = history.find((entry) => entry.id === meetingId);
      if (!savedMeeting) return json({ error: "Compte rendu introuvable." }, 404);
      await saveMeetingHistory(history.filter((entry) => entry.id !== meetingId));
      await recordAuditLog({ actor, category: "meeting", action: "Compte rendu de réunion SO supprimé", details: `Réunion du ${label(savedMeeting.occurredAt)}` });
    } else if (action === "set_so_meeting_history_document") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent gérer les documents de réunion." }, 403);
      const meetingId = String(body?.meetingId || "");
      const googleDocumentUrl = missionDocumentUrl(body?.googleDocumentUrl);
      if (!UUID.test(meetingId) || !googleDocumentUrl) return json({ error: "Le lien Google Docs est invalide." }, 400);
      const history = await meetingHistoryFor();
      const savedMeeting = history.find((entry) => entry.id === meetingId);
      if (!savedMeeting) return json({ error: "Compte rendu introuvable." }, 404);
      await saveMeetingHistory(history.map((entry) => entry.id === meetingId ? { ...entry, googleDocumentUrl } : entry));
      await recordAuditLog({ actor, category: "meeting", action: "Google Doc créé depuis un compte rendu de réunion SO", details: `Réunion du ${label(savedMeeting.occurredAt)}` });
    } else if (action === "sync_so_meeting_presence") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent synchroniser la réunion." }, 403);
      const userId = String(body?.userId || "");
      const member = await portalUser(userId);
      if (!member || !["officer", "senior"].includes(member.role) || member.presence !== "absent") return json({ error: "Membre ou présence invalide." }, 400);
      const currentMeeting = await meetingFor();
      await saveMeeting(await meetingWithPresenceSynced({ ...currentMeeting, updatedAt: new Date().toISOString(), updatedBy: actor.id }));
    } else if (action === "assign_sergeant") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent créer une assignation." }, 403);
      const sergeantId = String(body?.sergeantId || "");
      const observerId = String(body?.observerId || "");
      const dueDate = String(body?.dueDate || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return json({ error: "Date limite invalide." }, 400);
      const [sergeant, observer] = await Promise.all([portalUser(sergeantId), portalUser(observerId)]);
      if (!sergeant || sergeant.role !== "officer" || sergeant.grade !== "Sergent" || !observer || observer.role !== "senior") return json({ error: "Le Sergent ou le Sous-Officier Supérieur est invalide." }, 400);
      const assignments = await assignmentsFor();
      const now = new Date().toISOString();
      const existing = assignments.find((assignment) => assignment.sergeantId === sergeantId);
      const next = existing
        ? assignments.map((assignment) => assignment.id === existing.id ? { ...assignment, observerId, dueDate, status: "active", assignedAt: now, reminderAt: null, completedAt: null } : assignment)
        : [{ id: crypto.randomUUID(), sergeantId, observerId, dueDate, status: "active", assignedAt: now, reminderAt: null, completedAt: null }, ...assignments];
      await saveAssignments(next);
      await createNotification({ recipients: [sergeantId], kind: "info", title: "Référent de suivi attribué", text: `${observer.grade} ${observer.first_name} ${observer.last_name || ""}`.trim(), target: "home" });
      await createNotification({ recipients: [observerId], kind: "info", title: "Nouveau Sergent assigné", text: `${sergeant.grade} ${sergeant.first_name} ${sergeant.last_name || ""}`.trim(), target: "sergeant_report" });
      await recordAuditLog({ actor, category: "assignment", action: "Sergent assigné à un SO Sup", details: `${sergeant.first_name} ${sergeant.last_name || ""} → ${observer.first_name} ${observer.last_name || ""}`.trim() });
    } else if (action === "remind_sergeant_assignment") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent envoyer un rappel." }, 403);
      const assignmentId = String(body?.assignmentId || "");
      const assignments = await assignmentsFor();
      const assignment = assignments.find((item) => item.id === assignmentId && item.status === "active");
      if (!assignment) return json({ error: "Assignation introuvable." }, 404);
      const now = new Date().toISOString();
      const next = assignments.map((item) => item.id === assignment.id ? { ...item, reminderAt: now } : item);
      await saveAssignments(next);
      const sergeant = await portalUser(assignment.sergeantId);
      await createNotification({ recipients: [assignment.observerId], kind: "info", title: "Rappel : rapport de nouveau Sergent", text: sergeant ? `Rapport de ${sergeant.grade} ${sergeant.first_name} ${sergeant.last_name || ""}`.trim() : "Votre rapport assigné arrive à échéance.", target: "sergeant_report" });
      await recordAuditLog({ actor, category: "assignment", action: "Rappel de rapport envoyé", details: assignment.observerId });
    } else if (action === "delete_sergeant_assignment") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent supprimer une assignation." }, 403);
      const assignmentId = String(body?.assignmentId || "");
      const assignments = await assignmentsFor();
      if (!assignments.some((item) => item.id === assignmentId)) return json({ error: "Assignation introuvable." }, 404);
      await saveAssignments(assignments.filter((item) => item.id !== assignmentId));
      await recordAuditLog({ actor, category: "assignment", action: "Assignation de Sergent supprimée" });
    } else if (action === "complete_sergeant_assignment") {
      const assignmentId = String(body?.assignmentId || "");
      const assignments = await assignmentsFor();
      const assignment = assignments.find((item) => item.id === assignmentId && item.observerId === actor.id && item.status === "active");
      if (!assignment || actor.role !== "senior") return json({ error: "Assignation introuvable." }, 404);
      const next = assignments.map((item) => item.id === assignment.id ? { ...item, status: "completed", completedAt: new Date().toISOString() } : item);
      await saveAssignments(next);
      await recordAuditLog({ actor, category: "assignment", action: "Rapport de nouveau Sergent finalisé" });
    } else if (action === "notify") {
      await createNotification({ recipients: body?.recipients === "all" ? null : body?.recipients, kind: body?.kind, title: body?.title, text: body?.text, target: body?.target });
    } else if (action === "create_mission") {
      if (!["senior", "officer"].includes(actor.role)) return json({ error: "Seuls les Sous-Officiers peuvent déposer une mission." }, 403);
      const values = missionValues(body?.mission);
      if (!values) return json({ error: "Le titre ou le lien Google Docs de la mission est invalide." }, 400);
      const createdAt = new Date().toISOString();
      const mission = {
        id: crypto.randomUUID(),
        userId: actor.id,
        userName: `${actor.first_name} ${actor.last_name || ""}`.trim(),
        grade: actor.grade || "",
        ...values,
        status: "pending",
        createdAt,
      };
      await saveMission(mission);
      await createNotification({ recipients: [actor.id], kind: "form", title: "Mission interne déposée", text: "Votre document est en attente de validation.", target: "mission_internal" });
      await recordAuditLog({ actor, category: "mission", action: "Mission interne déposée", details: values.title });
    } else if (action === "migrate_missions") {
      return json({ error: "Les anciennes missions locales ne sont plus importées." }, 410);
    } else if (action === "validate_mission") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent valider une mission." }, 403);
      const missionId = String(body?.missionId || "");
      const missions = await missionsFor();
      const mission = missions.find((item) => item.id === missionId && item.status === "pending");
      if (!mission) return json({ error: "Mission introuvable ou déjà traitée." }, 404);
      const validatedAt = new Date().toISOString();
      await saveMission({ ...mission, status: "validated", validatedBy: `${actor.first_name} ${actor.last_name || ""}`.trim(), validatedAt });
      const settings = await currentQuotaSettings();
      const missionCounts = objectValue(settings.mission_counts);
      missionCounts[mission.userId] = numberInRange(missionCounts[mission.userId], 0, 99) + 1;
      await updateQuotaSettings({ mission_counts: missionCounts });
      await createNotification({ recipients: [mission.userId], kind: "info", title: "Mission interne validée", text: "Votre mission a été ajoutée à votre quota.", target: "mission_internal" });
      await recordAuditLog({ actor, category: "mission", action: "Mission interne validée", details: `${mission.title} · ${mission.userName}` });
    } else if (action === "reject_mission") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent refuser une mission." }, 403);
      const missionId = String(body?.missionId || "");
      const missions = await missionsFor();
      const mission = missions.find((item) => item.id === missionId && item.status === "pending");
      if (!mission) return json({ error: "Mission introuvable ou déjà traitée." }, 404);
      const rejectedAt = new Date().toISOString();
      await saveMission({ ...mission, status: "rejected", rejectedBy: `${actor.first_name} ${actor.last_name || ""}`.trim(), rejectedAt });
      await createNotification({ recipients: [mission.userId], kind: "info", title: "Mission interne refusée", text: "Votre document a été refusé par un responsable.", target: "mission_internal" });
      await recordAuditLog({ actor, category: "mission", action: "Mission interne refusée", details: `${mission.title} · ${mission.userName}` });
    } else if (action === "delete_mission") {
      const missionId = String(body?.missionId || "");
      const missions = await missionsFor();
      const mission = missions.find((item) => item.id === missionId);
      // Un responsable doit pouvoir retirer n'importe quel document de la liste
      // commune, y compris une mission déjà validée. Un déposant, lui, ne peut
      // retirer que son propre brouillon/refus avant validation.
      const canDeleteOwnMission = mission?.userId === actor.id && mission.status !== "validated";
      if (!mission || (!isManager(actor) && !canDeleteOwnMission)) return json({ error: "Vous ne pouvez pas supprimer cette mission." }, 403);
      await removeMission(mission.id);
      await recordAuditLog({ actor, category: "mission", action: isManager(actor) && mission.userId !== actor.id ? "Mission interne supprimée par un responsable" : "Mission interne supprimée", details: `${mission.title} · ${mission.userName}` });
    } else if (action === "reset_missions") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent réinitialiser les missions." }, 403);
      const missions = await missionsFor();
      await clearMissions();
      await recordAuditLog({ actor, category: "mission", action: "Documents de missions réinitialisés", details: `${missions.length} document${missions.length > 1 ? "s" : ""}` });
    } else if (action === "quota_set_target") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent modifier les quotas." }, 403);
      const category = String(body?.category || "");
      if (!QUOTA_CATEGORIES.has(category)) return json({ error: "Catégorie de quota invalide." }, 400);
      const settings = await currentQuotaSettings();
      const targets = normalizeQuotaTargets(settings.targets);
      targets[category] = numberInRange(body?.target);
      await updateQuotaSettings({ targets });
      await recordAuditLog({ actor, category: "quota", action: "Objectif de quota modifié", details: `${category} : ${targets[category]}` });
    } else if (action === "quota_reset") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent réinitialiser les quotas." }, 403);
      await updateQuotaSettings({ reset_at: new Date().toISOString(), mission_counts: {} });
      await recordAuditLog({ actor, category: "quota", action: "Compteurs de quotas réinitialisés" });
    } else if (action === "quota_toggle_exemption") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent gérer les exemptions." }, 403);
      const userId = String(body?.userId || "");
      if (!UUID.test(userId)) return json({ error: "Membre invalide." }, 400);
      const settings = await currentQuotaSettings();
      const exemptions = normalizeExemptions(settings.exemptions);
      const enabled = body?.enabled === true;
      if (enabled) exemptions[userId] = true;
      else delete exemptions[userId];
      await updateQuotaSettings({ exemptions });
      await recordAuditLog({ actor, category: "quota", action: enabled ? "Exemption de quota accordée" : "Exemption de quota retirée", details: userId });
    } else if (action === "quota_add_mission") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent valider une mission." }, 403);
      const userId = String(body?.userId || "");
      if (!UUID.test(userId)) return json({ error: "Membre invalide." }, 400);
      const settings = await currentQuotaSettings();
      const missionCounts = objectValue(settings.mission_counts);
      missionCounts[userId] = numberInRange(missionCounts[userId], 0, 99) + 1;
      await updateQuotaSettings({ mission_counts: missionCounts });
      await recordAuditLog({ actor, category: "mission", action: "Mission interne validée", details: userId });
    } else if (action === "reset_submissions") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent réinitialiser cet historique." }, 403);
      const type = String(body?.type || "");
      if (!SUBMISSION_TYPES.has(type)) return json({ error: "Historique invalide." }, 400);
      const deletedCount = await removeSubmissionsByType(type);
      result.deletedSubmissionCount = deletedCount;
      await recordAuditLog({ actor, category: "form", action: "Historique de formulaire réinitialisé", details: type });
    } else if (action === "update_submission") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent modifier cet historique." }, 403);
      const id = String(body?.submissionId || "");
      const type = String(body?.type || "");
      const values = submissionValues(type, body?.values);
      if (!UUID.test(id) || !values) return json({ error: "Données de formulaire invalides." }, 400);
      const rows = await database(`portal_notifications?id=eq.${encodeURIComponent(id)}&target=eq.${encodeURIComponent(`${SUBMISSION_TARGET_PREFIX}${type}`)}&select=*`);
      const row = parseArray(rows)[0];
      if (!row) return json({ error: "Formulaire introuvable." }, 404);
      let payload = {};
      try { payload = objectValue(JSON.parse(row.body || "{}")); } catch { payload = {}; }
      try {
        const discord = await updateDiscordSubmission({
          type,
          values,
          senderName: payload.authorName || "Utilisateur du portail",
          senderPosition: payload.authorGrade || "",
          messageId: payload.discordMessageId,
        });
        result.discordUpdated = discord.updated;
      } catch (error) {
        // Une modification d'historique doit rester possible, même si le
        // connecteur Discord est momentanément absent du VPS.
        if (error instanceof Error && error.message === "DISCORD_WEBHOOK_UNAVAILABLE") {
          result.discordUpdated = false;
          result.discordWarning = "La modification est enregistrée dans le portail, mais Discord n’est pas encore configuré pour cette catégorie.";
        } else {
          return json({ error: discordErrorMessage(error) }, 502);
        }
      }
      await database(`portal_notifications?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ body: JSON.stringify({ ...payload, values, editedAt: new Date().toISOString(), editedBy: actor.id }) }) });
      await recordAuditLog({ actor, category: "form", action: "Historique de formulaire modifié", details: result.discordUpdated ? `${type} • Discord mis à jour` : `${type} • ancien message Discord non modifiable` });
    } else if (action === "delete_submission") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent supprimer cet historique." }, 403);
      const id = String(body?.submissionId || "");
      const type = String(body?.type || "");
      if (!UUID.test(id) || !SUBMISSION_TYPES.has(type)) return json({ error: "Formulaire invalide." }, 400);
      const deleted = await removeSubmission(id, type);
      if (!deleted) return json({ error: "Formulaire introuvable ou déjà supprimé." }, 404);
      result.deletedSubmissionId = deleted.id;
      result.deletedSubmissionType = deleted.type;
      await recordAuditLog({ actor, category: "form", action: "Élément supprimé de l’historique", details: type });
    } else if (action === "create_announcement") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent publier une annonce." }, 403);
      const title = clean(body?.title, 140);
      const content = cleanMultiline(body?.content, 2_400);
      if (!title || !content) return json({ error: "Le titre et le message de l’annonce sont obligatoires." }, 400);
      const id = crypto.randomUUID();
      await database("portal_notifications", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          id,
          recipient_ids: null,
          kind: "info",
          title,
          body: JSON.stringify({
            content,
            pinned: body?.pinned === true,
            publishedBy: `${actor.first_name} ${actor.last_name || ""}`.trim(),
          }),
          target: `${ANNOUNCEMENT_TARGET_PREFIX}${id}`,
        }),
      });
      await recordAuditLog({ actor, category: "announcement", action: "Annonce publiée", details: title });
    } else if (action === "update_announcement") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent modifier une annonce." }, 403);
      const id = String(body?.announcementId || "");
      const title = clean(body?.title, 140);
      const content = cleanMultiline(body?.content, 2_400);
      if (!UUID.test(id) || !title || !content) return json({ error: "Annonce invalide." }, 400);
      const rows = await database(`portal_notifications?id=eq.${encodeURIComponent(id)}&select=*`);
      const announcement = parseArray(rows)[0];
      if (!announcement || !String(announcement.target || "").startsWith(ANNOUNCEMENT_TARGET_PREFIX)) return json({ error: "Annonce introuvable." }, 404);
      const existing = objectValue(jsonValue(announcement.body, {}));
      await database(`portal_notifications?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ title, body: JSON.stringify({ ...existing, content, pinned: body?.pinned === true, updatedAt: new Date().toISOString() }) }),
      });
      await recordAuditLog({ actor, category: "announcement", action: "Annonce modifiée", details: title });
    } else if (action === "delete_announcement") {
      if (!isManager(actor)) return json({ error: "Seuls les responsables peuvent supprimer une annonce." }, 403);
      const id = String(body?.announcementId || "");
      if (!UUID.test(id)) return json({ error: "Annonce invalide." }, 400);
      const rows = await database(`portal_notifications?id=eq.${encodeURIComponent(id)}&select=id,title,target`);
      const announcement = parseArray(rows)[0];
      if (!announcement || !String(announcement.target || "").startsWith(ANNOUNCEMENT_TARGET_PREFIX)) return json({ error: "Annonce introuvable." }, 404);
      await database(`portal_notification_dismissals?notification_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await database(`portal_notifications?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await recordAuditLog({ actor, category: "announcement", action: "Annonce supprimée", details: announcement.title || "Annonce" });
    } else if (action === "acknowledge_announcement") {
      const id = String(body?.announcementId || "");
      if (!UUID.test(id)) return json({ error: "Annonce invalide." }, 400);
      const rows = await database(`portal_notifications?id=eq.${encodeURIComponent(id)}&select=id,target`);
      const announcement = parseArray(rows)[0];
      if (!announcement || !String(announcement.target || "").startsWith(ANNOUNCEMENT_TARGET_PREFIX)) return json({ error: "Annonce introuvable." }, 404);
      await database("portal_notification_dismissals?on_conflict=notification_id,user_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ notification_id: id, user_id: actor.id }) });
    } else if (action === "dismiss_notification") {
      const notificationId = String(body?.notificationId || "");
      if (!UUID.test(notificationId)) return json({ error: "Notification invalide." }, 400);
      const rows = await database(`portal_notifications?id=eq.${encodeURIComponent(notificationId)}&select=*`);
      const notification = parseArray(rows)[0];
      if (!notification || !canSeeNotification(notification, actor)) return json({ error: "Notification introuvable." }, 404);
      await database("portal_notification_dismissals?on_conflict=notification_id,user_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ notification_id: notificationId, user_id: actor.id }) });
    } else if (action === "dismiss_all_notifications") {
      const rows = parseArray(await database("portal_notifications?select=id,recipient_ids,kind,target"));
      const dismissals = rows
        .filter((notification) => UUID.test(String(notification.id)) && !String(notification.target || "").startsWith("__portal_") && canSeeNotification(notification, actor))
        .map((notification) => ({ notification_id: notification.id, user_id: actor.id }));
      if (dismissals.length) {
        await database("portal_notification_dismissals?on_conflict=notification_id,user_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(dismissals) });
      }
    } else if (action === "clear_audit_logs") {
      if (!adminAccess(actor)) return json({ error: "Seul un administrateur ou la g\u00e9rance peut r\u00e9initialiser les logs." }, 403);
      await database("portal_audit_logs?created_at=not.is.null", { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await recordAuditLog({ actor, category: "system", action: "Journal des logs r\u00e9initialis\u00e9", details: "L\u2019historique pr\u00e9c\u00e9dent a \u00e9t\u00e9 supprim\u00e9." });
    } else {
      return json({ error: "Action inconnue." }, 400);
    }

    return json({ ok: true, ...(await stateFor(actor)), ...result });
  } catch (error) { return failure(error); }
}
