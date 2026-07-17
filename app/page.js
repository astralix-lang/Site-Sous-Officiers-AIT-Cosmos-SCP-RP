"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Bell,
  ClipboardCheck,
  ChevronDown,
  FileText,
  Gauge,
  Home,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Medal,
  MessageSquareText,
  Moon,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ScrollText,
  Send,
  ShieldCheck,
  Sun,
  Trash2,
  Download,
  UserCheck,
  UserRound,
  UserX,
  UsersRound,
  X,
} from "lucide-react";

const ROLES = {
  admin: { label: "Admin", short: "AD", tone: "violet" },
  referent: { label: "Référent SO", short: "RS", tone: "blue" },
  senior: { label: "Sous-Officier Supérieur", short: "SS", tone: "gold" },
  officer: { label: "Sous-Officier", short: "SO", tone: "green" },
};

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

const INITIAL_USERS = [
  { id: "admin-1", firstName: "Camille", lastName: "Martin", email: "admin@portail-so.fr", grade: "Major", role: "admin", password: "Admin2026!", createdAt: "16 juil. 2026" },
  { id: "ref-1", firstName: "Thomas", lastName: "Bernard", email: "t.bernard@portail-so.fr", grade: "Adjudant-Chef", role: "referent", password: "Referent2026!", createdAt: "14 juil. 2026" },
  { id: "senior-1", firstName: "Sophie", lastName: "Dubois", email: "s.dubois@portail-so.fr", grade: "Adjudant", role: "senior", password: "SousOff2026!", presence: "present", createdAt: "12 juil. 2026" },
  { id: "officer-1", firstName: "Julien", lastName: "Moreau", email: "j.moreau@portail-so.fr", grade: "Sergent-Chef", role: "officer", password: "SousOff2026!", presence: "present", createdAt: "9 juil. 2026" },
];

const STORAGE_KEY = "portail-so-users-v1";
const SESSION_KEY = "portail-so-session-v1";
const THEME_KEY = "portail-so-theme";
const ADMIN_RECOVERY_KEY = "portail-so-admin-recovery-v1";
const QUOTA_KEY = "portail-so-quotas-v1";
const MISSIONS_KEY = "portail-so-missions-v1";
const CHAT_KEY = "portail-so-chats-v1";
const LOG_KEY = "portail-so-logs-v1";
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
const LOG_CATEGORY_LABELS = { auth: "Connexion", account: "Comptes", presence: "Présences", quota: "Quotas", form: "Formulaires", mission: "Missions", chat: "Chat", profile: "Profils", system: "Système" };
const REPORT_CONCLUSIONS = [
  "Passage confirmé en sergent",
  "Prolongation de la semaine de test",
  "Retour caporal-chef",
];

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
};

function initials(user) {
  return `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase();
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
    if (color) node.style.color = color;
    if (backgroundColor) node.style.backgroundColor = backgroundColor;
  });
  return template.innerHTML;
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
  return CHAT_ATTACHMENT_TYPES.has(mimeType) || mimeType === "application/octet-stream" ? attachment.dataUrl : "";
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

function Login({ onLogin, error }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
          <div className="mobile-logo"><div className="brand-mark"><ShieldCheck size={25} /></div><strong>Portail SO</strong></div>
          <p className="eyebrow dark">CONNEXION</p>
          <h2>Bienvenue</h2>
          <p className="muted">Identifiez-vous pour accéder à votre espace.</p>
          <form autoComplete="off" onSubmit={(event) => { event.preventDefault(); onLogin(email, password); }}>
            <label>Adresse e-mail</label>
            <div className="input-wrap"><UserRound size={19} /><input type="email" name="portal-email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <label>Mot de passe</label>
            <div className="input-wrap"><KeyRound size={19} /><input type="password" name="portal-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            {error && <p className="form-error">{error}</p>}
            <button className="primary wide" type="submit">Se connecter <span>→</span></button>
          </form>
        </div>
      </section>
    </main>
  );
}

function UserModal({ actor, editing, onClose, onSave }) {
  const allowedRoles = actor.role === "admin" ? ["referent", "senior", "officer"] : ["senior", "officer"];
  const [form, setForm] = useState(editing || { firstName: "", lastName: "", email: "", grade: GRADES[0], role: allowedRoles[0], password: "", presence: "present" });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="icon-button close" onClick={onClose}><X size={20} /></button>
        <p className="eyebrow dark">GESTION DES ACCÈS</p>
        <h2>{editing ? "Modifier le compte" : "Créer un compte"}</h2>
        <p className="muted">Renseignez les informations et attribuez le niveau d’accès.</p>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
          <div className="form-grid">
            <div><label>Prénom</label><input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required /></div>
            <div><label>Nom</label><input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required /></div>
          </div>
          <label>Adresse e-mail</label><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
          <label>Grade</label><select value={form.grade || GRADES[0]} onChange={(e) => set("grade", e.target.value)} required>{GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}</select>
          <label>Niveau d’accès</label>
          <select value={form.role} onChange={(e) => set("role", e.target.value)} disabled={editing && !allowedRoles.includes(editing.role)}>
            {(allowedRoles.includes(form.role) ? allowedRoles : [form.role]).map((role) => <option key={role} value={role}>{ROLES[role].label}</option>)}
          </select>
          <label>{editing ? "Nouveau mot de passe (facultatif)" : "Mot de passe temporaire"}</label>
          <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required={!editing} minLength={8} placeholder="8 caractères minimum" />
          <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Annuler</button><button type="submit" className="primary">{editing ? "Enregistrer" : "Créer le compte"}</button></div>
        </form>
      </div>
    </div>
  );
}

function ProfileModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({ ...user, password: "" });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal profile-modal">
        <button className="icon-button close" onClick={onClose}><X size={20} /></button>
        <div className="profile-modal-head"><div className={`avatar profile-avatar ${ROLES[user.role].tone}`}>{initials(user)}</div><div><p className="eyebrow dark">MON COMPTE</p><h2>Personnaliser mon profil</h2><p className="muted">Mettez à jour vos informations personnelles.</p></div></div>
        <form onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
          <div className="form-grid"><div><label>Prénom</label><input value={form.firstName} onChange={(event) => set("firstName", event.target.value)} required /></div><div><label>Nom</label><input value={form.lastName} onChange={(event) => set("lastName", event.target.value)} required /></div></div>
          {["admin", "referent"].includes(user.role) && <><label>Adresse e-mail</label><input type="email" value={form.email} onChange={(event) => set("email", event.target.value)} required /></>}
          <label>Grade</label>{user.role === "admin" ? <select value={form.grade || GRADES[0]} onChange={(event) => set("grade", event.target.value)} required>{GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}</select> : <div className="readonly-grade"><span>{user.grade || GRADES[0]}</span><small>Le grade est géré par un Admin ou un Référent SO.</small></div>}
          <label>Niveau d’accès</label><div className="readonly-role"><RoleBadge role={user.role} /><span>Ce niveau est géré par un responsable.</span></div>
          <label>Nouveau mot de passe <span className="optional">(facultatif)</span></label><input type="password" value={form.password} onChange={(event) => set("password", event.target.value)} minLength={8} placeholder="Laisser vide pour conserver le mot de passe actuel" />
          <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Annuler</button><button type="submit" className="primary">Enregistrer mon profil</button></div>
        </form>
      </div>
    </div>
  );
}

function PresencePanel({ users, onChange }) {
  const team = users.filter((user) => ["senior", "officer"].includes(user.role));
  const presentCount = team.filter((user) => user.presence !== "absent").length;

  return (
    <section className="presence-card">
      <div className="presence-summary">
        <div><p className="eyebrow dark">SUIVI DE L’ÉQUIPE</p><h2>Tableau des présences</h2><p className="muted">Mettez à jour la situation des Sous-Officiers et Sous-Officiers Supérieurs.</p></div>
        <div className="presence-counts"><span className="present"><UserCheck size={17} /><strong>{presentCount}</strong> présent{presentCount > 1 ? "s" : ""}</span><span className="absent"><UserX size={17} /><strong>{team.length - presentCount}</strong> absent{team.length - presentCount > 1 ? "s" : ""}</span></div>
      </div>
      <div className="table-wrap"><table className="presence-table"><thead><tr><th>Utilisateur</th><th>Grade</th><th>Niveau d’accès</th><th>Situation</th><th>Mettre à jour</th></tr></thead><tbody>
        {team.map((user) => {
          const isPresent = user.presence !== "absent";
          return <tr key={user.id}><td><div className="user-cell"><span className={`avatar small ${ROLES[user.role].tone}`}>{initials(user)}</span><div><strong>{user.firstName} {user.lastName}</strong><small>{user.email}</small></div></div></td><td><span className="grade-badge">{user.grade || GRADES[0]}</span></td><td><RoleBadge role={user.role} /></td><td><span className={`presence-status ${isPresent ? "present" : "absent"}`}><i />{isPresent ? "Présent" : "Absent"}</span></td><td><div className="presence-actions"><button className={isPresent ? "selected present" : ""} onClick={() => onChange(user.id, "present")}><UserCheck size={16} /> Présent</button><button className={!isPresent ? "selected absent" : ""} onClick={() => onChange(user.id, "absent")}><UserX size={16} /> Absent</button></div></td></tr>;
        })}
        {!team.length && <tr><td colSpan="5" className="empty-presence">Aucun Sous-Officier à afficher.</td></tr>}
      </tbody></table></div>
    </section>
  );
}

function HomePanel({ session, users, missions, chats, quotas, logs, onNavigate }) {
  const isManager = ["admin", "referent"].includes(session.role);
  const team = users.filter((user) => ["senior", "officer"].includes(user.role));
  const activeAccounts = users.filter((user) => !user.blocked).length;
  const myChats = chats.filter((chat) => chat.participants.includes(session.id));
  const pendingMissions = missions.filter((mission) => mission.status === "pending");
  const myMissions = missions.filter((mission) => mission.userId === session.id);
  const targets = { ...DEFAULT_QUOTAS.targets, ...quotas.targets };
  const counts = quotas.counts?.[session.id] || {};
  const categoryCounts = { recommendation: counts.recommendation || 0, pcs_exp: counts.pcs_exp || 0, observations: (counts.observation_hdr || 0) + (counts.observation_so || 0), mission_internal: counts.mission_internal || 0 };
  const completedQuotaCategories = Object.keys(targets).filter((category) => categoryCounts[category] >= targets[category]).length;
  const notifications = [];
  if (isManager && pendingMissions.length) notifications.push({ tone: "warning", icon: <FileText size={17} />, title: `${pendingMissions.length} mission${pendingMissions.length > 1 ? "s" : ""} en attente`, text: "Des documents attendent une validation ou un refus.", target: "mission_internal" });
  if (session.presence === "absent") notifications.push({ tone: "danger", icon: <UserX size={17} />, title: "Vous êtes indiqué absent", text: "Vos quotas sont temporairement affichés comme absents.", target: "home" });
  if (quotas.exemptions?.[session.id]) notifications.push({ tone: "info", icon: <ShieldCheck size={17} />, title: "Vous êtes exempté de quota", text: "Les objectifs restent enregistrés mais ne sont pas exigés.", target: "home" });
  const rejectedMissions = myMissions.filter((mission) => mission.status === "rejected").length;
  if (rejectedMissions) notifications.push({ tone: "danger", icon: <X size={17} />, title: `${rejectedMissions} mission${rejectedMissions > 1 ? "s" : ""} refusée${rejectedMissions > 1 ? "s" : ""}`, text: "Consultez vos dépôts pour les corriger ou les supprimer.", target: "mission_internal" });
  if (myChats.length) notifications.push({ tone: "info", icon: <MessageSquareText size={17} />, title: `${myChats.length} discussion${myChats.length > 1 ? "s" : ""} disponible${myChats.length > 1 ? "s" : ""}`, text: "Ouvrez la messagerie pour consulter vos échanges.", target: "chat" });
  const visibleActivity = isManager ? logs.slice(0, 5) : logs.filter((entry) => entry.actorId === session.id).slice(0, 5);
  const today = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

  return (
    <div className="home-dashboard">
      <section className="home-hero"><div><span className="home-date">{today}</span><h2>Bienvenue, {session.firstName}</h2><p>Voici les informations importantes de votre espace Sous-Officiers.</p></div><div className={`avatar home-avatar ${ROLES[session.role].tone}`}>{initials(session)}</div></section>
      <section className="home-stats"><article><span className="home-stat-icon blue"><UsersRound size={20} /></span><div><strong>{activeAccounts}</strong><small>Comptes actifs</small></div></article><article><span className="home-stat-icon violet"><MessageSquareText size={20} /></span><div><strong>{myChats.length}</strong><small>Mes discussions</small></div></article><article><span className="home-stat-icon gold"><FileText size={20} /></span><div><strong>{isManager ? pendingMissions.length : myMissions.length}</strong><small>{isManager ? "Missions à traiter" : "Mes missions"}</small></div></article><article><span className="home-stat-icon green"><Gauge size={20} /></span><div><strong>{["senior", "officer"].includes(session.role) ? `${completedQuotaCategories}/4` : team.filter((user) => user.presence !== "absent").length}</strong><small>{["senior", "officer"].includes(session.role) ? "Catégories de quota" : "SO présents"}</small></div></article></section>
      <div className="home-grid">
        <section className="home-card notifications-card"><div className="home-card-head"><div><p className="eyebrow dark">CENTRE D’INFORMATIONS</p><h2>Notifications importantes</h2></div><span><Bell size={17} /> {notifications.length}</span></div><div className="notification-list">{notifications.map((notification, index) => <button type="button" className={notification.tone} key={`${notification.title}-${index}`} onClick={() => onNavigate(notification.target)}><span>{notification.icon}</span><span><strong>{notification.title}</strong><small>{notification.text}</small></span></button>)}{!notifications.length && <div className="no-notification"><BadgeCheck size={25} /><strong>Tout est à jour</strong><p>Aucune notification importante pour le moment.</p></div>}</div></section>
        <section className="home-card quick-card"><div className="home-card-head"><div><p className="eyebrow dark">ACCÈS RAPIDE</p><h2>Raccourcis</h2></div></div><div className="quick-actions"><button onClick={() => onNavigate("chat")}><MessageSquareText size={18} /><span><strong>Messagerie</strong><small>Ouvrir une discussion</small></span></button><button onClick={() => onNavigate("mission_internal")}><FileText size={18} /><span><strong>Mission interne</strong><small>Déposer ou contrôler un document</small></span></button><button onClick={() => onNavigate(session.role === "senior" ? "observation_so" : "observation_hdr")}><ClipboardCheck size={18} /><span><strong>Nouvelle observation</strong><small>Accéder au formulaire</small></span></button>{session.role === "admin" && <button onClick={() => onNavigate("dashboard")}><ShieldCheck size={18} /><span><strong>Gestion des comptes</strong><small>Administrer les accès</small></span></button>}{session.role === "referent" && <button onClick={() => onNavigate("presence")}><UserCheck size={18} /><span><strong>Présences</strong><small>Mettre l’équipe à jour</small></span></button>}</div></section>
        <section className="home-card activity-card"><div className="home-card-head"><div><p className="eyebrow dark">ACTIVITÉ RÉCENTE</p><h2>{isManager ? "Dernières actions du portail" : "Mes dernières actions"}</h2></div>{isManager && <button onClick={() => onNavigate("logs")}>Voir tous les logs</button>}</div><div className="home-activity-list">{visibleActivity.map((entry) => <article key={entry.id}><span className={`log-dot ${entry.category}`} /><div><strong>{entry.action}</strong><small>{entry.actorName} · {entry.displayAt}</small>{entry.details && <p>{entry.details}</p>}</div></article>)}{!visibleActivity.length && <p className="chat-empty-small">Aucune activité enregistrée pour le moment.</p>}</div></section>
        <section className="home-card identity-card"><p className="eyebrow dark">MON ESPACE</p><h2>{session.grade || GRADES[0]}</h2><RoleBadge role={session.role} /><div><span>État du compte</span><strong className="identity-active"><BadgeCheck size={15} /> Actif</strong></div><div><span>Présence</span><strong>{session.presence === "absent" ? "Absent" : ["senior", "officer"].includes(session.role) ? "Présent" : "Non concerné"}</strong></div></section>
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
    <section className="logs-card"><div className="logs-summary"><div><p className="eyebrow dark">JOURNAL D’AUDIT</p><h2>Activité du portail</h2><p className="muted">Les {Math.min(logs.length, 500)} dernières actions importantes sont conservées.</p></div><div><span><ScrollText size={18} /> {logs.length} entrées</span><button className="secondary" onClick={exportLogs}><Download size={16} /> Exporter</button>{session.role === "admin" && <button className="clear-logs" onClick={onClear}><Trash2 size={16} /> Réinitialiser</button>}</div></div><div className="logs-filters"><div className="search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une action…" /></div><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Toutes les catégories</option>{categories.map((item) => <option value={item} key={item}>{LOG_CATEGORY_LABELS[item] || item}</option>)}</select></div><div className="table-wrap"><table className="logs-table"><thead><tr><th>Date</th><th>Acteur</th><th>Catégorie</th><th>Action</th><th>Détails</th></tr></thead><tbody>{filteredLogs.map((entry) => <tr key={entry.id}><td>{entry.displayAt}</td><td><strong>{entry.actorName}</strong><small>{entry.actorRole ? ROLES[entry.actorRole]?.label || entry.actorRole : "Système"}</small></td><td><span className={`log-category ${entry.category}`}>{LOG_CATEGORY_LABELS[entry.category] || entry.category}</span></td><td><strong>{entry.action}</strong></td><td>{entry.details || "—"}</td></tr>)}{!filteredLogs.length && <tr><td colSpan="5" className="empty-presence">Aucun log ne correspond à votre recherche.</td></tr>}</tbody></table></div></section>
  );
}

function QuotaPanel({ users, quotas, onTargetChange, onReset, onToggleExemption }) {
  const team = users.filter((user) => ["senior", "officer"].includes(user.role));
  const targets = { ...DEFAULT_QUOTAS.targets, ...quotas.targets };

  return (
    <section className="quota-card">
      <div className="quota-head">
        <div><p className="eyebrow dark">SUIVI DES TRANSMISSIONS</p><h2>Quotas par catégorie</h2><p className="muted">Définissez un objectif distinct pour les recommandations, PCS EXP, observations et missions internes validées.</p></div>
        <div className="quota-controls"><label>Recommandation<input type="number" min="0" max="100" value={targets.recommendation} onChange={(event) => onTargetChange("recommendation", event.target.value)} /></label><label>PCS EXP<input type="number" min="0" max="100" value={targets.pcs_exp} onChange={(event) => onTargetChange("pcs_exp", event.target.value)} /></label><label>Observations<input type="number" min="0" max="100" value={targets.observations} onChange={(event) => onTargetChange("observations", event.target.value)} /></label><label>Missions internes<input type="number" min="0" max="100" value={targets.mission_internal} onChange={(event) => onTargetChange("mission_internal", event.target.value)} /></label><button className="reset-quota" onClick={onReset}><RotateCcw size={16} /> Réinitialiser</button></div>
      </div>
      <div className="table-wrap"><table className="quota-table"><thead><tr><th>Utilisateur</th><th>Recommandation</th><th>Recommandation PCS EXP</th><th>Observations HDR + SO</th><th>Missions internes</th><th>Statut global</th><th>Gestion</th></tr></thead><tbody>
        {team.map((user) => {
          const counts = quotas.counts?.[user.id] || {};
          const isAbsent = user.presence === "absent";
          const isExempted = quotas.exemptions?.[user.id] === true;
          const categoryCounts = { recommendation: counts.recommendation || 0, pcs_exp: counts.pcs_exp || 0, observations: (counts.observation_hdr || 0) + (counts.observation_so || 0), mission_internal: counts.mission_internal || 0 };
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
          return <tr className={isAbsent || isExempted ? "quota-row-inactive" : ""} key={user.id}><td><div className="user-cell"><span className={`avatar small ${ROLES[user.role].tone}`}>{initials(user)}</span><div><strong>{user.firstName} {user.lastName}</strong><small>{user.grade || GRADES[0]}</small></div></div></td><td>{quotaCell("recommendation")}</td><td>{quotaCell("pcs_exp")}</td><td>{quotaCell("observations", `HDR : ${counts.observation_hdr || 0} • SO : ${counts.observation_so || 0}`)}</td><td>{quotaCell("mission_internal")}</td><td><span className={`quota-status ${quotaStatus.tone}`}>{quotaStatus.icon}{quotaStatus.label}</span></td><td><button className={`quota-exemption ${isExempted ? "active" : ""}`} type="button" onClick={() => onToggleExemption(user.id)}>{isExempted ? <UserCheck size={15} /> : <ShieldCheck size={15} />}{isExempted ? "Retirer l’exemption" : "Exempter"}</button></td></tr>;
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
  const canValidate = ["admin", "referent"].includes(session.role);
  const displayedMissions = canValidate ? missions : missions.filter((mission) => mission.userId === session.id);

  function submit(event) {
    event.preventDefault();
    try {
      const parsedUrl = new URL(documentUrl);
      if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "docs.google.com" || !parsedUrl.pathname.startsWith("/document/")) throw new Error();
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

function ChatPanel({ session, users, chats, onStart, onCreateGroup, onSend, onEditMessage, onDeleteMessage, onDeleteChat }) {
  const isModerator = ["admin", "referent"].includes(session.role);
  const availableContacts = users.filter((user) => user.id !== session.id && !user.blocked);
  const supportContacts = availableContacts.filter((user) => ["admin", "referent"].includes(user.role));
  const visibleChats = useMemo(() => isModerator ? chats : chats.filter((chat) => chat.participants.includes(session.id)), [chats, isModerator, session.id]);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [contactId, setContactId] = useState(availableContacts[0]?.id || "");
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupError, setGroupError] = useState("");
  const [editingMessageId, setEditingMessageId] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState("");
  const editorRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const savedRangeRef = useRef(null);
  const selectedChat = visibleChats.find((chat) => chat.id === selectedChatId);
  const canParticipate = selectedChat?.participants.includes(session.id);

  useEffect(() => {
    if (selectedChatId && !visibleChats.some((chat) => chat.id === selectedChatId)) setSelectedChatId("");
  }, [visibleChats, selectedChatId]);

  useEffect(() => {
    if (!availableContacts.some((user) => user.id === contactId)) setContactId(availableContacts[0]?.id || "");
  }, [availableContacts, contactId]);

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
    if (!groupMembers.length) return setGroupError("Sélectionnez au moins un autre membre.");
    const groupId = onCreateGroup(groupName.trim(), groupMembers);
    if (!groupId) return setGroupError("Impossible de créer ce groupe.");
    setSelectedChatId(groupId);
    setGroupName("");
    setGroupMembers([]);
    setGroupError("");
    setGroupOpen(false);
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
      const allowedExtension = /\.(png|jpe?g|webp|gif|pdf|txt|docx?|xlsx?|pptx?)$/i.test(file.name);
      if (!CHAT_ATTACHMENT_TYPES.has(file.type) && !allowedExtension) {
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
        if (String(dataUrl).startsWith("data:;base64,")) dataUrl = String(dataUrl).replace("data:;base64,", "data:application/octet-stream;base64,");
        accepted.push({ id: crypto.randomUUID(), name: file.name, type: file.type || "application/octet-stream", size: file.size, dataUrl });
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
        <div className="chat-start"><label>Contacter un membre</label><div className="chat-start-row"><select value={contactId} onChange={(event) => setContactId(event.target.value)} disabled={!availableContacts.length}>{availableContacts.map((user) => <option value={user.id} key={user.id}>{user.firstName} {user.lastName} — {ROLES[user.role].label}</option>)}</select><button className="primary" type="button" disabled={!contactId} onClick={() => openChat(contactId)}><MessageSquareText size={16} /> Ouvrir</button></div><button className="create-group-toggle" type="button" onClick={() => setGroupOpen((open) => !open)}><UsersRound size={16} /> {groupOpen ? "Fermer la création" : "Créer un groupe"}</button>{groupOpen && <form className="group-form" onSubmit={createGroup}><label>Nom du groupe</label><input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={60} placeholder="Ex. Équipe Alpha" required /><label>Membres du groupe</label><div className="group-member-list">{availableContacts.map((user) => <label key={user.id}><input type="checkbox" checked={groupMembers.includes(user.id)} onChange={() => toggleGroupMember(user.id)} /><span className={`avatar small ${ROLES[user.role].tone}`}>{initials(user)}</span><span>{user.firstName} {user.lastName}<small>{ROLES[user.role].label}</small></span></label>)}</div>{groupError && <p className="form-error">{groupError}</p>}<button className="primary wide" type="submit"><UsersRound size={16} /> Créer le groupe</button></form>}</div>
        <div className="referent-contact"><div><p className="eyebrow dark">CONTACT RAPIDE</p><strong>Contacter un Référent SO ou un Admin</strong></div>{supportContacts.length ? supportContacts.map((contact) => <button type="button" key={contact.id} onClick={() => openChat(contact.id)}><span className={`avatar small ${ROLES[contact.role].tone}`}>{initials(contact)}</span><span>{contact.firstName} {contact.lastName}<small>{contact.role === "admin" ? "Admin · Contact Référent SO" : `${contact.grade || GRADES[0]} · Référent SO`}</small></span><Send size={15} /></button>) : <p className="chat-empty-small">{isModerator ? "Vous êtes actuellement le contact Référent SO principal." : "Aucun contact Référent SO disponible."}</p>}</div>
        <div className="conversation-picker"><div className="conversation-list-title"><p className="eyebrow dark">{isModerator ? "TOUTES LES DISCUSSIONS" : "MES DISCUSSIONS"}</p>{isModerator && <span>Modération</span>}</div><label>Accéder à une discussion</label><select value={selectedChatId} onChange={(event) => { clearEditor(); setSelectedChatId(event.target.value); }}><option value="">Choisir une discussion…</option>{visibleChats.map((chat) => <option value={chat.id} key={chat.id}>{chat.type === "group" ? "Groupe · " : "Discussion · "}{chatMeta(chat).title}</option>)}</select>{selectedChat ? <small>{selectedChat.messages.length} message{selectedChat.messages.length > 1 ? "s" : ""}{selectedChat.messages.at(-1)?.attachments?.length ? ` · ${selectedChat.messages.at(-1).attachments.length} pièce(s) jointe(s) dans le dernier message` : ""}</small> : <p className="chat-empty-small">Aucune discussion sélectionnée.</p>}</div>
      </aside>
      <div className="chat-conversation-card">
        {selectedChat ? <>
          <div className="conversation-head">
            {selectedMeta.group ? <span className="group-avatar"><UsersRound size={19} /></span> : selectedMeta.moderated ? <span className="group-avatar"><ShieldCheck size={19} /></span> : <span className={`avatar ${selectedMeta.other ? ROLES[selectedMeta.other.role].tone : "blue"}`}>{selectedMeta.other ? initials(selectedMeta.other) : "?"}</span>}
            <div><strong>{selectedMeta.title}</strong><small>{selectedMeta.subtitle}</small></div>
            <div className="conversation-head-actions">{isModerator && !canParticipate && <span className="moderation-chip"><ShieldCheck size={14} /> Consultation de modération</span>}<button className="delete-conversation" type="button" onClick={() => onDeleteChat(selectedChat.id)}><Trash2 size={16} /> Supprimer</button></div>
          </div>
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

function SergeantReportPanel({ users, session, onSuccess }) {
  const sergeants = users.filter((user) => user.role === "officer" && user.grade === "Sergent");
  const [form, setForm] = useState({
    sergeantId: sergeants[0]?.id || "",
    positivePoints: "",
    negativePoints: "",
    globalOpinion: "",
    conclusion: REPORT_CONCLUSIONS[0],
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    const selectedSergeant = sergeants.find((user) => user.id === form.sergeantId);
    if (!selectedSergeant) return setError("Sélectionnez un Sergent inscrit sur le site.");
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "sergeant_report",
          values: {
            sergeantName: `${selectedSergeant.firstName} ${selectedSergeant.lastName}`,
            positivePoints: form.positivePoints,
            negativePoints: form.negativePoints,
            globalOpinion: form.globalOpinion,
            conclusion: form.conclusion,
          },
          submittedBy: { name: `${session.firstName} ${session.lastName}`, role: ROLES[session.role].label },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Envoi impossible.");
      setForm((current) => ({ ...current, positivePoints: "", negativePoints: "", globalOpinion: "", conclusion: REPORT_CONCLUSIONS[0] }));
      onSuccess("Le rapport du nouveau Sous-Officier a été envoyé sur Discord.");
    } catch (submissionError) {
      setError(submissionError.message || "Une erreur est survenue pendant l’envoi.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="transmissions-layout single">
      <div className="transmission-card report-card">
        <div className="transmission-head"><span className="category-icon large gold"><FileText size={25} /></span><div><p className="eyebrow dark">NOUVEAU RAPPORT</p><h2>Rapport nouveau Sous-Officier</h2><p className="muted">Évaluez la semaine de test d’un Sergent inscrit sur le portail.</p></div></div>
        <form onSubmit={submit}>
          <label>Nom du Sergent</label>
          <select value={form.sergeantId} onChange={(event) => set("sergeantId", event.target.value)} required disabled={!sergeants.length}>
            {!sergeants.length && <option value="">Aucun Sergent disponible</option>}
            {sergeants.map((user) => <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>)}
          </select>
          {!sergeants.length && <p className="form-warning">Créez d’abord un compte de niveau Sous-Officier avec le grade Sergent.</p>}
          <label>Point positif</label><textarea value={form.positivePoints} onChange={(event) => set("positivePoints", event.target.value)} required maxLength={1000} rows={4} placeholder="Décrivez les points positifs observés…" />
          <label>Point négatif</label><textarea value={form.negativePoints} onChange={(event) => set("negativePoints", event.target.value)} required maxLength={1000} rows={4} placeholder="Décrivez les axes d’amélioration…" />
          <label>Avis global</label><textarea value={form.globalOpinion} onChange={(event) => set("globalOpinion", event.target.value)} required maxLength={1000} rows={5} placeholder="Rédigez votre avis général sur la semaine de test…" />
          <label>Conclusion</label><select value={form.conclusion} onChange={(event) => set("conclusion", event.target.value)} required>{REPORT_CONCLUSIONS.map((conclusion) => <option key={conclusion} value={conclusion}>{conclusion}</option>)}</select>
          {error && <p className="form-error transmission-error">{error}</p>}
          <div className="transmission-actions"><span><ShieldCheck size={15} /> Envoi sécurisé vers le salon dédié</span><button className="primary" type="submit" disabled={sending || !sergeants.length}><Send size={17} />{sending ? "Envoi en cours…" : "Envoyer le rapport"}</button></div>
        </form>
      </div>
    </section>
  );
}

function TransmissionPanel({ session, onSuccess, type }) {
  const [form, setForm] = useState({
    aitName: "",
    author: `${session.firstName} ${session.lastName}`,
    reason: "",
    observation: "positive",
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const selected = TRANSMISSION_TYPES[type];
  const SelectedIcon = selected.icon;
  const isObservation = ["observation_hdr", "observation_so"].includes(type);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      setForm((current) => ({ ...current, aitName: "", reason: "", observation: "positive" }));
      onSuccess(`${selected.title} envoyée sur Discord.`, type);
    } catch (submissionError) {
      setError(submissionError.message || "Une erreur est survenue pendant l’envoi.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="transmissions-layout single">
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

          {error && <p className="form-error transmission-error">{error}</p>}
          <div className="transmission-actions"><span><ShieldCheck size={15} /> Envoi sécurisé via le serveur</span><button className="primary" type="submit" disabled={sending}><Send size={17} />{sending ? "Envoi en cours…" : "Envoyer sur Discord"}</button></div>
        </form>
      </div>
    </section>
  );
}

function App() {
  const [users, setUsers] = useState([]);
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState("");
  const [activeSection, setActiveSection] = useState("home");
  const [openGroups, setOpenGroups] = useState({ admin: true, referent: false, global: true, senior: false, chat: true });
  const [profileOpen, setProfileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [quotas, setQuotas] = useState(DEFAULT_QUOTAS);
  const [missions, setMissions] = useState([]);
  const [chats, setChats] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    let loadedUsers = stored ? JSON.parse(stored) : INITIAL_USERS;
    if (localStorage.getItem(ADMIN_RECOVERY_KEY) !== "done") {
      const defaultAdmin = INITIAL_USERS[0];
      const hasAdmin = loadedUsers.some((user) => user.role === "admin");
      loadedUsers = hasAdmin
        ? loadedUsers.map((user) => user.role === "admin" ? { ...user, email: defaultAdmin.email, password: defaultAdmin.password } : user)
        : [defaultAdmin, ...loadedUsers];
      localStorage.setItem(ADMIN_RECOVERY_KEY, "done");
    }
    const normalizedUsers = loadedUsers.map(({ discordId: _discardedDiscordId, status: _discardedStatus, ...user }) => ({
      ...user,
      blocked: user.blocked === true,
      grade: user.grade || GRADES[0],
      ...(["senior", "officer"].includes(user.role) ? { presence: user.presence || "present" } : {}),
    }));
    setUsers(normalizedUsers);
    const rememberedSessionId = localStorage.getItem(SESSION_KEY);
    const rememberedUser = normalizedUsers.find((user) => user.id === rememberedSessionId && !user.blocked);
    if (rememberedUser) {
      setSession(rememberedUser);
      setActiveSection("home");
    } else if (rememberedSessionId) {
      localStorage.removeItem(SESSION_KEY);
    }
    const savedTheme = localStorage.getItem(THEME_KEY) === "dark";
    const savedQuotas = localStorage.getItem(QUOTA_KEY);
    const savedMissions = localStorage.getItem(MISSIONS_KEY);
    const savedChats = localStorage.getItem(CHAT_KEY);
    const savedLogs = localStorage.getItem(LOG_KEY);
    const parsedQuotas = savedQuotas ? JSON.parse(savedQuotas) : DEFAULT_QUOTAS;
    setQuotas({ targets: { ...DEFAULT_QUOTAS.targets, ...parsedQuotas.targets }, counts: parsedQuotas.counts || {}, exemptions: parsedQuotas.exemptions || {} });
    setMissions(savedMissions ? JSON.parse(savedMissions) : []);
    setChats(savedChats ? JSON.parse(savedChats) : []);
    setAuditLogs(savedLogs ? JSON.parse(savedLogs) : []);
    setDarkMode(savedTheme);
    document.documentElement.dataset.theme = savedTheme ? "dark" : "light";
    setReady(true);
  }, []);

  useEffect(() => { if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(users)); }, [users, ready]);
  useEffect(() => { if (ready) localStorage.setItem(QUOTA_KEY, JSON.stringify(quotas)); }, [quotas, ready]);
  useEffect(() => { if (ready) localStorage.setItem(MISSIONS_KEY, JSON.stringify(missions)); }, [missions, ready]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(chats)); }
    catch { flash("Stockage du chat saturé : supprimez d’anciennes pièces jointes."); }
  }, [chats, ready]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(LOG_KEY, JSON.stringify(auditLogs)); } catch { /* Conserve l’application fonctionnelle si le stockage est plein. */ }
  }, [auditLogs, ready]);
  useEffect(() => {
    function syncAccounts(event) {
      if (event.key === SESSION_KEY && !event.newValue) {
        setSession(null);
        setProfileOpen(false);
        setLoginError("");
        return;
      }
      if (event.key === CHAT_KEY && event.newValue) {
        try { setChats(JSON.parse(event.newValue)); } catch { /* Ignore une discussion invalide. */ }
        return;
      }
      if (event.key === LOG_KEY && event.newValue) {
        try { setAuditLogs(JSON.parse(event.newValue)); } catch { /* Ignore un journal invalide. */ }
        return;
      }
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const syncedUsers = JSON.parse(event.newValue);
        setUsers(syncedUsers);
        setSession((currentSession) => {
          if (!currentSession) return currentSession;
          const syncedSession = syncedUsers.find((user) => user.id === currentSession.id);
          if (!syncedSession || syncedSession.blocked) {
            localStorage.removeItem(SESSION_KEY);
            setProfileOpen(false);
            setLoginError(syncedSession?.blocked ? "Votre compte a été bloqué par un administrateur." : "Votre compte n’est plus disponible.");
            return null;
          }
          return syncedSession;
        });
      } catch {
        // Ignore une mise à jour de stockage invalide.
      }
    }
    window.addEventListener("storage", syncAccounts);
    return () => window.removeEventListener("storage", syncAccounts);
  }, []);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    localStorage.setItem(THEME_KEY, darkMode ? "dark" : "light");
  }, [darkMode, ready]);

  const canManage = session && ["admin", "referent"].includes(session.role);
  const manageable = (user) => session?.role === "admin" ? user.role !== "admin" : ["senior", "officer"].includes(user.role);
  const visibleUsers = useMemo(() => users.filter((user) => {
    const text = `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (roleFilter === "all" || user.role === roleFilter);
  }), [users, query, roleFilter]);

  function addLog(category, action, details = "", actor = session) {
    const now = new Date();
    const entry = { id: crypto.randomUUID(), createdAt: now.toISOString(), displayAt: new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "medium" }).format(now), actorId: actor?.id || "system", actorName: actor ? `${actor.firstName} ${actor.lastName}` : "Système", actorRole: actor?.role || "", category, action, details };
    setAuditLogs((current) => [entry, ...current].slice(0, 500));
  }
  function clearAuditLogs() {
    if (session.role !== "admin" || !confirm("Réinitialiser définitivement le journal des logs ?")) return;
    setAuditLogs([]);
    addLog("system", "Journal des logs réinitialisé", "L’historique précédent a été supprimé.");
    flash("Le journal des logs a été réinitialisé.");
  }
  function flash(message) { setNotice(message); window.setTimeout(() => setNotice(""), 2500); }
  function transmissionSuccess(message, type) {
    flash(message);
    addLog("form", "Formulaire envoyé", TRANSMISSION_TYPES[type]?.title || type);
    if (!QUOTA_TYPES.includes(type) || !["senior", "officer"].includes(session.role)) return;
    setQuotas((current) => {
      const userCounts = current.counts?.[session.id] || {};
      return { ...current, counts: { ...current.counts, [session.id]: { ...userCounts, [type]: (userCounts[type] || 0) + 1 } } };
    });
  }
  function sergeantReportSuccess(message) {
    flash(message);
    addLog("form", "Rapport nouveau Sous-Officier envoyé");
  }
  function changeQuotaTarget(category, value) {
    const parsedTarget = Number.parseInt(value, 10);
    const target = Math.max(0, Math.min(100, Number.isNaN(parsedTarget) ? 0 : parsedTarget));
    setQuotas((current) => ({ ...current, targets: { ...current.targets, [category]: target } }));
    addLog("quota", "Objectif de quota modifié", `${category} : ${target}`);
  }
  function resetQuotas() {
    if (!confirm("Réinitialiser tous les compteurs de quotas à zéro ?")) return;
    setQuotas((current) => ({ ...current, counts: {} }));
    addLog("quota", "Compteurs de quotas réinitialisés");
    flash("Les quotas ont été réinitialisés.");
  }
  function toggleQuotaExemption(userId) {
    if (!["admin", "referent"].includes(session.role)) return;
    const targetUser = users.find((user) => user.id === userId);
    const willExempt = !quotas.exemptions?.[userId];
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
    if (!["admin", "referent"].includes(session.role)) return;
    const mission = missions.find((item) => item.id === missionId);
    if (!mission || mission.status !== "pending") return;
    setMissions((current) => current.map((item) => item.id === missionId ? { ...item, status: "validated", validatedBy: `${session.firstName} ${session.lastName}`, validatedAt: new Date().toISOString() } : item));
    setQuotas((current) => {
      const userCounts = current.counts?.[mission.userId] || {};
      return { ...current, counts: { ...current.counts, [mission.userId]: { ...userCounts, mission_internal: (userCounts.mission_internal || 0) + 1 } } };
    });
    addLog("mission", "Mission interne validée", `${mission.title} · ${mission.userName}`);
    flash("La mission interne est validée et ajoutée au quota.");
  }
  function rejectMission(missionId) {
    if (!["admin", "referent"].includes(session.role)) return;
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
    if (!["admin", "referent"].includes(session.role)) return;
    if (!confirm("Réinitialiser tous les documents de missions internes ? Les quotas déjà validés resteront inchangés.")) return;
    const removedCount = missions.length;
    setMissions([]);
    addLog("mission", "Documents de missions réinitialisés", `${removedCount} document${removedCount > 1 ? "s" : ""} supprimé${removedCount > 1 ? "s" : ""}`);
    flash("Les documents de missions internes ont été réinitialisés.");
  }
  function startChat(otherUserId) {
    const contact = users.find((user) => user.id === otherUserId && user.id !== session.id && !user.blocked);
    if (!contact) return "";
    const existingChat = chats.find((chat) => chat.participants.length === 2 && chat.participants.includes(session.id) && chat.participants.includes(otherUserId));
    if (existingChat) return existingChat.id;
    const chatId = crypto.randomUUID();
    setChats((current) => [{ id: chatId, type: "direct", participants: [session.id, otherUserId], messages: [], updatedAt: new Date().toISOString() }, ...current]);
    addLog("chat", "Discussion privée créée", `Avec ${contact.firstName} ${contact.lastName}`);
    return chatId;
  }
  function createChatGroup(name, memberIds) {
    const validMemberIds = [...new Set(memberIds)].filter((id) => users.some((user) => user.id === id && user.id !== session.id && !user.blocked));
    if (!name || !validMemberIds.length) return "";
    const chatId = crypto.randomUUID();
    setChats((current) => [{ id: chatId, type: "group", name, createdBy: session.id, participants: [session.id, ...validMemberIds], messages: [], updatedAt: new Date().toISOString() }, ...current]);
    addLog("chat", "Groupe créé", `${name} · ${validMemberIds.length + 1} membres`);
    return chatId;
  }
  function sendChatMessage(chatId, html, text, attachments = []) {
    setChats((current) => {
      const chat = current.find((item) => item.id === chatId && item.participants.includes(session.id));
      if (!chat) return current;
      const message = { id: crypto.randomUUID(), senderId: session.id, senderName: `${session.firstName} ${session.lastName}`, html: sanitizeChatHtml(html), text, attachments, sentAt: new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date()) };
      const updatedChat = { ...chat, messages: [...chat.messages, message], updatedAt: new Date().toISOString() };
      return [updatedChat, ...current.filter((item) => item.id !== chatId)];
    });
    addLog("chat", "Message envoyé", `${attachments.length ? `${attachments.length} pièce${attachments.length > 1 ? "s" : ""} jointe${attachments.length > 1 ? "s" : ""}` : "Sans pièce jointe"}`);
  }
  function editChatMessage(chatId, messageId, html, text) {
    setChats((current) => current.map((chat) => chat.id !== chatId ? chat : { ...chat, messages: chat.messages.map((message) => message.id === messageId && message.senderId === session.id ? { ...message, html: sanitizeChatHtml(html), text, editedAt: new Date().toISOString() } : message), updatedAt: new Date().toISOString() }));
    addLog("chat", "Message modifié");
  }
  function deleteChatMessage(chatId, messageId) {
    const chat = chats.find((item) => item.id === chatId);
    const message = chat?.messages.find((item) => item.id === messageId);
    const canModerate = ["admin", "referent"].includes(session.role);
    if (!message || (message.senderId !== session.id && !canModerate) || !confirm("Supprimer ce message ?")) return;
    setChats((current) => current.map((item) => item.id === chatId ? { ...item, messages: item.messages.filter((entry) => entry.id !== messageId), updatedAt: new Date().toISOString() } : item));
    addLog("chat", canModerate && message.senderId !== session.id ? "Message supprimé par modération" : "Message supprimé", `Auteur : ${message.senderName}`);
  }
  function deleteChat(chatId) {
    const chat = chats.find((item) => item.id === chatId);
    const canModerate = ["admin", "referent"].includes(session.role);
    if (!chat || (!chat.participants.includes(session.id) && !canModerate) || !confirm("Supprimer définitivement cette conversation et tous ses messages ?")) return;
    setChats((current) => current.filter((item) => item.id !== chatId));
    addLog("chat", "Conversation supprimée", `${chat.type === "group" ? chat.name || "Groupe" : "Discussion privée"} · ${chat.messages.length} messages`);
    flash("La conversation a été supprimée.");
  }
  function toggleGroup(group) { setOpenGroups((current) => ({ ...current, [group]: !current[group] })); }
  function login(email, password) {
    const user = users.find((item) => item.email.toLowerCase() === email.toLowerCase() && item.password === password);
    if (!user) return setLoginError("Identifiants incorrects.");
    if (user.blocked) return setLoginError("Ce compte est bloqué. Contactez un administrateur.");
    localStorage.setItem(SESSION_KEY, user.id);
    addLog("auth", "Connexion au portail", "Connexion réussie", user);
    setLoginError(""); setSession(user); setActiveSection("home");
  }
  function logout() {
    addLog("auth", "Déconnexion du portail");
    localStorage.removeItem(SESSION_KEY);
    setProfileOpen(false);
    setLoginError("");
    setSession(null);
  }
  function saveUser(form) {
    const savedForm = { ...form };
    if (["senior", "officer"].includes(savedForm.role)) savedForm.presence ||= "present";
    else delete savedForm.presence;
    if (modal?.id) {
      const editedUser = users.find((user) => user.id === modal.id);
      setUsers((current) => current.map((user) => user.id === modal.id ? { ...user, ...savedForm, password: savedForm.password || user.password } : user));
      addLog("account", "Compte modifié", editedUser ? `${editedUser.firstName} ${editedUser.lastName}` : `${savedForm.firstName} ${savedForm.lastName}`);
      flash("Le compte a bien été modifié.");
    } else {
      setUsers((current) => [...current, { ...savedForm, blocked: false, id: crypto.randomUUID(), createdAt: new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date()) }]);
      addLog("account", "Compte créé", `${savedForm.firstName} ${savedForm.lastName} · ${ROLES[savedForm.role].label}`);
      flash("Le compte a bien été créé.");
    }
    setModal(null);
  }
  function removeUser(user) {
    if (!manageable(user) || !confirm(`Supprimer le compte de ${user.firstName} ${user.lastName} ?`)) return;
    setUsers((current) => current.filter((item) => item.id !== user.id)); addLog("account", "Compte supprimé", `${user.firstName} ${user.lastName}`); flash("Le compte a été supprimé.");
  }
  function changePresence(userId, presence) {
    const targetUser = users.find((user) => user.id === userId);
    setUsers((current) => current.map((user) => user.id === userId ? { ...user, presence } : user));
    addLog("presence", "Présence modifiée", `${targetUser ? `${targetUser.firstName} ${targetUser.lastName}` : "Compte inconnu"} · ${presence === "present" ? "Présent" : "Absent"}`);
    flash(presence === "present" ? "La personne est indiquée présente." : "La personne est indiquée absente.");
  }
  function toggleAccountBlock(user) {
    if (session.role !== "admin" || user.id === session.id || user.role === "admin") return;
    const willBlock = !user.blocked;
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, blocked: willBlock } : item));
    addLog("account", willBlock ? "Compte bloqué" : "Compte débloqué", `${user.firstName} ${user.lastName}`);
    flash(willBlock ? "Le compte a été bloqué et ses sessions seront fermées." : "Le compte a été débloqué.");
  }
  function saveProfile(form) {
    const updated = { ...session, ...form, password: form.password || session.password };
    setUsers((current) => current.map((user) => user.id === session.id ? updated : user));
    setSession(updated);
    setProfileOpen(false);
    addLog("profile", "Profil personnel modifié", `${updated.firstName} ${updated.lastName}`);
    flash("Votre profil a bien été mis à jour.");
  }

  if (!ready) return null;
  if (!session) return <Login onLogin={login} error={loginError} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row"><div className="brand-mark"><ShieldCheck size={23} /></div><div><strong>Portail SO</strong><small>Espace sécurisé</small></div></div>
        <nav>
          <button className={`menu-item standalone-nav ${activeSection === "home" ? "active" : ""}`} onClick={() => setActiveSection("home")}><Home size={18} /> Accueil</button>
          {session.role === "admin" && <MenuGroup title="Admin" icon={ShieldCheck} open={openGroups.admin} onToggle={() => toggleGroup("admin")}><button className={`menu-item ${activeSection === "dashboard" ? "active" : ""}`} onClick={() => setActiveSection("dashboard")}><LayoutDashboard size={17} /> Tableau de bord</button></MenuGroup>}
          {["admin", "referent"].includes(session.role) && <MenuGroup title="Référent SO" icon={UsersRound} open={openGroups.referent} onToggle={() => toggleGroup("referent")}><button className={`menu-item ${activeSection === "presence" ? "active" : ""}`} onClick={() => setActiveSection("presence")}><UserCheck size={17} /> Présences</button><button className={`menu-item ${activeSection === "quotas" ? "active" : ""}`} onClick={() => setActiveSection("quotas")}><Gauge size={17} /> Quotas</button></MenuGroup>}
          <MenuGroup title="Globale" icon={Send} open={openGroups.global} onToggle={() => toggleGroup("global")}><button className={`menu-item ${activeSection === "recommendation" ? "active" : ""}`} onClick={() => setActiveSection("recommendation")}><Medal size={17} /> Recommandation</button><button className={`menu-item ${activeSection === "pcs_exp" ? "active" : ""}`} onClick={() => setActiveSection("pcs_exp")}><ClipboardCheck size={17} /> Recommandation PCS EXP</button><button className={`menu-item ${activeSection === "observation_hdr" ? "active" : ""}`} onClick={() => setActiveSection("observation_hdr")}><MessageSquareText size={17} /> Observation HDR</button><button className={`menu-item ${activeSection === "mission_internal" ? "active" : ""}`} onClick={() => setActiveSection("mission_internal")}><FileText size={17} /> Mission interne</button></MenuGroup>
          {["admin", "referent", "senior"].includes(session.role) && <MenuGroup title="Sous-Officier Supérieur" icon={BadgeCheck} open={openGroups.senior} onToggle={() => toggleGroup("senior")}><button className={`menu-item ${activeSection === "observation_so" ? "active" : ""}`} onClick={() => setActiveSection("observation_so")}><MessageSquareText size={17} /> Observation SO</button><button className={`menu-item ${activeSection === "sergeant_report" ? "active" : ""}`} onClick={() => setActiveSection("sergeant_report")}><FileText size={17} /> Rapport nouveau SO</button></MenuGroup>}
          <MenuGroup title="Chat" icon={MessageSquareText} open={openGroups.chat} onToggle={() => toggleGroup("chat")}><button className={`menu-item ${activeSection === "chat" ? "active" : ""}`} onClick={() => setActiveSection("chat")}><Send size={17} /> Messagerie</button></MenuGroup>
          {["admin", "referent"].includes(session.role) && <button className={`menu-item standalone-nav logs-nav ${activeSection === "logs" ? "active" : ""}`} onClick={() => setActiveSection("logs")}><ScrollText size={18} /> Logs</button>}
        </nav>
        <button className="profile-card" onClick={() => setProfileOpen(true)} title="Personnaliser mon compte"><div className={`avatar ${ROLES[session.role].tone}`}>{initials(session)}</div><div><strong>{session.firstName} {session.lastName}</strong><small>{session.grade || GRADES[0]} · {ROLES[session.role].label}</small></div><ChevronDown size={16} /></button>
        <div className="sidebar-actions">
          <button className="logout" onClick={logout}><LogOut size={18} /><span>Se déconnecter</span></button>
          <label className="theme-toggle" title={darkMode ? "Passer en mode clair" : "Passer en mode sombre"}>
            <input type="checkbox" checked={darkMode} onChange={(event) => setDarkMode(event.target.checked)} aria-label="Activer le mode sombre" />
            {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            <i aria-hidden="true"><span /></i>
          </label>
        </div>
      </aside>

      <main className="content">
        <div className="mobile-section-nav"><label>Rubrique</label><select value={activeSection} onChange={(event) => setActiveSection(event.target.value)}><optgroup label="Menu"><option value="home">Accueil</option></optgroup>{session.role === "admin" && <optgroup label="Admin"><option value="dashboard">Tableau de bord</option></optgroup>}{["admin", "referent"].includes(session.role) && <optgroup label="Référent SO"><option value="presence">Présences</option><option value="quotas">Quotas</option></optgroup>}<optgroup label="Globale"><option value="recommendation">Recommandation</option><option value="pcs_exp">Recommandation PCS EXP</option><option value="observation_hdr">Observation HDR</option><option value="mission_internal">Mission interne</option></optgroup>{["admin", "referent", "senior"].includes(session.role) && <optgroup label="Sous-Officier Supérieur"><option value="observation_so">Observation SO</option><option value="sergeant_report">Rapport nouveau Sous-Officier</option></optgroup>}<optgroup label="Chat"><option value="chat">Messagerie</option></optgroup>{["admin", "referent"].includes(session.role) && <optgroup label="Journal"><option value="logs">Logs</option></optgroup>}</select></div>
        {activeSection === "home" ? <header><div><p className="eyebrow dark">MENU PRINCIPAL</p><h1>Accueil</h1><p className="muted">Retrouvez vos informations importantes et vos raccourcis.</p></div><span className="all-access"><Bell size={16} /> Centre d’informations</span></header> : activeSection === "logs" ? <header><div><p className="eyebrow dark">SUIVI DU PORTAIL</p><h1>Logs</h1><p className="muted">Consultez les actions importantes réalisées sur le portail.</p></div><span className="referent-access"><ScrollText size={16} /> Admin & Référent SO</span></header> : activeSection === "dashboard" ? <header><div><p className="eyebrow dark">PORTAIL DE GESTION</p><h1>Bonjour, {session.firstName}</h1><p className="muted">Gérez les accès et gardez une vue claire sur votre équipe.</p></div>{canManage && <button className="primary" onClick={() => setModal({ type: "create" })}><Plus size={18} /> Nouveau compte</button>}</header> : activeSection === "presence" ? <header><div><p className="eyebrow dark">RÉFÉRENT SO</p><h1>Présences</h1><p className="muted">Suivez la présence des Sous-Officiers de votre équipe.</p></div><span className="referent-access"><ShieldCheck size={16} /> Gestion Référent SO</span></header> : activeSection === "quotas" ? <header><div><p className="eyebrow dark">RÉFÉRENT SO</p><h1>Quotas</h1><p className="muted">Suivez le volume de transmissions réalisé par chaque Sous-Officier.</p></div><span className="referent-access"><Gauge size={16} /> Gestion Référent SO</span></header> : activeSection === "mission_internal" ? <header><div><p className="eyebrow dark">ESPACE PARTAGÉ</p><h1>Mission interne</h1><p className="muted">Déposez et validez les Google Docs des missions internes.</p></div><span className="all-access"><FileText size={16} /> Dépôt et validation</span></header> : activeSection === "chat" ? <header><div><p className="eyebrow dark">CHAT INTERNE</p><h1>Messagerie</h1><p className="muted">Échangez avec un membre du portail ou contactez un Référent SO.</p></div><span className="all-access"><MessageSquareText size={16} /> Accessible à tous les comptes</span></header> : activeSection === "observation_so" ? <header><div><p className="eyebrow dark">SOUS-OFFICIER SUPÉRIEUR</p><h1>{TRANSMISSION_TYPES[activeSection].title}</h1><p className="muted">{TRANSMISSION_TYPES[activeSection].description}</p></div><span className="senior-access"><BadgeCheck size={16} /> Accès Sous-Officiers Supérieurs</span></header> : activeSection === "sergeant_report" ? <header><div><p className="eyebrow dark">SOUS-OFFICIER SUPÉRIEUR</p><h1>Rapport nouveau Sous-Officier</h1><p className="muted">Évaluez et concluez la semaine de test d’un nouveau Sergent.</p></div><span className="senior-access"><BadgeCheck size={16} /> Accès Sous-Officiers Supérieurs</span></header> : <header><div><p className="eyebrow dark">ESPACE PARTAGÉ</p><h1>{TRANSMISSION_TYPES[activeSection].title}</h1><p className="muted">{TRANSMISSION_TYPES[activeSection].description}</p></div><span className="all-access"><UsersRound size={16} /> Accessible à tous les rôles</span></header>}

        {activeSection === "home" ? <HomePanel session={session} users={users} missions={missions} chats={chats} quotas={quotas} logs={auditLogs} onNavigate={setActiveSection} /> : activeSection === "logs" ? <LogsPanel session={session} logs={auditLogs} onClear={clearAuditLogs} /> : activeSection === "dashboard" ? <>
        <section className="stats">
          <article><span className="stat-icon blue"><UsersRound /></span><div><strong>{users.length}</strong><small>Comptes au total</small></div><span className="trend">Tous niveaux</span></article>
          <article><span className="stat-icon red"><UserX /></span><div><strong>{users.filter((user) => user.blocked).length}</strong><small>Comptes bloqués</small></div><span className="trend">Accès suspendu</span></article>
          <article><span className="stat-icon violet"><ShieldCheck /></span><div><strong>{users.filter((u) => ["admin", "referent"].includes(u.role)).length}</strong><small>Gestionnaires</small></div><span className="trend">Admin & Référent</span></article>
        </section>

        <section className="accounts-card">
          <div className="card-head"><div><h2>Comptes utilisateurs</h2><p className="muted">{visibleUsers.length} compte{visibleUsers.length > 1 ? "s" : ""} affiché{visibleUsers.length > 1 ? "s" : ""}</p></div><div className="filters"><div className="search"><Search size={17} /><input placeholder="Rechercher un compte…" value={query} onChange={(e) => setQuery(e.target.value)} /></div><select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option value="all">Tous les niveaux</option>{Object.entries(ROLES).map(([key, role]) => <option value={key} key={key}>{role.label}</option>)}</select></div></div>
          <div className="table-wrap"><table><thead><tr><th>Utilisateur</th><th>Grade</th><th>Niveau d’accès</th><th>État du compte</th><th>Création</th><th></th></tr></thead><tbody>{visibleUsers.map((user) => <tr key={user.id}><td><div className="user-cell"><span className={`avatar small ${ROLES[user.role].tone}`}>{initials(user)}</span><div><strong>{user.firstName} {user.lastName}</strong><small>{user.email}</small></div></div></td><td><span className="grade-badge">{user.grade || GRADES[0]}</span></td><td><RoleBadge role={user.role} /></td><td>{user.role === "admin" ? <span className="account-state active"><UserCheck size={15} /> Compte actif</span> : <button className={`account-state ${user.blocked ? "blocked" : "active"}`} type="button" onClick={() => toggleAccountBlock(user)}>{user.blocked ? <UserX size={15} /> : <UserCheck size={15} />}{user.blocked ? "Compte bloqué" : "Compte actif"}</button>}</td><td>{user.createdAt}</td><td><div className="row-actions">{canManage && manageable(user) ? <><button className="icon-button" title="Modifier" onClick={() => setModal(user)}><Pencil size={17} /></button><button className="icon-button danger" title="Supprimer" onClick={() => removeUser(user)}><Trash2 size={17} /></button></> : <span className="locked">Protégé</span>}</div></td></tr>)}</tbody></table></div>
        </section>
        </> : activeSection === "presence" ? <PresencePanel users={users} onChange={changePresence} /> : activeSection === "quotas" ? <QuotaPanel users={users} quotas={quotas} onTargetChange={changeQuotaTarget} onReset={resetQuotas} onToggleExemption={toggleQuotaExemption} /> : activeSection === "mission_internal" ? <MissionInternalPanel session={session} missions={missions} onSubmit={submitMission} onValidate={validateMission} onReject={rejectMission} onDelete={deleteMission} onReset={resetMissions} /> : activeSection === "chat" ? <ChatPanel session={session} users={users} chats={chats} onStart={startChat} onCreateGroup={createChatGroup} onSend={sendChatMessage} onEditMessage={editChatMessage} onDeleteMessage={deleteChatMessage} onDeleteChat={deleteChat} /> : activeSection === "sergeant_report" ? <SergeantReportPanel users={users} session={session} onSuccess={sergeantReportSuccess} /> : <TransmissionPanel key={activeSection} session={session} onSuccess={transmissionSuccess} type={activeSection} />}
      </main>
      {notice && <div className="toast"><BadgeCheck size={19} />{notice}</div>}
      {modal && <UserModal actor={session} editing={modal.id ? modal : null} onClose={() => setModal(null)} onSave={saveUser} />}
      {profileOpen && <ProfileModal user={session} onClose={() => setProfileOpen(false)} onSave={saveProfile} />}
    </div>
  );
}

export default App;
