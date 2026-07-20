import { database, json, readJson, requireSession, validCsrfRequest } from "../../auth/_shared";

export const runtime = "edge";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_SIZE = 1024 * 1024;
const FILE_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/plain",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function clean(value, max = 1000) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

function isManager(user) { return ["admin", "referent"].includes(user?.role); }
function parseArray(value) { return Array.isArray(value) ? value : []; }
function uniqueIds(values) { return [...new Set(parseArray(values).filter((value) => UUID.test(String(value))))]; }
function label(date) { return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(date)); }

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
  return Boolean(chat && (isManager(user) || parseArray(chat.participants).includes(user.id)));
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
    participants: parseArray(chat.participants),
    messages: messages.filter((message) => message.chat_id === chat.id).map(messageFromRow),
    updatedAt: chat.updated_at,
  }));
}

function canReceive(row, userId) {
  const recipients = row.recipient_ids;
  return recipients === null || recipients === undefined || (Array.isArray(recipients) && recipients.includes(userId));
}

async function notificationsFor(user) {
  const [rows, dismissed] = await Promise.all([
    database("portal_notifications?select=*&order=created_at.desc&limit=200"),
    database(`portal_notification_dismissals?user_id=eq.${encodeURIComponent(user.id)}&select=notification_id`),
  ]);
  const dismissedIds = new Set(parseArray(dismissed).map((row) => row.notification_id));
  return parseArray(rows).filter((row) => canReceive(row, user.id) && !dismissedIds.has(row.id)).map((row) => ({
    id: row.id,
    recipients: row.recipient_ids === null ? null : parseArray(row.recipient_ids),
    kind: row.kind,
    title: row.title,
    text: row.body,
    target: row.target,
    createdAt: row.created_at,
  }));
}

async function stateFor(user) {
  const [chats, notifications] = await Promise.all([allChats(user), notificationsFor(user)]);
  return { chats, notifications };
}

async function chatById(id) {
  if (!UUID.test(id)) return null;
  const rows = await database(`portal_chats?id=eq.${encodeURIComponent(id)}&select=*`);
  return parseArray(rows)[0] || null;
}

async function validMembers(ids, actorId) {
  const allowed = uniqueIds(ids).filter((id) => id !== actorId);
  if (!allowed.length) return [];
  const rows = await database("portal_users?select=id,blocked,approval_status");
  const active = new Set(parseArray(rows).filter((row) => !row.blocked && (!row.approval_status || row.approval_status === "approved")).map((row) => row.id));
  return allowed.filter((id) => active.has(id));
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

    if (action === "start_direct") {
      const otherUserId = String(body?.otherUserId || "");
      if (!UUID.test(otherUserId) || otherUserId === actor.id) return json({ error: "Destinataire invalide." }, 400);
      const members = await validMembers([otherUserId], actor.id);
      if (members.length !== 1) return json({ error: "Ce membre n’est plus disponible." }, 404);
      const existingRows = parseArray(await database("portal_chats?type=eq.direct&select=*"));
      const existing = existingRows.find((chat) => parseArray(chat.participants).length === 2 && parseArray(chat.participants).includes(actor.id) && parseArray(chat.participants).includes(otherUserId));
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
      const canDelete = chat && (isManager(actor) || (chat.type === "group" ? chat.created_by === actor.id : parseArray(chat.participants).includes(actor.id)));
      if (!canDelete) return json({ error: "Vous ne pouvez pas supprimer cette discussion." }, 403);
      await database(`portal_chats?id=eq.${encodeURIComponent(chat.id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    } else if (action === "send_message") {
      const chat = await chatById(String(body?.chatId || ""));
      if (!chat || !parseArray(chat.participants).includes(actor.id)) return json({ error: "Discussion introuvable." }, 404);
      const html = clean(body?.html, 10000);
      const text = clean(body?.text, 10000);
      const attachments = attachmentList(body?.attachments);
      if (!text && !html && !attachments.length) return json({ error: "Le message est vide." }, 400);
      const now = new Date().toISOString();
      await database("portal_chat_messages", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id: crypto.randomUUID(), chat_id: chat.id, sender_id: actor.id, sender_name: `${actor.first_name} ${actor.last_name || ""}`.trim(), html, text_content: text, attachments, created_at: now }) });
      await database(`portal_chats?id=eq.${encodeURIComponent(chat.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ updated_at: now }) });
      await createNotification({ recipients: parseArray(chat.participants).filter((id) => id !== actor.id), kind: "message", title: `Nouveau message de ${actor.first_name} ${actor.last_name || ""}`.trim(), text: chat.type === "group" ? `Dans le groupe « ${chat.name || "Sans nom"} »` : "Dans une discussion privée.", target: "chat" });
    } else if (action === "edit_message") {
      const id = String(body?.messageId || "");
      if (!UUID.test(id)) return json({ error: "Message invalide." }, 400);
      const rows = await database(`portal_chat_messages?id=eq.${encodeURIComponent(id)}&select=*`);
      const message = parseArray(rows)[0];
      const chat = message ? await chatById(message.chat_id) : null;
      if (!message || !chat || message.sender_id !== actor.id || !parseArray(chat.participants).includes(actor.id)) return json({ error: "Vous ne pouvez pas modifier ce message." }, 403);
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
    } else if (action === "notify") {
      await createNotification({ recipients: body?.recipients === "all" ? null : body?.recipients, kind: body?.kind, title: body?.title, text: body?.text, target: body?.target });
    } else if (action === "dismiss_notification") {
      const notificationId = String(body?.notificationId || "");
      if (!UUID.test(notificationId)) return json({ error: "Notification invalide." }, 400);
      const rows = await database(`portal_notifications?id=eq.${encodeURIComponent(notificationId)}&select=*`);
      const notification = parseArray(rows)[0];
      if (!notification || !canReceive(notification, actor.id)) return json({ error: "Notification introuvable." }, 404);
      await database("portal_notification_dismissals?on_conflict=notification_id,user_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ notification_id: notificationId, user_id: actor.id }) });
    } else {
      return json({ error: "Action inconnue." }, 400);
    }

    return json({ ok: true, ...(await stateFor(actor)) });
  } catch (error) { return failure(error); }
}
