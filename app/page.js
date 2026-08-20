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
const CHAT_KEY = "portail-so-chats-v1";
const LOG_KEY = "portail-so-logs-v1";
const SHORTCUTS_KEY = "portail-so-shortcuts-v1";
const SUMMARY_KEY = "portail-so-summary-v1";
const ASSIGNMENTS_KEY = "portail-so-sergeant-assignments-v1";
const DRAFTS_KEY = "portail-so-form-drafts-v1";
const SUBMISSION_HISTORY_KEY = "portail-so-submission-history-v1";
const NOTIFICATION_KEY = "portail-so-notifications-v1";
const CHAT_ATTACHMENT_MAX_SIZE = 1024 * 1024;
const CHAT_ATTACHMENT_MAX_COUNT = 3;
const CHAT_ATTACHMENT_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/plain",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const DEFAULT_QUOTAS = { targets: { recommendation: 1, pcs_exp: 1, observations: 1, mission_internal: 0 }, counts: {}, exemptions: {} };
const QUOTA_TYPES = ["recommendation", "pcs_exp", "observation_hdr", "observation_so"];
const LOG_CATEGORY_LABELS = { auth: "Connexion", account: "Comptes", presence: "Présences", quota: "Quotas", form: "Formulaires", mission: "Missions", chat: "Chat", assignment: "Référents", profile: "Profils", summary: "Résumé", system: "Système" };
const REPORT_CONCLUSIONS = [
  "Passage confirmé en sergent",
  "Prolongation de la semaine de test",
  "Retour caporal-chef",
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
  protocol: {
    title: "Mise en protocole",
    description: "Réservé à l’Administrateur. Enregistrer un protocole appliqué, sans incidence sur les quotas ni les statistiques.",
    icon: ClipboardCheck,
    tone: "violet",
  },
};

const THEME_OPTIONS = [
  { id: "clair", label: "Aurore", mode: "light", accent: "#0b9078", deep: "#08625b", surface: "#e7f7f2", sidebarA: "#083c40", sidebarB: "#0b766d" },
  { id: "sable", label: "Sable", mode: "light", accent: "#be6b2f", deep: "#7e3d14", surface: "#fff6e8", sidebarA: "#372317", sidebarB: "#72512a" },
  { id: "rose", label: "Sakura", mode: "light", accent: "#ca4f7c", deep: "#88334f", surface: "#fff1f6", sidebarA: "#3b1b3f", sidebarB: "#742a5d" },
  { id: "ocean", label: "Nord", mode: "light", accent: "#2475c9", deep: "#174c8a", surface: "#edf7ff", sidebarA: "#0b2d53", sidebarB: "#0b5c8e" },
  { id: "nuit", label: "Nuit", mode: "dark", accent: "#4d82e5", deep: "#284f9c", surface: "#081421", sidebarA: "#0b1a30", sidebarB: "#0d223e" },
  { id: "foret", label: "Forêt", mode: "dark", accent: "#48ba78", deep: "#237247", surface: "#071c15", sidebarA: "#0a261b", sidebarB: "#174b32" },
  { id: "cyberpunk", label: "Cyberpunk", mode: "dark", accent: "#ff45c7", deep: "#a4198c", surface: "#160b22", sidebarA: "#210b31", sidebarB: "#5c1257" },
  { id: "dracula", label: "Dracula", mode: "dark", accent: "#bd93f9", deep: "#7b5cb3", surface: "#282a36", sidebarA: "#1d1e28", sidebarB: "#4a3b68" },
  { id: "volcan", label: "Volcan", mode: "dark", accent: "#ef6a40", deep: "#a83620", surface: "#24120e", sidebarA: "#301411", sidebarB: "#712318" },
  { id: "monochrome", label: "Monochrome", mode: "dark", accent: "#e7e9ef", deep: "#858b99", surface: "#111214", sidebarA: "#17181c", sidebarB: "#383a43" },
];

function themeById(id) {
  return THEME_OPTIONS.find((theme) => theme.id === id) || THEME_OPTIONS.find((theme) => theme.id === "nuit") || THEME_OPTIONS[0];
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
          <h2>Continuez avec Discord</h2>
          <p className="muted">Connectez-vous avec votre compte Discord pour accéder au portail.</p>
          <div className="discord-login-panel">
            <a className={`primary wide discord-login ${configurationError ? "disabled" : ""}`} href={configurationError ? undefined : "/api/auth/discord"} aria-disabled={Boolean(configurationError)}><MessageSquareText size={20} /> Continuer avec Discord <span>→</span></a>
            <p className="discord-login-note">Lors de votre première connexion, votre demande devra être validée par un administrateur.</p>
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
          <label>Grade</label>{hasAdminAccess(user.role) ? <select value={form.grade || GRADES[0]} onChange={(event) => set("grade", event.target.value)} required>{GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}</select> : <div className="readonly-grade"><span>{user.grade || GRADES[0]}</span><small>Le grade est géré par un Admin ou une Gérance.</small></div>}
          <label>Niveau d’accès</label><div className="readonly-role"><RoleBadge role={user.role} /><span>Ce niveau est géré par un responsable.</span></div>
          <section className="profile-preferences"><p className="eyebrow dark">PARAMÈTRES</p><label className="preference-toggle"><span className="preference-icon">{soundEnabled ? <Volume2 size={19} /> : <VolumeX size={19} />}</span><span><strong>Sons de l’interface</strong><small>{soundEnabled ? "Des sons discrets sont joués lors des clics." : "Les sons sont désactivés sur cet appareil."}</small></span><input type="checkbox" checked={soundEnabled} onChange={(event) => onSoundEnabledChange(event.target.checked)} aria-label="Activer les sons de l’interface" /><i aria-hidden="true"><span /></i></label></section>
          <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Annuler</button><button type="submit" className="primary" disabled={saving}>{saving ? "Sécurisation…" : "Enregistrer mon profil"}</button></div>
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
      <div className="workforce-groups">{groups.map((group) => <section className={`workforce-group ${ROLES[group.role].tone}`} key={group.role}><header><div><RoleBadge role={group.role} /><span>{roleDescriptions[group.role]}</span></div><strong>{group.users.length}</strong></header><div className="workforce-list">{group.users.map((user) => { const quota = quotaState(user); const concerned = ["senior", "officer"].includes(user.role); return <article key={user.id}><Avatar user={user} /><div className="workforce-name"><strong>{user.grade || GRADES[0]} {user.firstName} {user.lastName}</strong><small>{ROLES[user.role].label}</small></div><span className={`workforce-presence ${concerned ? user.presence === "absent" ? "absent" : "present" : "neutral"}`}>{user.blocked ? "Compte bloqué" : concerned ? user.presence === "absent" ? "Absent" : "Présent" : "Actif"}</span><span className={`workforce-quota ${quota.tone}`}><Gauge size={14} /> {quota.label}</span></article>; })}{!group.users.length && <p className="workforce-empty">Aucun membre dans cette catégorie.</p>}</div></section>)}</div>
    </div>
  );
}

function HomePanel({ session, users, missions, chats, quotas, logs, assignments, portalNotifications, shortcutIds, onSaveShortcuts, onNavigate, onDismissNotification }) {
  const isManager = hasManagerAccess(session.role);
  const isQuotaMember = ["senior", "officer"].includes(session.role);
  const shortcutCatalog = [
    { id: "summary", label: "Résumé", description: "Consulter les statistiques", icon: <BarChart3 size={18} />, allowed: true },
    { id: "chat", label: "Messagerie", description: "Ouvrir une discussion", icon: <MessageSquareText size={18} />, allowed: true },
    { id: "mission_internal", label: "Mission interne", description: "Déposer ou contrôler un document", icon: <FileText size={18} />, allowed: true },
    { id: "recommendation", label: "Recommandation", description: "Envoyer une recommandation", icon: <Medal size={18} />, allowed: true },
    { id: "pcs_exp", label: "Reco PCS EXP", description: "Ouvrir le formulaire PCS EXP", icon: <ClipboardCheck size={18} />, allowed: true },
    { id: "observation_hdr", label: "Observation HDR", description: "Consigner une observation HDR", icon: <ClipboardCheck size={18} />, allowed: true },
    { id: "observation_so", label: "Observation SO", description: "Consigner une observation SO", icon: <MessageSquareText size={18} />, allowed: hasSeniorAccess(session.role) },
    { id: "sergeant_assignments", label: "Mes référents", description: "Consulter les Sergents assignés", icon: <UsersRound size={18} />, allowed: hasSeniorAccess(session.role) },
    { id: "sergeant_report", label: "Rapport nouveau SO", description: "Évaluer un nouveau Sergent", icon: <FileText size={18} />, allowed: hasSeniorAccess(session.role) },
    { id: "dashboard", label: "Gestion des comptes", description: "Administrer les accès", icon: <ShieldCheck size={18} />, allowed: hasAdminAccess(session.role) },
    { id: "presence", label: "Présences", description: "Mettre l’équipe à jour", icon: <UserCheck size={18} />, allowed: isManager },
    { id: "workforce", label: "Effectif", description: "Voir l’organisation de l’équipe", icon: <UsersRound size={18} />, allowed: isManager },
    { id: "quotas", label: "Gestion des quotas", description: "Consulter les objectifs de l’équipe", icon: <Gauge size={18} />, allowed: isManager },
  ].filter((item) => item.allowed);
  const defaultShortcutIds = ["summary", "chat", "mission_internal", session.role === "senior" ? "observation_so" : "observation_hdr"];
  const selectedShortcutIds = (shortcutIds?.length ? shortcutIds : defaultShortcutIds).filter((id) => shortcutCatalog.some((item) => item.id === id));
  const [editingShortcuts, setEditingShortcuts] = useState(false);
  const [shortcutDraft, setShortcutDraft] = useState(selectedShortcutIds);
  useEffect(() => setShortcutDraft(selectedShortcutIds), [shortcutIds, session.role]);
  const team = users.filter((user) => user.approvalStatus === "approved" && ["senior", "officer"].includes(user.role));
  const activeAccounts = users.filter((user) => user.approvalStatus === "approved" && !user.blocked).length;
  const myChats = chats.filter((chat) => chat.participants.includes(session.id));
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
  const notifications = portalNotifications
    .filter((notification) => !Array.isArray(notification.recipients) || notification.recipients.includes(session.id))
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
      {isQuotaMember && <section className="home-card home-quota-card"><div className="home-card-head"><div><p className="eyebrow dark">MES OBJECTIFS</p><h2>Mes quotas</h2></div><span className={isAbsent ? "quota-status-absent" : isExempted ? "quota-status-exempt" : ""}><Gauge size={17} /> {isAbsent ? "Absent" : isExempted ? "Exempté" : `${completedQuotaCategories}/4 terminés`}</span></div><div className="home-quota-grid">{quotaItems.map((item) => {
        const target = targets[item.key] || 0;
        const count = categoryCounts[item.key] || 0;
        const remaining = Math.max(target - count, 0);
        const progress = target === 0 ? 100 : Math.min((count / target) * 100, 100);
        const status = isAbsent ? "Absent" : isExempted ? "Exempté" : target === 0 ? "Aucun quota demandé" : remaining > 0 ? `Reste ${remaining}` : "Terminé";
        return <article key={item.key} className={remaining === 0 ? "completed" : ""}><div className="home-quota-title"><span>{item.icon}</span><strong>{item.label}</strong></div><div className="home-quota-numbers"><strong>{count}<small> / {target}</small></strong><em>{status}</em></div><div className="home-quota-progress"><i style={{ width: `${progress}%` }} /></div></article>;
      })}</div></section>}
      <div className="home-grid">
        <section className="home-card notifications-card"><div className="home-card-head"><div><p className="eyebrow dark">CENTRE D’INFORMATIONS</p><h2>Notifications importantes</h2></div><span><Bell size={17} /> {notifications.length}</span></div><div className="notification-list">{notifications.map((notification, index) => <div className={`notification-entry ${notification.tone}`} key={notification.id || `${notification.title}-${index}`}><button type="button" onClick={() => onNavigate(notification.target)}><span>{notification.icon}</span><span><strong>{notification.title}</strong><small>{notification.text}</small></span></button>{notification.dismissible && <button className="dismiss-notification" type="button" title="Supprimer cette notification" aria-label="Supprimer cette notification" onClick={() => onDismissNotification(notification.id)}><X size={15} /></button>}</div>)}{!notifications.length && <div className="no-notification"><BadgeCheck size={25} /><strong>Tout est à jour</strong><p>Aucune notification importante pour le moment.</p></div>}</div></section>
        <section className="home-card quick-card"><div className="home-card-head"><div><p className="eyebrow dark">ACCÈS RAPIDE</p><h2>Mes raccourcis</h2></div><button className="shortcut-edit-button" onClick={() => { setShortcutDraft(selectedShortcutIds); setEditingShortcuts((current) => !current); }}><Settings2 size={15} /> {editingShortcuts ? "Fermer" : "Personnaliser"}</button></div>{editingShortcuts ? <div className="shortcut-editor"><p>Choisissez les rubriques affichées sur votre accueil.</p><div className="shortcut-options">{shortcutCatalog.map((item) => <label className={shortcutDraft.includes(item.id) ? "selected" : ""} key={item.id}><input type="checkbox" checked={shortcutDraft.includes(item.id)} onChange={() => setShortcutDraft((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span>{item.icon}</span>{item.label}</label>)}</div><div className="shortcut-editor-actions"><button className="secondary" onClick={() => setShortcutDraft(defaultShortcutIds)}>Par défaut</button><button className="primary" disabled={!shortcutDraft.length} onClick={() => { onSaveShortcuts(shortcutDraft); setEditingShortcuts(false); }}>Enregistrer</button></div></div> : <div className="quick-actions">{shortcutCatalog.filter((item) => selectedShortcutIds.includes(item.id)).map((item) => <button key={item.id} onClick={() => onNavigate(item.id)}>{item.icon}<span><strong>{item.label}</strong><small>{item.description}</small></span></button>)}</div>}</section>
        <section className="home-card activity-card"><div className="home-card-head"><div><p className="eyebrow dark">ACTIVITÉ RÉCENTE</p><h2>{isManager ? "Dernières actions du portail" : "Mes dernières actions"}</h2></div>{isManager && <button onClick={() => onNavigate("logs")}>Voir tous les logs</button>}</div><div className="home-activity-list">{visibleActivity.map((entry) => <article key={entry.id}><span className={`log-dot ${entry.category}`} /><div><strong>{entry.action}</strong><small>{entry.actorName} · {entry.displayAt}</small>{entry.details && <p>{entry.details}</p>}</div></article>)}{!visibleActivity.length && <p className="chat-empty-small">Aucune activité enregistrée pour le moment.</p>}</div></section>
        <section className="home-card identity-card"><p className="eyebrow dark">MON ESPACE</p><h2>{session.grade || GRADES[0]}</h2><RoleBadge role={session.role} /><div><span>État du compte</span><strong className="identity-active"><BadgeCheck size={15} /> Actif</strong></div><div><span>Présence</span><strong>{session.presence === "absent" ? "Absent" : ["senior", "officer"].includes(session.role) ? "Présent" : "Non concerné"}</strong></div>{mySergeantAssignment && <div className="identity-referent"><span>Référent de suivi</span><strong>{mySergeantReferent ? `${mySergeantReferent.grade || GRADES[0]} ${mySergeantReferent.firstName} ${mySergeantReferent.lastName}` : "À confirmer"}</strong></div>}</section>
      </div>
    </div>
  );
}

function SummaryPanel({ session, users, logs, activityResetAt, rankingResetAt, onResetActivity, onResetRanking }) {
  const [period, setPeriod] = useState("week");
  const [scope, setScope] = useState("global");
  const allSeries = [
    { subtype: "recommendation", label: "Recommandation", shortLabel: "Reco", tone: "recommendation", kpiTone: "blue", icon: Medal },
    { subtype: "pcs_exp", label: "Recommandation PCS EXP", shortLabel: "PCS EXP", tone: "pcs-exp", kpiTone: "gold", icon: ClipboardCheck },
    { subtype: "observation_hdr", label: "Observation HDR", shortLabel: "Obs. HDR", tone: "observation-hdr", kpiTone: "green", icon: MessageSquareText },
    { subtype: "observation_so", label: "Observation SO", shortLabel: "Obs. SO", tone: "observation-so", kpiTone: "violet", icon: MessageSquareText },
  ];
  // Les Sous-Officiers Supérieurs ne consultent pas le volume des observations SO dans le résumé.
  const visibleSeries = session.role === "senior" ? allSeries.filter((series) => series.subtype !== "observation_so") : allSeries;
  const visibleSubtypes = new Set(visibleSeries.map((series) => series.subtype));
  const periodData = getSummaryPeriod(period);
  const periodLabels = { day: "Aujourd’hui", week: "Cette semaine", month: "Ce mois", year: "Cette année" };
  const allActivity = logs.map((entry) => {
    const subtype = getActivitySubtype(entry);
    return { ...entry, subtype, type: getActivityType(subtype), date: new Date(entry.createdAt) };
  }).filter((entry) => visibleSubtypes.has(entry.subtype) && !Number.isNaN(entry.date.getTime()));
  const resetDate = activityResetAt ? new Date(activityResetAt) : null;
  const activityAfterReset = resetDate && !Number.isNaN(resetDate.getTime()) ? allActivity.filter((entry) => entry.date >= resetDate) : allActivity;
  const scopedActivity = scope === "self" ? activityAfterReset.filter((entry) => entry.actorId === session.id) : activityAfterReset;
  const currentActivity = scopedActivity.filter((entry) => entry.date >= periodData.start && entry.date <= periodData.end);
  const duration = Math.max(periodData.end.getTime() - periodData.start.getTime(), 1);
  const previousStart = new Date(periodData.start.getTime() - duration);
  const previousActivity = scopedActivity.filter((entry) => entry.date >= previousStart && entry.date < periodData.start);
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
  const rankingResetDate = rankingResetAt ? new Date(rankingResetAt) : null;
  const rankingFloor = rankingResetDate && !Number.isNaN(rankingResetDate.getTime()) ? new Date(Math.max(periodData.start.getTime(), rankingResetDate.getTime())) : periodData.start;
  const rankingActivity = allActivity.filter((entry) => entry.date >= rankingFloor && entry.date <= periodData.end);
  const ranking = team.map((user) => {
    const entries = rankingActivity.filter((entry) => entry.actorId === user.id);
    return { user, counts: Object.fromEntries(visibleSeries.map((series) => [series.subtype, entries.filter((entry) => entry.subtype === series.subtype).length])), total: entries.length };
  }).sort((a, b) => b.total - a.total || `${a.user.lastName}`.localeCompare(b.user.lastName)).slice(0, 6);
  const rankingMaximum = Math.max(1, ...ranking.map((item) => item.total));
  const arrivalStart = resetDate && !Number.isNaN(resetDate.getTime()) ? new Date(Math.max(periodData.start.getTime(), resetDate.getTime())) : periodData.start;
  const arrivals = team.map((user) => ({ user, date: getUserCreatedDate(user) })).filter((item) => item.date && item.date >= arrivalStart && item.date <= periodData.end);
  const arrivalBins = periodData.bins.map((bin) => ({ ...bin, count: arrivals.filter((item) => item.date >= bin.start && item.date <= bin.end).length }));
  const arrivalMaximum = Math.max(1, ...arrivalBins.map((bin) => bin.count));
  const canReset = hasAdminAccess(session.role);

  return (
    <div className="summary-dashboard">
      <section className="summary-toolbar"><div><p className="eyebrow dark">PÉRIODE ANALYSÉE</p><h2>{periodLabels[period]}</h2><p>Les données sont calculées à partir des transmissions enregistrées sur le portail.</p></div><div className="summary-controls"><label>Affichage<select value={scope} onChange={(event) => setScope(event.target.value)}><option value="global">Vue globale</option><option value="self">Moi uniquement</option></select></label><label>Période<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="day">Jour</option><option value="week">Semaine</option><option value="month">Mois</option><option value="year">Année</option></select></label>{canReset && <><button className="summary-reset-button" onClick={onResetActivity}><RotateCcw size={16} /> Reset graphiques</button><button className="summary-reset-button" onClick={onResetRanking}><Trophy size={16} /> Reset classement</button></>}</div></section>
      <section className="summary-kpis"><article><span className="summary-kpi-icon blue"><BarChart3 size={20} /></span><div><strong>{currentActivity.length}</strong><small>Transmissions</small></div><em className={trend >= 0 ? "positive" : "negative"}><TrendingUp size={13} /> {trend >= 0 ? "+" : ""}{trend}%</em></article>{visibleSeries.map((series) => { const SeriesIcon = series.icon; return <article key={series.subtype}><span className={`summary-kpi-icon ${series.kpiTone}`}><SeriesIcon size={20} /></span><div><strong>{counts[series.subtype]}</strong><small>{series.label}</small></div></article>; })}<article><span className="summary-kpi-icon green"><UsersRound size={20} /></span><div><strong>{activeMembers}</strong><small>Membres actifs</small></div></article></section>
      <div className="summary-grid">
        <section className="summary-card activity-chart-card"><div className="summary-card-head"><div><p className="eyebrow dark">ÉVOLUTION</p><h2>Activité détaillée par catégorie</h2></div><div className="chart-legend">{visibleSeries.map((series) => <span key={series.subtype}><i className={series.tone} /> {series.shortLabel}</span>)}</div></div><div className="activity-chart">{chartBins.map((bin, index) => <div className="activity-column" key={`${bin.label}-${index}`}><div className="activity-bars">{visibleSeries.map((series) => { const value = bin.counts[series.subtype]; return <span className={`series-bar ${series.tone}`} key={series.subtype} title={`${series.label} : ${value}`} style={{ height: `${value ? Math.max((value / chartMaximum) * 100, 7) : 2}%` }} />; })}</div><span>{bin.label}</span></div>)}</div><div className="chart-insight"><CalendarDays size={16} /><span>Période la plus active : <strong>{busiestBin?.label || "—"}</strong></span></div></section>
        <section className="summary-card distribution-card"><div className="summary-card-head"><div><p className="eyebrow dark">RÉPARTITION</p><h2>Volumes détaillés</h2><p>Chaque catégorie est comptée séparément.</p></div></div><div className="distribution-details detailed">{visibleSeries.map((series) => <div key={series.subtype}><span><i className={series.tone} /><span>{series.label}<small>{counts[series.subtype]} transmission{counts[series.subtype] > 1 ? "s" : ""}</small></span></span><strong>{currentActivity.length ? Math.round((counts[series.subtype] / currentActivity.length) * 100) : 0}%</strong></div>)}</div></section>
        <section className="summary-card ranking-card"><div className="summary-card-head"><div><p className="eyebrow dark">CLASSEMENT</p><h2>Sous-Officiers les plus actifs</h2><p>Activité détaillée depuis le dernier reset du classement.</p></div></div><div className="ranking-list">{ranking.map((item, index) => <article key={item.user.id}><span className={`rank-position rank-${index + 1}`}>{index < 3 ? <Trophy size={15} /> : index + 1}</span><Avatar user={item.user} size="small" /><div className="rank-member"><strong>{item.user.grade} {item.user.firstName} {item.user.lastName}</strong><small>{visibleSeries.map((series) => `${series.shortLabel} : ${item.counts[series.subtype]}`).join(" · ")}</small><div><i style={{ width: `${(item.total / rankingMaximum) * 100}%` }} /></div></div><strong className="rank-score">{item.total}</strong></article>)}</div>{rankingResetAt && <p className="ranking-reset-date">Classement réinitialisé le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(rankingResetAt))}</p>}</section>
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
  const canSubmit = ["senior", "officer"].includes(session.role);
  const canValidate = hasManagerAccess(session.role);
  const displayedMissions = canValidate ? missions : missions.filter((mission) => mission.userId === session.id);

  function submit(event) {
    event.preventDefault();
    try {
      const parsedUrl = new URL(documentUrl);
      if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "docs.google.com" || parsedUrl.username || parsedUrl.password || !parsedUrl.pathname.startsWith("/document/d/")) throw new Error();
    } catch {
      return setError("Ajoutez un lien Google Docs valide.");
    }
    onSubmit({ title: title.trim(), documentUrl: documentUrl.trim() });
    setTitle("");
    setDocumentUrl("");
    setError("");
  }

  return (
    <section className="mission-layout">
      {canSubmit && <div className="mission-submit-card"><div className="transmission-head"><span className="category-icon large blue"><FileText size={25} /></span><div><p className="eyebrow dark">NOUVEAU DÉPÔT</p><h2>Mission interne</h2><p className="muted">Déposez votre Google Docs pour validation par un Référent SO.</p></div></div><form onSubmit={submit}><label>Titre de la mission</label><input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={100} placeholder="Ex. Compte rendu de mission interne" /><label>Lien Google Docs</label><input type="url" value={documentUrl} onChange={(event) => setDocumentUrl(event.target.value)} required placeholder="https://docs.google.com/document/d/…" />{error && <p className="form-error transmission-error">{error}</p>}<div className="transmission-actions"><span><ShieldCheck size={15} /> Le dépôt sera placé en attente</span><button className="primary" type="submit"><FileText size={17} /> Déposer le document</button></div></form></div>}
      <div className="mission-list-card">
        <div className="mission-list-head">
          <div><p className="eyebrow dark">{canValidate ? "VALIDATION RÉFÉRENT SO" : "MES DÉPÔTS"}</p><h2>{canValidate ? "Documents à contrôler" : "Suivi des missions"}</h2></div>
          <div className="mission-list-actions">
            <span className="mission-pending-count">{displayedMissions.filter((mission) => mission.status === "pending").length} en attente</span>
            {canValidate && <button className="reset-missions" type="button" onClick={onReset}><RotateCcw size={15} /> Réinitialiser les documents</button>}
          </div>
        </div>
        <div className="mission-list">
          {displayedMissions.map((mission) => {
            const canDelete = mission.userId === session.id && mission.status !== "validated";
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
  const visibleChats = useMemo(() => isModerator ? chats : chats.filter((chat) => chat.participants.includes(session.id)), [chats, isModerator, session.id]);
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
  const canParticipate = selectedChat?.participants.includes(session.id);
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
    if (!chat.participants.includes(session.id)) {
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
  const historyTitles = { recommendation: "Recommandations effectuées", pcs_exp: "Recommandations PCS EXP effectuées", observation_hdr: "Observations HDR effectuées", observation_so: "Observations SO effectuées", sergeant_report: "Rapports envoyés", protocol: "Mises en protocole enregistrées" };
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
        <div><p className="eyebrow dark">{type === "protocol" ? "HISTORIQUE ADMINISTRATEUR" : "HISTORIQUE PUBLIC"}</p><h2>{title}</h2><p>{type === "protocol" ? "Conservé uniquement pour l’administrateur." : "Visible par les membres ayant accès à cette rubrique."}</p></div>
        <span><ScrollText size={16} /> {entries.length}</span>
      </div>
      {canManage && entries.length > 0 && <button className="submission-history-reset" type="button" onClick={() => onReset(type)}><RotateCcw size={15} /> Réinitialiser uniquement cet historique</button>}
      <div className="submission-history-list">
        {entries.map((entry) => {
          const values = entry.values || {};
          const subject = type === "sergeant_report" ? values.sergeantName : type === "protocol" ? values.arrete : values.aitName;
          const observationLabel = values.observation === "negative" ? "Négative" : "Positive";
          const HistoryIcon = type === "sergeant_report" ? FileText : TRANSMISSION_TYPES[type]?.icon || FileText;
          const editing = editingId === entry.id && form;
          return <article key={entry.id}>
            <div className="submission-history-entry-head"><div className="submission-history-title"><span className={`category-icon ${type === "sergeant_report" ? "gold" : TRANSMISSION_TYPES[type]?.tone || "blue"}`}><HistoryIcon size={17} /></span><div><strong>{subject || "Transmission"}</strong><small>{entry.displayAt}</small></div></div>{canManage && !editing && <div className="history-entry-actions"><button className="icon-button" type="button" title="Modifier cet historique" aria-label="Modifier cet historique" onClick={() => startEditing(entry)}><Pencil size={15} /></button><button className="icon-button danger" type="button" title="Supprimer cet historique" aria-label="Supprimer cet historique" onClick={() => onDelete(type, entry.id)}><Trash2 size={15} /></button></div>}</div>
            {editing ? <form className="history-entry-editor" onSubmit={save}>{type === "sergeant_report" ? <><label>Nom du Sergent<input value={form.sergeantName || ""} onChange={(event) => change("sergeantName", event.target.value)} required /></label><label>Point positif<textarea value={form.positivePoints || ""} onChange={(event) => change("positivePoints", event.target.value)} required /></label><label>Point négatif<textarea value={form.negativePoints || ""} onChange={(event) => change("negativePoints", event.target.value)} required /></label><label>Avis global<textarea value={form.globalOpinion || ""} onChange={(event) => change("globalOpinion", event.target.value)} required /></label><label>Conclusion<select value={form.conclusion || REPORT_CONCLUSIONS[0]} onChange={(event) => change("conclusion", event.target.value)}>{REPORT_CONCLUSIONS.map((conclusion) => <option key={conclusion} value={conclusion}>{conclusion}</option>)}</select></label></> : type === "protocol" ? <><label>Enregistré par<input value={form.recordedBy || ""} onChange={(event) => change("recordedBy", event.target.value)} required /></label><label>Arrêté<input value={form.arrete || ""} onChange={(event) => change("arrete", event.target.value)} required /></label><label>Steam ID 64<input value={form.steamId64 || ""} onChange={(event) => change("steamId64", event.target.value)} inputMode="numeric" required /></label><label>Branche<input value={form.branch || ""} onChange={(event) => change("branch", event.target.value)} required /></label><label>Protocole appliqué<select value={form.protocol || "Protocole 1 (10 min)"} onChange={(event) => change("protocol", event.target.value)}><option value="Protocole 1 (10 min)">Protocole 1 (10 min)</option></select></label><label>Horaires du protocole<input value={form.schedule || ""} onChange={(event) => change("schedule", event.target.value)} required /></label><label>Raison<textarea value={form.reason || ""} onChange={(event) => change("reason", event.target.value)} required /></label></> : <><label>Nom de l’AIT<input value={form.aitName || ""} onChange={(event) => change("aitName", event.target.value)} required /></label><label>S-OFF/-SUP à l’origine<input value={form.author || ""} onChange={(event) => change("author", event.target.value)} required /></label>{["observation_hdr", "observation_so"].includes(type) && <label>Nature de l’observation<select value={form.observation || "positive"} onChange={(event) => change("observation", event.target.value)}><option value="positive">Positive</option><option value="negative">Négative</option></select></label>}<label>Raison<textarea value={form.reason || ""} onChange={(event) => change("reason", event.target.value)} required /></label></>}<div className="history-entry-editor-actions"><button className="secondary" type="button" onClick={cancelEditing}>Annuler</button><button className="primary" type="submit"><BadgeCheck size={15} /> Enregistrer</button></div></form> : <><div className="submission-history-author"><span>Envoyé par</span><strong>{entry.authorGrade ? `${entry.authorGrade} ` : ""}{entry.authorName}</strong></div>{["observation_hdr", "observation_so"].includes(type) && <span className={`history-observation ${values.observation === "negative" ? "negative" : "positive"}`}>{observationLabel}</span>}{type === "sergeant_report" && <span className={`history-conclusion conclusion-${REPORT_CONCLUSIONS.indexOf(values.conclusion)}`}>{values.conclusion}</span>}{type === "sergeant_report" ? <div className="history-report-details"><p><strong>Point positif</strong>{values.positivePoints}</p><p><strong>Point négatif</strong>{values.negativePoints}</p><p><strong>Avis global</strong>{values.globalOpinion}</p></div> : type === "protocol" ? <div className="history-report-details"><p><strong>Enregistré par</strong>{values.recordedBy}</p><p><strong>Steam ID 64</strong>{values.steamId64}</p><p><strong>Branche</strong>{values.branch}</p><p><strong>Protocole appliqué</strong>{values.protocol}</p><p><strong>Horaires du protocole</strong>{values.schedule}</p><p><strong>Raison</strong>{values.reason}</p></div> : <p className="submission-history-reason"><strong>Raison</strong>{values.reason}</p>}</>}
          </article>;
        })}
        {!entries.length && <div className="submission-history-empty"><ScrollText size={25} /><strong>Aucun envoi</strong><p>Les prochaines transmissions apparaîtront ici.</p></div>}
      </div>
    </aside>
  );
}

function ProtocolPanel({ session, onSuccess, history, onResetHistory, onEditHistory, onDeleteHistory }) {
  const initialDraft = readFormDraft(session.id, "protocol");
  const [form, setForm] = useState(() => ({ recordedBy: "", arrete: "", steamId64: "", branch: "", protocol: "Protocole 1 (10 min)", schedule: "", reason: "", ...(initialDraft?.values || {}) }));
  const [draftSavedAt, setDraftSavedAt] = useState(initialDraft?.savedAt || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const meaningful = Object.entries(form).some(([key, value]) => key !== "protocol" && String(value || "").trim());
    const timer = window.setTimeout(() => {
      if (meaningful) {
        saveFormDraft(session.id, "protocol", form);
        setDraftSavedAt(new Date().toISOString());
      } else {
        clearFormDraft(session.id, "protocol");
        setDraftSavedAt("");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [form, session.id]);

  async function submit(event) {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch("/api/submissions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ type: "protocol", values: form }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Enregistrement impossible.");
      const submittedValues = { ...form };
      clearFormDraft(session.id, "protocol");
      setDraftSavedAt("");
      setForm({ recordedBy: "", arrete: "", steamId64: "", branch: "", protocol: "Protocole 1 (10 min)", schedule: "", reason: "" });
      onSuccess("La mise en protocole a été enregistrée dans l’historique.", "protocol", submittedValues);
    } catch (submissionError) {
      setError(submissionError.message || "Une erreur est survenue pendant l’enregistrement.");
    } finally {
      setSending(false);
    }
  }

  if (session.role !== "admin") return <section className="access-denied"><ShieldCheck size={28} /><h2>Accès réservé</h2><p>La mise en protocole est actuellement réservée à l’Administrateur.</p></section>;

  return (
    <section className="transmissions-layout with-history">
      <div className="transmission-card">
        <div className="transmission-head"><span className="category-icon large violet"><ClipboardCheck size={25} /></span><div><p className="eyebrow dark">REGISTRE ADMINISTRATEUR</p><h2>Mise en protocole</h2><p className="muted">Cette fiche est enregistrée dans l’historique interne. Elle ne compte ni dans les quotas ni dans les statistiques.</p></div></div>
        <form onSubmit={submit}>
          <label>Enregistré par</label><input value={form.recordedBy} onChange={(event) => set("recordedBy", event.target.value)} required maxLength={100} placeholder="Nom du Sous-Officier" />
          <label>Arrêté</label><input value={form.arrete} onChange={(event) => set("arrete", event.target.value)} required maxLength={100} placeholder="Nom de la personne arrêtée" />
          <label>Steam ID 64</label><input value={form.steamId64} onChange={(event) => set("steamId64", event.target.value.replace(/\D/g, ""))} required inputMode="numeric" pattern="[0-9]{17}" minLength={17} maxLength={17} placeholder="17 chiffres" />
          <label>Branche</label><input value={form.branch} onChange={(event) => set("branch", event.target.value)} required maxLength={100} placeholder="Branche concernée" />
          <label>Protocole appliqué</label><select value={form.protocol} onChange={(event) => set("protocol", event.target.value)}><option value="Protocole 1 (10 min)">Protocole 1 (10 min)</option></select>
          <label>Horaires du protocole</label><input value={form.schedule} onChange={(event) => set("schedule", event.target.value)} required maxLength={100} placeholder="Ex. 14h00 – 14h10" />
          <label>Raison</label><textarea value={form.reason} onChange={(event) => set("reason", event.target.value)} required maxLength={1000} rows={6} placeholder="Décrivez la raison de la mise en protocole…" />
          {draftSavedAt && <p className="draft-status"><BadgeCheck size={14} /> Brouillon sauvegardé automatiquement à {new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(draftSavedAt))}</p>}
          {error && <p className="form-error transmission-error">{error}</p>}
          <div className="transmission-actions"><span><ShieldCheck size={15} /> Enregistrement administratif</span><button className="primary" type="submit" disabled={sending}><ClipboardCheck size={17} />{sending ? "Enregistrement…" : "Enregistrer la fiche"}</button></div>
        </form>
      </div>
      <SubmissionHistoryPanel type="protocol" entries={history} canManage={true} onReset={onResetHistory} onEdit={onEditHistory} onDelete={onDeleteHistory} />
    </section>
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

function TransmissionPanel({ session, onSuccess, type, history, canManageHistory, onResetHistory, onEditHistory, onDeleteHistory }) {
  if (type === "protocol") return <ProtocolPanel session={session} onSuccess={onSuccess} history={history} onResetHistory={onResetHistory} onEditHistory={onEditHistory} onDeleteHistory={onDeleteHistory} />;
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
  const [themeId, setThemeId] = useState("nuit");
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
    const timer = window.setInterval(refreshSharedPortal, activeSection === "chat" ? 1_200 : 8_000);
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
      setQuotas({ targets: { ...DEFAULT_QUOTAS.targets, ...(parsedQuotas?.targets || {}) }, counts: parsedQuotas?.counts || {}, exemptions: parsedQuotas?.exemptions || {} });
      const savedMissions = readStoredJson(MISSIONS_KEY, []);
      const savedChats = readStoredJson(CHAT_KEY, []);
      const savedLogs = readStoredJson(LOG_KEY, []);
      const savedAssignments = readStoredJson(ASSIGNMENTS_KEY, []);
      const savedSubmissionHistory = readStoredJson(SUBMISSION_HISTORY_KEY, []);
      const savedNotifications = readStoredJson(NOTIFICATION_KEY, []);
      setMissions(Array.isArray(savedMissions) ? savedMissions : []);
      setChats(Array.isArray(savedChats) ? savedChats : []);
      setAuditLogs(Array.isArray(savedLogs) ? savedLogs : []);
      setShortcutPreferences(readStoredJson(SHORTCUTS_KEY, {}));
      setSummarySettings(readStoredJson(SUMMARY_KEY, { activityResetAt: null }));
      setSergeantAssignments(Array.isArray(savedAssignments) ? savedAssignments : []);
      setSubmissionHistory(Array.isArray(savedSubmissionHistory) ? savedSubmissionHistory : []);
      setPortalNotifications(Array.isArray(savedNotifications) ? savedNotifications : []);
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
    if (user.approvalStatus !== "approved") return hasAdminAccess(session?.role);
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
  function applySharedPortalState(state) {
    if (Array.isArray(state?.chats)) setChats(state.chats);
    if (Array.isArray(state?.notifications)) setPortalNotifications(state.notifications);
    if (Array.isArray(state?.auditLogs)) setAuditLogs((current) => mergeAuditLogs(current, state.auditLogs));
    if (Array.isArray(state?.submissions)) setSubmissionHistory(state.submissions);
    if (state?.quotas && typeof state.quotas === "object") setQuotas((current) => ({ ...DEFAULT_QUOTAS, ...current, ...state.quotas }));
    if (state?.summarySettings && typeof state.summarySettings === "object") setSummarySettings(state.summarySettings);
    if (Array.isArray(state?.sergeantAssignments)) setSergeantAssignments(state.sergeantAssignments);
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
  function clearAuditLogs() {
    if (!hasAdminAccess(session.role) || !confirm("Réinitialiser définitivement le journal des logs ?")) return;
    if (portalRemote) {
      portalRequest("POST", { action: "clear_audit_logs" })
        .then((state) => {
          setAuditLogs(Array.isArray(state?.auditLogs) ? state.auditLogs : []);
          if (Array.isArray(state?.chats)) setChats(state.chats);
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
    if (type === "protocol" ? session.role !== "admin" : !hasManagerAccess(session.role)) return;
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
    if (type === "protocol" ? session.role !== "admin" : !hasManagerAccess(session.role)) return;
    const text = (value, limit = 950) => typeof value === "string" ? value.trim().slice(0, limit) : "";
    const isReport = type === "sergeant_report";
    const isProtocol = type === "protocol";
    const updatedValues = isReport
      ? {
          sergeantName: text(values.sergeantName, 100),
          positivePoints: text(values.positivePoints),
          negativePoints: text(values.negativePoints),
          globalOpinion: text(values.globalOpinion),
          conclusion: REPORT_CONCLUSIONS.includes(values.conclusion) ? values.conclusion : REPORT_CONCLUSIONS[0],
        }
      : isProtocol
        ? {
            recordedBy: text(values.recordedBy, 100),
            arrete: text(values.arrete, 100),
            steamId64: text(values.steamId64, 17).replace(/\D/g, ""),
            branch: text(values.branch, 100),
            protocol: values.protocol === "Protocole 1 (10 min)" ? values.protocol : "Protocole 1 (10 min)",
            schedule: text(values.schedule, 100),
            reason: text(values.reason),
          }
      : {
          aitName: text(values.aitName, 100),
          author: text(values.author, 100),
          reason: text(values.reason),
          ...( ["observation_hdr", "observation_so"].includes(type) ? { observation: values.observation === "negative" ? "negative" : "positive" } : {}),
        };
    const complete = isReport
      ? updatedValues.sergeantName && updatedValues.positivePoints && updatedValues.negativePoints && updatedValues.globalOpinion
      : isProtocol
        ? updatedValues.recordedBy && updatedValues.arrete && /^\d{17}$/.test(updatedValues.steamId64) && updatedValues.branch && updatedValues.schedule && updatedValues.reason
      : updatedValues.aitName && updatedValues.author && updatedValues.reason;
    if (!complete) { flash("Tous les champs de l’historique doivent être renseignés."); return; }
    if (portalRemote) {
      portalRequest("POST", { action: "update_submission", submissionId: entryId, type, values: updatedValues })
        .then((state) => { applySharedPortalState(state); flash("L’historique a été modifié."); })
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
      return;
    }
    setSubmissionHistory((current) => current.map((entry) => entry.id === entryId && entry.type === type ? { ...entry, values: updatedValues, editedAt: new Date().toISOString(), editedBy: session.id } : entry));
    const label = isReport ? "Rapport nouveau Sous-Officier" : TRANSMISSION_TYPES[type]?.title || type;
    addLog("form", "Historique de formulaire modifié", label);
    flash("L’historique a été modifié.");
  }
  function deleteSubmissionHistory(type, entryId) {
    if ((type === "protocol" ? session.role !== "admin" : !hasManagerAccess(session.role)) || !confirm("Supprimer définitivement cet élément de l’historique public ?")) return;
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
      const isProtocol = type === "protocol";
      addLog("form", isProtocol ? "Mise en protocole enregistrée" : "Formulaire envoyé", TRANSMISSION_TYPES[type]?.title || type);
      addPortalNotification({ recipients: [session.id], title: isProtocol ? "Mise en protocole enregistrée" : `Formulaire envoyé — ${TRANSMISSION_TYPES[type]?.title || type}`, text: isProtocol ? "La fiche a été ajoutée à l’historique interne." : "Votre formulaire a été transmis sur Discord.", target: type });
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
    setQuotas((current) => ({ ...current, counts: {} }));
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
  function submitMission({ title, documentUrl }) {
    if (!["senior", "officer"].includes(session.role)) return;
    const mission = { id: crypto.randomUUID(), userId: session.id, userName: `${session.firstName} ${session.lastName}`, grade: session.grade || GRADES[0], title, documentUrl, status: "pending", submittedAt: new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date()) };
    setMissions((current) => [mission, ...current]);
    addLog("mission", "Mission interne déposée", title);
    flash("Le document a été déposé et placé en attente.");
  }
  function validateMission(missionId) {
    if (!hasManagerAccess(session.role)) return;
    const mission = missions.find((item) => item.id === missionId);
    if (!mission || mission.status !== "pending") return;
    setMissions((current) => current.map((item) => item.id === missionId ? { ...item, status: "validated", validatedBy: `${session.firstName} ${session.lastName}`, validatedAt: new Date().toISOString() } : item));
    if (portalRemote) {
      portalRequest("POST", { action: "quota_add_mission", userId: mission.userId })
        .then(applySharedPortalState)
        .catch((error) => flash(error instanceof Error ? error.message : "La synchronisation est temporairement indisponible."));
    }
    if (!portalRemote) setQuotas((current) => {
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
    setMissions((current) => current.map((item) => item.id === missionId ? { ...item, status: "rejected", rejectedBy: `${session.firstName} ${session.lastName}`, rejectedAt: new Date().toISOString() } : item));
    addLog("mission", "Mission interne refusée", `${mission.title} · ${mission.userName}`);
    flash("La mission interne a été refusée.");
  }
  function deleteMission(missionId) {
    const mission = missions.find((item) => item.id === missionId);
    if (!mission || mission.userId !== session.id || mission.status === "validated") return;
    if (!confirm("Supprimer ce document de mission interne ?")) return;
    setMissions((current) => current.filter((item) => item.id !== missionId));
    addLog("mission", "Mission interne supprimée", mission.title);
    flash("Le document de mission interne a été supprimé.");
  }
  function resetMissions() {
    if (!hasManagerAccess(session.role)) return;
    if (!confirm("Réinitialiser tous les documents de missions internes ? Les quotas déjà validés resteront inchangés.")) return;
    const removedCount = missions.length;
    setMissions([]);
    addLog("mission", "Documents de missions réinitialisés", `${removedCount} document${removedCount > 1 ? "s" : ""} supprimé${removedCount > 1 ? "s" : ""}`);
    flash("Les documents de missions internes ont été réinitialisés.");
  }
  function startChat(otherUserId) {
    const contact = users.find((user) => user.id === otherUserId && user.id !== session.id && user.approvalStatus === "approved" && !user.blocked);
    if (!contact) return "";
    const existingChat = chats.find((chat) => chat.participants.length === 2 && chat.participants.includes(session.id) && chat.participants.includes(otherUserId));
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
    const chat = chats.find((item) => item.id === chatId && item.participants.includes(session.id));
    if (!chat) return;
    setChats((current) => {
      const currentChat = current.find((item) => item.id === chatId && item.participants.includes(session.id));
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
    const canDelete = chat?.type === "group" ? chat.createdBy === session.id || canModerate : chat?.participants.includes(session.id) || canModerate;
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
      addLog("presence", "Présence modifiée", `${targetUser.firstName} ${targetUser.lastName} · ${presence === "present" ? "Présent" : "Absent"}`);
      flash(presence === "present" ? "La personne est indiquée présente." : "La personne est indiquée absente.");
    } catch (error) { flash(error instanceof Error ? error.message : "La présence n’a pas pu être modifiée."); }
  }
  async function toggleAccountBlock(user) {
    if (!hasAdminAccess(session.role) || user.id === session.id || user.role === "admin" || (session.role === "management" && user.role === "management")) return;
    const willBlock = !user.blocked;
    try {
      const result = await accountRequest("/api/auth/users", "PATCH", { ...user, id: user.id, blocked: willBlock });
      setUsers(Array.isArray(result.users) ? result.users : []);
      addLog("account", willBlock ? "Compte bloqué" : "Compte débloqué", `${user.firstName} ${user.lastName}`);
      flash(willBlock ? "Le compte a été bloqué et ses sessions sont fermées." : "Le compte a été débloqué.");
    } catch (error) { flash(error instanceof Error ? error.message : "Le blocage du compte a échoué."); }
  }
  async function syncDiscordAvatars() {
    if (!hasAdminAccess(session?.role) || avatarSyncing) return;
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

  if (!ready) return null;
  if (!session) return <Login configurationError={configurationError} error={loginError} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row"><div className="brand-mark"><ShieldCheck size={23} /></div><div><strong>Portail SO</strong><small>Espace sécurisé</small></div></div>
        <nav>
          <button className={`menu-item standalone-nav ${activeSection === "home" ? "active" : ""}`} onClick={() => setActiveSection("home")}><Home size={18} /> Accueil</button>
        {hasAdminAccess(session.role) && <MenuGroup title="Admin" icon={ShieldCheck} open={openGroups.admin} onToggle={() => toggleGroup("admin")}><button className={`menu-item ${activeSection === "dashboard" ? "active" : ""}`} onClick={() => setActiveSection("dashboard")}><LayoutDashboard size={17} /> Tableau de bord</button></MenuGroup>}
        {hasManagerAccess(session.role) && <MenuGroup title="Référent SO" icon={UsersRound} open={openGroups.referent} onToggle={() => toggleGroup("referent")}><button className={`menu-item ${activeSection === "workforce" ? "active" : ""}`} onClick={() => setActiveSection("workforce")}><UsersRound size={17} /> Effectif</button><button className={`menu-item ${activeSection === "presence" ? "active" : ""}`} onClick={() => setActiveSection("presence")}><UserCheck size={17} /> Présences</button><button className={`menu-item ${activeSection === "quotas" ? "active" : ""}`} onClick={() => setActiveSection("quotas")}><Gauge size={17} /> Quotas</button></MenuGroup>}
          <MenuGroup title="Globale" icon={Send} open={openGroups.global} onToggle={() => toggleGroup("global")}><button className={`menu-item ${activeSection === "summary" ? "active" : ""}`} onClick={() => setActiveSection("summary")}><BarChart3 size={17} /> Résumé</button><button className={`menu-item ${activeSection === "recommendation" ? "active" : ""}`} onClick={() => setActiveSection("recommendation")}><Medal size={17} /> Recommandation</button><button className={`menu-item ${activeSection === "pcs_exp" ? "active" : ""}`} onClick={() => setActiveSection("pcs_exp")}><ClipboardCheck size={17} /> Recommandation PCS EXP</button><button className={`menu-item ${activeSection === "observation_hdr" ? "active" : ""}`} onClick={() => setActiveSection("observation_hdr")}><MessageSquareText size={17} /> Observation HDR</button>{session.role === "admin" ? <button className={`menu-item ${activeSection === "protocol" ? "active" : ""}`} onClick={() => setActiveSection("protocol")}><ClipboardCheck size={17} /> Mise en protocole</button> : <button className="menu-item protocol-locked" type="button" disabled aria-label="Mise en protocole — réservé à l’administrateur"><ClipboardCheck size={17} /> Mise en protocole</button>}<button className={`menu-item ${activeSection === "mission_internal" ? "active" : ""}`} onClick={() => setActiveSection("mission_internal")}><FileText size={17} /> Mission interne</button></MenuGroup>
        {hasSeniorAccess(session.role) && <MenuGroup title="Sous-Officier Supérieur" icon={BadgeCheck} open={openGroups.senior} onToggle={() => toggleGroup("senior")}><button className={`menu-item ${activeSection === "sergeant_assignments" ? "active" : ""}`} onClick={() => setActiveSection("sergeant_assignments")}><UsersRound size={17} /> Référent</button><button className={`menu-item ${activeSection === "observation_so" ? "active" : ""}`} onClick={() => setActiveSection("observation_so")}><MessageSquareText size={17} /> Observation SO</button><button className={`menu-item ${activeSection === "sergeant_report" ? "active" : ""}`} onClick={() => setActiveSection("sergeant_report")}><FileText size={17} /> Rapport nouveau SO</button></MenuGroup>}
          <MenuGroup title="Chat" icon={MessageSquareText} open={openGroups.chat} onToggle={() => toggleGroup("chat")}><button className={`menu-item ${activeSection === "chat" ? "active" : ""}`} onClick={() => setActiveSection("chat")}><Send size={17} /> Messagerie</button></MenuGroup>
        {hasManagerAccess(session.role) && <button className={`menu-item standalone-nav logs-nav ${activeSection === "logs" ? "active" : ""}`} onClick={() => setActiveSection("logs")}><ScrollText size={18} /> Logs</button>}
        </nav>
        <button className="profile-card" onClick={() => setProfileOpen(true)} title="Profil et paramètres"><Avatar user={session} /><div><strong>{session.firstName} {session.lastName}</strong><small>{session.grade || GRADES[0]} · {ROLES[session.role].label}</small></div><ChevronDown size={16} /></button>
        <div className="sidebar-actions">
          <button className="logout" onClick={logout}><LogOut size={18} /><span>Se déconnecter</span></button>
          <ThemePicker themeId={themeId} onChange={setThemeId} />
        </div>
      </aside>

      <main className="content">
        <div className="mobile-section-nav"><label>Rubrique</label><select value={activeSection} onChange={(event) => setActiveSection(event.target.value)}><optgroup label="Menu"><option value="home">Accueil</option></optgroup>{hasAdminAccess(session.role) && <optgroup label="Admin"><option value="dashboard">Tableau de bord</option></optgroup>}{hasManagerAccess(session.role) && <optgroup label="Référent SO"><option value="workforce">Effectif</option><option value="presence">Présences</option><option value="quotas">Quotas</option></optgroup>}<optgroup label="Globale"><option value="summary">Résumé</option><option value="recommendation">Recommandation</option><option value="pcs_exp">Recommandation PCS EXP</option><option value="observation_hdr">Observation HDR</option>{session.role === "admin" ? <option value="protocol">Mise en protocole</option> : <option disabled>Mise en protocole — réservé</option>}<option value="mission_internal">Mission interne</option></optgroup>{hasSeniorAccess(session.role) && <optgroup label="Sous-Officier Supérieur"><option value="sergeant_assignments">Référent</option><option value="observation_so">Observation SO</option><option value="sergeant_report">Rapport nouveau Sous-Officier</option></optgroup>}<optgroup label="Chat"><option value="chat">Messagerie</option></optgroup>{hasManagerAccess(session.role) && <optgroup label="Journal"><option value="logs">Logs</option></optgroup>}</select></div>
        {activeSection === "home" ? <header><div><p className="eyebrow dark">MENU PRINCIPAL</p><h1>Accueil</h1><p className="muted">Retrouvez vos informations importantes et vos raccourcis.</p></div><span className="all-access"><Bell size={16} /> Centre d’informations</span></header> : activeSection === "summary" ? <header><div><p className="eyebrow dark">ESPACE PARTAGÉ</p><h1>Résumé</h1><p className="muted">Analysez les recommandations, observations et l’activité de l’équipe.</p></div><span className="all-access"><BarChart3 size={16} /> Statistiques en temps réel</span></header> : activeSection === "workforce" ? <header><div><p className="eyebrow dark">RÉFÉRENT SO</p><h1>Effectif</h1><p className="muted">Consultez l’organisation complète des membres par accès et par grade.</p></div><span className="referent-access"><UsersRound size={16} /> Vue des effectifs</span></header> : activeSection === "sergeant_assignments" ? <header><div><p className="eyebrow dark">SOUS-OFFICIER SUPÉRIEUR</p><h1>Référent</h1><p className="muted">Attribuez et suivez les référents des nouveaux Sergents.</p></div><span className="senior-access"><BadgeCheck size={16} /> Suivi des semaines de test</span></header> : activeSection === "logs" ? <header><div><p className="eyebrow dark">SUIVI DU PORTAIL</p><h1>Logs</h1><p className="muted">Consultez les actions importantes réalisées sur le portail.</p></div><span className="referent-access"><ScrollText size={16} /> Admin & Référent SO</span></header> : activeSection === "dashboard" ? <header><div><p className="eyebrow dark">PORTAIL DE GESTION</p><h1>{getTimeGreeting()}, {session.grade || GRADES[0]} {session.lastName}</h1><p className="muted">Validez les demandes Discord et gardez une vue claire sur votre équipe.</p></div><span className="all-access"><MessageSquareText size={16} /> Connexion Discord</span></header> : activeSection === "presence" ? <header><div><p className="eyebrow dark">RÉFÉRENT SO</p><h1>Présences</h1><p className="muted">Suivez la présence des Sous-Officiers de votre équipe.</p></div><span className="referent-access"><ShieldCheck size={16} /> Gestion Référent SO</span></header> : activeSection === "quotas" ? <header><div><p className="eyebrow dark">RÉFÉRENT SO</p><h1>Quotas</h1><p className="muted">Suivez le volume de transmissions réalisé par chaque Sous-Officier.</p></div><span className="referent-access"><Gauge size={16} /> Gestion Référent SO</span></header> : activeSection === "mission_internal" ? <header><div><p className="eyebrow dark">ESPACE PARTAGÉ</p><h1>Mission interne</h1><p className="muted">Déposez et validez les Google Docs des missions internes.</p></div><span className="all-access"><FileText size={16} /> Dépôt et validation</span></header> : activeSection === "chat" ? <header><div><p className="eyebrow dark">CHAT INTERNE</p><h1>Messagerie</h1><p className="muted">Échangez avec un membre du portail ou contactez un Référent SO.</p></div><span className="all-access"><MessageSquareText size={16} /> Accessible à tous les comptes</span></header> : activeSection === "observation_so" ? <header><div><p className="eyebrow dark">SOUS-OFFICIER SUPÉRIEUR</p><h1>{TRANSMISSION_TYPES[activeSection].title}</h1><p className="muted">{TRANSMISSION_TYPES[activeSection].description}</p></div><span className="senior-access"><BadgeCheck size={16} /> Accès Sous-Officiers Supérieurs</span></header> : activeSection === "sergeant_report" ? <header><div><p className="eyebrow dark">SOUS-OFFICIER SUPÉRIEUR</p><h1>Rapport nouveau Sous-Officier</h1><p className="muted">Évaluez et concluez la semaine de test d’un nouveau Sergent.</p></div><span className="senior-access"><BadgeCheck size={16} /> Accès Sous-Officiers Supérieurs</span></header> : <header><div><p className="eyebrow dark">ESPACE PARTAGÉ</p><h1>{TRANSMISSION_TYPES[activeSection].title}</h1><p className="muted">{TRANSMISSION_TYPES[activeSection].description}</p></div><span className="all-access"><UsersRound size={16} /> Accessible à tous les rôles</span></header>}

        {activeSection === "home" ? <HomePanel session={session} users={users} missions={missions} chats={chats} quotas={quotas} logs={auditLogs} assignments={sergeantAssignments} portalNotifications={portalNotifications} shortcutIds={shortcutPreferences[session.id]} onSaveShortcuts={saveHomeShortcuts} onNavigate={setActiveSection} onDismissNotification={dismissPortalNotification} /> : activeSection === "summary" ? <SummaryPanel session={session} users={users} logs={auditLogs} activityResetAt={summarySettings.activityResetAt} rankingResetAt={summarySettings.rankingResetAt} onResetActivity={resetActivitySummary} onResetRanking={resetActivityRanking} /> : activeSection === "workforce" ? <WorkforcePanel users={users} quotas={quotas} /> : activeSection === "sergeant_assignments" ? <SergeantAssignmentPanel users={users} session={session} assignments={sergeantAssignments} onAssign={assignSergeant} onReminder={remindSergeantAssignment} onDelete={deleteSergeantAssignment} /> : activeSection === "logs" ? <LogsPanel session={session} logs={auditLogs} onClear={clearAuditLogs} /> : activeSection === "dashboard" ? <>
        <section className="stats">
          <article><span className="stat-icon blue"><UsersRound /></span><div><strong>{users.length}</strong><small>Comptes au total</small></div><span className="trend">Tous niveaux</span></article>
          <article><span className="stat-icon gold"><UserRound /></span><div><strong>{users.filter((user) => user.approvalStatus === "pending").length}</strong><small>Demandes en attente</small></div><span className="trend">À valider</span></article>
          <article><span className="stat-icon violet"><ShieldCheck /></span><div><strong>{users.filter((u) => hasManagerAccess(u.role)).length}</strong><small>Gestionnaires</small></div><span className="trend">Admin, Gérance & Référent</span></article>
        </section>

        <section className="accounts-card">
          <div className="card-head"><div><h2>Comptes utilisateurs</h2><p className="muted">{visibleUsers.length} compte{visibleUsers.length > 1 ? "s" : ""} affiché{visibleUsers.length > 1 ? "s" : ""}</p></div><div className="filters"><button className="secondary avatar-sync" type="button" onClick={syncDiscordAvatars} disabled={avatarSyncing}><RotateCcw size={15} /> {avatarSyncing ? "Synchronisation…" : "Rafraîchir les photos"}</button><div className="search"><Search size={17} /><input placeholder="Rechercher un compte…" value={query} onChange={(e) => setQuery(e.target.value)} /></div><select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option value="all">Tous les niveaux</option>{Object.entries(ROLES).map(([key, role]) => <option value={key} key={key}>{role.label}</option>)}</select></div></div>
          <div className="table-wrap"><table><thead><tr><th>Utilisateur</th><th>Grade</th><th>Niveau d’accès</th><th>État du compte</th><th>Création</th><th></th></tr></thead><tbody>{visibleUsers.map((user) => <tr key={user.id}><td><div className="user-cell"><Avatar user={user} size="small" /><div><strong>{user.firstName} {user.lastName}</strong><small>{user.discordUsername ? `Discord : ${user.discordUsername}` : "Compte Discord lié"}</small></div></div></td><td><span className="grade-badge">{user.grade || GRADES[0]}</span></td><td>{user.approvalStatus === "pending" ? <span className="locked">À attribuer</span> : <RoleBadge role={user.role} />}</td><td>{user.approvalStatus === "pending" ? <button className="account-state pending" type="button" onClick={() => hasAdminAccess(session.role) && setModal(user)}><UserRound size={15} /> En attente</button> : user.approvalStatus === "rejected" ? <span className="account-state blocked"><UserX size={15} /> Refusé</span> : user.role === "admin" ? <span className="account-state active"><UserCheck size={15} /> Compte actif</span> : <button className={`account-state ${user.blocked ? "blocked" : "active"}`} type="button" onClick={() => toggleAccountBlock(user)}>{user.blocked ? <UserX size={15} /> : <UserCheck size={15} />}{user.blocked ? "Compte bloqué" : "Compte actif"}</button>}</td><td>{user.createdAt}</td><td><div className="row-actions">{canManage && manageable(user) ? <><button className="icon-button" title={user.approvalStatus === "pending" ? "Examiner la demande" : "Modifier"} onClick={() => setModal(user)}>{user.approvalStatus === "pending" ? <BadgeCheck size={17} /> : <Pencil size={17} />}</button><button className="icon-button danger" title="Supprimer" onClick={() => removeUser(user)}><Trash2 size={17} /></button></> : <span className="locked">Protégé</span>}</div></td></tr>)}</tbody></table></div>
        </section>
        </> : activeSection === "presence" ? <PresencePanel users={users} onChange={changePresence} /> : activeSection === "quotas" ? <QuotaPanel users={users} quotas={quotas} onTargetChange={changeQuotaTarget} onReset={resetQuotas} onToggleExemption={toggleQuotaExemption} /> : activeSection === "mission_internal" ? <MissionInternalPanel session={session} missions={missions} onSubmit={submitMission} onValidate={validateMission} onReject={rejectMission} onDelete={deleteMission} onReset={resetMissions} /> : activeSection === "chat" ? <ChatPanel session={session} users={users} chats={chats} onStart={startChat} onCreateGroup={createChatGroup} onUpdateGroup={updateChatGroup} onSend={sendChatMessage} onEditMessage={editChatMessage} onDeleteMessage={deleteChatMessage} onDeleteChat={deleteChat} /> : activeSection === "sergeant_report" ? <SergeantReportPanel users={users} session={session} assignments={sergeantAssignments} onSuccess={sergeantReportSuccess} history={submissionHistory.filter((entry) => entry.type === "sergeant_report")} canManageHistory={canManage} onResetHistory={resetSubmissionHistory} onEditHistory={updateSubmissionHistory} onDeleteHistory={deleteSubmissionHistory} /> : <TransmissionPanel key={activeSection} session={session} onSuccess={transmissionSuccess} type={activeSection} history={submissionHistory.filter((entry) => entry.type === activeSection)} canManageHistory={canManage} onResetHistory={resetSubmissionHistory} onEditHistory={updateSubmissionHistory} onDeleteHistory={deleteSubmissionHistory} />}
      </main>
      {notice && <div className="toast"><BadgeCheck size={19} />{notice}</div>}
      {modal && <UserModal actor={session} editing={modal.id ? modal : null} onClose={() => setModal(null)} onSave={saveUser} />}
      {profileOpen && <ProfileModal user={session} onClose={() => setProfileOpen(false)} onSave={saveProfile} soundEnabled={soundEnabled} onSoundEnabledChange={setSoundEnabled} />}
      {loginTransition && <LoginTransition user={loginTransition} />}
    </div>
  );
}

export default App;
