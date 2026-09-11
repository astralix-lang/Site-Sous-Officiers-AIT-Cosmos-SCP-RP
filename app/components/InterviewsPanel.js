"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Clock3, CheckCircle2, Plus, Search, RefreshCw, X } from "lucide-react";

const REASONS = { test_end: "Fin de test Sergent", senior_entry: "Entrée chez les SO Sup", monthly: "Suivi mensuel" };
const STATES = { booked: "Rendez-vous réservé", completed: "Réalisé", cancelled: "Annulé", no_show: "Rendez-vous manqué" };
const day = (value) => value ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value)) : "—";
const time = (value) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const dateKey = (value = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const today = () => dateKey();
const countdown = (days) => days < 0 ? `${Math.abs(days)} j de retard` : days === 0 ? "Aujourd’hui" : `Dans ${days} jour${days > 1 ? "s" : ""}`;
const statusFor = (member, booking) => booking ? "booked" : member.due.daysUntil < 0 ? "late" : member.due.daysUntil <= 7 ? "soon" : "upcoming";
const STATUS = { booked: "Réservé", late: "En retard", soon: "À planifier", upcoming: "À venir" };

export default function InterviewsPanel({ session, management = false, request, initialData = null }) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedDate, setSelectedDate] = useState("");
  const [availability, setAvailability] = useState({ date: today(), from: "15:00", to: "16:00" });
  const [dialog, setDialog] = useState(null);
  const [notes, setNotes] = useState("");
  const [testDate, setTestDate] = useState("");
  const mounted = useRef(true);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const refresh = useCallback(async (silent = false) => {
    const ticket = ++generation.current;
    try {
      const result = await request("/api/interviews");
      if (mounted.current && ticket === generation.current) { setData(result); if (!silent) setError(""); }
    } catch (err) { if (mounted.current && ticket === generation.current) setError(err.message); }
  }, [request]);
  useEffect(() => {
    mounted.current = true;
    refresh();
    const interval = setInterval(() => { if (!document.hidden && !busyRef.current) refresh(true); }, 30000);
    return () => { mounted.current = false; generation.current++; clearInterval(interval); };
  }, [refresh]);
  async function mutate(payload) {
    if (busyRef.current) return;
    busyRef.current = true; generation.current++;
    setBusy(true); setError(""); setSuccess("");
    try {
      const result = await request("/api/interviews", "POST", payload);
      if (!mounted.current) return;
      setSuccess(result.message); setDialog(null); setNotes("");
      await refresh(true);
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  const activeBookings = useMemo(() => new Map((data?.bookings || []).filter(b => b.status === "booked").map(b => [b.memberId, b])), [data]);
  const members = useMemo(() => (data?.members || []).filter(m => m.due).sort((a,b) => a.due.daysUntil - b.due.daysUntil), [data]);
  const visible = members.filter(m => `${m.grade} ${m.name}`.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")) && (filter === "all" || statusFor(m, activeBookings.get(m.id)) === filter));
  const me = members.find(m => m.id === session.id);
  const myBooking = activeBookings.get(session.id);
  const freeSlots = (data?.slots || []).filter(s => !s.booked);
  const days = [...new Set(freeSlots.map(s => day(s.startsAt)))];
  const chosenDay = days.includes(selectedDate) ? selectedDate : days[0];
  const currentSlot = dialog?.booking || dialog?.slot;
  const history = (data?.bookings || []).filter((booking) => management || booking.memberId === session.id);

  return <section className="interviews-panel" aria-label={management ? "Gestion des entretiens" : "Mes entretiens"}>
    <div className="iv-topline"><span><Clock3 size={16} /> 15 minutes par entretien · Heure de Paris</span><button className="iv-button" disabled={busy} onClick={() => refresh()}><RefreshCw size={15} /> Actualiser</button></div>
    {error && <p className="iv-notice error" role="alert">{error}</p>}
    {success && <p className="iv-notice success" role="status">{success}</p>}
    {!data ? <div className="iv-card iv-empty" role="status">{error ? "Le suivi n’a pas pu être chargé." : "Chargement du suivi des entretiens…"}</div> : management && !data.isManager ? <p>Cette rubrique est réservée aux responsables.</p> : <>
      {management ? <>
        <div className="iv-stats">{[["Membres suivis", members.length], ["Rendez-vous pris", members.filter(m => activeBookings.has(m.id)).length], ["À planifier sous 7 jours", members.filter(m => !activeBookings.has(m.id) && m.due.daysUntil >= 0 && m.due.daysUntil <= 7).length], ["En retard", members.filter(m => !activeBookings.has(m.id) && m.due.daysUntil < 0).length]].map(([label, value]) => <article className="iv-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
        <section className="iv-card">
          <div className="iv-heading"><div><p className="eyebrow">DISPONIBILITÉS</p><h2>Ouvrir mes créneaux</h2><p className="muted">Une plage de 15 h à 16 h crée quatre rendez-vous de 15 minutes à votre nom.</p></div><CalendarDays size={28} /></div>
          <form className="iv-availability" onSubmit={e => { e.preventDefault(); mutate({ action: "add_slots", ...availability }); }}>
            <label>Date<input required type="date" min={today()} value={availability.date} onChange={e => setAvailability({ ...availability, date: e.target.value })} /></label>
            <label>De<input required type="time" step="900" value={availability.from} onChange={e => setAvailability({ ...availability, from: e.target.value })} /></label>
            <label>À<input required type="time" step="900" value={availability.to} onChange={e => setAvailability({ ...availability, to: e.target.value })} /></label>
            <button className="iv-button primary" disabled={busy}><Plus size={17} /> Publier les créneaux</button>
          </form>
          <details className="iv-details"><summary>Créneaux à venir ({data.slots.length})</summary><div className="iv-slot-list">{data.slots.length ? data.slots.map(s => <article key={s.id}><div><strong>{day(s.startsAt)} · {time(s.startsAt)}</strong><small>{s.interviewer} · {s.booked ? "Réservé" : "Disponible"}</small></div>{(s.interviewerId === session.id || ["admin", "management"].includes(session.role)) && <button className="iv-button" disabled={busy} onClick={() => setDialog({ action: "cancel_slot", slot: s })}>Retirer</button>}</article>) : <p className="muted">Aucune disponibilité publiée pour le moment.</p>}</div></details>
        </section>
        <section className="iv-card iv-table-card">
          <div className="iv-heading"><div><p className="eyebrow">SUIVI DE L’EFFECTIF</p><h2>Les entretiens en un coup d’œil</h2><p className="muted">Fin de test, entrée SO Sup, puis un entretien chaque mois sans nouveau mouvement.</p></div></div>
          <div className="iv-filters"><label><Search size={17} /><input aria-label="Rechercher un membre" type="search" placeholder="Rechercher un membre…" value={query} onChange={e => setQuery(e.target.value)} /></label><select aria-label="Filtrer le suivi" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Tous les statuts</option>{Object.entries(STATUS).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></div>
          <div className="iv-table-scroll"><table><thead><tr><th>Membre</th><th>Motif / échéance</th><th>Suivi</th><th>Rendez-vous</th><th>Actions</th></tr></thead><tbody>{visible.map(m => { const b = activeBookings.get(m.id); const state = statusFor(m,b); return <tr key={m.id}><td><strong className="iv-member-name">{m.grade} {m.name}</strong><small>{m.role === "senior" ? "Sous-Officier Supérieur" : "Sous-Officier"}</small></td><td>{REASONS[m.due.reason]}<small>{day(m.due.dueDate)} · {countdown(m.due.daysUntil)}</small></td><td><span className={`iv-status ${state}`}>{STATUS[state]}</span></td><td>{b ? <>{day(b.startsAt)} · {time(b.startsAt)}<small>{b.interviewer}</small>{new Date(b.startsAt) < new Date(data.serverNow) && <small className="iv-accent">À clôturer</small>}</> : <span className="muted">Non réservé</span>}</td><td><div className="iv-row-actions">{b && <><button className="iv-button" disabled={busy || new Date(b.startsAt) > new Date(data.serverNow)} onClick={() => { setNotes(""); setDialog({ action: "complete", booking: b }); }}>Clôturer</button><button className="iv-button" disabled={busy} onClick={() => setDialog({ action: "cancel", booking: b })}>Annuler</button></>}{m.role === "officer" && m.grade === "Sergent" && <button className="iv-button" disabled={busy} onClick={() => { setTestDate(m.due.reason === "test_end" ? m.due.dueDate : today()); setDialog({ action: "set_test_end", member: m }); }}>Fin de test</button>}</div></td></tr>; })}</tbody></table></div>
          {!visible.length && <p className="iv-empty muted">Aucun membre ne correspond à ce filtre.</p>}
        </section>
      </> : <>
        <section className="iv-card iv-personal">
          <div className="iv-heading"><div><p className="eyebrow">MON SUIVI</p><h2>{me ? REASONS[me.due.reason] : "Entretiens individuels"}</h2><p className="muted">Un temps d’échange avec un responsable pour faire le point sur votre parcours.</p></div><CalendarDays size={30} /></div>
          {me ? <><div className="iv-personal-due"><div><span>Prochaine échéance</span><strong>{day(me.due.dueDate)}</strong></div><span className={`iv-status ${statusFor(me,myBooking)}`}>{myBooking ? "Rendez-vous réservé" : countdown(me.due.daysUntil)}</span></div>{myBooking ? <div className="iv-appointment"><CheckCircle2 size={23} /><div><strong>{day(myBooking.startsAt)} à {time(myBooking.startsAt)}</strong><p>Avec {myBooking.interviewer} · 15 minutes</p></div><button className="iv-button" disabled={busy} onClick={() => setDialog({ action: "cancel", booking: myBooking })}>Annuler</button></div> : <p className="muted">{me.due.reason === "test_end" ? "Choisissez un rendez-vous à partir de la fin de votre période de test." : "Vous pouvez réserver dès maintenant parmi les disponibilités ci-dessous."}</p>}</> : <p className="muted">Le suivi personnel concerne les SO et SO Sup. Les responsables gèrent leurs disponibilités dans Référent SO → Entretiens individuels.</p>}
        </section>
        {me && !myBooking && <section className="iv-card"><div className="iv-heading"><div><p className="eyebrow">PRISE DE RENDEZ-VOUS</p><h2>Choisir un créneau</h2></div></div>{freeSlots.length ? <><label className="iv-date-picker">Jour du rendez-vous<select value={chosenDay || ""} onChange={e => setSelectedDate(e.target.value)}>{days.map(d => <option key={d}>{d}</option>)}</select></label><div className="iv-booking-grid">{freeSlots.filter(s => day(s.startsAt) === chosenDay).map(s => { const tooEarly = me.due.reason === "test_end" && dateKey(s.startsAt) < me.due.dueDate; return <button key={s.id} className="iv-slot" disabled={busy || tooEarly} onClick={() => setDialog({ action: "book", slot: s })}><strong>{time(s.startsAt)} – {time(new Date(new Date(s.startsAt).getTime() + 900000).toISOString())}</strong><span>{s.interviewer}</span><small>{tooEarly ? "Avant la fin de votre test" : "Réserver · 15 minutes"}</small></button>; })}</div></> : <p className="iv-empty muted">Aucun créneau libre pour le moment. Un responsable doit publier ses disponibilités.</p>}</section>}
      </>}
      <section className="iv-card"><div className="iv-heading"><div><p className="eyebrow">HISTORIQUE</p><h2>{management ? "Derniers entretiens et rendez-vous" : "Mes entretiens précédents"}</h2></div></div><div className="iv-history">{history.filter(b => b.status !== "booked").slice(0, management ? 100 : 50).map(b => <details key={b.id}><summary><span><strong>{management ? b.member : REASONS[b.reason]}</strong><small>{day(b.startsAt)} à {time(b.startsAt)} · {b.interviewer}</small></span><span className={`iv-status ${b.status}`}>{STATES[b.status]}</span></summary><p>{REASONS[b.reason]}</p><p className="iv-notes">{b.notes || "Aucun compte rendu renseigné."}</p></details>)}{!history.some(b => b.status !== "booked") && <p className="muted">Les entretiens clôturés et les annulations apparaîtront ici.</p>}</div></section>
      <p className="iv-help">Les changements de grade ou de niveau d’accès relancent le suivi. Une entrée chez les SO Sup déclenche un entretien dédié. Sans changement, la prochaine échéance est fixée un mois après le dernier entretien réalisé. Pour les membres déjà présents au lancement, le premier suivi mensuel commence à la mise en service.</p>
    </>}
    {dialog && <div className="iv-overlay" role="presentation" onClick={e => { if (e.target === e.currentTarget && !busy) setDialog(null); }}><section className="iv-dialog" role="dialog" aria-modal="true" aria-labelledby="iv-dialog-title" onKeyDown={e => { if (e.key === "Escape" && !busy) setDialog(null); if (e.key === "Tab") { const focusable = [...e.currentTarget.querySelectorAll('button:not(:disabled),input,textarea,select')]; const first = focusable[0], last = focusable[focusable.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } }}>
      <button className="iv-close iv-button" aria-label="Fermer" disabled={busy} onClick={() => setDialog(null)}><X size={20} /></button>
      <h2 id="iv-dialog-title">{dialog.action === "book" ? "Confirmer le rendez-vous" : dialog.action === "complete" ? "Clôturer l’entretien" : dialog.action === "set_test_end" ? "Fin de la période de test" : "Confirmer l’annulation"}</h2>
      {currentSlot && <p>{day(currentSlot.startsAt)} à {time(currentSlot.startsAt)}<br />{currentSlot.interviewer}</p>}
      <form onSubmit={e => { e.preventDefault(); mutate({ action: dialog.action === "complete" ? dialog.result || "complete" : dialog.action, slotId: dialog.slot?.id, bookingId: dialog.booking?.id, memberId: dialog.member?.id, date: testDate, notes }); }}>
        {dialog.action === "complete" && <><label>Résultat<select autoFocus value={dialog.result || "complete"} onChange={e => setDialog({ ...dialog, result: e.target.value, action: "complete" })}><option value="complete">Entretien réalisé</option><option value="no_show">Le membre ne s’est pas présenté</option></select></label><label>Bilan et objectifs (visibles par le membre)<textarea maxLength={3000} rows={5} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Points abordés, objectifs et conseils pour la suite…" /></label></>}
        {dialog.action === "set_test_end" && <><p>{dialog.member.grade} {dialog.member.name}</p><label>Date de fin de test<input autoFocus required type="date" value={testDate} onChange={e => setTestDate(e.target.value)} /></label><p className="muted">Cette date remplace celle du suivi Sergent. Un éventuel rendez-vous en cours sera annulé pour permettre une nouvelle réservation.</p></>}
        {dialog.action === "cancel_slot" && <p className="muted">Cette disponibilité sera retirée. Si elle est réservée, le membre sera averti et devra reprendre rendez-vous.</p>}
        {dialog.action === "cancel" && <p className="muted">L’entretien restera à planifier. Le créneau sera libéré.</p>}
        {dialog.action === "book" && <p className="muted">Durée : 15 minutes. Votre responsable sera averti de la réservation.</p>}
        {error && <p className="iv-notice error" role="alert">{error}</p>}
        <div className="iv-dialog-actions"><button type="button" className="iv-button" disabled={busy} onClick={() => setDialog(null)}>Retour</button><button autoFocus={!['complete','set_test_end'].includes(dialog.action)} className="iv-button primary" disabled={busy}>{busy ? "Enregistrement…" : "Confirmer"}</button></div>
      </form>
    </section></div>}
  </section>;
}
