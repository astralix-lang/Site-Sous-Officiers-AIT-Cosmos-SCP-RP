"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  ClipboardCheck,
  ChevronDown,
  FileText,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Medal,
  MessageSquareText,
  Moon,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sun,
  Trash2,
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
const THEME_KEY = "portail-so-theme";
const ADMIN_RECOVERY_KEY = "portail-so-admin-recovery-v1";
const QUOTA_KEY = "portail-so-quotas-v1";
const DEFAULT_QUOTAS = { targets: { recommendation: 1, pcs_exp: 1, observations: 1 }, counts: {} };
const QUOTA_TYPES = ["recommendation", "pcs_exp", "observation_hdr", "observation_so"];
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

function QuotaPanel({ users, quotas, onTargetChange, onReset }) {
  const team = users.filter((user) => ["senior", "officer"].includes(user.role));
  const targets = { ...DEFAULT_QUOTAS.targets, ...quotas.targets };

  return (
    <section className="quota-card">
      <div className="quota-head">
        <div><p className="eyebrow dark">SUIVI DES TRANSMISSIONS</p><h2>Quotas par catégorie</h2><p className="muted">Définissez un objectif distinct pour les recommandations, PCS EXP et observations.</p></div>
        <div className="quota-controls"><label>Recommandation<input type="number" min="1" max="100" value={targets.recommendation} onChange={(event) => onTargetChange("recommendation", event.target.value)} /></label><label>PCS EXP<input type="number" min="1" max="100" value={targets.pcs_exp} onChange={(event) => onTargetChange("pcs_exp", event.target.value)} /></label><label>Observations<input type="number" min="1" max="100" value={targets.observations} onChange={(event) => onTargetChange("observations", event.target.value)} /></label><button className="reset-quota" onClick={onReset}><RotateCcw size={16} /> Réinitialiser</button></div>
      </div>
      <div className="table-wrap"><table className="quota-table"><thead><tr><th>Utilisateur</th><th>Recommandation</th><th>Recommandation PCS EXP</th><th>Observations HDR + SO</th><th>Statut global</th></tr></thead><tbody>
        {team.map((user) => {
          const counts = quotas.counts?.[user.id] || {};
          const categoryCounts = { recommendation: counts.recommendation || 0, pcs_exp: counts.pcs_exp || 0, observations: (counts.observation_hdr || 0) + (counts.observation_so || 0) };
          const completed = Object.keys(targets).every((category) => categoryCounts[category] >= targets[category]);
          const quotaCell = (category, detail = "") => {
            const count = categoryCounts[category];
            const target = targets[category];
            const done = count >= target;
            const percentage = Math.min(100, Math.round((count / target) * 100));
            return <div className="quota-category"><div className="quota-category-top"><strong>{count}/{target}</strong><span className={done ? "done" : "pending"}>{done ? "Fait" : "Non fait"}</span></div><div className="quota-progress"><i><span style={{ width: `${percentage}%` }} /></i><small>{percentage}%</small></div>{detail && <small className="quota-detail">{detail}</small>}</div>;
          };
          return <tr key={user.id}><td><div className="user-cell"><span className={`avatar small ${ROLES[user.role].tone}`}>{initials(user)}</span><div><strong>{user.firstName} {user.lastName}</strong><small>{user.grade || GRADES[0]}</small></div></div></td><td>{quotaCell("recommendation")}</td><td>{quotaCell("pcs_exp")}</td><td>{quotaCell("observations", `HDR : ${counts.observation_hdr || 0} • SO : ${counts.observation_so || 0}`)}</td><td><span className={`quota-status ${completed ? "done" : "pending"}`}>{completed ? <BadgeCheck size={15} /> : <X size={15} />}{completed ? "Fait" : "Non fait"}</span></td></tr>;
        })}
        {!team.length && <tr><td colSpan="5" className="empty-presence">Aucun Sous-Officier à afficher.</td></tr>}
      </tbody></table></div>
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
  const [activeSection, setActiveSection] = useState("dashboard");
  const [openGroups, setOpenGroups] = useState({ admin: true, referent: false, global: true, senior: false });
  const [profileOpen, setProfileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [quotas, setQuotas] = useState(DEFAULT_QUOTAS);

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
    setUsers(loadedUsers.map(({ discordId: _discardedDiscordId, status: _discardedStatus, ...user }) => ({
      ...user,
      grade: user.grade || GRADES[0],
      ...(["senior", "officer"].includes(user.role) ? { presence: user.presence || "present" } : {}),
    })));
    const savedTheme = localStorage.getItem(THEME_KEY) === "dark";
    const savedQuotas = localStorage.getItem(QUOTA_KEY);
    const parsedQuotas = savedQuotas ? JSON.parse(savedQuotas) : DEFAULT_QUOTAS;
    setQuotas({ targets: { ...DEFAULT_QUOTAS.targets, ...parsedQuotas.targets }, counts: parsedQuotas.counts || {} });
    setDarkMode(savedTheme);
    document.documentElement.dataset.theme = savedTheme ? "dark" : "light";
    setReady(true);
  }, []);

  useEffect(() => { if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(users)); }, [users, ready]);
  useEffect(() => { if (ready) localStorage.setItem(QUOTA_KEY, JSON.stringify(quotas)); }, [quotas, ready]);
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

  function flash(message) { setNotice(message); window.setTimeout(() => setNotice(""), 2500); }
  function transmissionSuccess(message, type) {
    flash(message);
    if (!QUOTA_TYPES.includes(type) || !["senior", "officer"].includes(session.role)) return;
    setQuotas((current) => {
      const userCounts = current.counts?.[session.id] || {};
      return { ...current, counts: { ...current.counts, [session.id]: { ...userCounts, [type]: (userCounts[type] || 0) + 1 } } };
    });
  }
  function changeQuotaTarget(category, value) {
    const target = Math.max(1, Math.min(100, Number.parseInt(value, 10) || 1));
    setQuotas((current) => ({ ...current, targets: { ...current.targets, [category]: target } }));
  }
  function resetQuotas() {
    if (!confirm("Réinitialiser tous les compteurs de quotas à zéro ?")) return;
    setQuotas((current) => ({ ...current, counts: {} }));
    flash("Les quotas ont été réinitialisés.");
  }
  function toggleGroup(group) { setOpenGroups((current) => ({ ...current, [group]: !current[group] })); }
  function login(email, password) {
    const user = users.find((item) => item.email.toLowerCase() === email.toLowerCase() && item.password === password);
    if (!user) return setLoginError("Identifiants incorrects.");
    setLoginError(""); setSession(user); setActiveSection(user.role === "admin" ? "dashboard" : "recommendation");
  }
  function saveUser(form) {
    const savedForm = { ...form };
    if (["senior", "officer"].includes(savedForm.role)) savedForm.presence ||= "present";
    else delete savedForm.presence;
    if (modal?.id) {
      setUsers((current) => current.map((user) => user.id === modal.id ? { ...user, ...savedForm, password: savedForm.password || user.password } : user));
      flash("Le compte a bien été modifié.");
    } else {
      setUsers((current) => [...current, { ...savedForm, id: crypto.randomUUID(), createdAt: new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date()) }]);
      flash("Le compte a bien été créé.");
    }
    setModal(null);
  }
  function removeUser(user) {
    if (!manageable(user) || !confirm(`Supprimer le compte de ${user.firstName} ${user.lastName} ?`)) return;
    setUsers((current) => current.filter((item) => item.id !== user.id)); flash("Le compte a été supprimé.");
  }
  function changePresence(userId, presence) {
    setUsers((current) => current.map((user) => user.id === userId ? { ...user, presence } : user));
    flash(presence === "present" ? "La personne est indiquée présente." : "La personne est indiquée absente.");
  }
  function saveProfile(form) {
    const updated = { ...session, ...form, password: form.password || session.password };
    setUsers((current) => current.map((user) => user.id === session.id ? updated : user));
    setSession(updated);
    setProfileOpen(false);
    flash("Votre profil a bien été mis à jour.");
  }

  if (!ready) return null;
  if (!session) return <Login onLogin={login} error={loginError} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row"><div className="brand-mark"><ShieldCheck size={23} /></div><div><strong>Portail SO</strong><small>Espace sécurisé</small></div></div>
        <nav>
          {session.role === "admin" && <MenuGroup title="Admin" icon={ShieldCheck} open={openGroups.admin} onToggle={() => toggleGroup("admin")}><button className={`menu-item ${activeSection === "dashboard" ? "active" : ""}`} onClick={() => setActiveSection("dashboard")}><LayoutDashboard size={17} /> Tableau de bord</button></MenuGroup>}
          {["admin", "referent"].includes(session.role) && <MenuGroup title="Référent SO" icon={UsersRound} open={openGroups.referent} onToggle={() => toggleGroup("referent")}><button className={`menu-item ${activeSection === "presence" ? "active" : ""}`} onClick={() => setActiveSection("presence")}><UserCheck size={17} /> Présences</button><button className={`menu-item ${activeSection === "quotas" ? "active" : ""}`} onClick={() => setActiveSection("quotas")}><Gauge size={17} /> Quotas</button></MenuGroup>}
          <MenuGroup title="Globale" icon={Send} open={openGroups.global} onToggle={() => toggleGroup("global")}><button className={`menu-item ${activeSection === "recommendation" ? "active" : ""}`} onClick={() => setActiveSection("recommendation")}><Medal size={17} /> Recommandation</button><button className={`menu-item ${activeSection === "pcs_exp" ? "active" : ""}`} onClick={() => setActiveSection("pcs_exp")}><ClipboardCheck size={17} /> Recommandation PCS EXP</button><button className={`menu-item ${activeSection === "observation_hdr" ? "active" : ""}`} onClick={() => setActiveSection("observation_hdr")}><MessageSquareText size={17} /> Observation HDR</button></MenuGroup>
          {["admin", "referent", "senior"].includes(session.role) && <MenuGroup title="Sous-Officier Supérieur" icon={BadgeCheck} open={openGroups.senior} onToggle={() => toggleGroup("senior")}><button className={`menu-item ${activeSection === "observation_so" ? "active" : ""}`} onClick={() => setActiveSection("observation_so")}><MessageSquareText size={17} /> Observation SO</button><button className={`menu-item ${activeSection === "sergeant_report" ? "active" : ""}`} onClick={() => setActiveSection("sergeant_report")}><FileText size={17} /> Rapport nouveau SO</button></MenuGroup>}
        </nav>
        <button className="profile-card" onClick={() => setProfileOpen(true)} title="Personnaliser mon compte"><div className={`avatar ${ROLES[session.role].tone}`}>{initials(session)}</div><div><strong>{session.firstName} {session.lastName}</strong><small>{session.grade || GRADES[0]} · {ROLES[session.role].label}</small></div><ChevronDown size={16} /></button>
        <div className="sidebar-actions">
          <button className="logout" onClick={() => setSession(null)}><LogOut size={18} /><span>Se déconnecter</span></button>
          <label className="theme-toggle" title={darkMode ? "Passer en mode clair" : "Passer en mode sombre"}>
            <input type="checkbox" checked={darkMode} onChange={(event) => setDarkMode(event.target.checked)} aria-label="Activer le mode sombre" />
            {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            <i aria-hidden="true"><span /></i>
          </label>
        </div>
      </aside>

      <main className="content">
        <div className="mobile-section-nav"><label>Rubrique</label><select value={activeSection} onChange={(event) => setActiveSection(event.target.value)}>{session.role === "admin" && <optgroup label="Admin"><option value="dashboard">Tableau de bord</option></optgroup>}{["admin", "referent"].includes(session.role) && <optgroup label="Référent SO"><option value="presence">Présences</option><option value="quotas">Quotas</option></optgroup>}<optgroup label="Globale"><option value="recommendation">Recommandation</option><option value="pcs_exp">Recommandation PCS EXP</option><option value="observation_hdr">Observation HDR</option></optgroup>{["admin", "referent", "senior"].includes(session.role) && <optgroup label="Sous-Officier Supérieur"><option value="observation_so">Observation SO</option><option value="sergeant_report">Rapport nouveau Sous-Officier</option></optgroup>}</select></div>
        {activeSection === "dashboard" ? <header><div><p className="eyebrow dark">PORTAIL DE GESTION</p><h1>Bonjour, {session.firstName}</h1><p className="muted">Gérez les accès et gardez une vue claire sur votre équipe.</p></div>{canManage && <button className="primary" onClick={() => setModal({ type: "create" })}><Plus size={18} /> Nouveau compte</button>}</header> : activeSection === "presence" ? <header><div><p className="eyebrow dark">RÉFÉRENT SO</p><h1>Présences</h1><p className="muted">Suivez la présence des Sous-Officiers de votre équipe.</p></div><span className="referent-access"><ShieldCheck size={16} /> Gestion Référent SO</span></header> : activeSection === "quotas" ? <header><div><p className="eyebrow dark">RÉFÉRENT SO</p><h1>Quotas</h1><p className="muted">Suivez le volume de transmissions réalisé par chaque Sous-Officier.</p></div><span className="referent-access"><Gauge size={16} /> Gestion Référent SO</span></header> : activeSection === "sergeant_report" ? <header><div><p className="eyebrow dark">SOUS-OFFICIER SUPÉRIEUR</p><h1>Rapport nouveau Sous-Officier</h1><p className="muted">Évaluez et concluez la semaine de test d’un nouveau Sergent.</p></div><span className="senior-access"><BadgeCheck size={16} /> Accès supérieur</span></header> : <header><div><p className="eyebrow dark">ESPACE PARTAGÉ</p><h1>{TRANSMISSION_TYPES[activeSection].title}</h1><p className="muted">{TRANSMISSION_TYPES[activeSection].description}</p></div><span className="all-access"><UsersRound size={16} /> Accessible à tous les rôles</span></header>}

        {activeSection === "dashboard" ? <>
        <section className="stats">
          <article><span className="stat-icon blue"><UsersRound /></span><div><strong>{users.length}</strong><small>Comptes au total</small></div><span className="trend">Tous niveaux</span></article>
          <article><span className="stat-icon green"><UserCheck /></span><div><strong>{users.filter((u) => ["senior", "officer"].includes(u.role) && u.presence !== "absent").length}</strong><small>SO présents</small></div><span className="trend green-text">Disponibles</span></article>
          <article><span className="stat-icon violet"><ShieldCheck /></span><div><strong>{users.filter((u) => ["admin", "referent"].includes(u.role)).length}</strong><small>Gestionnaires</small></div><span className="trend">Admin & Référent</span></article>
        </section>

        <section className="accounts-card">
          <div className="card-head"><div><h2>Comptes utilisateurs</h2><p className="muted">{visibleUsers.length} compte{visibleUsers.length > 1 ? "s" : ""} affiché{visibleUsers.length > 1 ? "s" : ""}</p></div><div className="filters"><div className="search"><Search size={17} /><input placeholder="Rechercher un compte…" value={query} onChange={(e) => setQuery(e.target.value)} /></div><select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option value="all">Tous les niveaux</option>{Object.entries(ROLES).map(([key, role]) => <option value={key} key={key}>{role.label}</option>)}</select></div></div>
          <div className="table-wrap"><table><thead><tr><th>Utilisateur</th><th>Grade</th><th>Niveau d’accès</th><th>Présence</th><th>Création</th><th></th></tr></thead><tbody>{visibleUsers.map((user) => <tr key={user.id}><td><div className="user-cell"><span className={`avatar small ${ROLES[user.role].tone}`}>{initials(user)}</span><div><strong>{user.firstName} {user.lastName}</strong><small>{user.email}</small></div></div></td><td><span className="grade-badge">{user.grade || GRADES[0]}</span></td><td><RoleBadge role={user.role} /></td><td>{["senior", "officer"].includes(user.role) ? <span className={`presence-status ${user.presence === "absent" ? "absent" : "present"}`}><i />{user.presence === "absent" ? "Absent" : "Présent"}</span> : <span className="not-applicable">Non concerné</span>}</td><td>{user.createdAt}</td><td><div className="row-actions">{canManage && manageable(user) ? <><button className="icon-button" title="Modifier" onClick={() => setModal(user)}><Pencil size={17} /></button><button className="icon-button danger" title="Supprimer" onClick={() => removeUser(user)}><Trash2 size={17} /></button></> : <span className="locked">Protégé</span>}</div></td></tr>)}</tbody></table></div>
        </section>
        </> : activeSection === "presence" ? <PresencePanel users={users} onChange={changePresence} /> : activeSection === "quotas" ? <QuotaPanel users={users} quotas={quotas} onTargetChange={changeQuotaTarget} onReset={resetQuotas} /> : activeSection === "sergeant_report" ? <SergeantReportPanel users={users} session={session} onSuccess={flash} /> : <TransmissionPanel key={activeSection} session={session} onSuccess={transmissionSuccess} type={activeSection} />}
      </main>
      {notice && <div className="toast"><BadgeCheck size={19} />{notice}</div>}
      {modal && <UserModal actor={session} editing={modal.id ? modal : null} onClose={() => setModal(null)} onSave={saveUser} />}
      {profileOpen && <ProfileModal user={session} onClose={() => setProfileOpen(false)} onSave={saveProfile} />}
    </div>
  );
}

export default App;
