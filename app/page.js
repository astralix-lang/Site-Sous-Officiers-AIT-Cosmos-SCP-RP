"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  BadgeCheck,
  Bell,
  CalendarDays,
  ClipboardCheck,
  ChevronDown,
  FileText,
  Gauge,
  Home,
  LayoutDashboard,
  LogOut,
  Medal,
  MessageSquareText,
  Paperclip,
  Palette,
  Pencil,
  Pin,
  RotateCcw,
  Search,
  ScrollText,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Trophy,
  Download,
  UserCheck,
  UserRound,
  UserX,
  UsersRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

const ROLES = {
  admin: { label: "Admin", short: "AD", tone: "violet" },
  management: { label: "Gérance", short: "GE", tone: "violet" },
  referent: { label: "Référent SO", short: "RS", tone: "blue" },
  senior: { label: "Sous-Officier Supérieur", short: "SS", tone: "gold" },
  officer: { label: "Sous-Officier", short: "SO", tone: "green" },
};

const ADMIN_ACCESS_ROLES = new Set(["admin", "management"]);
const MANAGER_ACCESS_ROLES = new Set(["admin", "management", "referent"]);
const SENIOR_ACCESS_ROLES = new Set(["admin", "management", "referent", "senior"]);
const hasAdminAccess = (role) => ADMIN_ACCESS_ROLES.has(role);
const hasManagerAccess = (role) => MANAGER_ACCESS_ROLES.has(role);
const hasSeniorAccess = (role) => SENIOR_ACCESS_ROLES.has(role);
const hasChatParticipant = (chat, userId) => Array.isArray(chat?.participants) && chat.participants.some((id) => String(id) === String(userId));
// L'aperçu OpenAI peut être ouvert sans Discord afin de valider le portail
// avant la mise en ligne. Cette option n'est pas compilée sur Vercel.
const OPENAI_PREVIEW_ENABLED = process.env.NEXT_PUBLIC_OPENAI_PREVIEW_ACCESS === "enabled";

// Registre unique des rubriques : les menus et les raccourcis en tirent leur
// liste. Ainsi, toute nouvelle rubrique ajoutée ici devient disponible dans
// les raccourcis pour les personnes qui y ont accès.
const PORTAL_MENU_GROUPS = [
  { id: "admin", label: "Admin", icon: ShieldCheck, access: "manager" },
  { id: "referent", label: "Référent SO", icon: UsersRound, access: "manager" },
  { id: "global", label: "Globale", icon: Send, access: "all" },
  { id: "senior", label: "Sous-Officier Supérieur", icon: BadgeCheck, access: "senior" },
  { id: "chat", label: "Chat", icon: MessageSquareText, access: "all" },
];
const PORTAL_SECTION_REGISTRY = [
  { id: "dashboard", group: "admin", label: "Tableau de bord", shortcutLabel: "Gestion des comptes", description: "Administrer les accès", icon: LayoutDashboard, access: "manager" },
  { id: "workforce", group: "referent", label: "Effectif", description: "Voir l’organisation de l’équipe", icon: UsersRound, access: "manager" },
  { id: "specializations", group: "referent", label: "Spécialisations", description: "Consulter les spécialités de l’effectif", icon: BadgeCheck, access: "manager" },
  { id: "presence", group: "referent", label: "Présences", description: "Mettre l’équipe à jour", icon: UserCheck, access: "manager" },
  { id: "meeting_so", group: "referent", label: "Réunion SO", description: "Préparer et suivre une réunion SO", icon: ClipboardCheck, access: "manager" },
  { id: "quotas", group: "referent", label: "Quotas", shortcutLabel: "Gestion des quotas", description: "Consulter les objectifs de l’équipe", icon: Gauge, access: "manager" },
  { id: "summary", group: "global", label: "Résumé", description: "Consulter les statistiques", icon: BarChart3, access: "all" },
  { id: "management_report", group: "global", label: "Rapport de gérance", description: "Rédiger ou consulter les rapports de gérance", icon: FileText, access: "all" },
  { id: "recommendation", group: "global", label: "Recommandation", description: "Envoyer une recommandation", icon: Medal, access: "all" },
  { id: "pcs_exp", group: "global", label: "Recommandation PCS EXP", shortcutLabel: "Reco PCS EXP", description: "Ouvrir le formulaire PCS EXP", icon: ClipboardCheck, access: "all" },
  { id: "observation_hdr", group: "global", label: "Observation HDR", description: "Consigner une observation HDR", icon: MessageSquareText, access: "all" },
  { id: "mission_internal", group: "global", label: "Mission interne", description: "Déposer ou contrôler un document", icon: FileText, access: "all" },
  { id: "sergeant_assignments", group: "senior", label: "Référent", shortcutLabel: "Mes référents", description: "Consulter les Sergents assignés", icon: UsersRound, access: "senior" },
  { id: "observation_so", group: "senior", label: "Observation SO", description: "Consigner une observation SO", icon: MessageSquareText, access: "senior" },
  { id: "sergeant_report", group: "senior", label: "Rapport nouveau SO", description: "Évaluer un nouveau Sergent", icon: FileText, access: "senior" },
  { id: "chat", group: "chat", label: "Messagerie", description: "Ouvrir une discussion", icon: Send, access: "all" },
  { id: "logs", group: "logs", label: "Logs", description: "Consulter l’activité du portail", icon: ScrollText, access: "manager" },
];
function hasSectionAccess(role, access) {
  if (access === "admin") return hasAdminAccess(role);
  if (access === "manager") return hasManagerAccess(role);
  if (access === "senior") return hasSeniorAccess(role);
  return true;
}
function canOpenPortalSection(role, section) {
  const registered = PORTAL_SECTION_REGISTRY.find((item) => item.id === section);
  return registered ? hasSectionAccess(role, registered.access) : true;
}

const GRADES = [
  "Sergent",
  "Sergent-Chef",
  "Adjudant",
  "Adjudant-Chef",
  "Major",
  "Élève Officier",
  "Aspirant",
  "Sous-Lieutenant",
  "Lieutenant",
  "Capitaine",
  "Vice-Commandant",
  "Commandant",
  "Lieutenant-Colonel",
  "Colonel",
  "Général",
  "Maréchal",
];

function compareUsersByGrade(left, right) {
  const leftGrade = Math.max(0, GRADES.indexOf(left.grade || GRADES[0]));
  const rightGrade = Math.max(0, GRADES.indexOf(right.grade || GRADES[0]));
  const gradeDifference = rightGrade - leftGrade;
  if (gradeDifference) return gradeDifference;
  return `${left.lastName || ""} ${left.firstName || ""}`.localeCompare(`${right.lastName || ""} ${right.firstName || ""}`, "fr", { sensitivity: "base" });
}

const THEME_KEY = "portail-so-theme";
const SOUND_KEY = "portail-so-sounds";
const QUOTA_KEY = "portail-so-quotas-v1";
const MISSIONS_KEY = "portail-so-missions-v1";
const LEGACY_MISSIONS_PURGED_KEY = "portail-so-missions-legacy-purged-v1";
const CHAT_KEY = "portail-so-chats-v1";
const LOG_KEY = "portail-so-logs-v1";
const SHORTCUTS_KEY = "portail-so-shortcuts-v1";
const SUMMARY_KEY = "portail-so-summary-v1";
const ASSIGNMENTS_KEY = "portail-so-sergeant-assignments-v1";
const DRAFTS_KEY = "portail-so-form-drafts-v1";
const SUBMISSION_HISTORY_KEY = "portail-so-submission-history-v1";
const NOTIFICATION_KEY = "portail-so-notifications-v1";
const MANAGEMENT_REPORTS_KEY = "portail-so-management-reports-v1";
const MANAGEMENT_REPORT_SETTINGS_KEY = "portail-so-management-report-settings-v1";
const SO_MEETING_KEY = "portail-so-meeting-v1";
const CHAT_ATTACHMENT_MAX_SIZE = 1024 * 1024;
const CHAT_ATTACHMENT_MAX_COUNT = 3;
const CHAT_ATTACHMENT_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/plain",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const DEFAULT_QUOTAS = { targets: { recommendation: 1, pcs_exp: 1, observations: 1, mission_internal: 0 }, counts: {}, exemptions: {}, resetAt: null };
const DEFAULT_SO_MEETING = { occurredAt: new Date().toISOString(), attendance: [], improvementAxes: "", caporalVotes: [], suggestions: "", updatedAt: null, updatedBy: "" };
const QUOTA_TYPES = ["recommendation", "pcs_exp", "observation_hdr", "observation_so"];
const LOG_CATEGORY_LABELS = { auth: "Connexion", account: "Comptes", presence: "Présences", quota: "Quotas", form: "Formulaires", mission: "Missions", chat: "Chat", assignment: "Référents", profile: "Profils", summary: "Résumé", management: "Gérance", meeting: "Réunion SO", announcement: "Annonces", system: "Système" };
const REPORT_CONCLUSIONS = [
  "Passage confirmé en sergent",
  "Prolongation de la semaine de test",
  "Retour caporal-chef",
];
const SPECIALIZATION_OPTIONS = ["Aucune", "Resp Instr", "Instr CATI", "Instr", "Resp PM", "Référent PM", "PM", "Resp MDC", "Forma MDC", "MDC", "Resp ING", "Cadre ING", "ING"];
const SPECIALIZATION_COLUMNS = [
  { key: "specialization1", label: "Spécialisation 1" },
  { key: "specialization2", label: "Spécialisation 2" },
  { key: "specialization3", label: "Spécialisation 3" },
];
const RECOVERY_ADMIN_EMAIL = "admin@portail-so.fr";
const RECOVERY_ADMIN_PASSWORD = "Admin2026!";
const RECOVERY_ADMIN_PROFILE = {
  firstName: "Admin",
  lastName: "Secours",
  email: RECOVERY_ADMIN_EMAIL,
  role: "admin",
  grade: "Major",
};

function observationQuotaCount(counts) {
  const sharedCount = Number(counts?.observations);
  if (Number.isFinite(sharedCount)) return Math.max(0, sharedCount);
  return Math.max(0, Number(counts?.observation_hdr) || 0) + Math.max(0, Number(counts?.observation_so) || 0);
}

const ATTACHMENT_TYPE_BY_EXTENSION = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  pdf: "application/pdf", txt: "text/plain", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function readStoredJson(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const value = localStorage.getItem(key);
    if (!value || value.length > 4_500_000) return fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

let csrfTokenPromise;
let csrfTokenExpiresAt = 0;
async function getCsrfToken() {
  if (!csrfTokenPromise || Date.now() >= csrfTokenExpiresAt) {
    csrfTokenExpiresAt = Date.now() + 50 * 60 * 1000;
    csrfTokenPromise = fetch("/api/security/csrf", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Sécurité de la transmission indisponible.");
        const result = await response.json();
        if (!result.token) throw new Error("Jeton de sécurité invalide.");
        return result.token;
      })
      .catch((error) => { csrfTokenPromise = null; csrfTokenExpiresAt = 0; throw error; });
  }
  return csrfTokenPromise;
}

async function accountRequest(path, method = "GET", body) {
  const headers = {};
  if (method !== "GET") headers["x-csrf-token"] = await getCsrfToken();
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(20_000),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") throw new Error("La sauvegarde prend trop de temps. Réessayez dans quelques instants.");
    throw error;
  }
  let result = {};
  try { result = await response.json(); } catch { /* La réponse d'erreur est traitée ci-dessous. */ }
  if (!response.ok) throw new Error(result?.error || "Le serveur des comptes est indisponible.");
  return result;
}

async function portalRequest(method = "GET", body) {
  const headers = {};
  if (method !== "GET") headers["x-csrf-token"] = await getCsrfToken();
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch("/api/portal/state", {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let result = {};
  try { result = await response.json(); } catch { /* L’erreur est traitée ci-dessous. */ }
  if (!response.ok) throw new Error(result?.error || "La synchronisation du portail est indisponible.");
  return result;
}

const TRANSMISSION_TYPES = {
  recommendation: {
    title: "Recommandation",
    description: "Signaler un AIT qui mérite une recommandation.",
    icon: Medal,
    tone: "blue",
  },
  pcs_exp: {
    title: "Recommandation PCS EXP",
    description: "Transmettre une recommandation pour le parcours PCS EXP.",
    icon: ClipboardCheck,
    tone: "gold",
  },
  observation_hdr: {
    title: "Observation HDR",
    description: "Consigner une observation positive ou négative.",
    icon: MessageSquareText,
    tone: "green",
  },
  observation_so: {
    title: "Observation SO",
    description: "Consigner une observation concernant un Sous-Officier.",
    icon: MessageSquareText,
    tone: "violet",
  },
  specializations: {
    title: "Spécialisations",
    description: "Consultez les compétences et identifiants de l’effectif.",
    icon: BadgeCheck,
    tone: "blue",
  },
  meeting_so: {
    title: "Réunion SO",
    description: "Préparez le suivi de l’effectif et le compte rendu de réunion.",
    icon: ClipboardCheck,
    tone: "violet",
  },
};

const THEME_OPTIONS = [
  { id: "doctrine", label: "Doctrine", mode: "dark", accent: "#c9a521", deep: "#80630d", surface: "#080b09", sidebarA: "#090d0a", sidebarB: "#121711" },
  { id: "clair", label: "Aurore", mode: "dark", accent: "#3caf93", deep: "#1f7565", surface: "#091b1b", sidebarA: "#071716", sidebarB: "#15443c" },
  { id: "sable", label: "Sable", mode: "dark", accent: "#d59a58", deep: "#9d622b", surface: "#1b130d", sidebarA: "#21160e", sidebarB: "#50351c" },
  { id: "rose", label: "Sakura", mode: "dark", accent: "#d76a96", deep: "#9d3e65", surface: "#1d1018", sidebarA: "#24101d", sidebarB: "#522241" },
  { id: "ocean", label: "Nord", mode: "dark", accent: "#4b8ed9", deep: "#2b619f", surface: "#091624", sidebarA: "#0a1b30", sidebarB: "#123e65" },
  { id: "nuit", label: "Nuit", mode: "dark", accent: "#4d82e5", deep: "#284f9c", surface: "#081421", sidebarA: "#0b1a30", sidebarB: "#0d223e" },
  { id: "foret", label: "Forêt", mode: "dark", accent: "#48ba78", deep: "#237247", surface: "#071c15", sidebarA: "#0a261b", sidebarB: "#174b32" },
  { id: "cyberpunk", label: "Cyberpunk", mode: "dark", accent: "#ff45c7", deep: "#a4198c", surface: "#160b22", sidebarA: "#210b31", sidebarB: "#5c1257" },
  { id: "dracula", label: "Dracula", mode: "dark", accent: "#bd93f9", deep: "#7b5cb3", surface: "#282a36", sidebarA: "#1d1e28", sidebarB: "#4a3b68" },
  { id: "volcan", label: "Volcan", mode: "dark", accent: "#ef6a40", deep: "#a83620", surface: "#24120e", sidebarA: "#301411", sidebarB: "#712318" },
  { id: "monochrome", label: "Monochrome", mode: "dark", accent: "#e7e9ef", deep: "#858b99", surface: "#111214", sidebarA: "#17181c", sidebarB: "#383a43" },
];

function themeById(id) {
  return THEME_OPTIONS.find((theme) => theme.id === id) || THEME_OPTIONS.find((theme) => theme.id === "doctrine") || THEME_OPTIONS[0];
}

function readFormDraft(userId, type) {
  if (typeof window === "undefined") return null;
  const drafts = readStoredJson(DRAFTS_KEY, {});
  return drafts && typeof drafts === "object" ? drafts[`${userId}:${type}`] || null : null;
}

function saveFormDraft(userId, type, values) {
  try {
    const drafts = readStoredJson(DRAFTS_KEY, {});
    drafts[`${userId}:${type}`] = { values, savedAt: new Date().toISOString() };
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    // Le formulaire reste utilisable si le stockage local est indisponible.
  }
}

function clearFormDraft(userId, type) {
  try {
    const drafts = readStoredJson(DRAFTS_KEY, {});
    delete drafts[`${userId}:${type}`];
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    // Le formulaire reste utilisable si le stockage local est indisponible.
  }
}

function initials(user) {
  return `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase();
}

function Avatar({ user, size = "", className = "" }) {
  const role = ROLES[user?.role] || ROLES.officer;
  const classes = ["avatar", size, className, role.tone].filter(Boolean).join(" ");
  return <span className={classes}>{initials(user)}{user?.avatarUrl ? <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}</span>;
}

function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return "Bonne nuit";
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  if (hour < 23) return "Bonsoir";
  return "Bonne nuit";
}

function getActivitySubtype(entry) {
  if (entry?.category !== "form" || entry.action !== "Formulaire envoyé") return null;
  const details = String(entry.details || "").toLowerCase();
  if (details.includes("recommandation pcs exp")) return "pcs_exp";
  if (details.includes("recommandation")) return "recommendation";
  if (details.includes("observation hdr")) return "observation_hdr";
  if (details.includes("observation so")) return "observation_so";
  return null;
}

function getActivityType(subtype) {
  if (["recommendation", "pcs_exp"].includes(subtype)) return "recommendation";
  if (["observation_hdr", "observation_so"].includes(subtype)) return "observation";
  return null;
}

function getUserCreatedDate(user) {
  if (user.createdAtIso) {
    const date = new Date(user.createdAtIso);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const normalized = String(user.createdAt || "").toLowerCase().replaceAll(".", "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const match = normalized.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (!match) return null;
  const months = { janv: 0, janvier: 0, fevr: 1, fevrier: 1, mars: 2, avr: 3, avril: 3, mai: 4, juin: 5, juil: 6, juillet: 6, aout: 7, sept: 8, septembre: 8, oct: 9, octobre: 9, nov: 10, novembre: 10, dec: 11, decembre: 11 };
  const month = months[match[2]];
  return month === undefined ? null : new Date(Number(match[3]), month, Number(match[1]));
}

function getSummaryPeriod(period, referenceDate = new Date()) {
  const now = new Date(referenceDate);
  let start;
  if (period === "day") start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  else if (period === "week") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  } else if (period === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
  else start = new Date(now.getFullYear(), 0, 1);
  const bins = [];
  let cursor = new Date(start);
  while (cursor < now) {
    let end;
    let label;
    if (period === "day") {
      end = new Date(cursor); end.setHours(cursor.getHours() + 4);
      label = `${String(cursor.getHours()).padStart(2, "0")}h`;
    } else if (period === "week") {
      end = new Date(cursor); end.setDate(cursor.getDate() + 1);
      label = new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(cursor).replace(".", "");
    } else if (period === "month") {
      end = new Date(cursor); end.setDate(cursor.getDate() + 7);
      const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
      label = `${cursor.getDate()}–${Math.min(cursor.getDate() + 6, lastDay)}`;
    } else {
      end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      label = new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(cursor).replace(".", "");
    }
    bins.push({ start: new Date(cursor), end: end > now ? new Date(now) : end, label });
    cursor = end;
  }
  if (!bins.length) bins.push({ start, end: now, label: period === "day" ? "00h" : "Maintenant" });
  return { start, end: now, bins };
}

// La période « Quota » démarre exactement au dernier reset partagé des quotas.
// Son découpage s’adapte à sa durée, sans créer un graphique illisible quand
// les quotas n’ont pas encore été réinitialisés depuis longtemps.
function getQuotaSummaryPeriod(resetAt, referenceDate = new Date()) {
  const now = new Date(referenceDate);
  const candidate = resetAt ? new Date(resetAt) : null;
  const start = candidate && !Number.isNaN(candidate.getTime()) && candidate <= now ? candidate : new Date(now);
  const duration = Math.max(now.getTime() - start.getTime(), 0);
  const bins = [];
  let cursor = new Date(start);
  const formatter = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" });
  const mode = duration <= 2 * 24 * 60 * 60 * 1000 ? "hours" : duration <= 42 * 24 * 60 * 60 * 1000 ? "days" : duration <= 420 * 24 * 60 * 60 * 1000 ? "weeks" : "months";
  while (cursor < now && bins.length < 60) {
    let end;
    let label;
    if (mode === "hours") {
      end = new Date(cursor); end.setHours(end.getHours() + 4);
      label = `${String(cursor.getHours()).padStart(2, "0")}h`;
    } else if (mode === "days") {
      end = new Date(cursor); end.setDate(end.getDate() + 1);
      label = formatter.format(cursor).replace(".", "");
    } else if (mode === "weeks") {
      end = new Date(cursor); end.setDate(end.getDate() + 7);
      label = formatter.format(cursor).replace(".", "");
    } else {
      end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      label = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" }).format(cursor).replace(".", "");
    }
    bins.push({ start: new Date(cursor), end: end > now ? new Date(now) : end, label });
    cursor = end;
  }
  if (!bins.length) bins.push({ start, end: now, label: "Maintenant" });
  return { start, end: now, bins };
}

function sanitizeChatHtml(html) {
  if (typeof document === "undefined") return "";
  const template = document.createElement("template");
  template.innerHTML = String(html || "");
  const allowedTags = new Set(["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "BR", "DIV", "P", "SPAN", "FONT"]);
  [...template.content.querySelectorAll("*")].forEach((node) => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      return;
    }
    const color = node.style.color || node.getAttribute("color") || "";
    const backgroundColor = node.style.backgroundColor || "";
    [...node.attributes].forEach((attribute) => node.removeAttribute(attribute.name));
    const safeCssColor = (value) => /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(value) ? value : "";
    if (safeCssColor(color)) node.style.color = color;
    if (safeCssColor(backgroundColor)) node.style.backgroundColor = backgroundColor;
  });
  return template.innerHTML.slice(0, 10000);
}

function chatMessageHtml(message) {
  if (message.html) return sanitizeChatHtml(message.html);
  if (typeof document === "undefined") return "";
  const container = document.createElement("div");
  container.textContent = message.text || "";
  return container.innerHTML.replace(/\n/g, "<br>");
}

function chatMessageText(message) {
  if (!message.html || typeof document === "undefined") return message.text || "";
  const container = document.createElement("div");
  container.innerHTML = sanitizeChatHtml(message.html);
  return container.textContent || "";
}

function formatFileSize(size) {
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} Mo` : `${Math.max(1, Math.round(size / 1024))} Ko`;
}

function safeAttachmentUrl(attachment) {
  const match = /^data:([^;,]+);base64,/i.exec(String(attachment?.dataUrl || ""));
  if (!match) return "";
  const mimeType = match[1].toLowerCase();
  const extension = String(attachment?.name || "").split(".").pop()?.toLowerCase();
  return ATTACHMENT_TYPE_BY_EXTENSION[extension] === mimeType && CHAT_ATTACHMENT_TYPES.has(mimeType) ? attachment.dataUrl : "";
}

function RoleBadge({ role }) {
  const item = ROLES[role];
  return <span className={`role-badge ${item.tone}`}><span>{item.short}</span>{item.label}</span>;
}

function MenuGroup({ title, icon: Icon, open, onToggle, children }) {
  return (
    <div className="menu-group">
      <button className="menu-group-toggle" onClick={onToggle}><Icon size={18} /><span>{title}</span><ChevronDown className={open ? "rotated" : ""} size={15} /></button>
      {open && <div className="menu-group-items">{children || <span className="menu-empty">À compléter</span>}</div>}
    </div>
  );
}

function ThemePicker({ themeId, onChange }) {
  const [open, setOpen] = useState(false);
  const activeTheme = themeById(themeId);
  return (
    <div className="theme-picker">
      <button className="theme-picker-trigger" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} title="Choisir le thème de couleurs">
        <span className="theme-swatch" style={{ "--theme-swatch": activeTheme.accent, "--theme-swatch-deep": activeTheme.deep }}><Palette size={15} /></span>
        <span className="theme-picker-label">{activeTheme.label}</span><ChevronDown className={open ? "rotated" : ""} size={15} />
      </button>
      {open && <div className="theme-picker-menu" role="menu" aria-label="Thèmes de couleurs">
        <div className="theme-picker-head"><strong>Thème de couleurs</strong><span>{THEME_OPTIONS.length} ambiances</span></div>
        <div className="theme-options">{THEME_OPTIONS.map((theme) => <button key={theme.id} className={theme.id === themeId ? "selected" : ""} type="button" role="menuitemradio" aria-checked={theme.id === themeId} onClick={() => { onChange(theme.id); setOpen(false); }}><span className="theme-swatch" style={{ "--theme-swatch": theme.accent, "--theme-swatch-deep": theme.deep }}><i /></span><span>{theme.label}</span>{theme.id === themeId && <BadgeCheck size={15} />}</button>)}</div>
      </div>}
    </div>
  );
}

function Login({ configurationError, error }) {
  const previewEnabled = OPENAI_PREVIEW_ENABLED;
  const status = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("discord") || "";
  const messages = {
    pending: "Votre demande a été envoyée. Un administrateur doit encore vous attribuer un niveau d’accès.",
    rejected: "Cette demande d’accès a été refusée. Contactez un administrateur si besoin.",
    blocked: "Ce compte est bloqué. Contactez un administrateur.",
    email_required: "Discord doit autoriser le partage de votre adresse e-mail pour vérifier votre compte.",
    not_configured: "La connexion Discord n’est pas encore configurée par l’administrateur.",
    invalid_link: "Le lien de connexion Discord a expiré. Recommencez la connexion.",
    failed: "La connexion Discord n’a pas pu être finalisée. Réessayez dans un instant.",
  };

  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="brand-mark large"><ShieldCheck size={34} /></div>
        <p className="eyebrow">ESPACE SÉCURISÉ</p>
        <h1>Portail<br />Sous-Officiers</h1>
        <p className="brand-copy">Espace de gestion pour les sous-officiers AIT</p>
        <p className="security-note"><ShieldCheck size={16} /> Accès protégé et données confidentielles</p>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-logo"><div className="brand-mark"><ShieldCheck size={23} /></div><strong>Portail SO</strong></div>
          <p className="eyebrow dark">ACCÈS AU PORTAIL</p>
          <h2>{previewEnabled ? "Aperçu du portail" : "Continuez avec Discord"}</h2>
          <p className="muted">{previewEnabled ? "Ouvrez directement l’aperçu sécurisé pour consulter le portail." : "Connectez-vous avec votre compte Discord pour accéder au portail."}</p>
          <div className="discord-login-panel">
            {previewEnabled ? <><a className={`primary wide discord-login ${configurationError ? "disabled" : ""}`} href={configurationError ? undefined : "/api/auth/preview"} aria-disabled={Boolean(configurationError)}><LayoutDashboard size={20} /> Ouvrir le portail <span>→</span></a><p className="discord-login-note">Accès temporaire réservé à l’aperçu OpenAI.</p></> : <><a className={`primary wide discord-login ${configurationError ? "disabled" : ""}`} href={configurationError ? undefined : "/api/auth/discord"} aria-disabled={Boolean(configurationError)}><MessageSquareText size={20} /> Continuer avec Discord <span>→</span></a><p className="discord-login-note">Lors de votre première connexion, votre demande devra être validée par un administrateur.</p></>}
          </div>
          {(configurationError || error || messages[status]) && <p className="form-error">{configurationError || error || messages[status]}</p>}
        </div>
      </section>
    </main>
  );
}

function LoginTransition({ user }) {
  return (
    <div className="login-transition" role="status" aria-live="polite">
      <div className="transition-glow one" />
      <div className="transition-glow two" />
      <div className="transition-content">
        <div className="transition-mark"><span /><ShieldCheck size={36} /></div>
        <p>CONNEXION SÉCURISÉE</p>
        <h2>{getTimeGreeting()},<br /><strong>{user.grade || GRADES[0]} {user.lastName}</strong></h2>
        <div className="transition-line"><i /></div>
        <small>Préparation de votre espace personnel</small>
      </div>
    </div>
  );
}

function UserModal({ actor, editing, onClose, onSave }) {
  const allowedRoles = actor.role === "admin" ? ["management", "referent", "senior", "officer"] : actor.role === "management" ? ["referent", "senior", "officer"] : ["senior", "officer"];
  const [form, setForm] = useState({ ...editing });
  const [saving, setSaving] = useState(false);
  const isRequest = editing.approvalStatus !== "approved";
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try { await onSave(form); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="icon-button close" onClick={onClose}><X size={20} /></button>
        <p className="eyebrow dark">GESTION DES ACCÈS</p>
        <h2>{isRequest ? "Valider la demande Discord" : "Modifier le compte"}</h2>
        <p className="muted">{isRequest ? "Attribuez le grade et le niveau d’accès avant de valider ou de refuser la demande." : "Les informations Discord restent liées au compte du membre."}</p>
        <form onSubmit={submit}>
          <div className="form-grid">
            <div><label>Prénom</label><input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required /></div>
            <div><label>Nom <span className="optional">(facultatif)</span></label><input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} /></div>
          </div>
          <label>Compte Discord</label><div className="readonly-grade"><span>{form.discordUsername || "Compte Discord lié"}</span><small>Identité vérifiée par Discord.</small></div>
          <div className="form-grid identity-fields"><div><label>Steam ID 64</label><input value={form.steamId64 || ""} onChange={(e) => set("steamId64", e.target.value.replace(/\D/g, ""))} inputMode="numeric" minLength={17} maxLength={17} placeholder="17 chiffres" /></div><div><label>Discord ID</label><input value={form.discordContactId || form.discordId || ""} onChange={(e) => set("discordContactId", e.target.value.replace(/\D/g, ""))} inputMode="numeric" minLength={17} maxLength={20} placeholder="17 à 20 chiffres" /></div></div>
          <section className="specialization-fields"><p className="eyebrow dark">SPÉCIALISATIONS</p><div>{SPECIALIZATION_COLUMNS.map((group) => <label key={group.key}>{group.label}<select value={form[group.key] || "Aucune"} onChange={(e) => set(group.key, e.target.value)}>{SPECIALIZATION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>)}</div></section>
          <label>Grade</label><select value={form.grade || GRADES[0]} onChange={(e) => set("grade", e.target.value)} required>{GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}</select>
          <label>Niveau d’accès</label>
          <select value={form.role} onChange={(e) => set("role", e.target.value)} disabled={editing && !allowedRoles.includes(editing.role)}>
            {(allowedRoles.includes(form.role) ? allowedRoles : [form.role]).map((role) => <option key={role} value={role}>{ROLES[role].label}</option>)}
          </select>
          {isRequest && <><label>Décision</label><select value={form.approvalStatus || "pending"} onChange={(e) => set("approvalStatus", e.target.value)}><option value="pending">Laisser en attente</option><option value="approved">Valider l’accès</option><option value="rejected">Refuser la demande</option></select></>}
          <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Annuler</button><button type="submit" className="primary" disabled={saving}>{saving ? "Enregistrement…" : isRequest ? "Enregistrer la décision" : "Enregistrer"}</button></div>
        </form>
      </div>
    </div>
  );
}

function ProfileModal({ user, onClose, onSave, soundEnabled, onSoundEnabledChange }) {
  const [form, setForm] = useState({ ...user, password: "" });
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try { await onSave(form); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal profile-modal">
        <button className="icon-button close" onClick={onClose}><X size={20} /></button>
        <div className="profile-modal-head"><Avatar user={user} className="profile-avatar" /><div><p className="eyebrow dark">MON COMPTE</p><h2>Personnaliser mon profil</h2><p className="muted">Mettez à jour vos informations personnelles.</p></div></div>
        <form onSubmit={submit}>
          <div className="form-grid"><div><label>Prénom</label><input value={form.firstName} onChange={(event) => set("firstName", event.target.value)} required /></div><div><label>Nom <span className="optional">(facultatif)</span></label><input value={form.lastName} onChange={(event) => set("lastName", event.target.value)} /></div></div>
          <label>Compte Discord</label><div className="readonly-grade"><span>{user.discordUsername || "Compte Discord lié"}</span><small>La connexion est gérée par Discord.</small></div>
          <div className="form-grid identity-fields"><div><label>Steam ID 64</label><input value={form.steamId64 || ""} onChange={(event) => set("steamId64", event.target.value.replace(/\D/g, ""))} inputMode="numeric" minLength={17} maxLength={17} placeholder="17 chiffres" /></div><div><label>Discord ID</label><input value={form.discordContactId || form.discordId || ""} onChange={(event) => set("discordContactId", event.target.value.replace(/\D/g, ""))} inputMode="numeric" minLength={17} maxLength={20} placeholder="17 à 20 chiffres" /></div></div>
          <section className="specialization-fields"><p className="eyebrow dark">MES SPÉCIALISATIONS</p>{hasManagerAccess(user.role) ? <div>{SPECIALIZATION_COLUMNS.map((group) => <label key={group.key}>{group.label}<select value={form[group.key] || "Aucune"} onChange={(event) => set(group.key, event.target.value)}>{SPECIALIZATION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>)}</div> : <div className="readonly-specializations">{SPECIALIZATION_COLUMNS.map((group) => <div key={group.key}><small>{group.label}</small><SpecializationBadge value={form[group.key]} /></div>)}</div>}</section>
          <label>Grade</label>{hasAdminAccess(user.role) ? <select value={form.grade || GRADES[0]} onChange={(event) => set("grade", event.target.value)} required>{GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}</select> : <div className="readonly-grade"><span>{user.grade || GRADES[0]}</span><small>Le grade est géré par un Admin ou une Gérance.</small></div>}
          <label>Niveau d’accès</label><div className="readonly-role"><RoleBadge role={user.role} /><span>Ce niveau est géré par un responsable.</span></div>
          <section className="profile-preferences"><p className="eyebrow dark">PARAMÈTRES</p><label className="preference-toggle"><span className="preference-icon">{soundEnabled ? <Volume2 size={19} /> : <VolumeX size={19} />}</span><span><strong>Sons de l’interface</strong><small>{soundEnabled ? "Des sons discrets sont joués lors des clics." : "Les sons sont désactivés sur cet appareil."}</small></span><input type="checkbox" checked={soundEnabled} onChange={(event) => onSoundEnabledChange(event.target.checked)} aria-label="Activer les sons de l’interface" /><i aria-hidden="true"><span /></i></label></section>
          <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Annuler</button><button type="submit" className="primary" disabled={saving}>{saving ? "Sécurisation…" : "Enregistrer mon profil"}</button></div>
        </form>
      </div>
    </div>
  );
}

function InitialIdentityModal({ user, onSave }) {
  const [form, setForm] = useState(() => ({ steamId64: user.steamId64 || "", discordContactId: user.discordContactId || user.discordId || "" }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    const steamId64 = String(form.steamId64 || "").replace(/\D/g, "");
    const discordContactId = String(form.discordContactId || "").replace(/\D/g, "");
    if (!/^\d{17}$/.test(steamId64)) { setError("Le Steam ID 64 doit contenir exactement 17 chiffres."); return; }
    if (!/^\d{17,20}$/.test(discordContactId)) { setError("L’identifiant Discord doit contenir entre 17 et 20 chiffres."); return; }
    setSaving(true);
    setError("");
    try { await onSave({ steamId64, discordContactId }); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : "La sauvegarde est temporairement indisponible."); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-backdrop identity-setup-backdrop">
      <div className="modal identity-setup-modal" role="dialog" aria-modal="true" aria-labelledby="identity-setup-title">
        <p className="eyebrow dark">PREMIÈRE CONNEXION</p>
        <h2 id="identity-setup-title">Complétez votre profil</h2>
        <p className="muted">Ces informations sont nécessaires pour apparaître dans l’effectif. Elles restent modifiables depuis votre profil.</p>
        <form onSubmit={submit}>
          <label>Steam ID 64</label><input value={form.steamId64} onChange={(event) => set("steamId64", event.target.value.replace(/\D/g, ""))} inputMode="numeric" minLength={17} maxLength={17} required placeholder="17 chiffres" autoFocus />
          <label>Discord ID</label><input value={form.discordContactId} onChange={(event) => set("discordContactId", event.target.value.replace(/\D/g, ""))} inputMode="numeric" minLength={17} maxLength={20} required placeholder="17 à 20 chiffres" />
          <p className="identity-setup-note">Votre Discord ID est prérempli grâce à votre connexion Discord. Vérifiez-le avant de continuer.</p>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions"><button type="submit" className="primary" disabled={saving}>{saving ? "Enregistrement…" : "Accéder au portail"}</button></div>
        </form>
      </div>
    </div>
  );
}

function PresencePanel({ users, onChange }) {
  const team = users.filter((user) => user.approvalStatus === "approved" && ["senior", "officer"].includes(user.role)).sort(compareUsersByGrade);
  const presentCount = team.filter((user) => user.presence !== "absent").length;

  return (
    <section className="presence-card">
      <div className="presence-summary">
        <div><p className="eyebrow dark">SUIVI DE L’ÉQUIPE</p><h2>Tableau des présences</h2><p className="muted">Membres classés du grade le plus élevé au plus bas.</p></div>
        <div className="presence-counts"><span className="present"><UserCheck size={17} /><strong>{presentCount}</strong> présent{presentCount > 1 ? "s" : ""}</span><span className="absent"><UserX size={17} /><strong>{team.length - presentCount}</strong> absent{team.length - presentCount > 1 ? "s" : ""}</span></div>
      </div>
      <div className="table-wrap"><table className="presence-table"><thead><tr><th>Utilisateur</th><th>Grade</th><th>Niveau d’accès</th><th>Situation</th><th>Mettre à jour</th></tr></thead><tbody>
        {team.map((user) => {
          const isPresent = user.presence !== "absent";
          return <tr key={user.id}><td><div className="user-cell"><Avatar user={user} size="small" /><div><strong>{user.firstName} {user.lastName}</strong><small>{user.discordUsername ? `Discord : ${user.discordUsername}` : "Compte Discord lié"}</small></div></div></td><td><span className="grade-badge">{user.grade || GRADES[0]}</span></td><td><RoleBadge role={user.role} /></td><td><span className={`presence-status ${isPresent ? "present" : "absent"}`}><i />{isPresent ? "Présent" : "Absent"}</span></td><td><div className="presence-actions"><button className={isPresent ? "selected present" : ""} onClick={() => onChange(user.id, "present")}><UserCheck size={16} /> Présent</button><button className={!isPresent ? "selected absent" : ""} onClick={() => onChange(user.id, "absent")}><UserX size={16} /> Absent</button></div></td></tr>;
        })}
        {!team.length && <tr><td colSpan="5" className="empty-presence">Aucun Sous-Officier à afficher.</td></tr>}
      </tbody></table></div>
    </section>
  );
}

function WorkforcePanel({ users, quotas }) {
  const roleOrder = ["admin", "management", "referent", "senior", "officer"];
  const targets = { ...DEFAULT_QUOTAS.targets, ...quotas.targets };
  const approvedUsers = users.filter((user) => user.approvalStatus === "approved");
  const roleDescriptions = { admin: "Administration du portail", management: "Gestion complète du portail", referent: "Gestion et encadrement SO", senior: "Sous-Officiers Supérieurs", officer: "Sous-Officiers" };
  const groups = roleOrder.map((role) => ({
    role,
    users: users.filter((user) => user.approvalStatus === "approved" && user.role === role).sort(compareUsersByGrade),
  }));

  function quotaState(user) {
    if (!["senior", "officer"].includes(user.role)) return { label: "Non concerné", tone: "neutral", completed: 0 };
    if (user.presence === "absent") return { label: "Absent", tone: "absent", completed: 0 };
    if (quotas.exemptions?.[user.id]) return { label: "Exempté", tone: "exempt", completed: 4 };
    const counts = quotas.counts?.[user.id] || {};
    const values = { recommendation: counts.recommendation || 0, pcs_exp: counts.pcs_exp || 0, observations: observationQuotaCount(counts), mission_internal: counts.mission_internal || 0 };
    const completed = Object.keys(targets).filter((key) => values[key] >= targets[key]).length;
    return { label: completed === 4 ? "Quota fait" : `${completed}/4 catégories`, tone: completed === 4 ? "done" : "progress", completed };
  }

  return (
    <div className="workforce-directory">
      <section className="workforce-summary"><div><p className="eyebrow dark">VUE D’ENSEMBLE</p><h2>Effectif du portail</h2><p>Les membres sont classés automatiquement par niveau d’accès puis du grade le plus élevé au plus bas.</p></div><div><span><strong>{approvedUsers.length}</strong> membres</span><span><strong>{approvedUsers.filter((user) => user.presence === "absent").length}</strong> absents</span><span><strong>{approvedUsers.filter((user) => user.blocked).length}</strong> bloqués</span></div></section>
      <div className="workforce-groups">{groups.map((group) => <section className={`workforce-group ${ROLES[group.role].tone}`} key={group.role}><header><div><RoleBadge role={group.role} /><span>{roleDescriptions[group.role]}</span></div><strong>{group.users.length}</strong></header><div className="workforce-list">{group.users.map((user) => { const quota = quotaState(user); const concerned = ["senior", "officer"].includes(user.role); return <article key={user.id}><Avatar user={user} /><div className="workforce-name"><strong>{user.grade || GRADES[0]} {user.firstName} {user.lastName}</strong><small>{ROLES[user.role].label}</small><small className="workforce-ids">Steam : {user.steamId64 || "Non renseigné"}<br />Discord : {user.discordContactId || "Non renseigné"}</small></div><span className={`workforce-presence ${concerned ? user.presence === "absent" ? "absent" : "present" : "neutral"}`}>{user.blocked ? "Compte bloqué" : concerned ? user.presence === "absent" ? "Absent" : "Présent" : "Actif"}</span><span className={`workforce-quota ${quota.tone}`}><Gauge size={14} /> {quota.label}</span></article>; })}{!group.users.length && <p className="workforce-empty">Aucun membre dans cette catégorie.</p>}</div></section>)}</div>
    </div>
  );
}

function SpecializationBadge({ value }) {
  const selected = SPECIALIZATION_OPTIONS.includes(value) ? value : "Aucune";
  const tone = /Instr/.test(selected) ? "instruction" : /\bPM\b/.test(selected) ? "pm" : /MDC/.test(selected) ? "mdc" : /ING/.test(selected) ? "ing" : "none";
  return <span className={`specialization-badge ${tone} ${selected === "Aucune" ? "none" : ""}`}>{selected}</span>;
}

function SpecializationsPanel({ users: suppliedUsers }) {
  const [remoteUsers, setRemoteUsers] = useState([]);
  useEffect(() => {
    if (Array.isArray(suppliedUsers)) return;
    accountRequest("/api/auth/users").then((result) => setRemoteUsers(Array.isArray(result.users) ? result.users : [])).catch(() => setRemoteUsers([]));
  }, [suppliedUsers]);
  const users = Array.isArray(suppliedUsers) ? suppliedUsers : remoteUsers;
  const members = users.filter((user) => user.approvalStatus === "approved").sort(compareUsersByGrade);
  const specialists = members.filter((user) => SPECIALIZATION_COLUMNS.some((group) => (user[group.key] || "Aucune") !== "Aucune"));
  return (
    <section className="specializations-card">
      <div className="specializations-head"><div><p className="eyebrow dark">RÉFÉRENT SO</p><h2>Spécialisations</h2><p className="muted">Répartition des compétences par membre. Les modifications se font depuis le profil ou la gestion du compte.</p></div><span><BadgeCheck size={16} /><strong>{specialists.length}</strong> spécialisé{specialists.length > 1 ? "s" : ""}</span></div>
      <div className="table-wrap"><table className="specializations-table"><thead><tr><th>Membre</th><th>Grade</th>{SPECIALIZATION_COLUMNS.map((group) => <th key={group.key}>{group.label}</th>)}<th>Steam ID 64</th><th>Discord ID</th></tr></thead><tbody>{members.map((user) => <tr key={user.id}><td><div className="user-cell"><Avatar user={user} size="small" /><div><strong>{user.firstName} {user.lastName}</strong><small>{ROLES[user.role].label}</small></div></div></td><td><span className="grade-badge">{user.grade || GRADES[0]}</span></td>{SPECIALIZATION_COLUMNS.map((group) => <td key={group.key}><SpecializationBadge value={user[group.key]} /></td>)}<td><code>{user.steamId64 || "Non renseigné"}</code></td><td><code>{user.discordContactId || "Non renseigné"}</code></td></tr>)}{!members.length && <tr><td colSpan={7} className="empty-presence">Aucun membre à afficher.</td></tr>}</tbody></table></div>
    </section>
  );
}

function announcementDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(date);
}

function AnnouncementCenter({ session, announcements, onCreate, onUpdate, onDelete, onAcknowledge }) {
  const canManage = hasManagerAccess(session.role);
  const [editor, setEditor] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const unreadCount = announcements.filter((announcement) => !announcement.read).length;

  function openEditor(announcement = null) {
    setError("");
    setEditor(announcement ? {
      id: announcement.id,
      title: announcement.title,
      content: announcement.content,
      pinned: announcement.pinned,
    } : { id: "", title: "", content: "", pinned: true });
  }

  async function save(event) {
    event.preventDefault();
    if (!editor?.title.trim() || !editor.content.trim()) {
      setError("Renseignez un titre et le contenu de l’annonce.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editor.id) await onUpdate(editor.id, editor);
      else await onCreate(editor);
      setEditor(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "L’annonce n’a pas pu être enregistrée.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(announcement) {
    if (!confirm(`Supprimer l’annonce « ${announcement.title} » ?`)) return;
    try {
      await onDelete(announcement.id);
      if (editor?.id === announcement.id) setEditor(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "L’annonce n’a pas pu être supprimée.");
    }
  }

  async function acknowledge(announcement) {
    try { await onAcknowledge(announcement.id); }
    catch (acknowledgeError) { setError(acknowledgeError instanceof Error ? acknowledgeError.message : "L’accusé de lecture n’a pas pu être enregistré."); }
  }

  return <section className="home-card announcements-card">
    <div className="home-card-head announcements-head">
      <div><p className="eyebrow dark">CENTRE D’ANNONCES</p><h2>Informations importantes</h2></div>
      <div className="announcement-head-actions"><span><Pin size={15} /> {unreadCount ? `${unreadCount} à lire` : "Tout est lu"}</span>{canManage && <button className="announcement-publish" type="button" onClick={() => openEditor()}><Bell size={15} /> Publier</button>}</div>
    </div>
    {editor && <form className="announcement-editor" onSubmit={save}>
      <div><strong>{editor.id ? "Modifier l’annonce" : "Nouvelle annonce"}</strong><small>Elle sera visible immédiatement par tous les membres du portail.</small></div>
      <input value={editor.title} onChange={(event) => setEditor((current) => ({ ...current, title: event.target.value }))} maxLength={140} placeholder="Titre de l’annonce" required />
      <textarea value={editor.content} onChange={(event) => setEditor((current) => ({ ...current, content: event.target.value }))} maxLength={2400} placeholder="Rédigez le message important…" required />
      <label className="announcement-pin-toggle"><input type="checkbox" checked={editor.pinned} onChange={(event) => setEditor((current) => ({ ...current, pinned: event.target.checked }))} /> <Pin size={14} /> Épingler cette annonce</label>
      {error && <p className="form-error">{error}</p>}
      <div className="announcement-editor-actions"><button className="secondary" type="button" onClick={() => { setEditor(null); setError(""); }}>Annuler</button><button className="primary" type="submit" disabled={saving}>{saving ? "Enregistrement…" : editor.id ? "Enregistrer" : "Publier l’annonce"}</button></div>
    </form>}
    {!editor && error && <p className="form-error announcement-error">{error}</p>}
    <div className="announcement-list">{announcements.map((announcement) => <article className={`${announcement.pinned ? "pinned" : ""} ${announcement.read ? "read" : "unread"}`} key={announcement.id}>
      <div className="announcement-item-head"><div>{announcement.pinned && <span className="announcement-pin"><Pin size={13} /> Épinglée</span>}<h3>{announcement.title}</h3></div>{canManage && <div className="announcement-manage-actions"><button type="button" title="Modifier l’annonce" aria-label="Modifier l’annonce" onClick={() => openEditor(announcement)}><Pencil size={14} /></button><button type="button" title="Supprimer l’annonce" aria-label="Supprimer l’annonce" onClick={() => remove(announcement)}><Trash2 size={14} /></button></div>}</div>
      <p>{announcement.content}</p>
      <div className="announcement-footer"><small>Publié par {announcement.publishedBy} · {announcementDate(announcement.publishedAt)}{announcement.updatedAt && " · modifié"}</small><div>{canManage && <span className="announcement-read-count"><UserCheck size={14} /> {announcement.readCount}/{announcement.audienceCount || 0} lu{announcement.readCount > 1 ? "s" : ""}</span>}<button className={announcement.read ? "announcement-ack read" : "announcement-ack"} type="button" disabled={announcement.read} onClick={() => acknowledge(announcement)}>{announcement.read ? <><BadgeCheck size={15} /> Lu</> : <><BadgeCheck size={15} /> J’ai lu</>}</button></div></div>
    </article>)}{!announcements.length && <div className="announcement-empty"><Bell size={24} /><strong>Aucune annonce pour le moment</strong><p>Les informations importantes apparaîtront ici.</p></div>}</div>
  </section>;
}

function HomePanel({ session, users, missions, chats, quotas, logs, assignments, portalNotifications, announcements, shortcutIds, onSaveShortcuts, onNavigate, onDismissNotification, onClearNotifications, onCreateAnnouncement, onUpdateAnnouncement, onDeleteAnnouncement, onAcknowledgeAnnouncement }) {
  const isManager = hasManagerAccess(session.role);
  const isQuotaMember = ["senior", "officer"].includes(session.role);
  const shortcutCatalog = PORTAL_SECTION_REGISTRY
    .filter((item) => hasSectionAccess(session.role, item.access))
    .map((item) => ({ ...item, label: item.shortcutLabel || item.label, icon: <item.icon size={18} /> }));
  const defaultShortcutIds = ["summary", "chat", "mission_internal", session.role === "senior" ? "observation_so" : "observation_hdr"];
  const selectedShortcutIds = (shortcutIds?.length ? shortcutIds : defaultShortcutIds).filter((id) => shortcutCatalog.some((item) => item.id === id));
  const [editingShortcuts, setEditingShortcuts] = useState(false);
  const [shortcutDraft, setShortcutDraft] = useState(selectedShortcutIds);
  useEffect(() => setShortcutDraft(selectedShortcutIds), [shortcutIds, session.role]);
  const team = users.filter((user) => user.approvalStatus === "approved" && ["senior", "officer"].includes(user.role));
  const activeAccounts = users.filter((user) => user.approvalStatus === "approved" && !user.blocked).length;
  const myChats = chats.filter((chat) => hasChatParticipant(chat, session.id));
  const pendingMissions = missions.filter((mission) => mission.status === "pending");
  const myMissions = missions.filter((mission) => mission.userId === session.id);
  const myReportAssignments = assignments.filter((assignment) => assignment.observerId === session.id && assignment.status === "active");
  const mySergeantAssignment = assignments.find((assignment) => assignment.sergeantId === session.id && assignment.status === "active");
  const mySergeantReferent = mySergeantAssignment ? users.find((user) => user.id === mySergeantAssignment.observerId) : null;
  const targets = { ...DEFAULT_QUOTAS.targets, ...quotas.targets };
  const counts = quotas.counts?.[session.id] || {};
  const categoryCounts = { recommendation: counts.recommendation || 0, pcs_exp: counts.pcs_exp || 0, observations: observationQuotaCount(counts), mission_internal: counts.mission_internal || 0 };
  const completedQuotaCategories = Object.keys(targets).filter((category) => categoryCounts[category] >= targets[category]).length;
  const quotaItems = [
    { key: "recommendation", label: "Recommandations", icon: <Medal size={17} /> },
    { key: "pcs_exp", label: "Reco PCS EXP", icon: <ClipboardCheck size={17} /> },
    { key: "observations", label: "Observations HDR + SO", icon: <MessageSquareText size={17} /> },
    { key: "mission_internal", label: "Missions internes", icon: <FileText size={17} /> },
  ];
  const remainingTotal = quotaItems.reduce((total, item) => total + Math.max((targets[item.key] || 0) - (categoryCounts[item.key] || 0), 0), 0);
  const isAbsent = session.presence === "absent";
  const isExempted = quotas.exemptions?.[session.id] === true;
  const receivedNotifications = portalNotifications
    .filter((notification) => !Array.isArray(notification.recipients) || notification.recipients.includes(session.id))
  const notifications = receivedNotifications
    .slice(0, 8)
    .map((notification) => ({
      tone: notification.kind === "message" ? "info" : "success",
      icon: notification.kind === "message" ? <MessageSquareText size={17} /> : <FileText size={17} />,
      id: notification.id,
      dismissible: true,
      title: notification.title,
      text: notification.text,
      target: notification.target || "home",
    }));
  if (isManager && pendingMissions.length) notifications.push({ tone: "warning", icon: <FileText size={17} />, title: `${pendingMissions.length} mission${pendingMissions.length > 1 ? "s" : ""} en attente`, text: "Des documents attendent une validation ou un refus.", target: "mission_internal" });
  if (session.presence === "absent") notifications.push({ tone: "danger", icon: <UserX size={17} />, title: "Vous êtes indiqué absent", text: "Vos quotas sont temporairement affichés comme absents.", target: "home" });
  if (quotas.exemptions?.[session.id]) notifications.push({ tone: "info", icon: <ShieldCheck size={17} />, title: "Vous êtes exempté de quota", text: "Les objectifs restent enregistrés mais ne sont pas exigés.", target: "home" });
  if (isQuotaMember && !isAbsent && !isExempted && remainingTotal > 0) notifications.push({ tone: "info", icon: <Gauge size={17} />, title: `${remainingTotal} action${remainingTotal > 1 ? "s" : ""} restante${remainingTotal > 1 ? "s" : ""}`, text: "Consultez le détail de vos quotas sur cette page.", target: "home" });
  if (mySergeantAssignment) {
    const deadline = mySergeantAssignment.dueDate ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(`${mySergeantAssignment.dueDate}T12:00:00`)) : "non définie";
    const referentName = mySergeantReferent ? `${mySergeantReferent.grade || GRADES[0]} ${mySergeantReferent.firstName} ${mySergeantReferent.lastName}` : "Référent à confirmer";
    notifications.push({ tone: "info", icon: <UserCheck size={17} />, title: `Votre référent de suivi : ${referentName}`, text: `Il vous accompagne pendant votre semaine de test. Date limite du rapport : ${deadline}.`, target: "home" });
  }
  myReportAssignments.forEach((assignment) => {
    const sergeant = users.find((user) => user.id === assignment.sergeantId);
    const deadline = assignment.dueDate ? new Date(`${assignment.dueDate}T23:59:59`) : null;
    const overdue = deadline && deadline < new Date();
    const formattedDeadline = deadline ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(deadline) : "non définie";
    notifications.push({ tone: overdue ? "danger" : assignment.reminderAt ? "warning" : "info", icon: <FileText size={17} />, title: `${assignment.reminderAt ? "Rappel : " : ""}rapport de ${sergeant ? `${sergeant.grade} ${sergeant.lastName}` : "votre Sergent"}`, text: overdue ? `Échéance dépassée depuis le ${formattedDeadline}.` : `Rapport à remettre avant le ${formattedDeadline}.`, target: "sergeant_report" });
  });
  const rejectedMissions = myMissions.filter((mission) => mission.status === "rejected").length;
  if (rejectedMissions) notifications.push({ tone: "danger", icon: <X size={17} />, title: `${rejectedMissions} mission${rejectedMissions > 1 ? "s" : ""} refusée${rejectedMissions > 1 ? "s" : ""}`, text: "Consultez vos dépôts pour les corriger ou les supprimer.", target: "mission_internal" });
  if (myChats.length) notifications.push({ tone: "info", icon: <MessageSquareText size={17} />, title: `${myChats.length} discussion${myChats.length > 1 ? "s" : ""} disponible${myChats.length > 1 ? "s" : ""}`, text: "Ouvrez la messagerie pour consulter vos échanges.", target: "chat" });
  const visibleActivity = isManager ? logs.slice(0, 5) : logs.filter((entry) => entry.actorId === session.id).slice(0, 5);
  const today = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

  return (
    <div className="home-dashboard">
      <section className="home-hero"><div><span className="home-date">{today}</span><h2>{getTimeGreeting()}, {session.grade || GRADES[0]} {session.lastName}</h2><p>Voici les informations importantes de votre espace Sous-Officiers.</p></div><Avatar user={session} className="home-avatar" /></section>
      <section className="home-stats"><article><span className="home-stat-icon blue"><UsersRound size={20} /></span><div><strong>{activeAccounts}</strong><small>Comptes actifs</small></div></article><article><span className="home-stat-icon violet"><MessageSquareText size={20} /></span><div><strong>{myChats.length}</strong><small>Mes discussions</small></div></article><article><span className="home-stat-icon gold"><FileText size={20} /></span><div><strong>{isManager ? pendingMissions.length : myMissions.length}</strong><small>{isManager ? "Missions à traiter" : "Mes missions"}</small></div></article><article><span className="home-stat-icon green"><Gauge size={20} /></span><div><strong>{isQuotaMember ? remainingTotal : team.filter((user) => user.presence !== "absent").length}</strong><small>{isQuotaMember ? "Actions restantes" : "SO présents"}</small></div></article></section>
      <AnnouncementCenter session={session} announcements={announcements} onCreate={onCreateAnnouncement} onUpdate={onUpdateAnnouncement} onDelete={onDeleteAnnouncement} onAcknowledge={onAcknowledgeAnnouncement} />
      {isQuotaMember && <section className="home-card home-quota-card"><div className="home-card-head"><div><p className="eyebrow dark">MES OBJECTIFS</p><h2>Mes quotas</h2></div><span className={isAbsent ? "quota-status-absent" : isExempted ? "quota-status-exempt" : ""}><Gauge size={17} /> {isAbsent ? "Absent" : isExempted ? "Exempté" : `${completedQuotaCategories}/4 terminés`}</span></div><div className="home-quota-grid">{quotaItems.map((item) => {
        const target = targets[item.key] || 0;
        const count = categoryCounts[item.key] || 0;
        const remaining = Math.max(target - count, 0);
        const progress = target === 0 ? 100 : Math.min((count / target) * 100, 100);
        const status = isAbsent ? "Absent" : isExempted ? "Exempté" : target === 0 ? "Aucun quota demandé" : remaining > 0 ? `Reste ${remaining}` : "Terminé";
        return <article key={item.key} className={remaining === 0 ? "completed" : ""}><div className="home-quota-title"><span>{item.icon}</span><strong>{item.label}</strong></div><div className="home-quota-numbers"><strong>{count}<small> / {target}</small></strong><em>{status}</em></div><div className="home-quota-progress"><i style={{ width: `${progress}%` }} /></div></article>;
      })}</div></section>}
      <div className="home-grid">
        <section className="home-card notifications-card"><div className="home-card-head"><div><p className="eyebrow dark">CENTRE D’INFORMATIONS</p><h2>Notifications importantes</h2></div><div className="notifications-head-actions">{receivedNotifications.length > 0 && <button className="clear-notifications" type="button" onClick={onClearNotifications}><Trash2 size={14} /> Tout effacer</button>}<span><Bell size={17} /> {notifications.length}</span></div></div><div className="notification-list">{notifications.map((notification, index) => <div className={`notification-entry ${notification.tone}`} key={notification.id || `${notification.title}-${index}`}><button type="button" onClick={() => onNavigate(notification.target)}><span>{notification.icon}</span><span><strong>{notification.title}</strong><small>{notification.text}</small></span></button>{notification.dismissible && <button className="dismiss-notification" type="button" title="Supprimer cette notification" aria-label="Supprimer cette notification" onClick={() => onDismissNotification(notification.id)}><X size={15} /></button>}</div>)}{!notifications.length && <div className="no-notification"><BadgeCheck size={25} /><strong>Tout est à jour</strong><p>Aucune notification importante pour le moment.</p></div>}</div></section>
        <section className="home-card quick-card"><div className="home-card-head"><div><p className="eyebrow dark">ACCÈS RAPIDE</p><h2>Mes raccourcis</h2></div><button className="shortcut-edit-button" onClick={() => { setShortcutDraft(selectedShortcutIds); setEditingShortcuts((current) => !current); }}><Settings2 size={15} /> {editingShortcuts ? "Fermer" : "Personnaliser"}</button></div>{editingShortcuts ? <div className="shortcut-editor"><p>Choisissez les rubriques affichées sur votre accueil.</p><div className="shortcut-options">{shortcutCatalog.map((item) => <label className={shortcutDraft.includes(item.id) ? "selected" : ""} key={item.id}><input type="checkbox" checked={shortcutDraft.includes(item.id)} onChange={() => setShortcutDraft((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span>{item.icon}</span>{item.label}</label>)}</div><div className="shortcut-editor-actions"><button className="secondary" onClick={() => setShortcutDraft(defaultShortcutIds)}>Par défaut</button><button className="primary" disabled={!shortcutDraft.length} onClick={() => { onSaveShortcuts(shortcutDraft); setEditingShortcuts(false); }}>Enregistrer</button></div></div> : <div className="quick-actions">{shortcutCatalog.filter((item) => selectedShortcutIds.includes(item.id)).map((item) => <button key={item.id} onClick={() => onNavigate(item.id)}>{item.icon}<span><strong>{item.label}</strong><small>{item.description}</small></span></button>)}</div>}</section>
        <section className="home-card activity-card"><div className="home-card-head"><div><p className="eyebrow dark">ACTIVITÉ RÉCENTE</p><h2>{isManager ? "Dernières actions du portail" : "Mes dernières actions"}</h2></div>{isManager && <button onClick={() => onNavigate("logs")}>Voir tous les logs</button>}</div><div className="home-activity-list">{visibleActivity.map((entry) => <article key={entry.id}><span className={`log-dot ${entry.category}`} /><div><strong>{entry.action}</strong><small>{entry.actorName} · {entry.displayAt}</small>{entry.details && <p>{entry.details}</p>}</div></article>)}{!visibleActivity.length && <p className="chat-empty-small">Aucune activité enregistrée pour le moment.</p>}</div></section>
        <section className="home-card identity-card"><p className="eyebrow dark">MON ESPACE</p><h2>{session.grade || GRADES[0]}</h2><RoleBadge role={session.role} /><div><span>État du compte</span><strong className="identity-active"><BadgeCheck size={15} /> Actif</strong></div><div><span>Présence</span><strong>{session.presence === "absent" ? "Absent" : ["senior", "officer"].includes(session.role) ? "Présent" : "Non concerné"}</strong></div>{mySergeantAssignment && <div className="identity-referent"><span>Référent de suivi</span><strong>{mySergeantReferent ? `${mySergeantReferent.grade || GRADES[0]} ${mySergeantReferent.firstName} ${mySergeantReferent.lastName}` : "À confirmer"}</strong></div>}</section>
      </div>
    </div>
  );
}

function SummaryPanel({ session, users, submissions, activityResetAt, rankingResetAt, quotaResetAt, onResetActivity, onResetRanking }) {
  const [period, setPeriod] = useState("quota");
  const [scope, setScope] = useState("global");
  const allSeries = [
    { subtype: "recommendation", label: "Recommandation", shortLabel: "Reco", tone: "recommendation", kpiTone: "blue", icon: Medal },
    { subtype: "pcs_exp", label: "Recommandation PCS EXP", shortLabel: "PCS EXP", tone: "pcs-exp", kpiTone: "gold", icon: ClipboardCheck },
    { subtype: "observation_hdr", label: "Observation HDR", shortLabel: "Obs. HDR", tone: "observation-hdr", kpiTone: "green", icon: MessageSquareText },
    { subtype: "observation_so", label: "Observation SO", shortLabel: "Obs. SO", tone: "observation-so", kpiTone: "violet", icon: MessageSquareText },
  ];
  // Le résumé est commun à tous : chaque niveau d'accès voit les quatre catégories.
  const visibleSeries = allSeries;
  const visibleSubtypes = new Set(visibleSeries.map((series) => series.subtype));
  const periodLabels = { day: "Aujourd’hui", week: "Cette semaine", month: "Ce mois", year: "Cette année", quota: "Depuis le dernier reset des quotas" };
  const allActivity = submissions.map((submission) => {
    const subtype = submission?.type;
    return {
      ...submission,
      subtype,
      type: getActivityType(subtype),
      actorId: submission.authorId,
      actorName: submission.authorName,
      date: new Date(submission.createdAt),
    };
  }).filter((entry) => visibleSubtypes.has(entry.subtype) && !Number.isNaN(entry.date.getTime()));
  const earliestActivity = allActivity.reduce((earliest, entry) => !earliest || entry.date < earliest ? entry.date : earliest, null);
  const quotaResetDate = quotaResetAt ? new Date(quotaResetAt) : null;
  const quotaStart = quotaResetDate && !Number.isNaN(quotaResetDate.getTime()) ? quotaResetDate : earliestActivity || new Date();
  const periodData = period === "quota" ? getQuotaSummaryPeriod(quotaStart) : getSummaryPeriod(period);
  const resetDate = activityResetAt ? new Date(activityResetAt) : null;
  const activityAfterReset = resetDate && !Number.isNaN(resetDate.getTime()) ? allActivity.filter((entry) => entry.date >= resetDate) : allActivity;
  const activityForPeriod = period === "quota" ? allActivity.filter((entry) => entry.date >= quotaStart) : activityAfterReset;
  const scopedActivity = scope === "self" ? activityForPeriod.filter((entry) => entry.actorId === session.id) : activityForPeriod;
  const currentActivity = scopedActivity.filter((entry) => entry.date >= periodData.start && entry.date <= periodData.end);
  const duration = Math.max(periodData.end.getTime() - periodData.start.getTime(), 1);
  const previousStart = new Date(periodData.start.getTime() - duration);
  const previousActivity = period === "quota" ? [] : scopedActivity.filter((entry) => entry.date >= previousStart && entry.date < periodData.start);
  const counts = Object.fromEntries(visibleSeries.map((series) => [series.subtype, currentActivity.filter((entry) => entry.subtype === series.subtype).length]));
  const trend = previousActivity.length ? Math.round(((currentActivity.length - previousActivity.length) / previousActivity.length) * 100) : currentActivity.length ? 100 : 0;
  const activeMembers = new Set(currentActivity.map((entry) => entry.actorId)).size;
  const chartBins = periodData.bins.map((bin) => {
    const entries = currentActivity.filter((entry) => entry.date >= bin.start && entry.date <= bin.end);
    return { ...bin, counts: Object.fromEntries(visibleSeries.map((series) => [series.subtype, entries.filter((entry) => entry.subtype === series.subtype).length])) };
  });
  const chartMaximum = Math.max(1, ...chartBins.flatMap((bin) => visibleSeries.map((series) => bin.counts[series.subtype])));
  const totalForBin = (bin) => visibleSeries.reduce((total, series) => total + bin.counts[series.subtype], 0);
  const busiestBin = chartBins.reduce((best, bin) => totalForBin(bin) > totalForBin(best) ? bin : best, chartBins[0]);
  const team = users.filter((user) => user.approvalStatus === "approved" && ["senior", "officer"].includes(user.role));
  // Le classement inclut l'ensemble des encadrants SO : Référents, SO supérieurs et SO.
  const rankingTeam = users.filter((user) => user.approvalStatus === "approved" && ["referent", "senior", "officer"].includes(user.role));
  const rankingResetDate = rankingResetAt ? new Date(rankingResetAt) : null;
  const rankingFloor = rankingResetDate && !Number.isNaN(rankingResetDate.getTime()) ? new Date(Math.max(periodData.start.getTime(), rankingResetDate.getTime())) : periodData.start;
  const rankingActivity = allActivity.filter((entry) => entry.date >= rankingFloor && entry.date <= periodData.end);
  const ranking = rankingTeam.map((user) => {
    const entries = rankingActivity.filter((entry) => entry.actorId === user.id);
    return { user, counts: Object.fromEntries(visibleSeries.map((series) => [series.subtype, entries.filter((entry) => entry.subtype === series.subtype).length])), total: entries.length };
  }).sort((a, b) => b.total - a.total || `${a.user.lastName}`.localeCompare(b.user.lastName));
  const rankingMaximum = Math.max(1, ...ranking.map((item) => item.total));
  const arrivalStart = resetDate && !Number.isNaN(resetDate.getTime()) ? new Date(Math.max(periodData.start.getTime(), resetDate.getTime())) : periodData.start;
  const arrivals = team.map((user) => ({ user, date: getUserCreatedDate(user) })).filter((item) => item.date && item.date >= arrivalStart && item.date <= periodData.end);
  const arrivalBins = periodData.bins.map((bin) => ({ ...bin, count: arrivals.filter((item) => item.date >= bin.start && item.date <= bin.end).length }));
  const arrivalMaximum = Math.max(1, ...arrivalBins.map((bin) => bin.count));
  const canReset = hasAdminAccess(session.role);

  return (
    <div className="summary-dashboard">
      <section className="summary-toolbar"><div><p className="eyebrow dark">PÉRIODE ANALYSÉE</p><h2>{periodLabels[period]}</h2><p>{period === "quota" ? "Recommandations et observations réalisées depuis la dernière réinitialisation des quotas." : "Les données sont calculées à partir des transmissions enregistrées sur le portail."}</p></div><div className="summary-controls"><label>Affichage<select value={scope} onChange={(event) => setScope(event.target.value)}><option value="global">Vue globale</option><option value="self">Moi uniquement</option></select></label><label>Période<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="day">Jour</option><option value="week">Semaine</option><option value="month">Mois</option><option value="year">Année</option><option value="quota">Quota</option></select></label>{canReset && <><button className="summary-reset-button" onClick={onResetActivity}><RotateCcw size={16} /> Reset graphiques</button><button className="summary-reset-button" onClick={onResetRanking}><Trophy size={16} /> Reset classement</button></>}</div></section>
      <section className="summary-kpis"><article><span className="summary-kpi-icon blue"><BarChart3 size={20} /></span><div><strong>{currentActivity.length}</strong><small>Transmissions</small></div><em className={trend >= 0 ? "positive" : "negative"}><TrendingUp size={13} /> {trend >= 0 ? "+" : ""}{trend}%</em></article>{visibleSeries.map((series) => { const SeriesIcon = series.icon; return <article key={series.subtype}><span className={`summary-kpi-icon ${series.kpiTone}`}><SeriesIcon size={20} /></span><div><strong>{counts[series.subtype]}</strong><small>{series.label}</small></div></article>; })}<article><span className="summary-kpi-icon green"><UsersRound size={20} /></span><div><strong>{activeMembers}</strong><small>Membres actifs</small></div></article></section>
      <div className="summary-grid">
        <section className="summary-card activity-chart-card"><div className="summary-card-head"><div><p className="eyebrow dark">ÉVOLUTION</p><h2>Activité détaillée par catégorie</h2></div><div className="chart-legend">{visibleSeries.map((series) => <span key={series.subtype}><i className={series.tone} /> {series.shortLabel}</span>)}</div></div><div className="activity-chart">{chartBins.map((bin, index) => <div className="activity-column" key={`${bin.label}-${index}`}><div className="activity-bars">{visibleSeries.map((series) => { const value = bin.counts[series.subtype]; return <span className={`series-bar ${series.tone}`} key={series.subtype} title={`${series.label} : ${value}`} style={{ height: `${value ? Math.max((value / chartMaximum) * 100, 7) : 2}%` }} />; })}</div><span>{bin.label}</span></div>)}</div><div className="chart-insight"><CalendarDays size={16} /><span>Période la plus active : <strong>{busiestBin?.label || "—"}</strong></span></div></section>
        <section className="summary-card distribution-card"><div className="summary-card-head"><div><p className="eyebrow dark">RÉPARTITION</p><h2>Volumes détaillés</h2><p>Chaque catégorie est comptée séparément.</p></div></div><div className="distribution-details detailed">{visibleSeries.map((series) => <div key={series.subtype}><span><i className={series.tone} /><span>{series.label}<small>{counts[series.subtype]} transmission{counts[series.subtype] > 1 ? "s" : ""}</small></span></span><strong>{currentActivity.length ? Math.round((counts[series.subtype] / currentActivity.length) * 100) : 0}%</strong></div>)}</div></section>
        <section className="summary-card ranking-card"><div className="summary-card-head"><div><p className="eyebrow dark">CLASSEMENT</p><h2>Sous-Officiers et Référents les plus actifs</h2><p>Tous les Référents SO, Sous-Officiers Supérieurs et Sous-Officiers sont affichés.</p></div></div><div className="ranking-list">{ranking.map((item, index) => <article key={item.user.id}><span className={`rank-position rank-${index + 1}`}>{index < 3 ? <Trophy size={15} /> : index + 1}</span><Avatar user={item.user} size="small" /><div className="rank-member"><strong>{item.user.grade} {item.user.firstName} {item.user.lastName}</strong><small>{visibleSeries.map((series) => `${series.shortLabel} : ${item.counts[series.subtype]}`).join(" · ")}</small><div><i style={{ width: `${(item.total / rankingMaximum) * 100}%` }} /></div></div><strong className="rank-score">{item.total}</strong></article>)}</div>{rankingResetAt && <p className="ranking-reset-date">Classement réinitialisé le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(rankingResetAt))}</p>}</section>
        <section className="summary-card arrivals-card"><div className="summary-card-head"><div><p className="eyebrow dark">EFFECTIFS</p><h2>Arrivées de Sous-Officiers</h2><p>{arrivals.length} arrivée{arrivals.length > 1 ? "s" : ""} sur la période.</p></div><span><UsersRound size={17} /> {team.length} membres</span></div><div className="arrivals-chart">{arrivalBins.map((bin, index) => <div key={`${bin.label}-${index}`}><i title={`${bin.count} arrivée(s)`} style={{ height: `${bin.count ? Math.max((bin.count / arrivalMaximum) * 100, 9) : 3}%` }}><b>{bin.count || ""}</b></i><span>{bin.label}</span></div>)}</div></section>
      </div>
    </div>
  );
}

function LogsPanel({ session, logs, onClear }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const categories = [...new Set(logs.map((entry) => entry.category))];
  const filteredLogs = logs.filter((entry) => {
    const haystack = `${entry.actorName} ${entry.action} ${entry.details || ""}`.toLowerCase();
    return (category === "all" || entry.category === category) && haystack.includes(query.toLowerCase());
  });

  function exportLogs() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `logs-portail-so-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
<section className="logs-card"><div className="logs-summary"><div><p className="eyebrow dark">JOURNAL D’AUDIT</p><h2>Activité du portail</h2><p className="muted">Les {Math.min(logs.length, 500)} dernières actions importantes sont conservées.</p></div><div><span><ScrollText size={18} /> {logs.length} entrées</span><button className="secondary" onClick={exportLogs}><Download size={16} /> Exporter</button>{hasAdminAccess(session.role) && <button className="clear-logs" onClick={onClear}><Trash2 size={16} /> Réinitialiser</button>}</div></div><div className="logs-filters"><div className="search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une action…" /></div><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Toutes les catégories</option>{categories.map((item) => <option value={item} key={item}>{LOG_CATEGORY_LABELS[item] || item}</option>)}</select></div><div className="table-wrap"><table className="logs-table"><thead><tr><th>Date</th><th>Acteur</th><th>Catégorie</th><th>Action</th><th>Détails</th></tr></thead><tbody>{filteredLogs.map((entry) => <tr key={entry.id}><td>{entry.displayAt}</td><td><strong>{entry.actorName}</strong><small>{entry.actorRole ? ROLES[entry.actorRole]?.label || entry.actorRole : "Système"}</small></td><td><span className={`log-category ${entry.category}`}>{LOG_CATEGORY_LABELS[entry.category] || entry.category}</span></td><td><strong>{entry.action}</strong></td><td>{entry.details || "—"}</td></tr>)}{!filteredLogs.length && <tr><td colSpan="5" className="empty-presence">Aucun log ne correspond à votre recherche.</td></tr>}</tbody></table></div></section>
  );
}

function QuotaPanel({ users, quotas, onTargetChange, onReset, onToggleExemption }) {
  const team = users.filter((user) => user.approvalStatus === "approved" && ["senior", "officer"].includes(user.role)).sort(compareUsersByGrade);
  const targets = { ...DEFAULT_QUOTAS.targets, ...quotas.targets };

  return (
    <section className="quota-card">
      <div className="quota-head">
        <div><p className="eyebrow dark">SUIVI DES TRANSMISSIONS</p><h2>Quotas par catégorie</h2><p className="muted">Membres classés du grade le plus élevé au plus bas.</p></div>
        <div className="quota-controls"><label>Recommandation<input type="number" min="0" max="100" value={targets.recommendation} onChange={(event) => onTargetChange("recommendation", event.target.value)} /></label><label>PCS EXP<input type="number" min="0" max="100" value={targets.pcs_exp} onChange={(event) => onTargetChange("pcs_exp", event.target.value)} /></label><label>Observations<input type="number" min="0" max="100" value={targets.observations} onChange={(event) => onTargetChange("observations", event.target.value)} /></label><label>Missions internes<input type="number" min="0" max="100" value={targets.mission_internal} onChange={(event) => onTargetChange("mission_internal", event.target.value)} /></label><button className="reset-quota" onClick={onReset}><RotateCcw size={16} /> Réinitialiser</button></div>
      </div>
      <div className="table-wrap"><table className="quota-table"><thead><tr><th>Utilisateur</th><th>Recommandation</th><th>Recommandation PCS EXP</th><th>Observations HDR + SO</th><th>Missions internes</th><th>Statut global</th><th>Gestion</th></tr></thead><tbody>
        {team.map((user) => {
          const counts = quotas.counts?.[user.id] || {};
          const isAbsent = user.presence === "absent";
          const isExempted = quotas.exemptions?.[user.id] === true;
          const categoryCounts = { recommendation: counts.recommendation || 0, pcs_exp: counts.pcs_exp || 0, observations: observationQuotaCount(counts), mission_internal: counts.mission_internal || 0 };
          const completed = Object.keys(targets).every((category) => categoryCounts[category] >= targets[category]);
          const quotaCell = (category, detail = "") => {
            const count = categoryCounts[category];
            const target = targets[category];
            if (isAbsent || isExempted) return <div className={`quota-unavailable ${isAbsent ? "absent" : "exempted"}`}><span>{isAbsent ? <UserX size={15} /> : <ShieldCheck size={15} />}{isAbsent ? "Absent" : "Exempté"}</span><small>{count}/{target} enregistré</small></div>;
            const done = count >= target;
            const percentage = target === 0 ? 100 : Math.min(100, Math.round((count / target) * 100));
            return <div className="quota-category"><div className="quota-category-top"><strong>{count}/{target}</strong><span className={done ? "done" : "pending"}>{done ? "Fait" : "Non fait"}</span></div><div className="quota-progress"><i><span style={{ width: `${percentage}%` }} /></i><small>{percentage}%</small></div>{detail && <small className="quota-detail">{detail}</small>}</div>;
          };
          const quotaStatus = isAbsent ? { tone: "absent", icon: <UserX size={15} />, label: "Absent" } : isExempted ? { tone: "exempted", icon: <ShieldCheck size={15} />, label: "Exempté" } : completed ? { tone: "done", icon: <BadgeCheck size={15} />, label: "Fait" } : { tone: "pending", icon: <X size={15} />, label: "Non fait" };
          return <tr className={isAbsent || isExempted ? "quota-row-inactive" : ""} key={user.id}><td><div className="user-cell"><Avatar user={user} size="small" /><div><strong>{user.firstName} {user.lastName}</strong><small>{user.grade || GRADES[0]}</small></div></div></td><td>{quotaCell("recommendation")}</td><td>{quotaCell("pcs_exp")}</td><td>{quotaCell("observations", `HDR : ${counts.observation_hdr || 0} • SO : ${counts.observation_so || 0}`)}</td><td>{quotaCell("mission_internal")}</td><td><span className={`quota-status ${quotaStatus.tone}`}>{quotaStatus.icon}{quotaStatus.label}</span></td><td><button className={`quota-exemption ${isExempted ? "active" : ""}`} type="button" onClick={() => onToggleExemption(user.id)}>{isExempted ? <UserCheck size={15} /> : <ShieldCheck size={15} />}{isExempted ? "Retirer l’exemption" : "Exempter"}</button></td></tr>;
        })}
        {!team.length && <tr><td colSpan="7" className="empty-presence">Aucun Sous-Officier à afficher.</td></tr>}
      </tbody></table></div>
    </section>
  );
}

function MissionInternalPanel({ session, missions, onSubmit, onValidate, onReject, onDelete, onReset }) {
  const [title, setTitle] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = ["senior", "officer"].includes(session.role);
  const canValidate = hasManagerAccess(session.role);
  const displayedMissions = canValidate ? missions : missions.filter((mission) => mission.userId === session.id);

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    try {
      const parsedUrl = new URL(documentUrl);
      const isGoogleDocument = parsedUrl.hostname === "docs.google.com" && parsedUrl.pathname.startsWith("/document/d/");
      const isGoogleDrive = parsedUrl.hostname === "drive.google.com";
      if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password || (!isGoogleDocument && !isGoogleDrive)) throw new Error();
    } catch {
      return setError("Ajoutez un lien Google Docs ou Google Drive valide.");
    }
    try {
      setSubmitting(true);
      await onSubmit({ title: title.trim(), documentUrl: documentUrl.trim() });
      setTitle("");
      setDocumentUrl("");
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Le dépôt de la mission a échoué.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mission-layout">
      {canSubmit && <div className="mission-submit-card"><div className="transmission-head"><span className="category-icon large blue"><FileText size={25} /></span><div><p className="eyebrow dark">NOUVEAU DÉPÔT</p><h2>Mission interne</h2><p className="muted">Déposez votre Google Docs ou Google Drive pour validation par un Référent SO.</p></div></div><form onSubmit={submit}><label>Titre de la mission</label><input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={100} placeholder="Ex. Compte rendu de mission interne" /><label>Lien Google Docs ou Drive</label><input type="url" value={documentUrl} onChange={(event) => setDocumentUrl(event.target.value)} required placeholder="https://docs.google.com/document/d/… ou https://drive.google.com/…" />{error && <p className="form-error transmission-error">{error}</p>}<div className="transmission-actions"><span><ShieldCheck size={15} /> Le dépôt sera placé en attente</span><button className="primary" type="submit" disabled={submitting}><FileText size={17} /> {submitting ? "Dépôt en cours…" : "Déposer le document"}</button></div></form></div>}
      <div className="mission-list-card">
        <div className="mission-list-head">
          <div><p className="eyebrow dark">{canValidate ? "VALIDATION RÉFÉRENT SO" : "MES DÉPÔTS"}</p><h2>{canValidate ? "Documents à contrôler" : "Suivi des missions"}</h2></div>
          <div className="mission-list-actions">
            <span className="mission-pending-count">{displayedMissions.filter((mission) => mission.status === "pending").length} en attente</span>
            {canValidate && <button className="reset-missions" type="button" onClick={onReset}><Trash2 size={15} /> Tout effacer</button>}
          </div>
        </div>
        <div className="mission-list">
          {displayedMissions.map((mission) => {
            const canDelete = canValidate || (mission.userId === session.id && mission.status !== "validated");
            const status = mission.status === "validated" ? { icon: <BadgeCheck size={15} />, label: "Validé" } : mission.status === "rejected" ? { icon: <X size={15} />, label: "Refusé" } : { icon: <Gauge size={15} />, label: "En attente" };
            return <article key={mission.id}><div className="mission-document"><span className="mission-file-icon"><FileText size={19} /></span><div><strong>{mission.title}</strong><small>{mission.userName} • {mission.grade} • {mission.submittedAt}</small></div></div><a href={mission.documentUrl} target="_blank" rel="noreferrer">Ouvrir le Google Docs</a><span className={`mission-status ${mission.status}`}>{status.icon}{status.label}</span><div className="mission-item-actions">{canValidate && mission.status === "pending" && <><button className="reject-mission" type="button" onClick={() => onReject(mission.id)}><X size={16} /> Refuser</button><button className="validate-mission" type="button" onClick={() => onValidate(mission.id)}><BadgeCheck size={16} /> Valider</button></>}{canDelete && <button className="delete-mission" type="button" onClick={() => onDelete(mission.id)}><Trash2 size={16} /> Supprimer</button>}</div></article>;
          })}
          {!displayedMissions.length && <p className="mission-empty">Aucun document déposé pour le moment.</p>}
        </div>
      </div>
    </section>
  );
}

function ChatPanel({ session, users, chats, onStart, onCreateGroup, onUpdateGroup, onSend, onEditMessage, onDeleteMessage, onDeleteChat }) {
  const isModerator = hasManagerAccess(session.role);
  const availableContacts = users.filter((user) => user.id !== session.id && user.approvalStatus === "approved" && !user.blocked).sort(compareUsersByGrade);
  const supportContacts = availableContacts.filter((user) => hasManagerAccess(user.role));
  const visibleChats = useMemo(() => isModerator ? chats : chats.filter((chat) => hasChatParticipant(chat, session.id)), [chats, isModerator, session.id]);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [contactId, setContactId] = useState(availableContacts[0]?.id || "");
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupError, setGroupError] = useState("");
  const [groupManagementOpen, setGroupManagementOpen] = useState(false);
  const [managedGroupMembers, setManagedGroupMembers] = useState([]);
  const [groupManagementError, setGroupManagementError] = useState("");
  const [editingMessageId, setEditingMessageId] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState("");
  const editorRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const savedRangeRef = useRef(null);
  const selectedChat = visibleChats.find((chat) => chat.id === selectedChatId);
  const canParticipate = hasChatParticipant(selectedChat, session.id);
  const canManageSelectedGroup = selectedChat?.type === "group" && selectedChat.createdBy === session.id;

  useEffect(() => {
    if (selectedChatId && !visibleChats.some((chat) => chat.id === selectedChatId)) setSelectedChatId("");
  }, [visibleChats, selectedChatId]);

  useEffect(() => {
    if (!availableContacts.some((user) => user.id === contactId)) setContactId(availableContacts[0]?.id || "");
  }, [availableContacts, contactId]);

  useEffect(() => {
    if (!canManageSelectedGroup) {
      setGroupManagementOpen(false);
      setManagedGroupMembers([]);
      setGroupManagementError("");
      return;
    }
    setManagedGroupMembers(selectedChat.participants.filter((id) => id !== session.id));
    setGroupManagementError("");
  }, [selectedChat?.id, selectedChat?.updatedAt, canManageSelectedGroup, session.id]);

  function chatMeta(chat) {
    if (chat.type === "group") {
      const names = chat.participants.map((id) => users.find((user) => user.id === id)).filter(Boolean).map((user) => user.firstName).join(", ");
      return { title: chat.name || "Groupe sans nom", subtitle: names || "Aucun membre disponible", group: true };
    }
    if (!hasChatParticipant(chat, session.id)) {
      const participants = chat.participants.map((id) => users.find((user) => user.id === id)).filter(Boolean);
      return { title: participants.map((user) => `${user.firstName} ${user.lastName}`).join(" ↔ ") || "Discussion privée", subtitle: `Discussion privée · ${chat.messages.length} message${chat.messages.length > 1 ? "s" : ""}`, moderated: true, group: false };
    }
    const other = users.find((user) => user.id === chat.participants.find((id) => id !== session.id));
    return { title: other ? `${other.firstName} ${other.lastName}` : "Compte indisponible", subtitle: other ? `${other.grade || GRADES[0]} · ${ROLES[other.role].label}` : "Discussion conservée", other, group: false };
  }

  function openChat(userId) {
    if (!userId) return;
    setSelectedChatId(onStart(userId));
  }

  function toggleGroupMember(userId) {
    setGroupMembers((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  }

  function createGroup(event) {
    event.preventDefault();
    if (!groupName.trim()) return setGroupError("Donnez un nom au groupe.");
    if (groupMembers.length < 2) return setGroupError("Sélectionnez au moins deux autres membres : un groupe compte trois membres minimum avec son créateur.");
    const groupId = onCreateGroup(groupName.trim(), groupMembers);
    if (!groupId) return setGroupError("Impossible de créer ce groupe.");
    setSelectedChatId(groupId);
    setGroupName("");
    setGroupMembers([]);
    setGroupError("");
    setGroupOpen(false);
  }

  function toggleManagedGroupMember(userId) {
    setGroupManagementError("");
    setManagedGroupMembers((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  }

  function saveManagedGroup(event) {
    event.preventDefault();
    if (!selectedChat || !canManageSelectedGroup) return;
    if (managedGroupMembers.length < 2) {
      setGroupManagementError("Le groupe doit conserver au moins trois membres, créateur inclus.");
      return;
    }
    if (!onUpdateGroup(selectedChat.id, managedGroupMembers)) {
      setGroupManagementError("Les membres du groupe n’ont pas pu être enregistrés.");
      return;
    }
    setGroupManagementOpen(false);
  }

  function rememberSelection() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) savedRangeRef.current = selection.getRangeAt(0).cloneRange();
  }

  function format(command, value = null) {
    editorRef.current?.focus();
    const selection = window.getSelection();
    if (savedRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
    const applied = document.execCommand(command, false, value);
    if (command === "hiliteColor" && !applied) document.execCommand("backColor", false, value);
    rememberSelection();
  }

  async function addAttachments(event) {
    const files = [...(event.target.files || [])];
    const remaining = CHAT_ATTACHMENT_MAX_COUNT - pendingAttachments.length;
    if (!remaining) {
      setAttachmentError(`Maximum ${CHAT_ATTACHMENT_MAX_COUNT} pièces jointes par message.`);
      event.target.value = "";
      return;
    }
    const accepted = [];
    let error = files.length > remaining ? `Seules ${remaining} pièce${remaining > 1 ? "s" : ""} supplémentaire${remaining > 1 ? "s" : ""} ont été ajoutées.` : "";
    for (const file of files.slice(0, remaining)) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      const expectedType = ATTACHMENT_TYPE_BY_EXTENSION[extension];
      if (!expectedType || file.type !== expectedType || !CHAT_ATTACHMENT_TYPES.has(file.type)) {
        error = `${file.name} : type de fichier non autorisé.`;
        continue;
      }
      if (file.size > CHAT_ATTACHMENT_MAX_SIZE) {
        error = `${file.name} dépasse la limite de 1 Mo.`;
        continue;
      }
      try {
        let dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const safeName = file.name.replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").slice(0, 120);
        accepted.push({ id: crypto.randomUUID(), name: safeName, type: file.type, size: file.size, dataUrl });
      } catch {
        error = `${file.name} n’a pas pu être ajouté.`;
      }
    }
    if (accepted.length) setPendingAttachments((current) => [...current, ...accepted]);
    setAttachmentError(error);
    event.target.value = "";
  }

  function removePendingAttachment(attachmentId) {
    setPendingAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    setAttachmentError("");
  }

  function clearEditor() {
    if (editorRef.current) editorRef.current.innerHTML = "";
    setEditingMessageId("");
    setPendingAttachments([]);
    setAttachmentError("");
    savedRangeRef.current = null;
  }

  function submit(event) {
    event.preventDefault();
    if (!selectedChat || !canParticipate || !editorRef.current) return;
    const html = sanitizeChatHtml(editorRef.current.innerHTML);
    const text = editorRef.current.textContent?.trim() || "";
    if (!text && (!pendingAttachments.length || editingMessageId)) return;
    if (editingMessageId) onEditMessage(selectedChat.id, editingMessageId, html, text);
    else onSend(selectedChat.id, html, text, pendingAttachments);
    clearEditor();
  }

  function editMessage(message) {
    if (message.senderId !== session.id || !editorRef.current) return;
    setPendingAttachments([]);
    setAttachmentError("");
    setEditingMessageId(message.id);
    editorRef.current.innerHTML = chatMessageHtml(message);
    editorRef.current.focus();
  }

  const selectedMeta = selectedChat && chatMeta(selectedChat);

  return (
    <section className="chat-layout">
      <aside className="chat-contacts-card">
        <div className="chat-card-head"><p className="eyebrow dark">NOUVELLE DISCUSSION</p><h2>Messagerie</h2><p className="muted">Choisissez un membre ou créez un groupe.</p></div>
        <div className="chat-start"><label>Contacter un membre</label><div className="chat-start-row"><select value={contactId} onChange={(event) => setContactId(event.target.value)} disabled={!availableContacts.length}>{availableContacts.map((user) => <option value={user.id} key={user.id}>{user.firstName} {user.lastName} — {ROLES[user.role].label}</option>)}</select><button className="primary" type="button" disabled={!contactId} onClick={() => openChat(contactId)}><MessageSquareText size={16} /> Ouvrir</button></div><button className="create-group-toggle" type="button" onClick={() => setGroupOpen((open) => !open)}><UsersRound size={16} /> {groupOpen ? "Fermer la création" : "Créer un groupe"}</button>{groupOpen && <form className="group-form" onSubmit={createGroup}><label>Nom du groupe</label><input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={60} placeholder="Ex. Équipe Alpha" required /><label>Membres du groupe <small>(au moins 2 en plus de vous)</small></label><div className="group-member-list">{availableContacts.map((user) => <label key={user.id}><input type="checkbox" checked={groupMembers.includes(user.id)} onChange={() => toggleGroupMember(user.id)} /><Avatar user={user} size="small" /><span>{user.firstName} {user.lastName}<small>{ROLES[user.role].label}</small></span></label>)}</div>{groupError && <p className="form-error">{groupError}</p>}<button className="primary wide" type="submit"><UsersRound size={16} /> Créer le groupe</button></form>}</div>
<div className="referent-contact"><div><p className="eyebrow dark">CONTACT RAPIDE</p><strong>Contacter un Référent SO, la Gérance ou un Admin</strong></div>{supportContacts.length ? supportContacts.map((contact) => <button type="button" key={contact.id} onClick={() => openChat(contact.id)}><Avatar user={contact} size="small" /><span>{contact.firstName} {contact.lastName}<small>{hasAdminAccess(contact.role) ? `${ROLES[contact.role].label} · Contact Référent SO` : `${contact.grade || GRADES[0]} · Référent SO`}</small></span><Send size={15} /></button>) : <p className="chat-empty-small">{isModerator ? "Vous êtes actuellement le contact Référent SO principal." : "Aucun contact Référent SO disponible."}</p>}</div>
        <div className="conversation-picker"><div className="conversation-list-title"><p className="eyebrow dark">{isModerator ? "TOUTES LES DISCUSSIONS" : "MES DISCUSSIONS"}</p>{isModerator && <span>Modération</span>}</div><label>Accéder à une discussion</label><select value={selectedChatId} onChange={(event) => { clearEditor(); setSelectedChatId(event.target.value); }}><option value="">Choisir une discussion…</option>{visibleChats.map((chat) => <option value={chat.id} key={chat.id}>{chat.type === "group" ? "Groupe · " : "Discussion · "}{chatMeta(chat).title}</option>)}</select>{selectedChat ? <small>{selectedChat.messages.length} message{selectedChat.messages.length > 1 ? "s" : ""}{selectedChat.messages.at(-1)?.attachments?.length ? ` · ${selectedChat.messages.at(-1).attachments.length} pièce(s) jointe(s) dans le dernier message` : ""}</small> : <p className="chat-empty-small">Aucune discussion sélectionnée.</p>}</div>
      </aside>
      <div className="chat-conversation-card">
        {selectedChat ? <>
          <div className="conversation-head">
            {selectedMeta.group ? <span className="group-avatar"><UsersRound size={19} /></span> : selectedMeta.moderated ? <span className="group-avatar"><ShieldCheck size={19} /></span> : selectedMeta.other ? <Avatar user={selectedMeta.other} /> : <span className="avatar blue">?</span>}
            <div><strong>{selectedMeta.title}</strong><small>{selectedMeta.subtitle}</small></div>
            <div className="conversation-head-actions">{isModerator && !canParticipate && <span className="moderation-chip"><ShieldCheck size={14} /> Consultation de modération</span>}{canManageSelectedGroup && <button className="manage-group" type="button" onClick={() => setGroupManagementOpen((open) => !open)}><UsersRound size={16} /> {groupManagementOpen ? "Fermer" : "Gérer le groupe"}</button>}<button className="delete-conversation" type="button" onClick={() => onDeleteChat(selectedChat.id)}><Trash2 size={16} /> Supprimer</button></div>
          </div>
          {canManageSelectedGroup && groupManagementOpen && <form className="group-management" onSubmit={saveManagedGroup}><div className="group-management-head"><div><strong>Gérer les membres</strong><small>Le créateur reste membre. Conservez au moins deux autres membres.</small></div><span>{managedGroupMembers.length + 1} membres</span></div><div className="group-member-list">{availableContacts.map((user) => <label key={user.id}><input type="checkbox" checked={managedGroupMembers.includes(user.id)} onChange={() => toggleManagedGroupMember(user.id)} /><Avatar user={user} size="small" /><span>{user.firstName} {user.lastName}<small>{ROLES[user.role].label}</small></span></label>)}</div>{groupManagementError && <p className="form-error">{groupManagementError}</p>}<div className="group-management-actions"><button className="secondary" type="button" onClick={() => setGroupManagementOpen(false)}>Annuler</button><button className="primary" type="submit"><BadgeCheck size={16} /> Enregistrer</button></div></form>}
          <div className="chat-messages">
            {selectedChat.messages.map((item) => {
              const own = item.senderId === session.id;
              const hasText = Boolean(chatMessageText(item).trim());
              return <div className={`chat-message ${own ? "mine" : "theirs"}`} key={item.id}>{hasText && <div className="chat-bubble" dangerouslySetInnerHTML={{ __html: chatMessageHtml(item) }} />}{item.attachments?.length > 0 && <div className="message-attachments">{item.attachments.map((attachment) => { const url = safeAttachmentUrl(attachment); return url && <a href={url} download={attachment.name} key={attachment.id} target="_blank" rel="noreferrer">{/^image\/(png|jpeg|webp|gif)$/i.test(attachment.type) ? <img src={url} alt={attachment.name} /> : <span className="attachment-file-icon"><FileText size={18} /></span>}<span><strong>{attachment.name}</strong><small>{formatFileSize(attachment.size)}</small></span><Download size={15} /></a>; })}</div>}<small>{own ? "Vous" : item.senderName} · {item.sentAt}{item.editedAt ? " · modifié" : ""}</small>{(own || isModerator) && <div className="chat-message-actions">{own && <button type="button" onClick={() => editMessage(item)}><Pencil size={13} /> Modifier</button>}<button type="button" onClick={() => onDeleteMessage(selectedChat.id, item.id)}><Trash2 size={13} /> Supprimer</button></div>}</div>;
            })}
            {!selectedChat.messages.length && <div className="chat-welcome"><MessageSquareText size={28} /><strong>Nouvelle discussion</strong><p>Envoyez le premier message.</p></div>}
          </div>
          {canParticipate ? <form className="chat-compose rich" onSubmit={submit}>
            <div className="chat-toolbar"><button type="button" title="Gras" onMouseDown={(event) => { event.preventDefault(); format("bold"); }}><b>B</b></button><button type="button" title="Italique" onMouseDown={(event) => { event.preventDefault(); format("italic"); }}><i>I</i></button><button type="button" title="Souligné" onMouseDown={(event) => { event.preventDefault(); format("underline"); }}><u>U</u></button><button type="button" title="Barré" onMouseDown={(event) => { event.preventDefault(); format("strikeThrough"); }}><s>S</s></button><label title="Couleur du texte"><span>A</span><input type="color" defaultValue="#356ad2" onMouseDown={rememberSelection} onChange={(event) => format("foreColor", event.target.value)} /></label><label title="Surlignage"><span className="highlight-tool">A</span><input type="color" defaultValue="#fff1a8" onMouseDown={rememberSelection} onChange={(event) => format("hiliteColor", event.target.value)} /></label><button type="button" title="Effacer la mise en forme" onMouseDown={(event) => { event.preventDefault(); format("removeFormat"); }}>Tx</button>{!editingMessageId && <button type="button" title="Ajouter des pièces jointes" onClick={() => attachmentInputRef.current?.click()}><Paperclip size={15} /></button>}<input className="attachment-input" ref={attachmentInputRef} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={addAttachments} />{editingMessageId && <button className="cancel-edit" type="button" onClick={clearEditor}>Annuler la modification</button>}</div>
            {pendingAttachments.length > 0 && <div className="pending-attachments">{pendingAttachments.map((attachment) => <div key={attachment.id}><Paperclip size={14} /><span><strong>{attachment.name}</strong><small>{formatFileSize(attachment.size)}</small></span><button type="button" title="Retirer" onClick={() => removePendingAttachment(attachment.id)}><X size={14} /></button></div>)}</div>}
            {attachmentError && <p className="attachment-error">{attachmentError}</p>}
            <div className="chat-compose-row"><div className="chat-editor" ref={editorRef} contentEditable suppressContentEditableWarning data-placeholder={editingMessageId ? "Modifier le message…" : "Écrire un message…"} onKeyUp={rememberSelection} onMouseUp={rememberSelection} onInput={rememberSelection} /><button className="primary" type="submit"><Send size={17} /> {editingMessageId ? "Enregistrer" : "Envoyer"}</button></div>
          </form> : <div className="moderation-readonly"><ShieldCheck size={16} /> Vous consultez cette discussion en tant que modérateur.</div>}
        </> : <div className="chat-no-selection"><MessageSquareText size={36} /><h2>Choisissez une discussion</h2><p>Utilisez le menu déroulant pour ouvrir une conversation.</p></div>}
      </div>
    </section>
  );
}

function SergeantAssignmentPanel({ users, session, assignments, onAssign, onReminder, onDelete }) {
  const canManage = hasManagerAccess(session.role);
  const sergeants = users.filter((user) => user.approvalStatus === "approved" && user.role === "officer" && user.grade === "Sergent" && !user.blocked).sort(compareUsersByGrade);
  const supervisors = users.filter((user) => user.approvalStatus === "approved" && user.role === "senior" && !user.blocked).sort(compareUsersByGrade);
  const defaultDueDate = (() => { const date = new Date(); date.setDate(date.getDate() + 7); return date.toISOString().slice(0, 10); })();
  const [form, setForm] = useState({ sergeantId: sergeants[0]?.id || "", observerId: supervisors[0]?.id || "", dueDate: defaultDueDate });
  useEffect(() => {
    setForm((current) => ({ ...current, sergeantId: sergeants.some((user) => user.id === current.sergeantId) ? current.sergeantId : sergeants[0]?.id || "", observerId: supervisors.some((user) => user.id === current.observerId) ? current.observerId : supervisors[0]?.id || "" }));
  }, [users]);
  const visibleAssignments = canManage ? assignments : assignments.filter((assignment) => assignment.observerId === session.id);

  function submit(event) {
    event.preventDefault();
    if (!canManage || !form.sergeantId || !form.observerId || !form.dueDate) return;
    onAssign(form);
  }

  return (
    <div className={`assignment-layout ${canManage ? "" : "single"}`}>
      {canManage && <section className="assignment-form-card"><div className="assignment-card-head"><span><UsersRound size={22} /></span><div><p className="eyebrow dark">NOUVELLE ATTRIBUTION</p><h2>Assigner un Référent</h2><p>Confiez le suivi de la semaine d’un nouveau Sergent à un Sous-Officier Supérieur.</p></div></div><form onSubmit={submit}><label>Nouveau Sergent</label><select value={form.sergeantId} onChange={(event) => setForm((current) => ({ ...current, sergeantId: event.target.value }))} disabled={!sergeants.length}>{!sergeants.length && <option value="">Aucun Sergent disponible</option>}{sergeants.map((user) => <option value={user.id} key={user.id}>{user.grade} {user.firstName} {user.lastName}</option>)}</select><label>Sous-Officier Supérieur référent</label><select value={form.observerId} onChange={(event) => setForm((current) => ({ ...current, observerId: event.target.value }))} disabled={!supervisors.length}>{!supervisors.length && <option value="">Aucun SO Sup disponible</option>}{supervisors.map((user) => <option value={user.id} key={user.id}>{user.grade} {user.firstName} {user.lastName}</option>)}</select><label>Date limite du rapport</label><input type="date" min={new Date().toISOString().slice(0, 10)} value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} required />{(!sergeants.length || !supervisors.length) && <p className="form-warning">Un compte Sergent et un compte Sous-Officier Supérieur sont nécessaires.</p>}<button className="primary wide" type="submit" disabled={!sergeants.length || !supervisors.length}><UserCheck size={17} /> Enregistrer l’assignation</button></form></section>}
      <section className="assignment-list-card"><div className="assignment-list-head"><div><p className="eyebrow dark">SUIVI DES SERGENTS</p><h2>{canManage ? "Assignations en cours" : "Mes Sergents assignés"}</h2><p>{canManage ? "Gérez les référents, les échéances et les rappels." : "Seuls ces Sergents seront disponibles dans vos rapports."}</p></div><span><strong>{visibleAssignments.filter((assignment) => assignment.status === "active").length}</strong> en cours</span></div><div className="assignment-list">{visibleAssignments.map((assignment) => {
        const sergeant = users.find((user) => user.id === assignment.sergeantId);
        const observer = users.find((user) => user.id === assignment.observerId);
        const deadline = assignment.dueDate ? new Date(`${assignment.dueDate}T23:59:59`) : null;
        const overdue = assignment.status === "active" && deadline && deadline < new Date();
        return <article key={assignment.id}><div className="assignment-people"><div>{sergeant ? <Avatar user={sergeant} size="small" /> : <span className="avatar small green">?</span>}<span><small>Nouveau Sergent</small><strong>{sergeant ? `${sergeant.grade} ${sergeant.firstName} ${sergeant.lastName}` : "Compte supprimé"}</strong></span></div><i>→</i><div>{observer ? <Avatar user={observer} size="small" /> : <span className="avatar small gold">?</span>}<span><small>Référent SO Sup</small><strong>{observer ? `${observer.grade} ${observer.firstName} ${observer.lastName}` : "Compte supprimé"}</strong></span></div></div><div className="assignment-meta"><span className={`assignment-deadline ${overdue ? "overdue" : ""}`}><CalendarDays size={15} /> {deadline ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(deadline) : "Sans date"}</span><span className={`assignment-status ${assignment.status}`}>{assignment.status === "completed" ? "Rapport envoyé" : overdue ? "En retard" : assignment.reminderAt ? "Rappel envoyé" : "En suivi"}</span></div>{canManage && <div className="assignment-actions">{assignment.status === "active" && <button className="assignment-reminder" onClick={() => onReminder(assignment.id)}><Bell size={15} /> {assignment.reminderAt ? "Renvoyer un rappel" : "Envoyer un rappel"}</button>}<button className="icon-button danger" title="Supprimer l’assignation" onClick={() => onDelete(assignment.id)}><Trash2 size={16} /></button></div>}</article>;
      })}{!visibleAssignments.length && <div className="assignment-empty"><UsersRound size={27} /><strong>Aucune assignation</strong><p>{canManage ? "Commencez par attribuer un nouveau Sergent." : "Aucun Sergent ne vous a encore été confié."}</p></div>}</div></section>
    </div>
  );
}

function SubmissionHistoryPanel({ type, entries = [], canManage, onReset, onEdit, onDelete }) {
  const historyTitles = { recommendation: "Recommandations effectuées", pcs_exp: "Recommandations PCS EXP effectuées", observation_hdr: "Observations HDR effectuées", observation_so: "Observations SO effectuées", sergeant_report: "Rapports envoyés" };
  const title = historyTitles[type] || "Transmissions effectuées";
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(null);

  function startEditing(entry) {
    setEditingId(entry.id);
    setForm({ ...(entry.values || {}) });
  }
  function change(key, value) { setForm((current) => ({ ...current, [key]: value })); }
  function cancelEditing() { setEditingId(null); setForm(null); }
  function save(event) {
    event.preventDefault();
    if (!form || !editingId) return;
    onEdit(type, editingId, form);
    cancelEditing();
  }

  return (
    <aside className="submission-history-card">
      <div className="submission-history-head">
        <div><p className="eyebrow dark">HISTORIQUE PUBLIC</p><h2>{title}</h2><p>Visible par les membres ayant accès à cette rubrique.</p></div>
        <span><ScrollText size={16} /> {entries.length}</span>
      </div>
      {canManage && entries.length > 0 && <button className="submission-history-reset" type="button" onClick={() => onReset(type)}><RotateCcw size={15} /> Réinitialiser uniquement cet historique</button>}
      <div className="submission-history-list">
        {entries.map((entry) => {
          const values = entry.values || {};
          const subject = type === "sergeant_report" ? values.sergeantName : values.aitName;
          const observationLabel = values.observation === "negative" ? "Négative" : "Positive";
          const HistoryIcon = type === "sergeant_report" ? FileText : TRANSMISSION_TYPES[type]?.icon || FileText;
          const editing = editingId === entry.id && form;
          return <article key={entry.id}>
            <div className="submission-history-entry-head"><div className="submission-history-title"><span className={`category-icon ${type === "sergeant_report" ? "gold" : TRANSMISSION_TYPES[type]?.tone || "blue"}`}><HistoryIcon size={17} /></span><div><strong>{subject || "Transmission"}</strong><small>{entry.displayAt}</small></div></div>{canManage && !editing && <div className="history-entry-actions"><button className="icon-button" type="button" title="Modifier cet historique" aria-label="Modifier cet historique" onClick={() => startEditing(entry)}><Pencil size={15} /></button><button className="icon-button danger" type="button" title="Supprimer cet historique" aria-label="Supprimer cet historique" onClick={() => onDelete(type, entry.id)}><Trash2 size={15} /></button></div>}</div>
            {editing ? <form className="history-entry-editor" onSubmit={save}>{type === "sergeant_report" ? <><label>Nom du Sergent<input value={form.sergeantName || ""} onChange={(event) => change("sergeantName", event.target.value)} required /></label><label>Point positif<textarea value={form.positivePoints || ""} onChange={(event) => change("positivePoints", event.target.value)} required /></label><label>Point négatif<textarea value={form.negativePoints || ""} onChange={(event) => change("negativePoints", event.target.value)} required /></label><label>Avis global<textarea value={form.globalOpinion || ""} onChange={(event) => change("globalOpinion", event.target.value)} required /></label><label>Conclusion<select value={form.conclusion || REPORT_CONCLUSIONS[0]} onChange={(event) => change("conclusion", event.target.value)}>{REPORT_CONCLUSIONS.map((conclusion) => <option key={conclusion} value={conclusion}>{conclusion}</option>)}</select></label></> : <><label>Nom de l’AIT<input value={form.aitName || ""} onChange={(event) => change("aitName", event.target.value)} required /></label><label>S-OFF/-SUP à l’origine<input value={form.author || ""} onChange={(event) => change("author", event.target.value)} required /></label>{["observation_hdr", "observation_so"].includes(type) && <label>Nature de l’observation<select value={form.observation || "positive"} onChange={(event) => change("observation", event.target.value)}><option value="positive">Positive</option><option value="negative">Négative</option></select></label>}<label>Raison<textarea value={form.reason || ""} onChange={(event) => change("reason", event.target.value)} required /></label></>}<div className="history-entry-editor-actions"><button className="secondary" type="button" onClick={cancelEditing}>Annuler</button><button className="primary" type="submit"><BadgeCheck size={15} /> Enregistrer</button></div></form> : <><div className="submission-history-author"><span>Envoyé par</span><strong>{entry.authorGrade ? `${entry.authorGrade} ` : ""}{entry.authorName}</strong></div>{["observation_hdr", "observation_so"].includes(type) && <span className={`history-observation ${values.observation === "negative" ? "negative" : "positive"}`}>{observationLabel}</span>}{type === "sergeant_report" && <span className={`history-conclusion conclusion-${REPORT_CONCLUSIONS.indexOf(values.conclusion)}`}>{values.conclusion}</span>}{type === "sergeant_report" ? <div className="history-report-details"><p><strong>Point positif</strong>{values.positivePoints}</p><p><strong>Point négatif</strong>{values.negativePoints}</p><p><strong>Avis global</strong>{values.globalOpinion}</p></div> : <p className="submission-history-reason"><strong>Raison</strong>{values.reason}</p>}</>}
          </article>;
        })}
        {!entries.length && <div className="submission-history-empty"><ScrollText size={25} /><strong>Aucun envoi</strong><p>Les prochaines transmissions apparaîtront ici.</p></div>}
      </div>
    </aside>
  );
}

function SergeantReportPanel({ users, session, assignments, onSuccess, history, canManageHistory, onResetHistory, onEditHistory, onDeleteHistory }) {
  const activeAssignments = assignments.filter((assignment) => assignment.observerId === session.id && assignment.status === "active");
  const sergeants = activeAssignments.map((assignment) => users.find((user) => user.id === assignment.sergeantId)).filter((user) => user && user.role === "officer" && user.grade === "Sergent");
  const initialDraft = readFormDraft(session.id, "sergeant_report");
  const [form, setForm] = useState(() => ({ sergeantId: sergeants[0]?.id || "", positivePoints: "", negativePoints: "", globalOpinion: "", conclusion: REPORT_CONCLUSIONS[0], ...(initialDraft?.values || {}) }));
  const [draftSavedAt, setDraftSavedAt] = useState(initialDraft?.savedAt || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const selectedAssignment = activeAssignments.find((assignment) => assignment.sergeantId === form.sergeantId);
  useEffect(() => {
    if (!sergeants.some((user) => user.id === form.sergeantId)) setForm((current) => ({ ...current, sergeantId: sergeants[0]?.id || "" }));
  }, [assignments, users]);
  useEffect(() => {
    const meaningful = form.positivePoints.trim() || form.negativePoints.trim() || form.globalOpinion.trim() || form.conclusion !== REPORT_CONCLUSIONS[0];
    const timer = window.setTimeout(() => {
      if (meaningful) {
        saveFormDraft(session.id, "sergeant_report", form);
        setDraftSavedAt(new Date().toISOString());
      } else {
        clearFormDraft(session.id, "sergeant_report");
        setDraftSavedAt("");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [form, session.id]);

  async function submit(event) {
    event.preventDefault();
    const selectedSergeant = sergeants.find((user) => user.id === form.sergeantId);
    const assignment = activeAssignments.find((item) => item.sergeantId === form.sergeantId);
    if (session.role !== "senior" || !selectedSergeant || !assignment) return setError("Vous ne pouvez envoyer un rapport que pour un Sergent qui vous est assigné.");
    setSending(true);
    setError("");
    try {
      const reportValues = {
        sergeantName: `${selectedSergeant.firstName} ${selectedSergeant.lastName}`,
        positivePoints: form.positivePoints,
        negativePoints: form.negativePoints,
        globalOpinion: form.globalOpinion,
        conclusion: form.conclusion,
      };
      const csrfToken = await getCsrfToken();
      const response = await fetch("/api/submissions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({
          type: "sergeant_report",
          values: reportValues,
          submittedBy: { name: `${session.firstName} ${session.lastName}`, role: ROLES[session.role].label },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Envoi impossible.");
      clearFormDraft(session.id, "sergeant_report");
      setDraftSavedAt("");
      setForm((current) => ({ ...current, positivePoints: "", negativePoints: "", globalOpinion: "", conclusion: REPORT_CONCLUSIONS[0] }));
      onSuccess("Le rapport du nouveau Sous-Officier a été envoyé sur Discord.", selectedSergeant.id, reportValues);
    } catch (submissionError) {
      setError(submissionError.message || "Une erreur est survenue pendant l’envoi.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="transmissions-layout with-history">
      <div className="transmission-card report-card">
        <div className="transmission-head"><span className="category-icon large gold"><FileText size={25} /></span><div><p className="eyebrow dark">NOUVEAU RAPPORT</p><h2>Rapport nouveau Sous-Officier</h2><p className="muted">Évaluez uniquement les Sergents qui vous ont été confiés.</p></div></div>
        <form onSubmit={submit}>
          <label>Nom du Sergent</label>
          <select value={form.sergeantId} onChange={(event) => set("sergeantId", event.target.value)} required disabled={!sergeants.length}>
            {!sergeants.length && <option value="">Aucun Sergent disponible</option>}
            {sergeants.map((user) => <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>)}
          </select>
          {selectedAssignment?.dueDate && <p className="report-deadline"><CalendarDays size={15} /> Rapport attendu avant le <strong>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(`${selectedAssignment.dueDate}T12:00:00`))}</strong></p>}
          {!sergeants.length && <p className="form-warning">Aucun Sergent ne vous est assigné. Un Admin ou un Référent SO doit d’abord créer l’assignation.</p>}
          <label>Point positif</label><textarea value={form.positivePoints} onChange={(event) => set("positivePoints", event.target.value)} required maxLength={1000} rows={4} placeholder="Décrivez les points positifs observés…" />
          <label>Point négatif</label><textarea value={form.negativePoints} onChange={(event) => set("negativePoints", event.target.value)} required maxLength={1000} rows={4} placeholder="Décrivez les axes d’amélioration…" />
          <label>Avis global</label><textarea value={form.globalOpinion} onChange={(event) => set("globalOpinion", event.target.value)} required maxLength={1000} rows={5} placeholder="Rédigez votre avis général sur la semaine de test…" />
          <label>Conclusion</label><select value={form.conclusion} onChange={(event) => set("conclusion", event.target.value)} required>{REPORT_CONCLUSIONS.map((conclusion) => <option key={conclusion} value={conclusion}>{conclusion}</option>)}</select>
          {draftSavedAt && <p className="draft-status"><BadgeCheck size={14} /> Brouillon sauvegardé automatiquement à {new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(draftSavedAt))}</p>}
          {error && <p className="form-error transmission-error">{error}</p>}
          <div className="transmission-actions"><span><ShieldCheck size={15} /> Envoi réservé au SO Sup assigné</span><button className="primary" type="submit" disabled={sending || !sergeants.length || session.role !== "senior"}><Send size={17} />{sending ? "Envoi en cours…" : "Envoyer le rapport"}</button></div>
        </form>
      </div>
      <SubmissionHistoryPanel type="sergeant_report" entries={history} canManage={canManageHistory} onReset={onResetHistory} onEdit={onEditHistory} onDelete={onDeleteHistory} />
    </section>
  );
}

function TransmissionPanel({ type, ...props }) {
  if (type === "specializations") return <SpecializationsPanel />;
  if (type === "meeting_so") return <MeetingTransmissionPanel session={props.session} />;
  return <StandardTransmissionPanel type={type} {...props} />;
}

function StandardTransmissionPanel({ session, onSuccess, type, history, canManageHistory, onResetHistory, onEditHistory, onDeleteHistory }) {
  const defaultAuthor = `${session.firstName} ${session.lastName}`;
  const initialDraft = readFormDraft(session.id, type);
  const [form, setForm] = useState(() => ({ aitName: "", author: defaultAuthor, reason: "", observation: "positive", ...(initialDraft?.values || {}) }));
  const [draftSavedAt, setDraftSavedAt] = useState(initialDraft?.savedAt || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const selected = TRANSMISSION_TYPES[type];
  const SelectedIcon = selected.icon;
  const isObservation = ["observation_hdr", "observation_so"].includes(type);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    const meaningful = form.aitName.trim() || form.reason.trim() || form.author.trim() !== defaultAuthor || form.observation !== "positive";
    const timer = window.setTimeout(() => {
      if (meaningful) {
        saveFormDraft(session.id, type, form);
        setDraftSavedAt(new Date().toISOString());
      } else {
        clearFormDraft(session.id, type);
        setDraftSavedAt("");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [form, session.id, type, defaultAuthor]);

  async function submit(event) {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      const submittedValues = { ...form };
      const csrfToken = await getCsrfToken();
      const response = await fetch("/api/submissions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({
          type,
          values: form,
          submittedBy: {
            name: `${session.firstName} ${session.lastName}`,
            role: ROLES[session.role].label,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Envoi impossible.");
      clearFormDraft(session.id, type);
      setDraftSavedAt("");
      setForm((current) => ({ ...current, aitName: "", reason: "", observation: "positive" }));
      onSuccess(`${selected.title} envoyée sur Discord.`, type, submittedValues);
    } catch (submissionError) {
      setError(submissionError.message || "Une erreur est survenue pendant l’envoi.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="transmissions-layout with-history">
      <div className="transmission-card">
        <div className="transmission-head">
          <span className={`category-icon large ${selected.tone}`}><SelectedIcon size={25} /></span>
          <div><p className="eyebrow dark">NOUVELLE TRANSMISSION</p><h2>{selected.title}</h2><p className="muted">Le message sera transmis automatiquement dans le salon Discord associé.</p></div>
        </div>
        <form onSubmit={submit}>
          <label>{type === "observation_hdr" ? "Nom de l’AIT observé" : type === "observation_so" ? "Nom de l’AIT" : "Nom de l’AIT recommandé"}</label>
          <input value={form.aitName} onChange={(e) => set("aitName", e.target.value)} required maxLength={100} placeholder="Prénom, nom ou identifiant de l’AIT" />

          <label>{type === "observation_hdr" ? "S-OFF/-SUP faisant l’observation" : type === "observation_so" ? "S-OFF SUP faisant l’observation" : "S-OFF/-SUP à l’origine de la recommandation"}</label>
          <input value={form.author} onChange={(e) => set("author", e.target.value)} required maxLength={100} />

          {isObservation ? (
            <><label>Nature de l’observation</label><div className="choice-row"><label className={form.observation === "positive" ? "checked" : ""}><input type="radio" name="observation" value="positive" checked={form.observation === "positive"} onChange={(e) => set("observation", e.target.value)} /><BadgeCheck size={18} /> Positive</label><label className={form.observation === "negative" ? "checked negative" : ""}><input type="radio" name="observation" value="negative" checked={form.observation === "negative"} onChange={(e) => set("observation", e.target.value)} /><X size={18} /> Négative</label></div><label>Raison</label><textarea value={form.reason} onChange={(e) => set("reason", e.target.value)} required maxLength={1000} rows={6} placeholder="Décrivez les faits et la raison de cette observation…" /></>
          ) : (
            <><label>Raison</label><textarea value={form.reason} onChange={(e) => set("reason", e.target.value)} required maxLength={1000} rows={6} placeholder="Décrivez les éléments qui motivent cette recommandation…" /></>
          )}

          {draftSavedAt && <p className="draft-status"><BadgeCheck size={14} /> Brouillon sauvegardé automatiquement à {new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(draftSavedAt))}</p>}
          {error && <p className="form-error transmission-error">{error}</p>}
          <div className="transmission-actions"><span><ShieldCheck size={15} /> Envoi sécurisé via le serveur</span><button className="primary" type="submit" disabled={sending}><Send size={17} />{sending ? "Envoi en cours…" : "Envoyer sur Discord"}</button></div>
        </form>
      </div>
      <SubmissionHistoryPanel type={type} entries={history} canManage={canManageHistory} onReset={onResetHistory} onEdit={onEditHistory} onDelete={onDeleteHistory} />
    </section>
  );
}

function localDateTimeValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function managementPeriodStart(period) {
  const now = new Date();
  if (period === "day") { now.setHours(0, 0, 0, 0); return now; }
  if (period === "week") { const day = (now.getDay() + 6) % 7; now.setDate(now.getDate() - day); now.setHours(0, 0, 0, 0); return now; }
  if (period === "month") { now.setDate(1); now.setHours(0, 0, 0, 0); return now; }
  now.setMonth(0, 1); now.setHours(0, 0, 0, 0); return now;
}

function reportDateLabel(value) {
  try { return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(value)); }
  catch { return "Date inconnue"; }
}

function ManagementReportPanel({ session, users, reports, assignments, settings, onSubmit, onComment, onUpdateComment, onDeleteComment, onDeleteReport, onResetRanking }) {
  const isManager = hasManagerAccess(session.role);
  const isContributor = ["senior", "officer"].includes(session.role);
  const assignedSergeantIds = useMemo(() => new Set((assignments || []).filter((assignment) => assignment.observerId === session.id).map((assignment) => assignment.sergeantId)), [assignments, session.id]);
  const canReviewReport = (report) => isManager || (session.role === "senior" && assignedSergeantIds.has(report.authorId));
  const isAssignedReferent = session.role === "senior" && assignedSergeantIds.size > 0;
  const [period, setPeriod] = useState("month");
  const [form, setForm] = useState(() => ({ occurredAt: localDateTimeValue(), managementType: "", description: "", positivePoint: "", negativePoint: "" }));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replying, setReplying] = useState("");
  const [editingCommentId, setEditingCommentId] = useState("");
  const [commentEditDrafts, setCommentEditDrafts] = useState({});
  const [savingCommentId, setSavingCommentId] = useState("");
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const ownReports = reports.filter((report) => report.authorId === session.id).slice().sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());
  const reviewedReports = reports.filter((report) => report.authorId !== session.id && canReviewReport(report)).slice().sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());
  const start = managementPeriodStart(period);
  const resetAt = settings?.rankingResetAt ? new Date(settings.rankingResetAt) : new Date(0);
  const rankedReports = reports.filter((report) => ["senior", "officer"].includes(report.authorRole) && new Date(report.createdAt).getTime() >= resetAt.getTime() && new Date(report.occurredAt).getTime() >= start.getTime());
  const ranking = users.filter((user) => user.approvalStatus === "approved" && ["senior", "officer"].includes(user.role)).map((user) => ({ user, total: rankedReports.filter((report) => report.authorId === user.id).length })).filter((entry) => entry.total > 0).sort((left, right) => right.total - left.total || compareUsersByGrade(left.user, right.user));

  async function submit(event) {
    event.preventDefault();
    if (!form.managementType.trim() || !form.description.trim() || !form.positivePoint.trim() || !form.negativePoint.trim()) { setError("Tous les champs sont obligatoires."); return; }
    setSending(true); setError("");
    try {
      await onSubmit({ ...form, occurredAt: new Date(form.occurredAt).toISOString() });
      setForm({ occurredAt: localDateTimeValue(), managementType: "", description: "", positivePoint: "", negativePoint: "" });
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Le rapport n’a pas pu être enregistré."); }
    finally { setSending(false); }
  }

  async function reply(reportId) {
    const content = String(replyDrafts[reportId] || "").trim();
    if (!content) return;
    setReplying(reportId);
    try { await onComment(reportId, content); setReplyDrafts((current) => ({ ...current, [reportId]: "" })); }
    catch (replyError) { setError(replyError instanceof Error ? replyError.message : "Votre avis n’a pas pu être ajouté."); }
    finally { setReplying(""); }
  }

  function startCommentEdit(comment) {
    setEditingCommentId(comment.id);
    setCommentEditDrafts((current) => ({ ...current, [comment.id]: comment.content }));
  }

  async function saveComment(reportId, commentId) {
    const content = String(commentEditDrafts[commentId] || "").trim();
    if (!content) return;
    setSavingCommentId(commentId);
    try {
      await onUpdateComment(reportId, commentId, content);
      setEditingCommentId("");
    } finally { setSavingCommentId(""); }
  }

  async function removeComment(reportId, commentId) {
    if (!confirm("Supprimer définitivement cet avis de gérance ?")) return;
    setSavingCommentId(commentId);
    try {
      await onDeleteComment(reportId, commentId);
      if (editingCommentId === commentId) setEditingCommentId("");
    } finally { setSavingCommentId(""); }
  }

  async function removeReport(reportId) {
    if (!confirm("Supprimer définitivement ce rapport de gérance et tous ses avis ?")) return;
    setSavingCommentId(reportId);
    try { await onDeleteReport(reportId); }
    catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Le rapport n’a pas pu être supprimé."); }
    finally { setSavingCommentId(""); }
  }

  function renderReportCard(report) {
    return <article className="management-report-card" key={report.id}>
      <div className="management-report-card-head"><div><span className="category-icon blue"><CalendarDays size={17} /></span><div><strong>{report.managementType}</strong><small>{reportDateLabel(report.occurredAt)}</small></div></div><div className="management-report-author-actions"><div className="management-report-author"><strong>{report.authorGrade ? `${report.authorGrade} ` : ""}{report.authorName}</strong><small>{ROLES[report.authorRole]?.label || "Sous-Officier"}</small></div>{isManager && <button className="icon-button danger" type="button" title="Supprimer ce rapport" aria-label="Supprimer ce rapport" onClick={() => removeReport(report.id)} disabled={savingCommentId === report.id}><Trash2 size={14} /></button>}</div></div>
      <div className="management-report-details"><p><strong>Description</strong>{report.description}</p><p className="positive"><strong>Point positif</strong>{report.positivePoint}</p><p className="negative"><strong>Point négatif</strong>{report.negativePoint}</p></div>
      {report.comments?.length > 0 && <div className="management-comments"><p className="eyebrow dark">AVIS DES RESPONSABLES</p>{report.comments.map((comment) => {
        const editingComment = editingCommentId === comment.id;
        const canManageComment = isManager || (canReviewReport(report) && comment.authorId === session.id);
        return <article key={comment.id}><div className="management-comment-head"><div><strong>{comment.authorGrade ? `${comment.authorGrade} ` : ""}{comment.authorName}</strong><small>{reportDateLabel(comment.createdAt)}{comment.editedAt ? " · modifié" : ""}</small></div>{canManageComment && <div className="management-comment-actions"><button className="icon-button" type="button" title="Modifier cet avis" aria-label="Modifier cet avis" onClick={() => startCommentEdit(comment)} disabled={savingCommentId === comment.id}><Pencil size={14} /></button><button className="icon-button danger" type="button" title="Supprimer cet avis" aria-label="Supprimer cet avis" onClick={() => removeComment(report.id, comment.id)} disabled={savingCommentId === comment.id}><Trash2 size={14} /></button></div>}</div>{editingComment ? <div className="management-comment-editor"><textarea value={commentEditDrafts[comment.id] || ""} onChange={(event) => setCommentEditDrafts((current) => ({ ...current, [comment.id]: event.target.value }))} maxLength={1000} /><div><button className="secondary" type="button" onClick={() => setEditingCommentId("")} disabled={savingCommentId === comment.id}>Annuler</button><button className="primary" type="button" onClick={() => saveComment(report.id, comment.id)} disabled={savingCommentId === comment.id}>{savingCommentId === comment.id ? "Enregistrement…" : "Enregistrer"}</button></div></div> : <p>{comment.content}</p>}</article>;
      })}</div>}
      {canReviewReport(report) && <div className="management-reply"><label>Ajouter un avis<textarea value={replyDrafts[report.id] || ""} onChange={(event) => setReplyDrafts((current) => ({ ...current, [report.id]: event.target.value }))} placeholder="Votre avis ou conseil…" maxLength={1000} /></label><button className="secondary" type="button" onClick={() => reply(report.id)} disabled={replying === report.id}>{replying === report.id ? "Envoi…" : "Ajouter l’avis"}</button></div>}
    </article>;
  }

  function renderReportList({ eyebrow, title, description, items, emptyText }) {
    return <section className="management-reports-list"><div className="management-list-head"><div><p className="eyebrow dark">{eyebrow}</p><h2>{title}</h2><p className="muted">{description}</p></div><span>{items.length} rapport{items.length > 1 ? "s" : ""}</span></div><div className="management-report-grid">{items.map(renderReportCard)}{!items.length && <div className="management-empty"><FileText size={28} /><strong>Aucun rapport</strong><p>{emptyText}</p></div>}</div></section>;
  }

  return (
    <div className="management-report-page">
      {isContributor && <section className="management-report-form"><div className="management-form-head"><span className="category-icon violet"><FileText size={22} /></span><div><p className="eyebrow dark">AUTO-ÉVALUATION</p><h2>Rapport de gérance</h2><p className="muted">Décrivez votre gérance et les points à améliorer.</p></div></div><form onSubmit={submit}><div className="form-grid"><label>Date et heure<input type="datetime-local" value={form.occurredAt} onChange={(event) => set("occurredAt", event.target.value)} required /></label><label>Type de gérance<input value={form.managementType} onChange={(event) => set("managementType", event.target.value)} placeholder="Ex. Patrouille, intervention, formation…" required maxLength={100} /></label></div><label>Description<textarea value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="Décrivez la gérance effectuée…" required /></label><div className="form-grid"><label>Point positif<textarea value={form.positivePoint} onChange={(event) => set("positivePoint", event.target.value)} placeholder="Ce qui a bien fonctionné…" required /></label><label>Point négatif<textarea value={form.negativePoint} onChange={(event) => set("negativePoint", event.target.value)} placeholder="Ce qui peut être amélioré…" required /></label></div>{error && <p className="form-error">{error}</p>}<div className="transmission-actions"><span><ShieldCheck size={15} /> Visible par les responsables</span><button type="submit" className="primary" disabled={sending}><Send size={17} />{sending ? "Enregistrement…" : "Envoyer le rapport"}</button></div></form></section>}

      {isManager && <section className="management-overview"><div className="summary-toolbar"><div><p className="eyebrow dark">SUIVI RESPONSABLE</p><h2>Classement des gérances</h2><p>Nombre de rapports réalisés par les Sous-Officiers et Sous-Officiers Supérieurs.</p></div><div className="summary-controls"><label>Période<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="day">Jour</option><option value="week">Semaine</option><option value="month">Mois</option><option value="year">Année</option></select></label>{session.role === "admin" && <button className="summary-reset-button" type="button" onClick={onResetRanking}><Trophy size={16} /> Reset classement</button>}</div></div><div className="management-ranking">{ranking.map((entry, index) => <article key={entry.user.id}><span className={`ranking-number rank-${Math.min(index + 1, 3)}`}>{index + 1}</span><Avatar user={entry.user} size="small" /><div><strong>{entry.user.grade || GRADES[0]} {entry.user.firstName} {entry.user.lastName}</strong><small>{ROLES[entry.user.role].label}</small></div><b>{entry.total}</b><small>gérance{entry.total > 1 ? "s" : ""}</small></article>)}{!ranking.length && <p className="management-empty">Aucun rapport pour cette période.</p>}</div></section>}

      {renderReportList({ eyebrow: "MES RAPPORTS", title: "Mes rapports", description: "Retrouvez vos auto-évaluations et les avis reçus.", items: ownReports, emptyText: "Vos prochains rapports apparaîtront ici." })}
      {(isManager || isAssignedReferent) && renderReportList({ eyebrow: isManager ? "SUIVI DES ÉVALUATIONS" : "SUIVI DES SERGENTS ASSIGNÉS", title: isManager ? "Rapports de l’effectif" : "Rapports de mes nouveaux Sergents", description: isManager ? "Ajoutez un avis libre et gérez les rapports de l’effectif." : "Ajoutez votre avis aux rapports des Sergents qui vous sont assignés.", items: reviewedReports, emptyText: isManager ? "Les évaluations de l’effectif apparaîtront ici." : "Les rapports de vos Sergents assignés apparaîtront ici." })}
    </div>
  );
}

const MEETING_STATUS_LABELS = { present: "Présent", absent: "Absent", late: "En retard" };
const MEETING_STATUS_TONES = { present: "green", absent: "red", late: "gold" };
const GOOGLE_DOCS_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_REQUEST_TIMEOUT = 45000;

function loadGoogleIdentityServices() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Google Docs est disponible uniquement depuis le portail."));
      return;
    }
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const selector = 'script[data-google-identity-services="true"]';
    const existingScript = document.querySelector(selector);
    const onLoad = () => window.google?.accounts?.oauth2 ? resolve() : reject(new Error("Le service Google n’est pas disponible."));
    if (existingScript) {
      existingScript.addEventListener("load", onLoad, { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Le service Google n’a pas pu être chargé.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentityServices = "true";
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", () => reject(new Error("Le service Google n’a pas pu être chargé.")), { once: true });
    document.head.appendChild(script);
  });
}

async function requestGoogleDriveToken() {
  if (!GOOGLE_CLIENT_ID) throw new Error("La liaison Google Docs n’est pas encore configurée.");
  await loadGoogleIdentityServices();
  return new Promise((resolve, reject) => {
    let completed = false;
    const finish = (handler) => (value) => {
      if (completed) return;
      completed = true;
      window.clearTimeout(timeout);
      handler(value);
    };
    const timeout = window.setTimeout(() => finish(reject)(new Error("Google met trop de temps à répondre. Vérifiez la fenêtre d’autorisation puis réessayez.")), GOOGLE_REQUEST_TIMEOUT);
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_DOCS_SCOPE,
      callback: finish((response) => {
        if (response?.error || !response?.access_token) {
          reject(new Error(response?.error_description || "L’autorisation Google a été refusée."));
          return;
        }
        resolve(response.access_token);
      }),
      error_callback: finish(() => reject(new Error("L’autorisation Google n’a pas pu être ouverte. Autorisez les fenêtres contextuelles puis réessayez."))),
    });
    try {
      tokenClient.requestAccessToken({ prompt: "select_account consent" });
    } catch (requestError) {
      finish(reject)(requestError instanceof Error ? requestError : new Error("L’autorisation Google n’a pas pu démarrer."));
    }
  });
}

async function fetchGoogleDocs(url, options) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), GOOGLE_REQUEST_TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (requestError) {
    if (requestError?.name === "AbortError") throw new Error("Google Docs met trop de temps à répondre. Réessayez dans un instant.");
    throw requestError;
  } finally {
    window.clearTimeout(timeout);
  }
}

function meetingLocalValue(value) {
  const date = new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) return localDateTimeValue();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function MeetingPanel({ session, users, meeting, history, onSave }) {
  const members = useMemo(() => users.filter((user) => user.approvalStatus === "approved" && ["admin", "referent", "senior", "officer"].includes(user.role)).sort(compareUsersByGrade), [users]);
  const savedMeetings = useMemo(() => Array.isArray(history) ? history : [], [history]);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const [form, setForm] = useState(() => ({ occurredAt: meetingLocalValue(meeting?.occurredAt), attendance: [], improvementAxes: "", caporalVotes: [], suggestions: "" }));
  const [saving, setSaving] = useState(false);
  const [syncingDraft, setSyncingDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const initializedRef = useRef(false);
  const lastMeetingRevisionRef = useRef("");
  const hasUnsavedChangesRef = useRef(false);
  const draftVersionRef = useRef(0);

  function memberLabel(userId) {
    const user = usersById.get(userId);
    return user ? `${user.grade || GRADES[0]} ${user.firstName || ""} ${user.lastName || ""}`.trim() : "Membre du portail";
  }

  function historyDateLabel(value) {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(value));
  }

  useEffect(() => {
    const revision = `${meeting?.updatedAt || ""}:${meeting?.occurredAt || ""}`;
    const known = new Map((Array.isArray(meeting?.attendance) ? meeting.attendance : []).map((entry) => [entry.userId, entry]));
    // Une actualisation du portail ne doit jamais écraser une réunion en cours
    // de saisie. La nouvelle version est chargée uniquement au premier affichage
    // ou juste après son enregistrement.
    if (hasUnsavedChangesRef.current) {
      const absentIds = new Set([...known.values()].filter((entry) => entry.status === "absent").map((entry) => entry.userId));
      if (absentIds.size) setForm((current) => {
        let changed = false;
        const attendance = current.attendance.map((entry) => absentIds.has(entry.userId) && entry.status !== "absent" ? (changed = true, { ...entry, status: "absent" }) : entry);
        return changed ? { ...current, attendance } : current;
      });
      return;
    }
    if (initializedRef.current && lastMeetingRevisionRef.current === revision) return;
    setForm({
      occurredAt: meetingLocalValue(meeting?.occurredAt),
      attendance: members.map((user) => ({ userId: user.id, status: user.presence === "absent" ? "absent" : known.get(user.id)?.status || "present", note: known.get(user.id)?.note || "" })),
      improvementAxes: meeting?.improvementAxes || "",
      caporalVotes: Array.isArray(meeting?.caporalVotes) ? meeting.caporalVotes : [],
      suggestions: meeting?.suggestions || "",
    });
    initializedRef.current = true;
    lastMeetingRevisionRef.current = revision;
  }, [meeting?.updatedAt, meeting?.occurredAt, users]);

  function updateAttendance(userId, field, value) {
    hasUnsavedChangesRef.current = true;
    draftVersionRef.current += 1;
    setForm((current) => ({ ...current, attendance: current.attendance.map((entry) => entry.userId === userId ? { ...entry, [field]: value } : entry) }));
  }

  function updateCaporal(id, field, value) {
    hasUnsavedChangesRef.current = true;
    draftVersionRef.current += 1;
    setForm((current) => ({ ...current, caporalVotes: current.caporalVotes.map((entry) => entry.id === id ? { ...entry, [field]: value } : entry) }));
  }

  function addCaporal() {
    hasUnsavedChangesRef.current = true;
    draftVersionRef.current += 1;
    setForm((current) => ({ ...current, caporalVotes: [...current.caporalVotes, { id: crypto.randomUUID(), name: "", vote: "favorable", note: "" }] }));
  }

  function removeCaporal(id) {
    hasUnsavedChangesRef.current = true;
    draftVersionRef.current += 1;
    setForm((current) => ({ ...current, caporalVotes: current.caporalVotes.filter((entry) => entry.id !== id) }));
  }

  function updateFormField(field, value) {
    hasUnsavedChangesRef.current = true;
    draftVersionRef.current += 1;
    setForm((current) => ({ ...current, [field]: value }));
  }

  useEffect(() => {
    if (!initializedRef.current || !hasUnsavedChangesRef.current) return undefined;
    const version = draftVersionRef.current;
    const timer = window.setTimeout(async () => {
      setSyncingDraft(true);
      try {
        await onSave({ ...form, occurredAt: new Date(form.occurredAt).toISOString() }, { draft: true });
        if (draftVersionRef.current === version) {
          hasUnsavedChangesRef.current = false;
          setDraftSavedAt(new Date().toISOString());
        }
      } catch (draftError) {
        setError(draftError instanceof Error ? draftError.message : "Le brouillon partagé n’a pas pu être synchronisé.");
      } finally {
        setSyncingDraft(false);
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [form, onSave]);

  async function save(event) {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const version = draftVersionRef.current;
      await onSave({ ...form, occurredAt: new Date(form.occurredAt).toISOString() }, { draft: false });
      if (draftVersionRef.current === version) {
        hasUnsavedChangesRef.current = false;
        setDraftSavedAt(new Date().toISOString());
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "La réunion n’a pas pu être enregistrée.");
    } finally { setSaving(false); }
  }

  async function createGoogleDocument() {
    setExporting(true); setError("");
    try {
      const sourceDate = new Date(form.occurredAt);
      const meetingDate = Number.isNaN(sourceDate.getTime()) ? new Date() : sourceDate;
      const meetingDateLabel = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }).format(meetingDate);
      const author = `${session.grade || GRADES[0]} ${session.firstName || ""} ${session.lastName || ""}`.trim() || "Responsable SO";
      const attendance = members.map((user) => {
        const entry = form.attendance.find((item) => item.userId === user.id) || { status: "present", note: "" };
        const status = user.presence === "absent" ? "absent" : entry.status;
        return `${user.grade || GRADES[0]} ${user.firstName || ""} ${user.lastName || ""}`.trim() + ` — ${MEETING_STATUS_LABELS[status] || "Présent"}\n${entry.note || "Aucun mot renseigné."}`;
      });
      const voteLabels = { favorable: "Favorable", mitige: "Mitigé", defavorable: "Défavorable", sanction: "Sanction" };
      const votes = form.caporalVotes.length
        ? form.caporalVotes.map((entry) => `${entry.name || "Caporal-Chef"} — ${voteLabels[entry.vote] || "Favorable"}\n${entry.note || "Aucune remarque."}`)
        : ["Aucun vote renseigné."];
      const sections = [
        { title: "PRÉSENCES ET MOTS DE L’EFFECTIF", body: attendance.length ? attendance.join("\n\n") : "Aucun Sous-Officier ou Sous-Officier Supérieur validé." },
        { title: "AXES D’AMÉLIORATION", body: form.improvementAxes || "Aucun axe renseigné." },
        { title: "VOTES DES CAPORAUX-CHEFS", body: votes.join("\n\n") },
        { title: "SUGGESTIONS ET IDÉES", body: form.suggestions || "Aucune suggestion renseignée." },
      ];
      const title = "RÉUNION SO\n";
      const subtitle = "COMPTE RENDU OFFICIEL\n";
      const metadata = `Réunion du ${meetingDateLabel}\nPréparé par ${author}\nPortail Sous-Officiers AIT · Document interne\n\n`;
      const closing = "Document interne · Portail Sous-Officiers AIT\n";
      let content = title + subtitle + metadata;
      let cursor = content.length + 1;
      const headingRanges = [];
      sections.forEach((section) => {
        const startIndex = cursor;
        content += `${section.title}\n${section.body}\n\n`;
        headingRanges.push({ startIndex, endIndex: startIndex + section.title.length });
        cursor = content.length + 1;
      });
      const closingStart = cursor;
      content += closing;

      const accessToken = await requestGoogleDriveToken();
      const docTitle = `Réunion SO — ${new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(meetingDate)}`;
      const createResponse = await fetchGoogleDocs("https://docs.googleapis.com/v1/documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: docTitle }),
      });
      if (!createResponse.ok) throw new Error("Google Docs n’a pas pu créer le document.");
      const createdDocument = await createResponse.json();
      const documentId = createdDocument?.documentId;
      if (!documentId) throw new Error("Google Docs n’a pas renvoyé de lien de document.");

      const documentEndpoint = `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`;
      const insertResponse = await fetchGoogleDocs(documentEndpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: content } }] }),
      });
      if (!insertResponse.ok) throw new Error("Le contenu du compte rendu n’a pas pu être ajouté.");

      const titleEnd = title.length + 1;
      const subtitleEnd = titleEnd + subtitle.length;
      const metadataEnd = subtitleEnd + metadata.length;
      const documentEnd = content.length + 1;
      const applyStyleRequests = async (requests) => {
        const response = await fetchGoogleDocs(documentEndpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ requests }),
        });
        return response.ok;
      };
      // The page background is kept in a dedicated request: Google can reject a visual
      // preference on some accounts, but that must never prevent the report from opening.
      const darkBackgroundApplied = await applyStyleRequests([
        { updateDocumentStyle: { documentStyle: { background: { color: { rgbColor: { red: 0.027, green: 0.078, blue: 0.14 } } } }, fields: "background" } },
      ]);
      const palette = darkBackgroundApplied
        ? { body: { red: 0.86, green: 0.9, blue: 0.95 }, title: { red: 0.63, green: 0.84, blue: 1 }, subtitle: { red: 0.3, green: 0.69, blue: 0.96 }, metadata: { red: 0.58, green: 0.7, blue: 0.82 }, heading: { red: 0.74, green: 0.89, blue: 1 }, footer: { red: 0.35, green: 0.58, blue: 0.76 } }
        : { body: { red: 0.12, green: 0.2, blue: 0.3 }, title: { red: 0.04, green: 0.16, blue: 0.31 }, subtitle: { red: 0.06, green: 0.34, blue: 0.62 }, metadata: { red: 0.3, green: 0.41, blue: 0.52 }, heading: { red: 0.05, green: 0.29, blue: 0.54 }, footer: { red: 0.25, green: 0.46, blue: 0.65 } };
      const styleRequests = [
        { updateTextStyle: { range: { startIndex: 1, endIndex: documentEnd }, textStyle: { fontSize: { magnitude: 10.5, unit: "PT" }, foregroundColor: { color: { rgbColor: palette.body } } }, fields: "fontSize,foregroundColor" } },
        { updateTextStyle: { range: { startIndex: 1, endIndex: titleEnd }, textStyle: { bold: true, fontSize: { magnitude: 26, unit: "PT" }, foregroundColor: { color: { rgbColor: palette.title } } }, fields: "bold,fontSize,foregroundColor" } },
        { updateParagraphStyle: { range: { startIndex: 1, endIndex: titleEnd }, paragraphStyle: { alignment: "CENTER", spaceBelow: { magnitude: 4, unit: "PT" } }, fields: "alignment,spaceBelow" } },
        { updateTextStyle: { range: { startIndex: titleEnd, endIndex: subtitleEnd }, textStyle: { bold: true, fontSize: { magnitude: 11, unit: "PT" }, foregroundColor: { color: { rgbColor: palette.subtitle } } }, fields: "bold,fontSize,foregroundColor" } },
        { updateParagraphStyle: { range: { startIndex: titleEnd, endIndex: subtitleEnd }, paragraphStyle: { alignment: "CENTER", spaceBelow: { magnitude: 16, unit: "PT" } }, fields: "alignment,spaceBelow" } },
        { updateTextStyle: { range: { startIndex: subtitleEnd, endIndex: metadataEnd }, textStyle: { fontSize: { magnitude: 10, unit: "PT" }, foregroundColor: { color: { rgbColor: palette.metadata } } }, fields: "fontSize,foregroundColor" } },
        { updateParagraphStyle: { range: { startIndex: subtitleEnd, endIndex: metadataEnd }, paragraphStyle: { alignment: "CENTER", spaceBelow: { magnitude: 12, unit: "PT" } }, fields: "alignment,spaceBelow" } },
        ...headingRanges.flatMap((range) => [
          { updateParagraphStyle: { range, paragraphStyle: { spaceAbove: { magnitude: 18, unit: "PT" }, spaceBelow: { magnitude: 8, unit: "PT" }, keepWithNext: true }, fields: "spaceAbove,spaceBelow,keepWithNext" } },
          { updateTextStyle: { range, textStyle: { bold: true, fontSize: { magnitude: 12.5, unit: "PT" }, foregroundColor: { color: { rgbColor: palette.heading } } }, fields: "bold,fontSize,foregroundColor" } },
        ]),
        { updateTextStyle: { range: { startIndex: closingStart, endIndex: documentEnd }, textStyle: { bold: true, fontSize: { magnitude: 9, unit: "PT" }, foregroundColor: { color: { rgbColor: palette.footer } } }, fields: "bold,fontSize,foregroundColor" } },
        { updateParagraphStyle: { range: { startIndex: closingStart, endIndex: documentEnd }, paragraphStyle: { alignment: "CENTER", spaceAbove: { magnitude: 18, unit: "PT" } }, fields: "alignment,spaceAbove" } },
      ];
      const stylesApplied = await applyStyleRequests(styleRequests);
      if (!stylesApplied) {
        // Leave the user with a readable, created report even if a Google formatting rule changes.
        await applyStyleRequests([
          { updateTextStyle: { range: { startIndex: 1, endIndex: documentEnd }, textStyle: { foregroundColor: { color: { rgbColor: palette.body } } }, fields: "foregroundColor" } },
          { updateTextStyle: { range: { startIndex: 1, endIndex: titleEnd }, textStyle: { bold: true, fontSize: { magnitude: 22, unit: "PT" }, foregroundColor: { color: { rgbColor: palette.title } } }, fields: "bold,fontSize,foregroundColor" } },
          ...headingRanges.map((range) => ({ updateTextStyle: { range, textStyle: { bold: true, foregroundColor: { color: { rgbColor: palette.heading } } }, fields: "bold,foregroundColor" } })),
        ]);
      }

      const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;
      window.location.assign(documentUrl);
    } catch (googleError) {
      setError(googleError instanceof Error ? googleError.message : "Le document Google Docs n’a pas pu être créé.");
    } finally { setExporting(false); }
  }

  return <div className="meeting-page"><form className="meeting-card" onSubmit={save}>
    <div className="meeting-head"><div><p className="eyebrow dark">SUIVI RESPONSABLE</p><h2>Réunion SO</h2><p className="muted">Centralisez les présences, les échanges et les décisions de la réunion.</p></div><label>Date et heure<input type="datetime-local" value={form.occurredAt} onChange={(event) => updateFormField("occurredAt", event.target.value)} required /></label></div>
    <section className="meeting-section"><div className="meeting-section-title"><span className="category-icon green"><UserCheck size={20} /></span><div><h3>Présences et mots de l'effectif</h3><p>Indiquez le statut et notez les informations utiles pour chaque membre.</p></div></div><div className="meeting-attendance-table"><div className="meeting-attendance-head"><span>Membre</span><span>Présence</span><span>Mot / remarque</span></div>{members.map((user) => { const entry = form.attendance.find((item) => item.userId === user.id) || { status: "present", note: "" }; const markedAbsent = user.presence === "absent"; const status = markedAbsent ? "absent" : entry.status; return <div className="meeting-attendance-row" key={user.id}><div className="meeting-member"><Avatar user={user} size="small" /><span><strong>{user.grade || GRADES[0]} {user.firstName} {user.lastName}</strong><small>{ROLES[user.role].label}</small></span></div><select className={`meeting-status ${MEETING_STATUS_TONES[status] || "green"}`} value={status} onChange={(event) => updateAttendance(user.id, "status", event.target.value)} disabled={markedAbsent} title={markedAbsent ? "Ce membre est indiqué absent dans le tableau des présences." : undefined}><option value="present">Présent</option><option value="absent">Absent</option><option value="late">En retard</option></select><textarea value={entry.note} onChange={(event) => updateAttendance(user.id, "note", event.target.value)} maxLength={1200} placeholder="Mot, absence, point évoqué…" /></div>; })}{!members.length && <p className="meeting-empty">Aucun Sous-Officier ou Sous-Officier Supérieur validé.</p>}</div></section>
    <section className="meeting-section"><div className="meeting-section-title"><span className="category-icon blue"><TrendingUp size={20} /></span><div><h3>Axes d'amélioration</h3><p>Les points à travailler collectivement avant la prochaine réunion.</p></div></div><textarea className="meeting-long-text" value={form.improvementAxes} onChange={(event) => updateFormField("improvementAxes", event.target.value)} maxLength={6000} placeholder="Décrivez les axes d'amélioration…" /></section>
    <section className="meeting-section"><div className="meeting-section-title"><span className="category-icon gold"><ClipboardCheck size={20} /></span><div><h3>Votes des Caporaux-Chefs</h3><p>Ajoutez les membres éligibles puis consignez l'avis et la remarque.</p></div></div><div className="meeting-votes"><div className="meeting-votes-head"><span>Caporal-Chef</span><span>Avis</span><span>Remarque</span><span /></div>{form.caporalVotes.map((entry) => <div className="meeting-vote-row" key={entry.id}><input value={entry.name} onChange={(event) => updateCaporal(entry.id, "name", event.target.value)} maxLength={140} placeholder="Prénom et nom" /><select value={entry.vote} onChange={(event) => updateCaporal(entry.id, "vote", event.target.value)}><option value="favorable">Favorable</option><option value="mitige">Mitigé</option><option value="defavorable">Défavorable</option><option value="sanction">Sanction</option></select><textarea value={entry.note} onChange={(event) => updateCaporal(entry.id, "note", event.target.value)} maxLength={1200} placeholder="Remarque…" /><button className="icon-button danger" type="button" title="Retirer ce vote" onClick={() => removeCaporal(entry.id)}><Trash2 size={16} /></button></div>)}</div><button className="secondary meeting-add-vote" type="button" onClick={addCaporal}>Ajouter un Caporal-Chef</button></section>
    <section className="meeting-section"><div className="meeting-section-title"><span className="category-icon violet"><MessageSquareText size={20} /></span><div><h3>Suggestions et idées</h3><p>Conservez les propositions à étudier ou à mettre en place.</p></div></div><textarea className="meeting-long-text" value={form.suggestions} onChange={(event) => updateFormField("suggestions", event.target.value)} maxLength={6000} placeholder="Ajoutez les suggestions et les idées évoquées…" /></section>
    {syncingDraft && <p className="draft-status"><BadgeCheck size={14} /> Synchronisation du brouillon partagé…</p>}{!syncingDraft && draftSavedAt && <p className="draft-status"><BadgeCheck size={14} /> Brouillon partagé synchronisé à {new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(draftSavedAt))}</p>}{error && <p className="form-error">{error}</p>}<div className="meeting-actions"><span><ShieldCheck size={15} /> Brouillon partagé avec les responsables</span><div><button className="secondary" type="button" onClick={createGoogleDocument} disabled={exporting}><Download size={17} />{exporting ? "Création…" : "Créer le Google Doc"}</button><button className="primary" type="submit" disabled={saving}><ClipboardCheck size={17} />{saving ? "Enregistrement…" : "Enregistrer la réunion"}</button></div></div>
  </form>
  <section className="meeting-history-card">
    <div className="meeting-history-head"><div><p className="eyebrow dark">ARCHIVES PARTAGÉES</p><h2>Historique des réunions SO</h2><p className="muted">Chaque enregistrement final est conservé ici. Les brouillons n’y apparaissent pas.</p></div><span className="meeting-history-count"><CalendarDays size={16} /> {savedMeetings.length}</span></div>
    <div className="meeting-history-list">{savedMeetings.map((savedMeeting) => { const presentCount = savedMeeting.attendance.filter((entry) => entry.status === "present").length; const absentCount = savedMeeting.attendance.filter((entry) => entry.status === "absent").length; return <article key={savedMeeting.id} className="meeting-history-item"><div className="meeting-history-summary"><span className="category-icon blue"><CalendarDays size={20} /></span><div><h3>Réunion du {historyDateLabel(savedMeeting.occurredAt)}</h3><p>Enregistrée par {savedMeeting.savedByName} le {historyDateLabel(savedMeeting.savedAt)}</p></div><div className="meeting-history-stats"><span>{presentCount} présent{presentCount > 1 ? "s" : ""}</span><span>{absentCount} absent{absentCount > 1 ? "s" : ""}</span></div></div><details><summary>Voir le compte rendu</summary><div className="meeting-history-details"><section><h4>Présences et mots</h4><div className="meeting-history-attendance">{savedMeeting.attendance.map((entry) => <article key={entry.userId}><strong>{memberLabel(entry.userId)}</strong><span className={`history-status ${MEETING_STATUS_TONES[entry.status] || "green"}`}>{MEETING_STATUS_LABELS[entry.status] || "Présent"}</span><p>{entry.note || "Aucun mot renseigné."}</p></article>)}{!savedMeeting.attendance.length && <p>Aucune présence renseignée.</p>}</div></section><section><h4>Axes d’amélioration</h4><p>{savedMeeting.improvementAxes || "Aucun axe renseigné."}</p></section><section><h4>Votes des Caporaux-Chefs</h4><div className="meeting-history-votes">{savedMeeting.caporalVotes.map((entry) => <p key={entry.id}><strong>{entry.name || "Caporal-Chef"}</strong> · {entry.vote === "mitige" ? "Mitigé" : entry.vote === "defavorable" ? "Défavorable" : entry.vote === "sanction" ? "Sanction" : "Favorable"}<br />{entry.note || "Aucune remarque."}</p>)}{!savedMeeting.caporalVotes.length && <p>Aucun vote renseigné.</p>}</div></section><section><h4>Suggestions et idées</h4><p>{savedMeeting.suggestions || "Aucune suggestion renseignée."}</p></section></div></details></article>; })}{!savedMeetings.length && <p className="meeting-empty">Aucune réunion SO n’a encore été enregistrée.</p>}</div>
  </section>
  </div>;
}

function MeetingTransmissionPanel({ session }) {
  const [users, setUsers] = useState([]);
  const [meeting, setMeeting] = useState(DEFAULT_SO_MEETING);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let refreshing = false;
    const applyMeeting = (state) => {
      if (cancelled) return;
      if (state?.soMeeting && typeof state.soMeeting === "object") {
        const next = { ...DEFAULT_SO_MEETING, ...state.soMeeting };
        setMeeting((current) => current.updatedAt === next.updatedAt && current.occurredAt === next.occurredAt ? current : next);
      }
      if (Array.isArray(state?.soMeetingHistory)) setHistory(state.soMeetingHistory);
    };
    async function loadInitial() {
      try {
        const [accounts, state] = await Promise.all([accountRequest("/api/auth/bootstrap"), portalRequest()]);
        if (cancelled) return;
        setUsers(Array.isArray(accounts?.users) ? accounts.users : []);
        applyMeeting(state);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    async function refreshMeeting() {
      if (refreshing) return;
      refreshing = true;
      try { applyMeeting(await portalRequest()); } catch { /* La prochaine synchronisation réessaiera. */ } finally { refreshing = false; }
    }
    loadInitial();
    const timer = window.setInterval(refreshMeeting, 2_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  async function save(values, { draft = false } = {}) {
    const state = await portalRequest("POST", { action: draft ? "save_so_meeting_draft" : "save_so_meeting", meeting: { ...values, updatedAt: new Date().toISOString(), updatedBy: session.id } });
    if (state?.soMeeting && typeof state.soMeeting === "object") setMeeting({ ...DEFAULT_SO_MEETING, ...state.soMeeting });
    if (Array.isArray(state?.soMeetingHistory)) setHistory(state.soMeetingHistory);
    return state?.soMeeting;
  }

  if (loading) return <div className="meeting-card"><p className="muted">Chargement de la réunion SO…</p></div>;
  return <MeetingPanel session={session} users={users} meeting={meeting} history={history} onSave={save} />;
}

function App() {
  const [users, setUsers] = useState([]);
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [configurationError, setConfigurationError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState("");
  const [activeSection, setActiveSection] = useState("home");
  const [openGroups, setOpenGroups] = useState({ admin: true, referent: true, global: true, senior: true, chat: true });
  const [profileOpen, setProfileOpen] = useState(false);
  const [themeId, setThemeId] = useState("doctrine");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [quotas, setQuotas] = useState(DEFAULT_QUOTAS);
  const [missions, setMissions] = useState([]);
  const [chats, setChats] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [shortcutPreferences, setShortcutPreferences] = useState({});
  const [summarySettings, setSummarySettings] = useState({ activityResetAt: null });
  const [sergeantAssignments, setSergeantAssignments] = useState([]);
  const [submissionHistory, setSubmissionHistory] = useState([]);
  const [portalNotifications, setPortalNotifications] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [managementReports, setManagementReports] = useState([]);
  const [managementReportSettings, setManagementReportSettings] = useState({ rankingResetAt: null });
  const [soMeeting, setSoMeeting] = useState(DEFAULT_SO_MEETING);
  const [portalRemote, setPortalRemote] = useState(false);
  const [loginTransition, setLoginTransition] = useState(null);
  const [avatarSyncing, setAvatarSyncing] = useState(false);
  const audioContextRef = useRef(null);

  useEffect(() => {
    if (!ready || !session) return;
    let cancelled = false;
    let refreshing = false;
    async function refreshSharedPortal() {
      if (refreshing || document.visibilityState === "hidden") return;
      refreshing = true;
      try {
        const state = await portalRequest();
        if (cancelled) return;
        applySharedPortalState(state);
      } catch {
        if (!cancelled) setPortalRemote(false);
      } finally {
        refreshing = false;
      }
    }
    refreshSharedPortal();
    // Une conversation ouverte se synchronise presque instantanément ; le reste
    // du portail reste plus léger lorsque la messagerie n’est pas affichée.
    const refreshDelay = activeSection === "chat" ? 1_200 : activeSection === "summary" ? 2_500 : 8_000;
    const timer = window.setInterval(refreshSharedPortal, refreshDelay);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshSharedPortal();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [ready, session?.id, activeSection]);
  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      const accountState = await accountRequest("/api/auth/bootstrap");
      if (cancelled) return;
      setConfigurationError(accountState.configured ? "" : "La base des comptes n’est pas configurée. Contactez l’administrateur du portail.");
      setUsers(Array.isArray(accountState.users) ? accountState.users : []);
      if (accountState.session) {
        setSession(accountState.session);
        setActiveSection("home");
        const discordStatus = new URLSearchParams(window.location.search).get("discord");
        if (discordStatus === "connected") {
          setLoginTransition(accountState.session);
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete("discord");
          window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
          window.setTimeout(() => {
            if (!cancelled) setLoginTransition(null);
          }, 1850);
        }
      }

      const parsedQuotas = readStoredJson(QUOTA_KEY, DEFAULT_QUOTAS);
      setQuotas({ targets: { ...DEFAULT_QUOTAS.targets, ...(parsedQuotas?.targets || {}) }, counts: parsedQuotas?.counts || {}, exemptions: parsedQuotas?.exemptions || {}, resetAt: parsedQuotas?.resetAt || null });
      const savedMissions = readStoredJson(MISSIONS_KEY, []);
      const savedChats = readStoredJson(CHAT_KEY, []);
      const savedLogs = readStoredJson(LOG_KEY, []);
      const savedAssignments = readStoredJson(ASSIGNMENTS_KEY, []);
      const savedSubmissionHistory = readStoredJson(SUBMISSION_HISTORY_KEY, []);
      const savedNotifications = readStoredJson(NOTIFICATION_KEY, []);
      const savedManagementReports = readStoredJson(MANAGEMENT_REPORTS_KEY, []);
      const savedManagementReportSettings = readStoredJson(MANAGEMENT_REPORT_SETTINGS_KEY, { rankingResetAt: null });
      const savedMeeting = readStoredJson(SO_MEETING_KEY, DEFAULT_SO_MEETING);
      // Les anciennes missions n’étaient stockées que dans le navigateur. Elles
      // ne doivent plus réapparaître ni être importées dans l’espace partagé.
      // La purge ne s’exécute qu’une fois : les données reçues du serveur restent
      // ensuite disponibles comme cache de secours lors des prochains chargements.
      const purgeLegacyMissions = localStorage.getItem(LEGACY_MISSIONS_PURGED_KEY) !== "true";
      if (purgeLegacyMissions) {
        localStorage.removeItem(MISSIONS_KEY);
        localStorage.setItem(LEGACY_MISSIONS_PURGED_KEY, "true");
      }
      setMissions(purgeLegacyMissions ? [] : (Array.isArray(savedMissions) ? savedMissions : []));
      setChats(Array.isArray(savedChats) ? savedChats : []);
      setAuditLogs(Array.isArray(savedLogs) ? savedLogs : []);
      setShortcutPreferences(readStoredJson(SHORTCUTS_KEY, {}));
      setSummarySettings(readStoredJson(SUMMARY_KEY, { activityResetAt: null }));
      setSergeantAssignments(Array.isArray(savedAssignments) ? savedAssignments : []);
      setSubmissionHistory(Array.isArray(savedSubmissionHistory) ? savedSubmissionHistory : []);
      setPortalNotifications(Array.isArray(savedNotifications) ? savedNotifications : []);
      setManagementReports(Array.isArray(savedManagementReports) ? savedManagementReports : []);
      setManagementReportSettings(savedManagementReportSettings && typeof savedManagementReportSettings === "object" ? savedManagementReportSettings : { rankingResetAt: null });
      setSoMeeting(savedMeeting && typeof savedMeeting === "object" ? { ...DEFAULT_SO_MEETING, ...savedMeeting } : DEFAULT_SO_MEETING);
      const storedTheme = localStorage.getItem(THEME_KEY);
      const savedThemeId = storedTheme === "dark" ? "nuit" : storedTheme === "light" ? "clair" : themeById(storedTheme).id;
      const savedSounds = localStorage.getItem(SOUND_KEY) !== "off";
      setThemeId(savedThemeId);
      setSoundEnabled(savedSounds);
      const initialTheme = themeById(savedThemeId);
      document.documentElement.dataset.theme = initialTheme.mode;
      document.documentElement.dataset.colorTheme = initialTheme.id;
      document.documentElement.style.setProperty("--theme-accent", initialTheme.accent);
      document.documentElement.style.setProperty("--theme-accent-deep", initialTheme.deep);
      document.documentElement.style.setProperty("--theme-surface", initialTheme.surface);
      document.documentElement.style.setProperty("--theme-sidebar-a", initialTheme.sidebarA);
      document.documentElement.style.setProperty("--theme-sidebar-b", initialTheme.sidebarB);
      setReady(true);
    }
    initialize().catch((error) => {
      if (!cancelled) {
        setConfigurationError(error instanceof Error ? error.message : "La connexion à la base des comptes est indisponible.");
        setReady(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (ready) localStorage.setItem(QUOTA_KEY, JSON.stringify(quotas)); }, [quotas, ready]);
  useEffect(() => { if (ready) localStorage.setItem(MISSIONS_KEY, JSON.stringify(missions)); }, [missions, ready]);
  useEffect(() => {
    if (!ready || portalRemote) return;
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(chats)); }
    catch { flash("Stockage du chat saturé : supprimez d’anciennes pièces jointes."); }
  }, [chats, ready, portalRemote]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(LOG_KEY, JSON.stringify(auditLogs)); } catch { /* Conserve l’application fonctionnelle si le stockage est plein. */ }
  }, [auditLogs, ready]);
  useEffect(() => { if (ready) localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcutPreferences)); }, [shortcutPreferences, ready]);
  useEffect(() => { if (ready) localStorage.setItem(SUMMARY_KEY, JSON.stringify(summarySettings)); }, [summarySettings, ready]);
  useEffect(() => { if (ready) localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(sergeantAssignments)); }, [sergeantAssignments, ready]);
  useEffect(() => { if (ready) localStorage.setItem(SUBMISSION_HISTORY_KEY, JSON.stringify(submissionHistory)); }, [submissionHistory, ready]);
  useEffect(() => { if (ready) localStorage.setItem(MANAGEMENT_REPORTS_KEY, JSON.stringify(managementReports)); }, [managementReports, ready]);
  useEffect(() => { if (ready) localStorage.setItem(MANAGEMENT_REPORT_SETTINGS_KEY, JSON.stringify(managementReportSettings)); }, [managementReportSettings, ready]);
  useEffect(() => { if (ready) localStorage.setItem(SO_MEETING_KEY, JSON.stringify(soMeeting)); }, [soMeeting, ready]);
  useEffect(() => { if (ready && !portalRemote) localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(portalNotifications)); }, [portalNotifications, ready, portalRemote]);
  useEffect(() => {
    function syncAccounts(event) {
      if (event.key === CHAT_KEY && event.newValue) {
        if (portalRemote) return;
        try { setChats(JSON.parse(event.newValue)); } catch { /* Ignore une discussion invalide. */ }
        return;
      }
      if (event.key === LOG_KEY && event.newValue) {
        try { setAuditLogs(JSON.parse(event.newValue)); } catch { /* Ignore un journal invalide. */ }
        return;
      }
      if (event.key === SHORTCUTS_KEY && event.newValue) {
        try { setShortcutPreferences(JSON.parse(event.newValue)); } catch { /* Ignore des raccourcis invalides. */ }
        return;
      }
      if (event.key === SUMMARY_KEY && event.newValue) {
        try { setSummarySettings(JSON.parse(event.newValue)); } catch { /* Ignore des réglages invalides. */ }
        return;
      }
      if (event.key === ASSIGNMENTS_KEY && event.newValue) {
        try { setSergeantAssignments(JSON.parse(event.newValue)); } catch { /* Ignore des assignations invalides. */ }
        return;
      }
      if (event.key === SUBMISSION_HISTORY_KEY && event.newValue) {
        try { setSubmissionHistory(JSON.parse(event.newValue)); } catch { /* Ignore un historique invalide. */ }
        return;
      }
      if (event.key === NOTIFICATION_KEY && event.newValue) {
        if (portalRemote) return;
        try { setPortalNotifications(JSON.parse(event.newValue)); } catch { /* Ignore des notifications invalides. */ }
        return;
      }
    }
    window.addEventListener("storage", syncAccounts);
    return () => window.removeEventListener("storage", syncAccounts);
  }, [portalRemote]);
  useEffect(() => {
    if (!ready || !session) return;
    let checking = false;
    async function checkSession() {
      if (checking) return;
      checking = true;
      try {
        const accountState = await accountRequest("/api/auth/bootstrap");
        if (!accountState.session) {
          setSession(null);
          setProfileOpen(false);
          setLoginError("Votre session a expiré ou votre compte a été bloqué.");
          return;
        }
        setUsers(Array.isArray(accountState.users) ? accountState.users : []);
        setSession(accountState.session);
      } catch {
        // Une indisponibilité temporaire de la base ne doit pas déconnecter la personne.
      } finally { checking = false; }
    }
    const timer = window.setInterval(checkSession, 60_000);
    document.addEventListener("visibilitychange", checkSession);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", checkSession);
    };
  }, [ready, session?.id]);
  useEffect(() => {
    if (!ready) return;
    const selectedTheme = themeById(themeId);
    document.documentElement.dataset.theme = selectedTheme.mode;
    document.documentElement.dataset.colorTheme = selectedTheme.id;
    document.documentElement.style.setProperty("--theme-accent", selectedTheme.accent);
    document.documentElement.style.setProperty("--theme-accent-deep", selectedTheme.deep);
    document.documentElement.style.setProperty("--theme-surface", selectedTheme.surface);
    document.documentElement.style.setProperty("--theme-sidebar-a", selectedTheme.sidebarA);
    document.documentElement.style.setProperty("--theme-sidebar-b", selectedTheme.sidebarB);
    localStorage.setItem(THEME_KEY, selectedTheme.id);
  }, [themeId, ready]);
  useEffect(() => { if (ready) localStorage.setItem(SOUND_KEY, soundEnabled ? "on" : "off"); }, [soundEnabled, ready]);
  useEffect(() => {
    if (!ready || !soundEnabled) return undefined;
    const onInterfaceClick = (event) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest("button, a.primary, label.preference-toggle");
      if (!control || control.disabled || control.getAttribute("aria-disabled") === "true") return;
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const context = audioContextRef.current || new AudioContextClass();
        audioContextRef.current = context;
        if (context.state === "suspended") context.resume().catch(() => {});
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(480, now);
        oscillator.frequency.exponentialRampToValueAtTime(630, now + 0.06);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.035, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.09);
      } catch { /* Le portail reste utilisable si le navigateur ne prend pas en charge l’audio. */ }
    };
    document.addEventListener("click", onInterfaceClick, true);
    return () => document.removeEventListener("click", onInterfaceClick, true);
  }, [ready, soundEnabled]);
  useEffect(() => () => {
    const context = audioContextRef.current;
    if (context?.close) context.close().catch(() => {});
  }, []);

  const canManage = session && hasManagerAccess(session.role);
  const manageable = (user) => {
    if (user.approvalStatus !== "approved") return hasManagerAccess(session?.role);
    if (session?.role === "admin") return user.role !== "admin";
    if (session?.role === "management") return !["admin", "management"].includes(user.role);
    return ["senior", "officer"].includes(user.role);
  };
  const visibleUsers = useMemo(() => users.filter((user) => {
    const text = `${user.firstName} ${user.lastName} ${user.discordUsername || ""}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (roleFilter === "all" || user.role === roleFilter);
  }).sort(compareUsersByGrade), [users, query, roleFilter]);

  function addLog(category, action, details = "", actor = session) {
    const now = new Date();
    const entry = { id: crypto.randomUUID(), createdAt: now.toISOString(), displayAt: new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "medium" }).format(now), actorId: actor?.id || "system", actorName: actor ? `${actor.firstName} ${actor.lastName}` : "Système", actorRole: actor?.role || "", category, action, details };
    setAuditLogs((current) => [entry, ...current].slice(0, 500));
  }
  function mergeAuditLogs(current, remoteLogs) {
    const remote = Array.isArray(remoteLogs) ? remoteLogs : [];
    if (!remote.length) return current;
    const known = new Set(remote.map((entry) => entry.id));
    return [...remote, ...current.filter((entry) => !known.has(entry.id))]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 500);
  }
  function mergeChats(current, remoteChats) {
    const remote = Array.isArray(remoteChats) ? remoteChats : [];
    const remoteIds = new Set(remote.map((chat) => chat.id));
    // Une conversation est créée sur le serveur au premier message seulement.
    // On conserve donc son brouillon local entre deux synchronisations afin que
    // l'ouverture d'une nouvelle discussion ne se referme pas immédiatement.
    const localDrafts = current.filter((chat) => chat?.isDraft && !remoteIds.has(chat.id));
    return [...remote, ...localDrafts].sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime());
  }
  function mergeMissions(current, remoteMissions) {
    const remote = Array.isArray(remoteMissions) ? remoteMissions : [];
    return remote.sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
  }
  function applySharedPortalState(state) {
    if (Array.isArray(state?.chats)) setChats((current) => mergeChats(current, state.chats));
    if (Array.isArray(state?.notifications)) setPortalNotifications(state.notifications);
    if (Array.isArray(state?.announcements)) setAnnouncements(state.announcements);
    if (Array.isArray(state?.auditLogs)) setAuditLogs((current) => mergeAuditLogs(current, state.auditLogs));
    if (Array.isArray(state?.submissions)) setSubmissionHistory(state.submissions);
    if (Array.isArray(state?.missions)) setMissions((current) => mergeMissions(current, state.missions));
    if (state?.quotas && typeof state.quotas === "object") setQuotas((current) => ({ ...DEFAULT_QUOTAS, ...current, ...state.quotas }));
    if (state?.summarySettings && typeof state.summarySettings === "object") setSummarySettings(state.summarySettings);
    if (Array.isArray(state?.sergeantAssignments)) setSergeantAssignments(state.sergeantAssignments);
    if (Array.isArray(state?.managementReports)) setManagementReports(state.managementReports);
    if (state?.managementReportSettings && typeof state.managementReportSettings === "object") setManagementReportSettings(state.managementReportSettings);
    if (state?.soMeeting && typeof state.soMeeting === "object") setSoMeeting({ ...DEFAULT_SO_MEETING, ...state.soMeeting });
    setPortalRemote(true);
  }

  function syncSharedPortal(action, payload = {}) {
    if (!portalRemote) return Promise.resolve(null);
    return portalRequest("POST", { action, ...payload })
      .then((state) => { applySharedPortalState(state); return state; })
      .catch((error) => {
        flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible.");
        return null;
      });
  }
  function addPortalNotification({ recipients = "all", kind = "form", title, text, target = "home" }) {
    const audience = Array.isArray(recipients) ? [...new Set(recipients.filter(Boolean))] : null;
    const item = { id: crypto.randomUUID(), recipients: audience, kind, title, text, target, createdAt: new Date().toISOString() };
    setPortalNotifications((current) => [item, ...current].slice(0, 300));
    if (portalRemote) syncSharedPortal("notify", { recipients, kind, title, text, target });
  }
  function dismissPortalNotification(notificationId) {
    if (!notificationId) return;
    setPortalNotifications((current) => current.filter((notification) => notification.id !== notificationId));
    if (portalRemote) syncSharedPortal("dismiss_notification", { notificationId });
  }
  function clearPortalNotifications() {
    const hasNotifications = portalNotifications.some((notification) => !Array.isArray(notification.recipients) || notification.recipients.includes(session.id));
    if (!hasNotifications) return;
    if (portalRemote) {
      portalRequest("POST", { action: "dismiss_all_notifications" })
        .then((state) => {
          applySharedPortalState(state);
          flash("Toutes vos notifications ont été effacées.");
        })
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    setPortalNotifications((current) => current.filter((notification) => Array.isArray(notification.recipients) && !notification.recipients.includes(session.id)));
    flash("Toutes vos notifications ont été effacées.");
  }
  async function createAnnouncement(values) {
    if (!hasManagerAccess(session?.role)) throw new Error("Vous ne pouvez pas publier une annonce.");
    const state = await portalRequest("POST", { action: "create_announcement", title: values.title, content: values.content, pinned: values.pinned === true });
    applySharedPortalState(state);
    flash("L’annonce a été publiée pour tous les membres.");
  }
  async function updateAnnouncement(announcementId, values) {
    if (!hasManagerAccess(session?.role)) throw new Error("Vous ne pouvez pas modifier une annonce.");
    const state = await portalRequest("POST", { action: "update_announcement", announcementId, title: values.title, content: values.content, pinned: values.pinned === true });
    applySharedPortalState(state);
    flash("L’annonce a été modifiée.");
  }
  async function deleteAnnouncement(announcementId) {
    if (!hasManagerAccess(session?.role)) throw new Error("Vous ne pouvez pas supprimer une annonce.");
    const state = await portalRequest("POST", { action: "delete_announcement", announcementId });
    applySharedPortalState(state);
    flash("L’annonce a été supprimée.");
  }
  async function acknowledgeAnnouncement(announcementId) {
    const state = await portalRequest("POST", { action: "acknowledge_announcement", announcementId });
    applySharedPortalState(state);
    flash("Votre accusé de lecture est enregistré.");
  }
  function navigateFromHome(section) {
    if (!canOpenPortalSection(session.role, section)) {
      flash("Votre niveau d’accès actuel ne permet plus d’ouvrir cette rubrique.");
      return;
    }
    setActiveSection(section);
  }
  function clearAuditLogs() {
    if (!hasAdminAccess(session.role) || !confirm("Réinitialiser définitivement le journal des logs ?")) return;
    if (portalRemote) {
      portalRequest("POST", { action: "clear_audit_logs" })
        .then((state) => {
          setAuditLogs(Array.isArray(state?.auditLogs) ? state.auditLogs : []);
          if (Array.isArray(state?.chats)) setChats((current) => mergeChats(current, state.chats));
          if (Array.isArray(state?.notifications)) setPortalNotifications(state.notifications);
          setPortalRemote(true);
          flash("Le journal des logs a été réinitialisé.");
        })
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    setAuditLogs([]);
    addLog("system", "Journal des logs réinitialisé", "L’historique précédent a été supprimé.");
    flash("Le journal des logs a été réinitialisé.");
  }
  function saveHomeShortcuts(ids) {
    setShortcutPreferences((current) => ({ ...current, [session.id]: ids }));
    addLog("profile", "Raccourcis d’accueil modifiés", `${ids.length} raccourci${ids.length > 1 ? "s" : ""} sélectionné${ids.length > 1 ? "s" : ""}`);
    flash("Vos raccourcis ont bien été enregistrés.");
  }
  function resetActivitySummary() {
    if (!hasAdminAccess(session.role) || !confirm("Réinitialiser les graphiques de recommandations et d’observations ? Le classement restera inchangé.")) return;
    if (portalRemote) {
      portalRequest("POST", { action: "reset_summary", scope: "activity" })
        .then((state) => { applySharedPortalState(state); flash("Les graphiques sont réinitialisés pour tous les membres."); })
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    const activityResetAt = new Date().toISOString();
    setSummarySettings((current) => ({ ...current, activityResetAt }));
    addLog("summary", "Graphiques d’activité réinitialisés", "Recommandations et observations remises à zéro.");
    flash("Les statistiques d’activité ont été réinitialisées.");
  }
  function resetActivityRanking() {
    if (!hasAdminAccess(session.role) || !confirm("Réinitialiser uniquement le classement des Sous-Officiers les plus actifs ?")) return;
    if (portalRemote) {
      portalRequest("POST", { action: "reset_summary", scope: "ranking" })
        .then((state) => { applySharedPortalState(state); flash("Le classement est réinitialisé pour tous les membres."); })
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    const rankingResetAt = new Date().toISOString();
    setSummarySettings((current) => ({ ...current, rankingResetAt }));
    addLog("summary", "Classement d’activité réinitialisé", "Le classement repart à zéro sans modifier les graphiques.");
    flash("Le classement des Sous-Officiers a été réinitialisé.");
  }
  async function submitManagementReport(values) {
    if (!session || !["senior", "officer"].includes(session.role)) throw new Error("Vous ne pouvez pas envoyer ce rapport.");
    if (portalRemote) {
      const state = await portalRequest("POST", { action: "create_management_report", values });
      applySharedPortalState(state);
      flash("Votre rapport de gérance a été envoyé.");
      return;
    }
    const report = { id: crypto.randomUUID(), ...values, authorId: session.id, authorName: `${session.firstName} ${session.lastName}`.trim(), authorGrade: session.grade || GRADES[0], authorRole: session.role, createdAt: new Date().toISOString(), comments: [] };
    setManagementReports((current) => [report, ...current]);
    addLog("management", "Rapport de gérance envoyé", values.managementType);
    flash("Votre rapport de gérance a été envoyé.");
  }
  async function commentManagementReport(reportId, content) {
    if (!hasSeniorAccess(session?.role)) throw new Error("Vous ne pouvez pas donner d’avis.");
    if (portalRemote) {
      const state = await portalRequest("POST", { action: "comment_management_report", reportId, content });
      applySharedPortalState(state);
      flash("Votre avis a été ajouté.");
      return;
    }
    const comment = { id: crypto.randomUUID(), authorId: session.id, authorName: `${session.firstName} ${session.lastName}`.trim(), authorGrade: session.grade || GRADES[0], authorRole: session.role, content: content.trim(), createdAt: new Date().toISOString() };
    setManagementReports((current) => current.map((report) => report.id === reportId ? { ...report, comments: [...(report.comments || []), comment] } : report));
    addLog("management", "Avis ajouté à un rapport de gérance");
    flash("Votre avis a été ajouté.");
  }
  async function updateManagementComment(reportId, commentId, content) {
    if (!hasSeniorAccess(session?.role)) throw new Error("Vous ne pouvez pas modifier cet avis.");
    const nextContent = String(content || "").trim();
    if (!nextContent) throw new Error("L’avis ne peut pas être vide.");
    if (portalRemote) {
      const state = await portalRequest("POST", { action: "update_management_comment", reportId, commentId, content: nextContent });
      applySharedPortalState(state);
      flash("L’avis a été modifié.");
      return;
    }
    const editedAt = new Date().toISOString();
    setManagementReports((current) => current.map((report) => report.id === reportId ? { ...report, comments: (report.comments || []).map((comment) => comment.id === commentId ? { ...comment, content: nextContent, editedAt } : comment) } : report));
    addLog("management", "Avis de gérance modifié");
    flash("L’avis a été modifié.");
  }
  async function deleteManagementComment(reportId, commentId) {
    if (!hasSeniorAccess(session?.role)) throw new Error("Vous ne pouvez pas supprimer cet avis.");
    if (portalRemote) {
      const state = await portalRequest("POST", { action: "delete_management_comment", reportId, commentId });
      applySharedPortalState(state);
      flash("L’avis a été supprimé.");
      return;
    }
    setManagementReports((current) => current.map((report) => report.id === reportId ? { ...report, comments: (report.comments || []).filter((comment) => comment.id !== commentId) } : report));
    addLog("management", "Avis de gérance supprimé");
    flash("L’avis a été supprimé.");
  }
  async function deleteManagementReport(reportId) {
    if (!hasManagerAccess(session?.role)) throw new Error("Vous ne pouvez pas supprimer ce rapport.");
    if (portalRemote) {
      const state = await portalRequest("POST", { action: "delete_management_report", reportId });
      applySharedPortalState(state);
      flash("Le rapport de gérance a été supprimé.");
      return;
    }
    setManagementReports((current) => current.filter((report) => report.id !== reportId));
    addLog("management", "Rapport de gérance supprimé");
    flash("Le rapport de gérance a été supprimé.");
  }
  function resetManagementRanking() {
    if (session?.role !== "admin" || !confirm("Réinitialiser le classement des gérances pour tous les membres ?")) return;
    if (portalRemote) {
      portalRequest("POST", { action: "reset_management_ranking" })
        .then((state) => { applySharedPortalState(state); flash("Le classement des gérances a été réinitialisé pour tous les membres."); })
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    setManagementReportSettings({ rankingResetAt: new Date().toISOString() });
    addLog("management", "Classement des gérances réinitialisé");
    flash("Le classement des gérances a été réinitialisé.");
  }
  async function saveSoMeeting(values) {
    if (!hasManagerAccess(session?.role)) throw new Error("Vous ne pouvez pas modifier cette réunion.");
    const meeting = { ...values, updatedAt: new Date().toISOString(), updatedBy: session.id };
    if (portalRemote) {
      const state = await portalRequest("POST", { action: "save_so_meeting", meeting });
      applySharedPortalState(state);
      flash("La réunion SO est enregistrée et synchronisée.");
      return;
    }
    setSoMeeting(meeting);
    addLog("meeting", "Réunion SO mise à jour", `${meeting.attendance?.length || 0} membre(s) suivi(s)`);
    flash("La réunion SO est enregistrée.");
  }
  function flash(message) { setNotice(message); window.setTimeout(() => setNotice(""), 2500); }
  function recordSubmission(type, values) {
    const now = new Date();
    const entry = {
      id: crypto.randomUUID(),
      type,
      values,
      authorId: session.id,
      authorName: `${session.firstName} ${session.lastName}`,
      authorGrade: session.grade || GRADES[0],
      authorRole: session.role,
      createdAt: now.toISOString(),
      displayAt: new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(now),
    };
    setSubmissionHistory((current) => [entry, ...current].slice(0, 300));
    if (portalRemote) portalRequest().then(applySharedPortalState).catch(() => {});
  }
  function resetSubmissionHistory(type) {
    if (!hasManagerAccess(session.role)) return;
    const label = type === "sergeant_report" ? "Rapports nouveau Sous-Officier" : TRANSMISSION_TYPES[type]?.title || type;
    if (!confirm(`Réinitialiser uniquement l’historique « ${label} » ?`)) return;
    if (portalRemote) {
      portalRequest("POST", { action: "reset_submissions", type })
        .then((state) => { applySharedPortalState(state); flash(`L’historique « ${label} » a été réinitialisé.`); })
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    setSubmissionHistory((current) => current.filter((entry) => entry.type !== type));
    addLog("form", "Historique de formulaire réinitialisé", label);
    flash(`L’historique « ${label} » a été réinitialisé.`);
  }
  function updateSubmissionHistory(type, entryId, values) {
    if (!hasManagerAccess(session.role)) return;
    const text = (value, limit = 950) => typeof value === "string" ? value.trim().slice(0, limit) : "";
    const isReport = type === "sergeant_report";
    const updatedValues = isReport
      ? {
          sergeantName: text(values.sergeantName, 100),
          positivePoints: text(values.positivePoints),
          negativePoints: text(values.negativePoints),
          globalOpinion: text(values.globalOpinion),
          conclusion: REPORT_CONCLUSIONS.includes(values.conclusion) ? values.conclusion : REPORT_CONCLUSIONS[0],
        }
      : {
          aitName: text(values.aitName, 100),
          author: text(values.author, 100),
          reason: text(values.reason),
          ...( ["observation_hdr", "observation_so"].includes(type) ? { observation: values.observation === "negative" ? "negative" : "positive" } : {}),
        };
    const complete = isReport
      ? updatedValues.sergeantName && updatedValues.positivePoints && updatedValues.negativePoints && updatedValues.globalOpinion
      : updatedValues.aitName && updatedValues.author && updatedValues.reason;
    if (!complete) { flash("Tous les champs de l’historique doivent être renseignés."); return; }
    if (portalRemote) {
      portalRequest("POST", { action: "update_submission", submissionId: entryId, type, values: updatedValues })
        .then((state) => { applySharedPortalState(state); flash(state?.discordUpdated === false ? "L’historique a été modifié. Cet ancien message Discord ne peut pas être mis à jour." : "L’historique et le message Discord ont été modifiés."); })
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    setSubmissionHistory((current) => current.map((entry) => entry.id === entryId && entry.type === type ? { ...entry, values: updatedValues, editedAt: new Date().toISOString(), editedBy: session.id } : entry));
    const label = isReport ? "Rapport nouveau Sous-Officier" : TRANSMISSION_TYPES[type]?.title || type;
    addLog("form", "Historique de formulaire modifié", label);
    flash("L’historique a été modifié.");
  }
  function deleteSubmissionHistory(type, entryId) {
    if (!hasManagerAccess(session.role) || !confirm("Supprimer définitivement cet élément de l’historique public ?")) return;
    const entry = submissionHistory.find((item) => item.id === entryId && item.type === type);
    if (!entry) return;
    if (portalRemote) {
      portalRequest("POST", { action: "delete_submission", submissionId: entryId, type })
        .then((state) => { applySharedPortalState(state); flash("L’élément a été supprimé de l’historique."); })
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    setSubmissionHistory((current) => current.filter((item) => item.id !== entryId));
    const label = type === "sergeant_report" ? "Rapport nouveau Sous-Officier" : TRANSMISSION_TYPES[type]?.title || type;
    addLog("form", "Élément supprimé de l’historique", label);
    flash("L’élément a été supprimé de l’historique.");
  }
  function transmissionSuccess(message, type, values) {
    flash(message);
    recordSubmission(type, values);
    if (!portalRemote) {
      addLog("form", "Formulaire envoyé", TRANSMISSION_TYPES[type]?.title || type);
      addPortalNotification({ recipients: [session.id], title: `Formulaire envoyé — ${TRANSMISSION_TYPES[type]?.title || type}`, text: "Votre formulaire a été transmis sur Discord.", target: type });
    }
    if (!QUOTA_TYPES.includes(type) || !["senior", "officer"].includes(session.role)) return;
    setQuotas((current) => {
      const userCounts = current.counts?.[session.id] || {};
      return { ...current, counts: { ...current.counts, [session.id]: { ...userCounts, [type]: (userCounts[type] || 0) + 1 } } };
    });
  }
  function sergeantReportSuccess(message, sergeantId, values) {
    flash(message);
    recordSubmission("sergeant_report", values);
    const sergeant = users.find((user) => user.id === sergeantId);
    const assignment = sergeantAssignments.find((item) => item.sergeantId === sergeantId && item.observerId === session.id && item.status === "active");
    if (portalRemote && assignment) {
      portalRequest("POST", { action: "complete_sergeant_assignment", assignmentId: assignment.id })
        .then(applySharedPortalState)
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
    } else setSergeantAssignments((current) => current.map((item) => item.sergeantId === sergeantId && item.observerId === session.id && item.status === "active" ? { ...item, status: "completed", completedAt: new Date().toISOString() } : item));
    if (!portalRemote) {
      addLog("form", "Rapport nouveau Sous-Officier envoyé", sergeant ? `${sergeant.grade} ${sergeant.firstName} ${sergeant.lastName}` : "Sergent assigné");
      addPortalNotification({ recipients: [session.id], title: "Rapport nouveau Sous-Officier envoyé", text: "Votre rapport a été transmis sur Discord.", target: "sergeant_report" });
    }
  }
  function assignSergeant({ sergeantId, observerId, dueDate }) {
    if (!hasManagerAccess(session.role)) return;
    const sergeant = users.find((user) => user.id === sergeantId && user.role === "officer" && user.grade === "Sergent");
    const observer = users.find((user) => user.id === observerId && user.role === "senior");
    if (!sergeant || !observer || !dueDate) return flash("L’assignation est invalide.");
    if (portalRemote) {
      portalRequest("POST", { action: "assign_sergeant", sergeantId, observerId, dueDate })
        .then((state) => { applySharedPortalState(state); flash("Le Référent du nouveau Sergent a bien été enregistré."); })
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    const now = new Date().toISOString();
    setSergeantAssignments((current) => {
      const existing = current.find((assignment) => assignment.sergeantId === sergeantId);
      if (existing) return current.map((assignment) => assignment.id === existing.id ? { ...assignment, observerId, dueDate, status: "active", assignedAt: now, reminderAt: null, completedAt: null } : assignment);
      return [{ id: crypto.randomUUID(), sergeantId, observerId, dueDate, status: "active", assignedAt: now, reminderAt: null }, ...current];
    });
    addLog("assignment", "Sergent assigné à un SO Sup", `${sergeant.grade} ${sergeant.lastName} → ${observer.grade} ${observer.lastName} · échéance ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(new Date(`${dueDate}T12:00:00`))}`);
    flash("Le Référent du nouveau Sergent a bien été enregistré.");
  }
  function remindSergeantAssignment(assignmentId) {
    if (!hasManagerAccess(session.role)) return;
    const assignment = sergeantAssignments.find((item) => item.id === assignmentId && item.status === "active");
    if (!assignment) return;
    if (portalRemote) {
      portalRequest("POST", { action: "remind_sergeant_assignment", assignmentId })
        .then((state) => { applySharedPortalState(state); flash("Le rappel a bien été envoyé au SO Sup assigné."); })
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    const now = new Date().toISOString();
    setSergeantAssignments((current) => current.map((item) => item.id === assignmentId ? { ...item, reminderAt: now } : item));
    const sergeant = users.find((user) => user.id === assignment.sergeantId);
    const observer = users.find((user) => user.id === assignment.observerId);
    addLog("assignment", "Rappel de rapport envoyé", `${sergeant?.lastName || "Sergent"} → ${observer?.lastName || "SO Sup"}`);
    flash("Le rappel apparaîtra sur l’accueil du SO Sup assigné.");
  }
  function deleteSergeantAssignment(assignmentId) {
    if (!hasManagerAccess(session.role)) return;
    const assignment = sergeantAssignments.find((item) => item.id === assignmentId);
    if (!assignment || !confirm("Supprimer cette assignation ?")) return;
    if (portalRemote) {
      portalRequest("POST", { action: "delete_sergeant_assignment", assignmentId })
        .then((state) => { applySharedPortalState(state); flash("L’assignation a été supprimée."); })
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    setSergeantAssignments((current) => current.filter((item) => item.id !== assignmentId));
    addLog("assignment", "Assignation de Sergent supprimée");
    flash("L’assignation a été supprimée.");
  }
  function changeQuotaTarget(category, value) {
    const parsedTarget = Number.parseInt(value, 10);
    const target = Math.max(0, Math.min(100, Number.isNaN(parsedTarget) ? 0 : parsedTarget));
    if (portalRemote) {
      portalRequest("POST", { action: "quota_set_target", category, target })
        .then((state) => applySharedPortalState(state))
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    setQuotas((current) => ({ ...current, targets: { ...current.targets, [category]: target } }));
    addLog("quota", "Objectif de quota modifié", `${category} : ${target}`);
  }
  function resetQuotas() {
    if (!confirm("Réinitialiser tous les compteurs de quotas à zéro ?")) return;
    if (portalRemote) {
      portalRequest("POST", { action: "quota_reset" })
        .then((state) => { applySharedPortalState(state); flash("Les quotas ont été réinitialisés."); })
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    setQuotas((current) => ({ ...current, counts: {}, resetAt: new Date().toISOString() }));
    addLog("quota", "Compteurs de quotas réinitialisés");
    flash("Les quotas ont été réinitialisés.");
  }
  function toggleQuotaExemption(userId) {
    if (!hasManagerAccess(session.role)) return;
    const targetUser = users.find((user) => user.id === userId);
    const willExempt = !quotas.exemptions?.[userId];
    if (portalRemote) {
      portalRequest("POST", { action: "quota_toggle_exemption", userId, enabled: willExempt })
        .then((state) => { applySharedPortalState(state); flash(willExempt ? "La personne est exemptée de quota." : "L’exemption de quota a été retirée."); })
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    setQuotas((current) => {
      const isExempted = current.exemptions?.[userId] === true;
      return { ...current, exemptions: { ...current.exemptions, [userId]: !isExempted } };
    });
    addLog("quota", willExempt ? "Exemption de quota accordée" : "Exemption de quota retirée", targetUser ? `${targetUser.firstName} ${targetUser.lastName}` : "Compte inconnu");
    flash(quotas.exemptions?.[userId] ? "L’exemption de quota a été retirée." : "La personne est exemptée de quota.");
  }
  async function submitMission({ title, documentUrl }) {
    if (!["senior", "officer"].includes(session.role)) throw new Error("Vous ne pouvez pas déposer une mission.");
    const state = await portalRequest("POST", { action: "create_mission", mission: { title, documentUrl } });
    applySharedPortalState(state);
    flash("Le document a été déposé et placé en attente.");
  }
  function validateMission(missionId) {
    if (!hasManagerAccess(session.role)) return;
    const mission = missions.find((item) => item.id === missionId);
    if (!mission || mission.status !== "pending") return;
    if (portalRemote) {
      portalRequest("POST", { action: "validate_mission", missionId })
        .then((state) => { applySharedPortalState(state); flash("La mission interne est validée et ajoutée au quota."); })
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    setMissions((current) => current.map((item) => item.id === missionId ? { ...item, status: "validated", validatedBy: `${session.firstName} ${session.lastName}`, validatedAt: new Date().toISOString() } : item));
    setQuotas((current) => {
      const userCounts = current.counts?.[mission.userId] || {};
      return { ...current, counts: { ...current.counts, [mission.userId]: { ...userCounts, mission_internal: (userCounts.mission_internal || 0) + 1 } } };
    });
    addLog("mission", "Mission interne validée", `${mission.title} · ${mission.userName}`);
    flash("La mission interne est validée et ajoutée au quota.");
  }
  function rejectMission(missionId) {
    if (!hasManagerAccess(session.role)) return;
    const mission = missions.find((item) => item.id === missionId);
    if (!mission || mission.status !== "pending") return;
    if (portalRemote) {
      portalRequest("POST", { action: "reject_mission", missionId })
        .then((state) => { applySharedPortalState(state); flash("La mission interne a été refusée."); })
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    setMissions((current) => current.map((item) => item.id === missionId ? { ...item, status: "rejected", rejectedBy: `${session.firstName} ${session.lastName}`, rejectedAt: new Date().toISOString() } : item));
    addLog("mission", "Mission interne refusée", `${mission.title} · ${mission.userName}`);
    flash("La mission interne a été refusée.");
  }
  function deleteMission(missionId) {
    const mission = missions.find((item) => item.id === missionId);
    const canDelete = hasManagerAccess(session.role) || (mission?.userId === session.id && mission.status !== "validated");
    if (!mission || !canDelete) return;
    if (!confirm("Supprimer ce document de mission interne ?")) return;
    if (portalRemote) {
      portalRequest("POST", { action: "delete_mission", missionId })
        .then((state) => { applySharedPortalState(state); flash("Le document de mission interne a été supprimé."); })
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    setMissions((current) => current.filter((item) => item.id !== missionId));
    addLog("mission", "Mission interne supprimée", mission.title);
    flash("Le document de mission interne a été supprimé.");
  }
  function resetMissions() {
    if (!hasManagerAccess(session.role)) return;
    if (!confirm("Réinitialiser tous les documents de missions internes ? Les quotas déjà validés resteront inchangés.")) return;
    const removedCount = missions.length;
    if (portalRemote) {
      portalRequest("POST", { action: "reset_missions" })
        .then((state) => { applySharedPortalState(state); flash("Les documents de missions internes ont été réinitialisés."); })
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    setMissions([]);
    addLog("mission", "Documents de missions réinitialisés", `${removedCount} document${removedCount > 1 ? "s" : ""} supprimé${removedCount > 1 ? "s" : ""}`);
    flash("Les documents de missions internes ont été réinitialisés.");
  }
  function startChat(otherUserId) {
    const contact = users.find((user) => user.id === otherUserId && user.id !== session.id && user.approvalStatus === "approved" && !user.blocked);
    if (!contact) return "";
    const existingChat = chats.find((chat) => chat.participants.length === 2 && hasChatParticipant(chat, session.id) && hasChatParticipant(chat, otherUserId));
    if (existingChat) return existingChat.id;
    const chatId = crypto.randomUUID();
    setChats((current) => [{ id: chatId, type: "direct", participants: [session.id, otherUserId], messages: [], updatedAt: new Date().toISOString(), isDraft: true }, ...current]);
    return chatId;
  }
  function createChatGroup(name, memberIds) {
    const validMemberIds = [...new Set(memberIds)].filter((id) => users.some((user) => user.id === id && user.id !== session.id && user.approvalStatus === "approved" && !user.blocked));
    if (!name || validMemberIds.length < 2) return "";
    const chatId = crypto.randomUUID();
    setChats((current) => [{ id: chatId, type: "group", name, createdBy: session.id, participants: [session.id, ...validMemberIds], messages: [], updatedAt: new Date().toISOString(), isDraft: true }, ...current]);
    return chatId;
  }
  function updateChatGroup(chatId, memberIds) {
    const chat = chats.find((item) => item.id === chatId);
    if (!chat || chat.type !== "group" || chat.createdBy !== session.id) return false;
    const validMemberIds = [...new Set(memberIds)].filter((id) => users.some((user) => user.id === id && user.id !== session.id && user.approvalStatus === "approved" && !user.blocked));
    if (validMemberIds.length < 2) {
      flash("Un groupe doit conserver au moins trois membres, créateur inclus.");
      return false;
    }
    setChats((current) => current.map((item) => item.id === chatId ? { ...item, participants: [session.id, ...validMemberIds], updatedAt: new Date().toISOString() } : item));
    if (portalRemote && !chat.isDraft) syncSharedPortal("update_group", { chatId, memberIds: validMemberIds });
    addLog("chat", "Membres du groupe modifiés", `${chat.name || "Groupe"} · ${validMemberIds.length + 1} membres`);
    flash("Les membres du groupe ont bien été mis à jour.");
    return true;
  }
  function sendChatMessage(chatId, html, text, attachments = []) {
    const chat = chats.find((item) => item.id === chatId && hasChatParticipant(item, session.id));
    if (!chat) return;
    setChats((current) => {
      const currentChat = current.find((item) => item.id === chatId && hasChatParticipant(item, session.id));
      if (!currentChat) return current;
      const message = { id: crypto.randomUUID(), senderId: session.id, senderName: `${session.firstName} ${session.lastName}`, html: sanitizeChatHtml(html), text, attachments, sentAt: new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date()) };
      const updatedChat = { ...currentChat, messages: [...currentChat.messages, message], updatedAt: new Date().toISOString() };
      return [updatedChat, ...current.filter((item) => item.id !== chatId)];
    });
    addLog("chat", "Message envoyé", `${attachments.length ? `${attachments.length} pièce${attachments.length > 1 ? "s" : ""} jointe${attachments.length > 1 ? "s" : ""}` : "Sans pièce jointe"}`);
    if (portalRemote) {
      const draft = chat.isDraft ? { type: chat.type, name: chat.name || "", memberIds: chat.participants.filter((id) => id !== session.id) } : undefined;
      syncSharedPortal("send_message", { chatId, html, text, attachments, draft });
    }
    else addPortalNotification({ recipients: chat.participants.filter((id) => id !== session.id), kind: "message", title: `Nouveau message de ${session.firstName} ${session.lastName}`, text: chat.type === "group" ? `Dans le groupe « ${chat.name || "Sans nom"} »` : "Dans une discussion privée.", target: "chat" });
  }
  function editChatMessage(chatId, messageId, html, text) {
    setChats((current) => current.map((chat) => chat.id !== chatId ? chat : { ...chat, messages: chat.messages.map((message) => message.id === messageId && message.senderId === session.id ? { ...message, html: sanitizeChatHtml(html), text, editedAt: new Date().toISOString() } : message), updatedAt: new Date().toISOString() }));
    if (portalRemote) syncSharedPortal("edit_message", { chatId, messageId, html, text });
    addLog("chat", "Message modifié");
  }
  function deleteChatMessage(chatId, messageId) {
    const chat = chats.find((item) => item.id === chatId);
    const message = chat?.messages.find((item) => item.id === messageId);
    const canModerate = hasManagerAccess(session.role);
    if (!message || (message.senderId !== session.id && !canModerate) || !confirm("Supprimer ce message ?")) return;
    setChats((current) => current.map((item) => item.id === chatId ? { ...item, messages: item.messages.filter((entry) => entry.id !== messageId), updatedAt: new Date().toISOString() } : item));
    if (portalRemote) syncSharedPortal("delete_message", { chatId, messageId });
    addLog("chat", canModerate && message.senderId !== session.id ? "Message supprimé par modération" : "Message supprimé", `Auteur : ${message.senderName}`);
  }
  function deleteChat(chatId) {
    const chat = chats.find((item) => item.id === chatId);
    const canModerate = hasManagerAccess(session.role);
    const canDelete = chat?.type === "group" ? chat.createdBy === session.id || canModerate : hasChatParticipant(chat, session.id) || canModerate;
    if (!chat || !canDelete || !confirm("Supprimer définitivement cette conversation et tous ses messages ?")) return;
    setChats((current) => current.filter((item) => item.id !== chatId));
    if (portalRemote && !chat.isDraft) syncSharedPortal("delete_chat", { chatId });
    addLog("chat", "Conversation supprimée", `${chat.type === "group" ? chat.name || "Groupe" : "Discussion privée"} · ${chat.messages.length} messages`);
    flash("La conversation a été supprimée.");
  }
  function toggleGroup(group) { setOpenGroups((current) => ({ ...current, [group]: !current[group] })); }
  async function logout() {
    addLog("auth", "Déconnexion du portail");
    try { await accountRequest("/api/auth/logout", "POST", {}); } catch { /* La fermeture locale reste possible. */ }
    setProfileOpen(false);
    setLoginError("");
    setLoginTransition(null);
    setSession(null);
  }
  async function saveUser(form) {
    try {
      const result = await accountRequest("/api/auth/users", "PATCH", { ...form, id: modal.id });
      setUsers(Array.isArray(result.users) ? result.users : []);
      if (result.session) setSession(result.session);
      addLog("account", form.approvalStatus === "approved" ? "Demande Discord validée" : form.approvalStatus === "rejected" ? "Demande Discord refusée" : "Compte modifié", `${form.firstName} ${form.lastName}`);
      flash(form.approvalStatus === "approved" ? "Le compte Discord est maintenant autorisé." : form.approvalStatus === "rejected" ? "La demande Discord a été refusée." : "Le compte a bien été modifié.");
      setModal(null);
    } catch (error) { flash(error instanceof Error ? error.message : "La modification du compte a échoué."); }
  }
  async function removeUser(user) {
    if (!manageable(user) || !confirm(`Supprimer le compte de ${user.firstName} ${user.lastName} ?`)) return;
    try {
      const result = await accountRequest("/api/auth/users", "DELETE", { id: user.id });
      setUsers(Array.isArray(result.users) ? result.users : []);
      setSergeantAssignments((current) => current.filter((assignment) => assignment.sergeantId !== user.id && assignment.observerId !== user.id));
      addLog("account", "Compte supprimé", `${user.firstName} ${user.lastName}`); flash("Le compte a été supprimé.");
    } catch (error) { flash(error instanceof Error ? error.message : "La suppression du compte a échoué."); }
  }
  async function changePresence(userId, presence) {
    const targetUser = users.find((user) => user.id === userId);
    if (!targetUser) return;
    try {
      const result = await accountRequest("/api/auth/users", "PATCH", { ...targetUser, id: userId, presence });
      setUsers(Array.isArray(result.users) ? result.users : []);
      if (presence === "absent") {
        try { applySharedPortalState(await portalRequest("POST", { action: "sync_so_meeting_presence", userId })); }
        catch { /* La présence reste enregistrée même si la réunion se synchronise au prochain passage. */ }
      }
      addLog("presence", "Présence modifiée", `${targetUser.firstName} ${targetUser.lastName} · ${presence === "present" ? "Présent" : "Absent"}`);
      flash(presence === "present" ? "La personne est indiquée présente." : "La personne est indiquée absente.");
    } catch (error) { flash(error instanceof Error ? error.message : "La présence n’a pas pu être modifiée."); }
  }
  async function toggleAccountBlock(user) {
    if (!hasManagerAccess(session.role) || user.id === session.id || user.role === "admin" || (session.role === "management" && user.role === "management")) return;
    const willBlock = !user.blocked;
    try {
      const result = await accountRequest("/api/auth/users", "PATCH", { ...user, id: user.id, blocked: willBlock });
      setUsers(Array.isArray(result.users) ? result.users : []);
      addLog("account", willBlock ? "Compte bloqué" : "Compte débloqué", `${user.firstName} ${user.lastName}`);
      flash(willBlock ? "Le compte a été bloqué et ses sessions sont fermées." : "Le compte a été débloqué.");
    } catch (error) { flash(error instanceof Error ? error.message : "Le blocage du compte a échoué."); }
  }
  async function syncDiscordAvatars() {
    if (!hasManagerAccess(session?.role) || avatarSyncing) return;
    setAvatarSyncing(true);
    try {
      const result = await accountRequest("/api/auth/discord/sync-avatars", "POST", {});
      const refreshedUsers = Array.isArray(result.users) ? result.users : [];
      setUsers(refreshedUsers);
      setSession(result.session || refreshedUsers.find((user) => user.id === session.id) || session);
      addLog("profile", "Photos Discord synchronisées", `${result.updated || 0} profil${result.updated > 1 ? "s" : ""} actualisé${result.updated > 1 ? "s" : ""}`);
      const details = [`${result.updated || 0} photo${result.updated > 1 ? "s" : ""} actualisée${result.updated > 1 ? "s" : ""}`];
      if (result.reconnectRequired) details.push(`${result.reconnectRequired} reconnexion${result.reconnectRequired > 1 ? "s" : ""} nécessaire${result.reconnectRequired > 1 ? "s" : ""}`);
      if (result.unavailable) details.push(`${result.unavailable} indisponible${result.unavailable > 1 ? "s" : ""}`);
      flash(`Synchronisation terminée : ${details.join(" · ")}.`);
    } catch (error) { flash(error instanceof Error ? error.message : "La synchronisation des photos a échoué."); }
    finally { setAvatarSyncing(false); }
  }
  async function saveProfile(form) {
    if (!String(form.firstName || "").trim()) {
      flash("Le prénom est obligatoire.");
      return;
    }
    try {
      const result = await accountRequest("/api/auth/users", "PATCH", {
        ...session,
        ...form,
        id: session.id,
        grade: hasAdminAccess(session.role) && GRADES.includes(form.grade) ? form.grade : session.grade,
      });
      setUsers(Array.isArray(result.users) ? result.users : []);
      setSession(result.session || session);
      setProfileOpen(false);
      addLog("profile", "Profil personnel modifié", `${form.firstName} ${form.lastName}`);
      flash("Votre profil a bien été mis à jour.");
    } catch (error) { flash(error instanceof Error ? error.message : "Votre profil n’a pas pu être modifié."); }
  }
  async function saveRequiredIdentity(form) {
    const steamId64 = String(form.steamId64 || "").replace(/\D/g, "");
    const discordContactId = String(form.discordContactId || "").replace(/\D/g, "");
    if (!/^\d{17}$/.test(steamId64)) throw new Error("Le Steam ID 64 doit contenir exactement 17 chiffres.");
    if (!/^\d{17,20}$/.test(discordContactId)) throw new Error("L’identifiant Discord doit contenir entre 17 et 20 chiffres.");
    const result = await accountRequest("/api/auth/users", "PATCH", { ...session, ...form, id: session.id, steamId64, discordContactId });
    const refreshedUsers = Array.isArray(result.users) ? result.users : [];
    const refreshedSession = result.session || refreshedUsers.find((user) => user.id === session.id) || session;
    setUsers(refreshedUsers);
    setSession(refreshedSession);
    addLog("profile", "Identifiants de profil renseignés", `${session.firstName} ${session.lastName}`);
    flash("Votre profil est complet. Bienvenue sur le portail.");
  }

  if (!ready) return null;
  if (!session) return <Login configurationError={configurationError} error={loginError} />;
  const requiresIdentitySetup = !loginTransition && (!/^\d{17}$/.test(String(session.steamId64 || "")) || !/^\d{17,20}$/.test(String(session.discordContactId || "")));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row"><div className="brand-mark"><ShieldCheck size={23} /></div><div><strong>Portail SO</strong><small>Espace sécurisé</small></div></div>
        <nav>
          <button className={`menu-item standalone-nav ${activeSection === "home" ? "active" : ""}`} onClick={() => setActiveSection("home")}><Home size={18} /> Accueil</button>
        {PORTAL_MENU_GROUPS.map((group) => {
          const GroupIcon = group.icon;
          const sections = PORTAL_SECTION_REGISTRY.filter((item) => item.group === group.id && hasSectionAccess(session.role, item.access));
          if (!hasSectionAccess(session.role, group.access) || !sections.length) return null;
          return <MenuGroup key={group.id} title={group.label} icon={GroupIcon} open={openGroups[group.id]} onToggle={() => toggleGroup(group.id)}>{sections.map((item) => {
            const SectionIcon = item.icon;
            return <button key={item.id} className={`menu-item ${activeSection === item.id ? "active" : ""}`} onClick={() => setActiveSection(item.id)}><SectionIcon size={17} /> {item.label}</button>;
          })}</MenuGroup>;
        })}
        {PORTAL_SECTION_REGISTRY.filter((item) => item.group === "logs" && hasSectionAccess(session.role, item.access)).map((item) => {
          const SectionIcon = item.icon;
          return <button key={item.id} className={`menu-item standalone-nav logs-nav ${activeSection === item.id ? "active" : ""}`} onClick={() => setActiveSection(item.id)}><SectionIcon size={18} /> {item.label}</button>;
        })}
        </nav>
        <button className="profile-card" onClick={() => setProfileOpen(true)} title="Profil et paramètres"><Avatar user={session} /><div><strong>{session.firstName} {session.lastName}</strong><small>{session.grade || GRADES[0]} · {ROLES[session.role].label}</small></div><ChevronDown size={16} /></button>
        <div className="sidebar-actions">
          <button className="logout" onClick={logout}><LogOut size={18} /><span>Se déconnecter</span></button>
          <ThemePicker themeId={themeId} onChange={setThemeId} />
        </div>
      </aside>

      <main className="content">
        <div className="mobile-section-nav"><label>Rubrique</label><select value={activeSection} onChange={(event) => setActiveSection(event.target.value)}><optgroup label="Menu"><option value="home">Accueil</option></optgroup>{PORTAL_MENU_GROUPS.map((group) => {
          const sections = PORTAL_SECTION_REGISTRY.filter((item) => item.group === group.id && hasSectionAccess(session.role, item.access));
          return hasSectionAccess(session.role, group.access) && sections.length ? <optgroup label={group.label} key={group.id}>{sections.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</optgroup> : null;
        })}{PORTAL_SECTION_REGISTRY.filter((item) => item.group === "logs" && hasSectionAccess(session.role, item.access)).length > 0 && <optgroup label="Journal">{PORTAL_SECTION_REGISTRY.filter((item) => item.group === "logs" && hasSectionAccess(session.role, item.access)).map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</optgroup>}</select></div>
        {activeSection === "home" ? <header><div><p className="eyebrow dark">MENU PRINCIPAL</p><h1>Accueil</h1><p className="muted">Retrouvez vos informations importantes et vos raccourcis.</p></div><span className="all-access"><Bell size={16} /> Centre d’informations</span></header> : activeSection === "summary" ? <header><div><p className="eyebrow dark">ESPACE PARTAGÉ</p><h1>Résumé</h1><p className="muted">Analysez les recommandations, observations et l’activité de l’équipe.</p></div><span className="all-access"><BarChart3 size={16} /> Statistiques en temps réel</span></header> : activeSection === "management_report" ? <header><div><p className="eyebrow dark">ESPACE PARTAGÉ</p><h1>Rapport de gérance</h1><p className="muted">Auto-évaluez vos gérances et consultez les avis des responsables.</p></div><span className={hasManagerAccess(session.role) ? "referent-access" : "all-access"}><FileText size={16} /> {hasManagerAccess(session.role) ? "Suivi responsable" : "Auto-évaluation"}</span></header> : activeSection === "workforce" ? <header><div><p className="eyebrow dark">RÉFÉRENT SO</p><h1>Effectif</h1><p className="muted">Consultez l’organisation complète des membres par accès et par grade.</p></div><span className="referent-access"><UsersRound size={16} /> Vue des effectifs</span></header> : activeSection === "specializations" ? <header><div><p className="eyebrow dark">RÉFÉRENT SO</p><h1>Spécialisations</h1><p className="muted">Consultez les spécialités, Steam ID et Discord ID de l’effectif.</p></div><span className="referent-access"><BadgeCheck size={16} /> Gestion Référent SO</span></header> : activeSection === "sergeant_assignments" ? <header><div><p className="eyebrow dark">SOUS-OFFICIER SUPÉRIEUR</p><h1>Référent</h1><p className="muted">Attribuez et suivez les référents des nouveaux Sergents.</p></div><span className="senior-access"><BadgeCheck size={16} /> Suivi des semaines de test</span></header> : activeSection === "logs" ? <header><div><p className="eyebrow dark">SUIVI DU PORTAIL</p><h1>Logs</h1><p className="muted">Consultez les actions importantes réalisées sur le portail.</p></div><span className="referent-access"><ScrollText size={16} /> Admin & Référent SO</span></header> : activeSection === "dashboard" ? <header><div><p className="eyebrow dark">PORTAIL DE GESTION</p><h1>{getTimeGreeting()}, {session.grade || GRADES[0]} {session.lastName}</h1><p className="muted">Validez les demandes Discord et gardez une vue claire sur votre équipe.</p></div><span className="all-access"><MessageSquareText size={16} /> Connexion Discord</span></header> : activeSection === "presence" ? <header><div><p className="eyebrow dark">RÉFÉRENT SO</p><h1>Présences</h1><p className="muted">Suivez la présence des Sous-Officiers de votre équipe.</p></div><span className="referent-access"><ShieldCheck size={16} /> Gestion Référent SO</span></header> : activeSection === "quotas" ? <header><div><p className="eyebrow dark">RÉFÉRENT SO</p><h1>Quotas</h1><p className="muted">Suivez le volume de transmissions réalisé par chaque Sous-Officier.</p></div><span className="referent-access"><Gauge size={16} /> Gestion Référent SO</span></header> : activeSection === "mission_internal" ? <header><div><p className="eyebrow dark">ESPACE PARTAGÉ</p><h1>Mission interne</h1><p className="muted">Déposez et validez les Google Docs des missions internes.</p></div><span className="all-access"><FileText size={16} /> Dépôt et validation</span></header> : activeSection === "chat" ? <header><div><p className="eyebrow dark">CHAT INTERNE</p><h1>Messagerie</h1><p className="muted">Échangez avec un membre du portail ou contactez un Référent SO.</p></div><span className="all-access"><MessageSquareText size={16} /> Accessible à tous les comptes</span></header> : activeSection === "observation_so" ? <header><div><p className="eyebrow dark">SOUS-OFFICIER SUPÉRIEUR</p><h1>{TRANSMISSION_TYPES[activeSection].title}</h1><p className="muted">{TRANSMISSION_TYPES[activeSection].description}</p></div><span className="senior-access"><BadgeCheck size={16} /> Accès Sous-Officiers Supérieurs</span></header> : activeSection === "sergeant_report" ? <header><div><p className="eyebrow dark">SOUS-OFFICIER SUPÉRIEUR</p><h1>Rapport nouveau Sous-Officier</h1><p className="muted">Évaluez et concluez la semaine de test d’un nouveau Sergent.</p></div><span className="senior-access"><BadgeCheck size={16} /> Accès Sous-Officiers Supérieurs</span></header> : <header><div><p className="eyebrow dark">ESPACE PARTAGÉ</p><h1>{TRANSMISSION_TYPES[activeSection].title}</h1><p className="muted">{TRANSMISSION_TYPES[activeSection].description}</p></div><span className="all-access"><UsersRound size={16} /> Accessible à tous les rôles</span></header>}

        {activeSection === "home" ? <HomePanel session={session} users={users} missions={missions} chats={chats} quotas={quotas} logs={auditLogs} assignments={sergeantAssignments} portalNotifications={portalNotifications} announcements={announcements} shortcutIds={shortcutPreferences[session.id]} onSaveShortcuts={saveHomeShortcuts} onNavigate={navigateFromHome} onDismissNotification={dismissPortalNotification} onClearNotifications={clearPortalNotifications} onCreateAnnouncement={createAnnouncement} onUpdateAnnouncement={updateAnnouncement} onDeleteAnnouncement={deleteAnnouncement} onAcknowledgeAnnouncement={acknowledgeAnnouncement} /> : activeSection === "summary" ? <SummaryPanel session={session} users={users} submissions={submissionHistory} activityResetAt={summarySettings.activityResetAt} rankingResetAt={summarySettings.rankingResetAt} quotaResetAt={quotas.resetAt} onResetActivity={resetActivitySummary} onResetRanking={resetActivityRanking} /> : activeSection === "management_report" ? <ManagementReportPanel session={session} users={users} reports={managementReports} assignments={sergeantAssignments} settings={managementReportSettings} onSubmit={submitManagementReport} onComment={commentManagementReport} onUpdateComment={updateManagementComment} onDeleteComment={deleteManagementComment} onDeleteReport={deleteManagementReport} onResetRanking={resetManagementRanking} /> : activeSection === "workforce" ? <WorkforcePanel users={users} quotas={quotas} /> : activeSection === "sergeant_assignments" ? <SergeantAssignmentPanel users={users} session={session} assignments={sergeantAssignments} onAssign={assignSergeant} onReminder={remindSergeantAssignment} onDelete={deleteSergeantAssignment} /> : activeSection === "logs" ? <LogsPanel session={session} logs={auditLogs} onClear={clearAuditLogs} /> : activeSection === "dashboard" ? <>
        <section className="stats">
          <article><span className="stat-icon blue"><UsersRound /></span><div><strong>{users.length}</strong><small>Comptes au total</small></div><span className="trend">Tous niveaux</span></article>
          <article><span className="stat-icon gold"><UserRound /></span><div><strong>{users.filter((user) => user.approvalStatus === "pending").length}</strong><small>Demandes en attente</small></div><span className="trend">À valider</span></article>
          <article><span className="stat-icon violet"><ShieldCheck /></span><div><strong>{users.filter((u) => hasManagerAccess(u.role)).length}</strong><small>Gestionnaires</small></div><span className="trend">Admin, Gérance & Référent</span></article>
        </section>

        <section className="accounts-card">
          <div className="card-head"><div><h2>Comptes utilisateurs</h2><p className="muted">{visibleUsers.length} compte{visibleUsers.length > 1 ? "s" : ""} affiché{visibleUsers.length > 1 ? "s" : ""}</p></div><div className="filters"><button className="secondary avatar-sync" type="button" onClick={syncDiscordAvatars} disabled={avatarSyncing}><RotateCcw size={15} /> {avatarSyncing ? "Synchronisation…" : "Rafraîchir les photos"}</button><div className="search"><Search size={17} /><input placeholder="Rechercher un compte…" value={query} onChange={(e) => setQuery(e.target.value)} /></div><select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option value="all">Tous les niveaux</option>{Object.entries(ROLES).map(([key, role]) => <option value={key} key={key}>{role.label}</option>)}</select></div></div>
          <div className="table-wrap"><table><thead><tr><th>Utilisateur</th><th>Grade</th><th>Niveau d’accès</th><th>État du compte</th><th>Création</th><th></th></tr></thead><tbody>{visibleUsers.map((user) => <tr key={user.id}><td><div className="user-cell"><Avatar user={user} size="small" /><div><strong>{user.firstName} {user.lastName}</strong><small>{user.discordUsername ? `Discord : ${user.discordUsername}` : "Compte Discord lié"}</small></div></div></td><td><span className="grade-badge">{user.grade || GRADES[0]}</span></td><td>{user.approvalStatus === "pending" ? <span className="locked">À attribuer</span> : <RoleBadge role={user.role} />}</td><td>{user.approvalStatus === "pending" ? <button className="account-state pending" type="button" onClick={() => hasManagerAccess(session.role) && setModal(user)}><UserRound size={15} /> En attente</button> : user.approvalStatus === "rejected" ? <span className="account-state blocked"><UserX size={15} /> Refusé</span> : user.role === "admin" ? <span className="account-state active"><UserCheck size={15} /> Compte actif</span> : <button className={`account-state ${user.blocked ? "blocked" : "active"}`} type="button" onClick={() => toggleAccountBlock(user)}>{user.blocked ? <UserX size={15} /> : <UserCheck size={15} />}{user.blocked ? "Compte bloqué" : "Compte actif"}</button>}</td><td>{user.createdAt}</td><td><div className="row-actions">{canManage && manageable(user) ? <><button className="icon-button" title={user.approvalStatus === "pending" ? "Examiner la demande" : "Modifier"} onClick={() => setModal(user)}>{user.approvalStatus === "pending" ? <BadgeCheck size={17} /> : <Pencil size={17} />}</button><button className="icon-button danger" title="Supprimer" onClick={() => removeUser(user)}><Trash2 size={17} /></button></> : <span className="locked">Protégé</span>}</div></td></tr>)}</tbody></table></div>
        </section>
        </> : activeSection === "presence" ? <PresencePanel users={users} onChange={changePresence} /> : activeSection === "quotas" ? <QuotaPanel users={users} quotas={quotas} onTargetChange={changeQuotaTarget} onReset={resetQuotas} onToggleExemption={toggleQuotaExemption} /> : activeSection === "mission_internal" ? <MissionInternalPanel session={session} missions={missions} onSubmit={submitMission} onValidate={validateMission} onReject={rejectMission} onDelete={deleteMission} onReset={resetMissions} /> : activeSection === "chat" ? <ChatPanel session={session} users={users} chats={chats} onStart={startChat} onCreateGroup={createChatGroup} onUpdateGroup={updateChatGroup} onSend={sendChatMessage} onEditMessage={editChatMessage} onDeleteMessage={deleteChatMessage} onDeleteChat={deleteChat} /> : activeSection === "sergeant_report" ? <SergeantReportPanel users={users} session={session} assignments={sergeantAssignments} onSuccess={sergeantReportSuccess} history={submissionHistory.filter((entry) => entry.type === "sergeant_report")} canManageHistory={canManage} onResetHistory={resetSubmissionHistory} onEditHistory={updateSubmissionHistory} onDeleteHistory={deleteSubmissionHistory} /> : <TransmissionPanel key={activeSection} session={session} onSuccess={transmissionSuccess} type={activeSection} history={submissionHistory.filter((entry) => entry.type === activeSection)} canManageHistory={canManage} onResetHistory={resetSubmissionHistory} onEditHistory={updateSubmissionHistory} onDeleteHistory={deleteSubmissionHistory} />}
      </main>
      {notice && <div className="toast"><BadgeCheck size={19} />{notice}</div>}
      {modal && <UserModal actor={session} editing={modal.id ? modal : null} onClose={() => setModal(null)} onSave={saveUser} />}
      {profileOpen && <ProfileModal user={session} onClose={() => setProfileOpen(false)} onSave={saveProfile} soundEnabled={soundEnabled} onSoundEnabledChange={setSoundEnabled} />}
      {requiresIdentitySetup && <InitialIdentityModal user={session} onSave={saveRequiredIdentity} />}
      {loginTransition && <LoginTransition user={loginTransition} />}
    </div>
  );
}

export default App;
