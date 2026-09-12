"use client";

import { useMemo, useState } from "react";
import { CalendarCheck2, CalendarClock, CheckCircle2, Clock3, Plus, Trash2, UserRound, UsersRound, XCircle } from "lucide-react";

const REASONS = {
  test_end: "Fin de période d’essai",
  senior_entry: "Entrée chez les Sous-Officiers Supérieurs",
  monthly: "Suivi mensuel",
};

const STATUS = {
  to_book: "À réserver",
  booked: "Rendez-vous fixé",
  completed: "Terminé",
};

const GRADE_ORDER = [
  "Sergent", "Sergent-Chef", "Adjudant", "Adjudant-Chef", "Major", "Élève Officier", "Aspirant",
  "Sous-Lieutenant", "Lieutenant", "Capitaine", "Vice-Commandant", "Commandant", "Lieutenant-Colonel",
  "Colonel", "Général", "Maréchal",
];

function parisDay() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function memberName(member) {
  if (!member) return "Membre introuvable";
  return `${member.grade ? `${member.grade} ` : ""}${member.firstName || ""} ${member.lastName || ""}`.trim();
}

function compareMembersByGrade(left, right) {
  const leftGrade = Math.max(0, GRADE_ORDER.indexOf(left?.grade || GRADE_ORDER[0]));
  const rightGrade = Math.max(0, GRADE_ORDER.indexOf(right?.grade || GRADE_ORDER[0]));
  const gradeDifference = rightGrade - leftGrade;
  if (gradeDifference) return gradeDifference;
  return memberName(left).localeCompare(memberName(right), "fr", { sensitivity: "base" });
}

function memberInitials(member) {
  return `${member?.firstName?.[0] || ""}${member?.lastName?.[0] || ""}`.toUpperCase() || "?";
}

function ProfileAvatar({ member, size = "" }) {
  const classes = ["interview-avatar", size].filter(Boolean).join(" ");
  return <span className={classes}>{memberInitials(member)}{member?.avatarUrl ? <img src={member.avatarUrl} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}</span>;
}

function MemberIdentity({ member, label, compact = false }) {
  return <span className={`interview-person ${compact ? "compact" : ""}`}><ProfileAvatar member={member} size={compact ? "small" : ""} /><span>{label && <small>{label}</small>}<strong>{memberName(member)}</strong></span></span>;
}

function displayDate(date) {
  if (!date) return "Date à préciser";
  try { return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(new Date(`${date}T12:00:00Z`)); }
  catch { return date; }
}

function displaySlot(slot) {
  try {
    return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(slot.startsAt));
  } catch { return "Créneau à préciser"; }
}

function dayKey(slot) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(slot.startsAt));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shortTime(slot) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(slot.startsAt));
}

function dueText(requirement) {
  const current = parisDay();
  if (!requirement?.dueDate) return "Échéance à définir";
  if (requirement.dueDate < current) return `En retard depuis le ${displayDate(requirement.dueDate)}`;
  if (requirement.dueDate === current) return "À réserver aujourd’hui";
  const days = Math.round((new Date(`${requirement.dueDate}T12:00:00Z`).getTime() - new Date(`${current}T12:00:00Z`).getTime()) / 86_400_000);
  return days === 1 ? "À réserver demain" : `À réserver dans ${days} jours`;
}

function RequirementPill({ requirement }) {
  return <span className={`interview-status ${requirement.status}`}><i />{STATUS[requirement.status] || "À suivre"}</span>;
}

function EmptyState({ title, text }) {
  return <div className="interview-empty"><CalendarCheck2 size={25} /><strong>{title}</strong><p>{text}</p></div>;
}

async function runAction(setBusy, key, action, values) {
  setBusy(key);
  try { await action(values); }
  finally { setBusy(""); }
}

export function InterviewBookingPanel({ session, users, interviews, onAction }) {
  const [busy, setBusy] = useState("");
  const requirements = Array.isArray(interviews?.requirements) ? interviews.requirements : [];
  const bookings = Array.isArray(interviews?.bookings) ? interviews.bookings : [];
  const slots = Array.isArray(interviews?.slots) ? interviews.slots : [];
  const current = requirements.find((item) => item.status !== "completed") || null;
  const booking = current ? bookings.find((item) => item.requirementId === current.id) : null;
  const slotById = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);
  const usersById = useMemo(() => new Map(users.map((user) => [String(user.id), user])), [users]);
  const availableSlots = slots.filter((slot) => !bookings.some((item) => item.slotId === slot.id) && new Date(slot.startsAt).getTime() > Date.now());
  const groupedSlots = useMemo(() => availableSlots.reduce((groups, slot) => {
    const key = dayKey(slot);
    if (!groups[key]) groups[key] = [];
    groups[key].push(slot);
    return groups;
  }, {}), [availableSlots]);
  const completed = requirements.filter((item) => item.status === "completed").slice(-4).reverse();
  const bookedSlot = booking ? slotById.get(booking.slotId) : null;
  const bookedInterviewer = bookedSlot ? usersById.get(String(bookedSlot.interviewerId)) : null;

  return <div className="interview-page">
    <section className="interview-hero">
      <div className="interview-hero-icon"><CalendarClock size={27} /></div>
      <div><p className="eyebrow dark">SUIVI INDIVIDUEL</p><h2>Mes entretiens</h2><p>Réservez votre créneau dès qu’une échéance vous est attribuée par l’équipe Référent SO.</p></div>
      <div className="interview-hero-state"><strong>{current ? STATUS[current.status] : "À jour"}</strong><span>{current ? dueText(current) : "Aucun rendez-vous à prévoir"}</span></div>
    </section>

    <div className="interview-booking-grid">
      <section className="interview-card interview-current-card">
        <div className="interview-card-head"><div><p className="eyebrow dark">PROCHAIN ÉCHANGE</p><h2>{current ? REASONS[current.reason] : "Aucun entretien à planifier"}</h2></div>{current && <RequirementPill requirement={current} />}</div>
        {current ? <>
          <div className="interview-deadline"><CalendarClock size={19} /><div><strong>{dueText(current)}</strong><span>Échéance : {displayDate(current.dueDate)}</span></div></div>
          {booking ? <div className="interview-booked"><CheckCircle2 size={21} /><div className="interview-booked-details"><strong>Votre rendez-vous est confirmé</strong><span>{displaySlot(bookedSlot || {})}</span>{bookedInterviewer && <MemberIdentity member={bookedInterviewer} label="Votre responsable" compact />}</div><button type="button" className="text-danger" disabled={busy === booking.id} onClick={() => { if (window.confirm("Annuler ce rendez-vous ?")) runAction(setBusy, booking.id, onAction, { action: "cancel_interview_booking", bookingId: booking.id }); }}><XCircle size={15} /> Annuler</button></div> : <p className="interview-guidance">Choisissez un créneau et son responsable. Chaque rendez-vous dure 15 minutes.</p>}
        </> : <EmptyState title="Votre suivi est à jour" text="Une nouvelle échéance apparaîtra ici lorsqu’un entretien devra être planifié." />}
      </section>

      <section className="interview-card interview-history-card">
        <div className="interview-card-head"><div><p className="eyebrow dark">HISTORIQUE</p><h2>Suivi précédent</h2></div><span className="interview-count">{completed.length}</span></div>
        <div className="interview-history-list">{completed.map((item) => { const interviewer = usersById.get(String(item.completedBy)); return <article key={item.id}><span className="interview-history-dot"><CheckCircle2 size={14} /></span><div><strong>{REASONS[item.reason]}</strong><small>Réalisé le {item.completedAt ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" }).format(new Date(item.completedAt)) : "—"}{interviewer ? ` · avec ${memberName(interviewer)}` : ""}</small>{item.completionNote && <p>{item.completionNote}</p>}</div></article>; })}{!completed.length && <p className="interview-history-empty">Aucun entretien n’est encore enregistré.</p>}</div>
      </section>
    </div>

    {current?.status === "to_book" && <section className="interview-card interview-slots-card">
      <div className="interview-card-head"><div><p className="eyebrow dark">DISPONIBILITÉS</p><h2>Choisir un créneau</h2><p>Les créneaux affichés sont disponibles à la réservation.</p></div><span className="interview-duration"><Clock3 size={15} /> 15 min</span></div>
      {Object.keys(groupedSlots).length ? <div className="interview-slot-days">{Object.entries(groupedSlots).map(([day, daySlots]) => <article key={day}><strong>{displayDate(day)}</strong><div>{daySlots.map((slot) => { const interviewer = usersById.get(String(slot.interviewerId)); return <button key={slot.id} className="interview-slot-button" type="button" disabled={Boolean(busy)} onClick={() => runAction(setBusy, slot.id, onAction, { action: "book_interview", requirementId: current.id, slotId: slot.id })}><Clock3 size={15} /><span><b>{shortTime(slot)}</b><small>{interviewer ? `Avec ${memberName(interviewer)}` : "Responsable à confirmer"}</small></span>{interviewer && <ProfileAvatar member={interviewer} size="small" />}</button>; })}</div></article>)}</div> : <EmptyState title="Aucun créneau disponible" text="Les responsables n’ont pas encore ouvert de disponibilité. Revenez un peu plus tard." />}
    </section>}
  </div>;
}

export function InterviewManagementPanel({ session, users, interviews, onAction }) {
  const [busy, setBusy] = useState("");
  const [slotForm, setSlotForm] = useState({ date: parisDay(), startTime: "15:00", endTime: "16:00" });
  const usersById = useMemo(() => new Map(users.map((user) => [String(user.id), user])), [users]);
  const members = useMemo(() => users.filter((user) => ["officer", "senior"].includes(user.role) && user.approvalStatus === "approved" && !user.blocked).sort(compareMembersByGrade), [users]);
  const [requirementForm, setRequirementForm] = useState({ memberId: "", reason: "monthly", dueDate: parisDay() });
  const requirements = Array.isArray(interviews?.requirements) ? [...interviews.requirements] : [];
  const slots = Array.isArray(interviews?.slots) ? interviews.slots : [];
  const bookings = Array.isArray(interviews?.bookings) ? interviews.bookings : [];
  const slotsById = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);
  const bookingByRequirement = useMemo(() => new Map(bookings.map((booking) => [booking.requirementId, booking])), [bookings]);
  const openRequirements = requirements.filter((item) => item.status !== "completed").sort((left, right) => {
    const gradeDifference = compareMembersByGrade(usersById.get(String(left.memberId)), usersById.get(String(right.memberId)));
    return gradeDifference || String(left.dueDate).localeCompare(String(right.dueDate));
  });
  const completedRequirements = requirements.filter((item) => item.status === "completed");
  const upcomingSlots = slots.filter((slot) => new Date(slot.startsAt).getTime() > Date.now() - 60_000).slice(0, 20);

  async function addSlots(event) {
    event.preventDefault();
    await runAction(setBusy, "slot-form", onAction, { action: "create_interview_slot", ...slotForm });
  }
  async function addRequirement(event) {
    event.preventDefault();
    if (!requirementForm.memberId) return;
    await runAction(setBusy, "requirement-form", onAction, { action: "create_interview_requirement", ...requirementForm });
  }
  async function complete(requirement) {
    const note = window.prompt("Compte rendu de l’entretien (facultatif) :", "");
    if (note === null) return;
    await runAction(setBusy, requirement.id, onAction, { action: "complete_interview", requirementId: requirement.id, note });
  }

  return <div className="interview-page interview-management-page">
    <section className="interview-hero">
      <div className="interview-hero-icon"><UsersRound size={27} /></div>
      <div><p className="eyebrow dark">RÉFÉRENT SO</p><h2>Gestion des entretiens</h2><p>Ouvrez des créneaux, suivez les rendez-vous et gardez une vue claire sur les prochaines échéances.</p></div>
      <div className="interview-hero-counters"><span><strong>{openRequirements.filter((item) => item.status === "to_book").length}</strong> à réserver</span><span><strong>{openRequirements.filter((item) => item.status === "booked").length}</strong> fixés</span><span><strong>{completedRequirements.length}</strong> terminés</span></div>
    </section>

    <div className="interview-management-forms">
      <section className="interview-card"><div className="interview-card-head"><div><p className="eyebrow dark">DISPONIBILITÉS</p><h2>Ouvrir mes créneaux</h2><p>Une plage est automatiquement découpée en rendez-vous de 15 minutes.</p></div><span className="interview-icon-box"><Plus size={18} /></span></div><form className="interview-form" onSubmit={addSlots}><div className="interview-host-note"><MemberIdentity member={session} label="Les rendez-vous seront proposés avec" compact /></div><label>Date<input type="date" value={slotForm.date} min={parisDay()} onChange={(event) => setSlotForm((current) => ({ ...current, date: event.target.value }))} required /></label><div className="interview-time-grid"><label>Début<input type="time" step="900" value={slotForm.startTime} onChange={(event) => setSlotForm((current) => ({ ...current, startTime: event.target.value }))} required /></label><label>Fin<input type="time" step="900" value={slotForm.endTime} onChange={(event) => setSlotForm((current) => ({ ...current, endTime: event.target.value }))} required /></label></div><button className="primary" type="submit" disabled={busy === "slot-form"}><CalendarClock size={17} />{busy === "slot-form" ? "Création…" : "Créer mes créneaux"}</button></form></section>
      <section className="interview-card"><div className="interview-card-head"><div><p className="eyebrow dark">SUIVI MANUEL</p><h2>Ajouter une échéance</h2><p>Pour un entretien exceptionnel ou pour démarrer le suivi d’un membre.</p></div><span className="interview-icon-box"><UserRound size={18} /></span></div><form className="interview-form" onSubmit={addRequirement}><label>Membre<select value={requirementForm.memberId} onChange={(event) => setRequirementForm((current) => ({ ...current, memberId: event.target.value }))} required><option value="">Choisir un Sous-Officier…</option>{members.map((member) => <option value={member.id} key={member.id}>{memberName(member)}</option>)}</select></label><div className="interview-time-grid"><label>Motif<select value={requirementForm.reason} onChange={(event) => setRequirementForm((current) => ({ ...current, reason: event.target.value }))}>{Object.entries(REASONS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Échéance<input type="date" value={requirementForm.dueDate} onChange={(event) => setRequirementForm((current) => ({ ...current, dueDate: event.target.value }))} required /></label></div><button className="secondary" type="submit" disabled={!requirementForm.memberId || busy === "requirement-form"}><Plus size={17} />{busy === "requirement-form" ? "Ajout…" : "Ajouter l’échéance"}</button></form></section>
    </div>

    <section className="interview-card interview-dashboard-card"><div className="interview-card-head"><div><p className="eyebrow dark">TABLEAU DE SUIVI</p><h2>État des entretiens</h2><p>Les échéances mensuelles sont recalculées automatiquement après chaque entretien clôturé.</p></div><span className="interview-count">{openRequirements.length}</span></div><div className="table-wrap"><table className="interview-table"><thead><tr><th>Membre</th><th>Motif</th><th>Échéance</th><th>Rendez-vous</th><th>Responsable</th><th>État</th><th aria-label="Actions" /></tr></thead><tbody>{openRequirements.map((requirement) => { const member = usersById.get(String(requirement.memberId)); const booking = bookingByRequirement.get(requirement.id); const slot = booking ? slotsById.get(booking.slotId) : null; const interviewer = slot ? usersById.get(String(slot.interviewerId)) : null; return <tr key={requirement.id}><td><div className="interview-member"><ProfileAvatar member={member} size="small" /><div><strong>{memberName(member)}</strong><small>{member ? (member.role === "senior" ? "Sous-Officier Supérieur" : "Sous-Officier") : "Compte supprimé"}</small></div></div></td><td><strong>{REASONS[requirement.reason]}</strong></td><td><span className={`interview-due ${requirement.dueDate < parisDay() ? "late" : ""}`}>{dueText(requirement)}</span></td><td>{slot ? <span className="interview-appointment"><Clock3 size={14} />{displaySlot(slot)}</span> : <span className="interview-no-appointment">En attente du membre</span>}</td><td>{interviewer ? <MemberIdentity member={interviewer} label="Entretien avec" compact /> : <span className="interview-no-appointment">À définir</span>}</td><td><RequirementPill requirement={requirement} /></td><td><div className="interview-row-actions">{booking && <button className="icon-button" type="button" title="Annuler le rendez-vous" disabled={busy === booking.id} onClick={() => { if (window.confirm("Annuler ce rendez-vous ?")) runAction(setBusy, booking.id, onAction, { action: "cancel_interview_booking", bookingId: booking.id }); }}><XCircle size={16} /></button>}<button className="secondary interview-complete" type="button" disabled={busy === requirement.id} onClick={() => complete(requirement)}><CheckCircle2 size={15} /> Clôturer</button></div></td></tr>; })}{!openRequirements.length && <tr><td colSpan="7"><EmptyState title="Aucune échéance en attente" text="Les prochains suivis apparaîtront ici automatiquement." /></td></tr>}</tbody></table></div></section>

    <section className="interview-card interview-availability-card"><div className="interview-card-head"><div><p className="eyebrow dark">CRÉNEAUX OUVERTS</p><h2>Disponibilités à venir</h2><p>Chaque créneau indique le responsable qui recevra le membre.</p></div><span className="interview-duration"><Clock3 size={15} /> 15 min</span></div><div className="interview-availability-list">{upcomingSlots.map((slot) => { const booking = bookings.find((item) => item.slotId === slot.id); const member = booking ? usersById.get(String(booking.memberId)) : null; const interviewer = usersById.get(String(slot.interviewerId)); const creator = usersById.get(String(slot.createdBy)); return <article key={slot.id}><div className="interview-slot-summary"><strong>{displaySlot(slot)}</strong>{interviewer && <MemberIdentity member={interviewer} label="Entretien assuré par" compact />}{creator && creator.id !== interviewer?.id && <small>Créneau ouvert par {memberName(creator)}</small>}</div>{booking ? <div className="interview-booking-owner">{member && <MemberIdentity member={member} label="Réservé par" compact />}<span className="interview-status booked"><i />Réservé</span></div> : <div className="interview-booking-owner"><span className="interview-status to_book"><i />Disponible</span><button className="icon-button danger" type="button" title="Retirer ce créneau" disabled={busy === slot.id} onClick={() => { if (window.confirm("Retirer ce créneau disponible ?")) runAction(setBusy, slot.id, onAction, { action: "delete_interview_slot", slotId: slot.id }); }}><Trash2 size={16} /></button></div>}</article>; })}{!upcomingSlots.length && <EmptyState title="Aucune disponibilité ouverte" text="Créez une première plage pour permettre les prises de rendez-vous." />}</div></section>
  </div>;
}
