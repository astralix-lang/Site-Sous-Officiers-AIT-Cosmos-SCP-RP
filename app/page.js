"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  ClipboardCheck,
  ChevronDown,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Medal,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

const ROLES = {
  admin: { label: "Admin", short: "AD", tone: "violet" },
  referent: { label: "Référent SO", short: "RS", tone: "blue" },
  senior: { label: "Sous-Officier Supérieur", short: "SS", tone: "gold" },
  officer: { label: "Sous-Officier", short: "SO", tone: "green" },
};

const INITIAL_USERS = [
  { id: "admin-1", firstName: "Camille", lastName: "Martin", email: "admin@portail-so.fr", role: "admin", password: "Admin2026!", status: "Actif", createdAt: "16 juil. 2026" },
  { id: "ref-1", firstName: "Thomas", lastName: "Bernard", email: "t.bernard@portail-so.fr", role: "referent", password: "Referent2026!", status: "Actif", createdAt: "14 juil. 2026" },
  { id: "senior-1", firstName: "Sophie", lastName: "Dubois", email: "s.dubois@portail-so.fr", role: "senior", password: "SousOff2026!", status: "Actif", createdAt: "12 juil. 2026" },
  { id: "officer-1", firstName: "Julien", lastName: "Moreau", email: "j.moreau@portail-so.fr", role: "officer", password: "SousOff2026!", status: "Actif", createdAt: "9 juil. 2026" },
];

const STORAGE_KEY = "portail-so-users-v1";

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
  const [email, setEmail] = useState("admin@portail-so.fr");
  const [password, setPassword] = useState("Admin2026!");

  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="brand-mark large"><ShieldCheck size={34} /></div>
        <p className="eyebrow">ESPACE SÉCURISÉ</p>
        <h1>Portail<br />Sous-Officiers</h1>
        <p className="brand-copy">Un espace unique pour gérer les accès, les équipes et les responsabilités.</p>
        <div className="role-list">
          {Object.entries(ROLES).map(([key, role]) => <RoleBadge key={key} role={key} />)}
        </div>
        <p className="security-note"><ShieldCheck size={16} /> Accès protégé et données confidentielles</p>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-logo"><div className="brand-mark"><ShieldCheck size={25} /></div><strong>Portail SO</strong></div>
          <p className="eyebrow dark">CONNEXION</p>
          <h2>Bienvenue</h2>
          <p className="muted">Identifiez-vous pour accéder à votre espace.</p>
          <form onSubmit={(event) => { event.preventDefault(); onLogin(email, password); }}>
            <label>Adresse e-mail</label>
            <div className="input-wrap"><UserRound size={19} /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <label>Mot de passe</label>
            <div className="input-wrap"><KeyRound size={19} /><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            {error && <p className="form-error">{error}</p>}
            <button className="primary wide" type="submit">Se connecter <span>→</span></button>
          </form>
          <div className="demo-box"><strong>Compte de démonstration</strong><span>admin@portail-so.fr</span><span>Mot de passe : Admin2026!</span></div>
        </div>
      </section>
    </main>
  );
}

function UserModal({ actor, editing, onClose, onSave }) {
  const allowedRoles = actor.role === "admin" ? ["referent", "senior", "officer"] : ["senior", "officer"];
  const [form, setForm] = useState(editing || { firstName: "", lastName: "", email: "", role: allowedRoles[0], password: "", status: "Actif" });
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
            email: session.email,
            role: ROLES[session.role].label,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Envoi impossible.");
      setForm((current) => ({ ...current, aitName: "", reason: "", observation: "positive" }));
      onSuccess(`${selected.title} envoyée sur Discord.`);
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

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setUsers(stored ? JSON.parse(stored) : INITIAL_USERS);
    setReady(true);
  }, []);

  useEffect(() => { if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(users)); }, [users, ready]);

  const canManage = session && ["admin", "referent"].includes(session.role);
  const manageable = (user) => session?.role === "admin" ? user.role !== "admin" : ["senior", "officer"].includes(user.role);
  const visibleUsers = useMemo(() => users.filter((user) => {
    const text = `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (roleFilter === "all" || user.role === roleFilter);
  }), [users, query, roleFilter]);

  function flash(message) { setNotice(message); window.setTimeout(() => setNotice(""), 2500); }
  function toggleGroup(group) { setOpenGroups((current) => ({ ...current, [group]: !current[group] })); }
  function login(email, password) {
    const user = users.find((item) => item.email.toLowerCase() === email.toLowerCase() && item.password === password && item.status === "Actif");
    if (!user) return setLoginError("Identifiants incorrects ou compte inactif.");
    setLoginError(""); setSession(user); setActiveSection(user.role === "admin" ? "dashboard" : "recommendation");
  }
  function saveUser(form) {
    if (modal?.id) {
      setUsers((current) => current.map((user) => user.id === modal.id ? { ...user, ...form, password: form.password || user.password } : user));
      flash("Le compte a bien été modifié.");
    } else {
      setUsers((current) => [...current, { ...form, id: crypto.randomUUID(), createdAt: new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date()) }]);
      flash("Le compte a bien été créé.");
    }
    setModal(null);
  }
  function removeUser(user) {
    if (!manageable(user) || !confirm(`Supprimer le compte de ${user.firstName} ${user.lastName} ?`)) return;
    setUsers((current) => current.filter((item) => item.id !== user.id)); flash("Le compte a été supprimé.");
  }

  if (!ready) return null;
  if (!session) return <Login onLogin={login} error={loginError} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row"><div className="brand-mark"><ShieldCheck size={23} /></div><div><strong>Portail SO</strong><small>Espace sécurisé</small></div></div>
        <nav>
          {session.role === "admin" && <MenuGroup title="Admin" icon={ShieldCheck} open={openGroups.admin} onToggle={() => toggleGroup("admin")}><button className={`menu-item ${activeSection === "dashboard" ? "active" : ""}`} onClick={() => setActiveSection("dashboard")}><LayoutDashboard size={17} /> Tableau de bord</button></MenuGroup>}
          {["admin", "referent"].includes(session.role) && <MenuGroup title="Référent SO" icon={UsersRound} open={openGroups.referent} onToggle={() => toggleGroup("referent")} />}
          <MenuGroup title="Globale" icon={Send} open={openGroups.global} onToggle={() => toggleGroup("global")}><button className={`menu-item ${activeSection === "recommendation" ? "active" : ""}`} onClick={() => setActiveSection("recommendation")}><Medal size={17} /> Recommandation</button><button className={`menu-item ${activeSection === "pcs_exp" ? "active" : ""}`} onClick={() => setActiveSection("pcs_exp")}><ClipboardCheck size={17} /> Recommandation PCS EXP</button><button className={`menu-item ${activeSection === "observation_hdr" ? "active" : ""}`} onClick={() => setActiveSection("observation_hdr")}><MessageSquareText size={17} /> Observation HDR</button></MenuGroup>
          {["admin", "referent", "senior"].includes(session.role) && <MenuGroup title="Sous-Officier Supérieur" icon={BadgeCheck} open={openGroups.senior} onToggle={() => toggleGroup("senior")}><button className={`menu-item ${activeSection === "observation_so" ? "active" : ""}`} onClick={() => setActiveSection("observation_so")}><MessageSquareText size={17} /> Observation SO</button></MenuGroup>}
        </nav>
        <div className="profile-card"><div className="avatar">{initials(session)}</div><div><strong>{session.firstName} {session.lastName}</strong><small>{ROLES[session.role].label}</small></div><ChevronDown size={16} /></div>
        <button className="logout" onClick={() => setSession(null)}><LogOut size={18} /> Se déconnecter</button>
      </aside>

      <main className="content">
        <div className="mobile-section-nav"><label>Rubrique</label><select value={activeSection} onChange={(event) => setActiveSection(event.target.value)}>{session.role === "admin" && <optgroup label="Admin"><option value="dashboard">Tableau de bord</option></optgroup>}<optgroup label="Globale"><option value="recommendation">Recommandation</option><option value="pcs_exp">Recommandation PCS EXP</option><option value="observation_hdr">Observation HDR</option></optgroup>{["admin", "referent", "senior"].includes(session.role) && <optgroup label="Sous-Officier Supérieur"><option value="observation_so">Observation SO</option></optgroup>}</select></div>
        {activeSection === "dashboard" ? <header><div><p className="eyebrow dark">PORTAIL DE GESTION</p><h1>Bonjour, {session.firstName}</h1><p className="muted">Gérez les accès et gardez une vue claire sur votre équipe.</p></div>{canManage && <button className="primary" onClick={() => setModal({ type: "create" })}><Plus size={18} /> Nouveau compte</button>}</header> : <header><div><p className="eyebrow dark">ESPACE PARTAGÉ</p><h1>{TRANSMISSION_TYPES[activeSection].title}</h1><p className="muted">{TRANSMISSION_TYPES[activeSection].description}</p></div><span className="all-access"><UsersRound size={16} /> Accessible à tous les rôles</span></header>}

        {activeSection === "dashboard" ? <>
        <section className="stats">
          <article><span className="stat-icon blue"><UsersRound /></span><div><strong>{users.length}</strong><small>Comptes au total</small></div><span className="trend">Tous niveaux</span></article>
          <article><span className="stat-icon green"><BadgeCheck /></span><div><strong>{users.filter((u) => u.status === "Actif").length}</strong><small>Comptes actifs</small></div><span className="trend green-text">Opérationnels</span></article>
          <article><span className="stat-icon violet"><ShieldCheck /></span><div><strong>{users.filter((u) => ["admin", "referent"].includes(u.role)).length}</strong><small>Gestionnaires</small></div><span className="trend">Admin & Référent</span></article>
        </section>

        <section className="accounts-card">
          <div className="card-head"><div><h2>Comptes utilisateurs</h2><p className="muted">{visibleUsers.length} compte{visibleUsers.length > 1 ? "s" : ""} affiché{visibleUsers.length > 1 ? "s" : ""}</p></div><div className="filters"><div className="search"><Search size={17} /><input placeholder="Rechercher un compte…" value={query} onChange={(e) => setQuery(e.target.value)} /></div><select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option value="all">Tous les niveaux</option>{Object.entries(ROLES).map(([key, role]) => <option value={key} key={key}>{role.label}</option>)}</select></div></div>
          <div className="table-wrap"><table><thead><tr><th>Utilisateur</th><th>Niveau d’accès</th><th>Statut</th><th>Création</th><th></th></tr></thead><tbody>{visibleUsers.map((user) => <tr key={user.id}><td><div className="user-cell"><span className={`avatar small ${ROLES[user.role].tone}`}>{initials(user)}</span><div><strong>{user.firstName} {user.lastName}</strong><small>{user.email}</small></div></div></td><td><RoleBadge role={user.role} /></td><td><span className="status"><i />{user.status}</span></td><td>{user.createdAt}</td><td><div className="row-actions">{canManage && manageable(user) ? <><button className="icon-button" title="Modifier" onClick={() => setModal(user)}><Pencil size={17} /></button><button className="icon-button danger" title="Supprimer" onClick={() => removeUser(user)}><Trash2 size={17} /></button></> : <span className="locked">Protégé</span>}</div></td></tr>)}</tbody></table></div>
        </section>
        </> : <TransmissionPanel key={activeSection} session={session} onSuccess={flash} type={activeSection} />}
      </main>
      {notice && <div className="toast"><BadgeCheck size={19} />{notice}</div>}
      {modal && <UserModal actor={session} editing={modal.id ? modal : null} onClose={() => setModal(null)} onSave={saveUser} />}
    </div>
  );
}

export default App;
