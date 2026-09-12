"use client";

import { useMemo, useState } from "react";
import { CalendarCheck2, CalendarClock, CheckCircle2, Clock3, FileSpreadsheet, Plus, Trash2, UserRound, UsersRound, XCircle } from "lucide-react";

const INTERVIEW_SHEET_ID = "1a2FsKNqjO80xvDMRNuSSurjIcfwTs4nwdPGwu6zHibs";
const INTERVIEW_SHEET_URL = `https://docs.google.com/spreadsheets/d/${INTERVIEW_SHEET_ID}/edit`;
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_REQUEST_TIMEOUT = 45_000;
const INTERVIEW_REPORT_FIELDS = [
  { id: "branchFeeling", label: "Comment la personne se sent-elle au sein de la branche ?", placeholder: "Ressenti général au sein des AIT…" },
  { id: "teamFeeling", label: "Comment se sent-elle parmi les SO / SO-S ?", placeholder: "Intégration, échanges et cohésion…" },
  { id: "selfAssessment", label: "Auto-évaluation du SO / SO-S", hint: "Points positifs et points à améliorer.", placeholder: "Forces, difficultés et bilan personnel…" },
  { id: "careerReview", label: "Parcours et évolution", hint: "Sanctions éventuelles, évolutions, retours des Officiers.", placeholder: "Éléments importants de sa carrière…" },
  { id: "careerGoals", label: "Objectifs de carrière", placeholder: "Objectifs à court et moyen terme…" },
  { id: "improvementFeedback", label: "Remarques et axes d’amélioration", hint: "Concernant les AIT ou les SO / SO-S.", placeholder: "Suggestions, remarques ou points à travailler…" },
  { id: "personalOutlook", label: "Avenir personnel et disponibilité", hint: "Départ prochain, baisse d’activité ou indisponibilités à anticiper.", placeholder: "Disponibilités et changements personnels à prévoir…" },
];

const EMPTY_INTERVIEW_REPORT = Object.fromEntries(INTERVIEW_REPORT_FIELDS.map((field) => [field.id, ""]));
const INTERVIEW_DASHBOARD_TITLE = "Accueil · Entretiens";
const INTERVIEW_REPORT_HEADERS = ["Date de clôture", "Responsable", "Motif", "Ressenti dans la branche", "Ressenti SO / SO-S", "Auto-évaluation", "Parcours et évolution", "Objectifs de carrière", "Remarques / axes d’amélioration", "Avenir personnel", "Identifiant entretien"];

const REASONS = {
  test_end: "Fin de période d’essai",
  senior_entry: "Entrée chez les Sous-Officiers Supérieurs",
  monthly: "Suivi toutes les deux semaines",
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

function memberRoleLabel(member) {
  return member?.role === "senior" ? "Sous-Officier Supérieur" : "Sous-Officier";
}

function interviewSheetTitle(member) {
  const base = `${member?.firstName || "Membre"} ${member?.lastName || ""}`.trim().replace(/[\\/:?*\[\]]/g, " ").replace(/\s+/g, " ");
  return `${base.slice(0, 82)} · ${String(member?.id || "dossier").slice(-6)}`.slice(0, 99);
}

function loadGoogleIdentityServices() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Google Sheets est disponible uniquement depuis le portail."));
    if (window.google?.accounts?.oauth2) return resolve();
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

async function requestGoogleSheetsToken() {
  if (!GOOGLE_CLIENT_ID) throw new Error("La liaison Google Sheets n’est pas encore configurée.");
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
      scope: GOOGLE_SHEETS_SCOPE,
      callback: finish((response) => {
        if (response?.error || !response?.access_token) return reject(new Error(response?.error_description || "L’autorisation Google a été refusée."));
        resolve(response.access_token);
      }),
      error_callback: finish(() => reject(new Error("L’autorisation Google n’a pas pu être ouverte. Autorisez les fenêtres contextuelles puis réessayez."))),
    });
    try { tokenClient.requestAccessToken({ prompt: "select_account consent" }); }
    catch (error) { finish(reject)(error instanceof Error ? error : new Error("L’autorisation Google n’a pas pu démarrer.")); }
  });
}

async function googleSheetsRequest(url, options, fallback) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), GOOGLE_REQUEST_TIMEOUT);
    let response = null;
    try {
      response = await fetch(url, { ...options, signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (response.ok) return payload;
      throw new Error(payload?.error?.message || fallback);
    } catch (error) {
      lastError = error;
      const retryable = error?.name === "AbortError" || error instanceof TypeError || response?.status === 429 || response?.status >= 500;
      if (!retryable || attempt === 2) {
        if (error?.name === "AbortError") throw new Error("Google Sheets met trop de temps à répondre. Réessayez dans un instant.");
        throw error;
      }
    } finally {
      window.clearTimeout(timeout);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 900 * (attempt + 1)));
  }
  throw lastError || new Error(fallback);
}

function googleHeaders(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function sheetRow(values, width = 11) {
  return [...values, ...Array(Math.max(0, width - values.length)).fill("")].slice(0, width);
}

function sheetDataRow(values, width = 11) {
  return { values: sheetRow(values, width).map((value) => ({ userEnteredValue: { stringValue: String(value ?? "") } })) };
}

async function sheetsBatchUpdate(token, requests, fallback) {
  return googleSheetsRequest(`https://sheets.googleapis.com/v4/spreadsheets/${INTERVIEW_SHEET_ID}:batchUpdate`, {
    method: "POST",
    headers: googleHeaders(token),
    body: JSON.stringify({ requests }),
  }, fallback);
}

async function sheetValuesUpdate(token, range, values, fallback) {
  return googleSheetsRequest(`https://sheets.googleapis.com/v4/spreadsheets/${INTERVIEW_SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    headers: googleHeaders(token),
    body: JSON.stringify({ values }),
  }, fallback);
}

async function createSheet(token, title, properties = {}) {
  const created = await sheetsBatchUpdate(token, [{ addSheet: { properties: { title, ...properties } } }], "L’onglet n’a pas pu être créé.");
  const sheet = created?.replies?.[0]?.addSheet?.properties || null;
  if (!sheet) throw new Error("Google Sheets n’a pas renvoyé le nouvel onglet.");
  return sheet;
}

async function formatMemberInterviewSheet(token, sheet, member) {
  await sheetsBatchUpdate(token, [
    { unmergeCells: { range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 11 } } },
    { unmergeCells: { range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 11 } } },
    { unmergeCells: { range: { sheetId: sheet.sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 11 } } },
    { mergeCells: { range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 11 }, mergeType: "MERGE_ALL" } },
    { mergeCells: { range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 11 }, mergeType: "MERGE_ALL" } },
    { mergeCells: { range: { sheetId: sheet.sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 11 }, mergeType: "MERGE_ALL" } },
    { updateSheetProperties: { properties: { sheetId: sheet.sheetId, tabColor: { red: 0.73, green: 0.57, blue: 0.12 }, gridProperties: { frozenRowCount: 9 } }, fields: "tabColor,gridProperties.frozenRowCount" } },
    { repeatCell: { range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.05, green: 0.10, blue: 0.07 }, horizontalAlignment: "LEFT", verticalAlignment: "MIDDLE", textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 16, fontFamily: "Arial" } } }, fields: "userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)" } },
    { repeatCell: { range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: 2 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.13, green: 0.22, blue: 0.15 }, horizontalAlignment: "LEFT", verticalAlignment: "MIDDLE", textFormat: { foregroundColor: { red: 0.80, green: 0.91, blue: 0.82 }, italic: true, fontSize: 10, fontFamily: "Arial" } } }, fields: "userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)" } },
    { repeatCell: { range: { sheetId: sheet.sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 5 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.91, green: 0.88, blue: 0.76 }, horizontalAlignment: "LEFT", verticalAlignment: "MIDDLE", textFormat: { foregroundColor: { red: 0.25, green: 0.20, blue: 0.08 }, bold: true, fontSize: 10, fontFamily: "Arial" } } }, fields: "userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)" } },
    { repeatCell: { range: { sheetId: sheet.sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 5 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.97, green: 0.98, blue: 0.96 }, verticalAlignment: "MIDDLE", textFormat: { foregroundColor: { red: 0.12, green: 0.19, blue: 0.14 }, fontSize: 11, fontFamily: "Arial" } } }, fields: "userEnteredFormat(backgroundColor,verticalAlignment,textFormat)" } },
    { repeatCell: { range: { sheetId: sheet.sheetId, startRowIndex: 7, endRowIndex: 8 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.14, green: 0.31, blue: 0.20 }, horizontalAlignment: "LEFT", verticalAlignment: "MIDDLE", textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 11, fontFamily: "Arial" } } }, fields: "userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)" } },
    { repeatCell: { range: { sheetId: sheet.sheetId, startRowIndex: 8, endRowIndex: 9 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.19, green: 0.38, blue: 0.25 }, verticalAlignment: "MIDDLE", wrapStrategy: "WRAP", textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 10, fontFamily: "Arial" } } }, fields: "userEnteredFormat(backgroundColor,verticalAlignment,wrapStrategy,textFormat)" } },
    { repeatCell: { range: { sheetId: sheet.sheetId, startRowIndex: 9 }, cell: { userEnteredFormat: { verticalAlignment: "TOP", wrapStrategy: "WRAP", textFormat: { fontSize: 10, fontFamily: "Arial" } } }, fields: "userEnteredFormat(verticalAlignment,wrapStrategy,textFormat)" } },
    { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 150 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 3 }, properties: { pixelSize: 190 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: "COLUMNS", startIndex: 3, endIndex: 10 }, properties: { pixelSize: 250 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: "COLUMNS", startIndex: 10, endIndex: 11 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
    { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 34 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: "ROWS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 24 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: "ROWS", startIndex: 7, endIndex: 8 }, properties: { pixelSize: 27 }, fields: "pixelSize" } },
    { updateCells: { range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 9, startColumnIndex: 0, endColumnIndex: 11 }, rows: [
      sheetDataRow([`Dossier d’entretiens individuels · ${memberName(member)}`]),
      sheetDataRow(["Portail SO AIT · Suivi individuel et comptes rendus"]),
      sheetDataRow([]),
      sheetDataRow(["Membre", "Grade", "Niveau", "Identifiant portail", "Dernière mise à jour"]),
      sheetDataRow([memberName(member), member.grade || "Non renseigné", memberRoleLabel(member), member.id, new Date().toISOString()]),
      sheetDataRow([]),
      sheetDataRow([]),
      sheetDataRow(["Historique des entretiens"]),
      sheetDataRow(INTERVIEW_REPORT_HEADERS),
    ], fields: "userEnteredValue" } },
  ], "La mise en forme du dossier n’a pas pu être appliquée.");
}

async function ensureMemberInterviewSheet(token, member) {
  const metadata = await googleSheetsRequest(`https://sheets.googleapis.com/v4/spreadsheets/${INTERVIEW_SHEET_ID}?fields=sheets.properties`, { headers: googleHeaders(token) }, "Le Google Sheet ne peut pas être ouvert.");
  const title = interviewSheetTitle(member);
  let sheet = metadata?.sheets?.find((entry) => entry?.properties?.title === title)?.properties || null;
  if (!sheet) {
    sheet = await createSheet(token, title);
  }
  await formatMemberInterviewSheet(token, sheet, member);
  return title;
}

async function ensureInterviewDashboard(token, members) {
  const metadata = await googleSheetsRequest(`https://sheets.googleapis.com/v4/spreadsheets/${INTERVIEW_SHEET_ID}?fields=sheets.properties`, { headers: googleHeaders(token) }, "Le Google Sheet ne peut pas être ouvert.");
  let sheet = metadata?.sheets?.find((entry) => entry?.properties?.title === INTERVIEW_DASHBOARD_TITLE)?.properties || null;
  if (!sheet) sheet = await createSheet(token, INTERVIEW_DASHBOARD_TITLE, { index: 0 });
  await sheetsBatchUpdate(token, [
    { unmergeCells: { range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 } } },
    { unmergeCells: { range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 8 } } },
    { mergeCells: { range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 }, mergeType: "MERGE_ALL" } },
    { mergeCells: { range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 8 }, mergeType: "MERGE_ALL" } },
    { updateSheetProperties: { properties: { sheetId: sheet.sheetId, index: 0, tabColor: { red: 0.12, green: 0.42, blue: 0.28 }, gridProperties: { frozenRowCount: 9 } }, fields: "index,tabColor,gridProperties.frozenRowCount" } },
    { repeatCell: { range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.05, green: 0.10, blue: 0.07 }, verticalAlignment: "MIDDLE", textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 18, fontFamily: "Arial" } } }, fields: "userEnteredFormat(backgroundColor,verticalAlignment,textFormat)" } },
    { repeatCell: { range: { sheetId: sheet.sheetId, startRowIndex: 1, endRowIndex: 2 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.13, green: 0.22, blue: 0.15 }, verticalAlignment: "MIDDLE", textFormat: { foregroundColor: { red: 0.80, green: 0.91, blue: 0.82 }, italic: true, fontSize: 10, fontFamily: "Arial" } } }, fields: "userEnteredFormat(backgroundColor,verticalAlignment,textFormat)" } },
    { repeatCell: { range: { sheetId: sheet.sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 8 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.91, green: 0.88, blue: 0.76 }, textFormat: { foregroundColor: { red: 0.25, green: 0.20, blue: 0.08 }, bold: true, fontSize: 10, fontFamily: "Arial" } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } },
    { repeatCell: { range: { sheetId: sheet.sheetId, startRowIndex: 4, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 8 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.97, green: 0.98, blue: 0.96 }, verticalAlignment: "TOP", wrapStrategy: "WRAP", textFormat: { foregroundColor: { red: 0.12, green: 0.19, blue: 0.14 }, fontSize: 11, fontFamily: "Arial" } } }, fields: "userEnteredFormat(backgroundColor,verticalAlignment,wrapStrategy,textFormat)" } },
    { repeatCell: { range: { sheetId: sheet.sheetId, startRowIndex: 7, endRowIndex: 8 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.14, green: 0.31, blue: 0.20 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 11, fontFamily: "Arial" } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } },
    { repeatCell: { range: { sheetId: sheet.sheetId, startRowIndex: 8, endRowIndex: 9 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.19, green: 0.38, blue: 0.25 }, verticalAlignment: "MIDDLE", textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 10, fontFamily: "Arial" } } }, fields: "userEnteredFormat(backgroundColor,verticalAlignment,textFormat)" } },
    { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 150 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 250 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 5 }, properties: { pixelSize: 180 }, fields: "pixelSize" } },
    { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 38 }, fields: "pixelSize" } },
  ], "La mise en forme de l’accueil n’a pas pu être appliquée.");
  return sheet;
}

async function prepareInterviewWorkbook({ members, onProgress }) {
  const token = await requestGoogleSheetsToken();
  const dashboard = await ensureInterviewDashboard(token, members);
  const dossiers = [];
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index];
    onProgress?.(index + 1, members.length, member);
    const title = await ensureMemberInterviewSheet(token, member);
    dossiers.push([member.grade || "Non renseigné", memberName(member), memberRoleLabel(member), title, "Prêt"]);
  }
  await sheetValuesUpdate(token, `${INTERVIEW_DASHBOARD_TITLE}!A1:H8`, [
    sheetRow(["Portail SO AIT · Entretiens individuels"], 8),
    sheetRow(["Dossiers centralisés des Sous-Officiers et Sous-Officiers Supérieurs"], 8),
    sheetRow([], 8),
    sheetRow(["Fonctionnement", "Dossiers préparés", "Dernière préparation"], 8),
    sheetRow(["Chaque onglet regroupe le profil du membre et ses comptes rendus d’entretien.", `${members.length} dossier${members.length > 1 ? "s" : ""}`, new Date().toISOString()], 8),
    sheetRow([], 8),
    sheetRow([], 8),
    sheetRow(["Liste des dossiers"], 8),
  ], "L’accueil du Google Sheet n’a pas pu être actualisé.");
  await sheetValuesUpdate(token, `${INTERVIEW_DASHBOARD_TITLE}!A9:E${Math.max(9, dossiers.length + 9)}`, [
    ["Grade", "Membre", "Niveau", "Onglet", "État"],
    ...dossiers,
  ], "La liste des dossiers n’a pas pu être ajoutée.");
  await sheetsBatchUpdate(token, [{ repeatCell: { range: { sheetId: dashboard.sheetId, startRowIndex: 9 }, cell: { userEnteredFormat: { verticalAlignment: "MIDDLE", textFormat: { fontSize: 10, fontFamily: "Arial" } } }, fields: "userEnteredFormat(verticalAlignment,textFormat)" } }], "La liste des dossiers n’a pas pu être mise en forme.");
}

async function sendInterviewReportToSheet({ member, interviewer, requirement, report }) {
  const token = await requestGoogleSheetsToken();
  const title = await ensureMemberInterviewSheet(token, member);
  const idRange = encodeURIComponent(`${title}!K10:K`);
  const existing = await googleSheetsRequest(`https://sheets.googleapis.com/v4/spreadsheets/${INTERVIEW_SHEET_ID}/values/${idRange}`, { headers: googleHeaders(token) }, "Le dossier du membre n’a pas pu être vérifié.");
  if (existing?.values?.some((row) => row?.[0] === requirement.id)) return;
  const appendRange = encodeURIComponent(`${title}!A10`);
  await googleSheetsRequest(`https://sheets.googleapis.com/v4/spreadsheets/${INTERVIEW_SHEET_ID}/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    headers: googleHeaders(token),
    body: JSON.stringify({ values: [[
      new Date().toISOString(), memberName(interviewer), REASONS[requirement.reason] || "Entretien individuel",
      ...INTERVIEW_REPORT_FIELDS.map((field) => report[field.id] || ""), requirement.id,
    ]] }),
  }, "Le compte rendu n’a pas pu être ajouté au Google Sheet.");
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

function displayCompletedAt(value) {
  if (!value) return "Date non renseignée";
  try { return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(value)); }
  catch { return "Date non renseignée"; }
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
  try { return await action(values); }
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
      <div className="interview-hero-side"><span className="interview-access"><UsersRound size={15} /> Accessible à tous les rôles</span><div className="interview-hero-state"><strong>{current ? STATUS[current.status] : "À jour"}</strong><span>{current ? dueText(current) : "Aucun rendez-vous à prévoir"}</span></div></div>
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
  const [completionTarget, setCompletionTarget] = useState(null);
  const [completionReport, setCompletionReport] = useState(EMPTY_INTERVIEW_REPORT);
  const [completionError, setCompletionError] = useState("");
  const [sendingToSheet, setSendingToSheet] = useState(false);
  const [preparingWorkbook, setPreparingWorkbook] = useState(false);
  const [workbookProgress, setWorkbookProgress] = useState("");
  const [workbookError, setWorkbookError] = useState("");
  const [historyMemberId, setHistoryMemberId] = useState("");
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
  const recentCompletedRequirements = [...completedRequirements].sort((left, right) => new Date(right.completedAt || right.updatedAt || 0).getTime() - new Date(left.completedAt || left.updatedAt || 0).getTime()).slice(0, 24);
  const upcomingSlots = slots.filter((slot) => new Date(slot.startsAt).getTime() > Date.now() - 60_000).slice(0, 20);
  const historyMember = historyMemberId ? usersById.get(String(historyMemberId)) : null;
  const historyEntries = historyMember ? completedRequirements
    .filter((item) => String(item.memberId) === String(historyMember.id))
    .sort((left, right) => new Date(right.completedAt || right.updatedAt || 0).getTime() - new Date(left.completedAt || left.updatedAt || 0).getTime()) : [];

  async function addSlots(event) {
    event.preventDefault();
    await runAction(setBusy, "slot-form", onAction, { action: "create_interview_slot", ...slotForm });
  }
  async function addRequirement(event) {
    event.preventDefault();
    if (!requirementForm.memberId) return;
    await runAction(setBusy, "requirement-form", onAction, { action: "create_interview_requirement", ...requirementForm });
  }
  async function prepareWorkbook() {
    setPreparingWorkbook(true);
    setWorkbookError("");
    setWorkbookProgress("");
    try {
      await prepareInterviewWorkbook({
        members,
        onProgress: (current, total, member) => setWorkbookProgress(`Préparation ${current}/${total} · ${memberName(member)}`),
      });
      setWorkbookProgress(`${members.length} dossier${members.length > 1 ? "s" : ""} préparé${members.length > 1 ? "s" : ""} dans Google Sheet.`);
    } catch (error) {
      setWorkbookProgress("");
      setWorkbookError(error instanceof Error ? error.message : "Les dossiers Google Sheet n’ont pas pu être préparés.");
    } finally {
      setPreparingWorkbook(false);
    }
  }
  async function submitCompletion(event) {
    event.preventDefault();
    if (!completionTarget) return;
    const member = usersById.get(String(completionTarget.memberId));
    if (!member) return setCompletionError("Le membre de cet entretien est introuvable.");
    setCompletionError("");
    setSendingToSheet(true);
    try {
      await sendInterviewReportToSheet({ member, interviewer: session, requirement: completionTarget, report: completionReport });
    } catch (error) {
      setCompletionError(error instanceof Error ? error.message : "Le compte rendu n’a pas pu être envoyé au Google Sheet.");
      return;
    } finally {
      setSendingToSheet(false);
    }
    const saved = await runAction(setBusy, completionTarget.id, onAction, { action: "complete_interview", requirementId: completionTarget.id });
    if (saved) {
      setCompletionTarget(null);
      setCompletionReport(EMPTY_INTERVIEW_REPORT);
    }
  }

  return <div className="interview-page interview-management-page">
    <section className="interview-hero">
      <div className="interview-hero-icon"><UsersRound size={27} /></div>
      <div><p className="eyebrow dark">RÉFÉRENT SO</p><h2>Gestion des entretiens</h2><p>Ouvrez des créneaux, suivez les rendez-vous et gardez une vue claire sur les prochaines échéances.</p></div>
      <div className="interview-hero-side"><span className="interview-access"><UsersRound size={15} /> Gestion Référent SO</span><div className="interview-hero-counters"><span><strong>{openRequirements.filter((item) => item.status === "to_book").length}</strong> à réserver</span><span><strong>{openRequirements.filter((item) => item.status === "booked").length}</strong> fixés</span><span><strong>{completedRequirements.length}</strong> terminés</span></div></div>
    </section>

    <div className="interview-management-forms">
      <section className="interview-card"><div className="interview-card-head"><div><p className="eyebrow dark">DISPONIBILITÉS</p><h2>Ouvrir mes créneaux</h2><p>Une plage est automatiquement découpée en rendez-vous de 15 minutes.</p></div><span className="interview-icon-box"><Plus size={18} /></span></div><form className="interview-form" onSubmit={addSlots}><div className="interview-host-note"><MemberIdentity member={session} label="Les rendez-vous seront proposés avec" compact /></div><label>Date<input type="date" value={slotForm.date} min={parisDay()} onChange={(event) => setSlotForm((current) => ({ ...current, date: event.target.value }))} required /></label><div className="interview-time-grid"><label>Début<input type="time" step="900" value={slotForm.startTime} onChange={(event) => setSlotForm((current) => ({ ...current, startTime: event.target.value }))} required /></label><label>Fin<input type="time" step="900" value={slotForm.endTime} onChange={(event) => setSlotForm((current) => ({ ...current, endTime: event.target.value }))} required /></label></div><button className="primary" type="submit" disabled={busy === "slot-form"}><CalendarClock size={17} />{busy === "slot-form" ? "Création…" : "Créer mes créneaux"}</button></form></section>
      <section className="interview-card"><div className="interview-card-head"><div><p className="eyebrow dark">SUIVI MANUEL</p><h2>Ajouter une échéance</h2><p>Pour un entretien exceptionnel ou pour démarrer le suivi d’un membre.</p></div><span className="interview-icon-box"><UserRound size={18} /></span></div><form className="interview-form" onSubmit={addRequirement}><label>Membre<select value={requirementForm.memberId} onChange={(event) => setRequirementForm((current) => ({ ...current, memberId: event.target.value }))} required><option value="">Choisir un Sous-Officier…</option>{members.map((member) => <option value={member.id} key={member.id}>{memberName(member)}</option>)}</select></label><div className="interview-time-grid"><label>Motif<select value={requirementForm.reason} onChange={(event) => setRequirementForm((current) => ({ ...current, reason: event.target.value }))}>{Object.entries(REASONS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Échéance<input type="date" value={requirementForm.dueDate} onChange={(event) => setRequirementForm((current) => ({ ...current, dueDate: event.target.value }))} required /></label></div><button className="secondary" type="submit" disabled={!requirementForm.memberId || busy === "requirement-form"}><Plus size={17} />{busy === "requirement-form" ? "Ajout…" : "Ajouter l’échéance"}</button></form></section>
    </div>

    <section className="interview-card interview-sheet-setup-card">
      <div className="interview-card-head"><div><p className="eyebrow dark">GOOGLE SHEET</p><h2>Préparer les dossiers individuels</h2><p>Crée un onglet complet par Sous-Officier et Sous-Officier Supérieur, puis actualise l’accueil du fichier.</p></div><span className="interview-icon-box"><FileSpreadsheet size={18} /></span></div>
      <div className="interview-sheet-setup-body"><div><strong>{members.length} dossier{members.length > 1 ? "s" : ""} à préparer</strong><p>Chaque onglet contient l’identité du membre et l’historique de ses comptes rendus d’entretien.</p></div><div className="interview-sheet-setup-actions"><a className="secondary" href={INTERVIEW_SHEET_URL} target="_blank" rel="noreferrer">Ouvrir le Sheet</a><button className="primary" type="button" disabled={preparingWorkbook || !members.length} onClick={prepareWorkbook}><FileSpreadsheet size={17} />{preparingWorkbook ? (workbookProgress || "Préparation…") : "Créer les dossiers"}</button></div></div>
      {workbookProgress && <p className="interview-sheet-progress">{workbookProgress}</p>}
      {workbookError && <p className="form-error interview-sheet-error">{workbookError}</p>}
    </section>

    <section className="interview-card interview-dashboard-card"><div className="interview-card-head"><div><p className="eyebrow dark">TABLEAU DE SUIVI</p><h2>État des entretiens</h2><p>Les suivis périodiques reviennent toutes les deux semaines. Cliquez sur un membre pour consulter son historique.</p></div><span className="interview-count">{openRequirements.length}</span></div><div className="table-wrap"><table className="interview-table"><thead><tr><th>Membre</th><th>Motif</th><th>Échéance</th><th>Rendez-vous</th><th>Responsable</th><th>État</th><th aria-label="Actions" /></tr></thead><tbody>{openRequirements.map((requirement) => { const member = usersById.get(String(requirement.memberId)); const booking = bookingByRequirement.get(requirement.id); const slot = booking ? slotsById.get(booking.slotId) : null; const interviewer = slot ? usersById.get(String(slot.interviewerId)) : null; return <tr key={requirement.id}><td><button className="interview-member interview-member-open" type="button" disabled={!member} title={member ? `Ouvrir l’historique de ${memberName(member)}` : undefined} onClick={() => setHistoryMemberId(member.id)}><ProfileAvatar member={member} size="small" /><span><strong>{memberName(member)}</strong><small>{member ? (member.role === "senior" ? "Sous-Officier Supérieur" : "Sous-Officier") : "Compte supprimé"}</small></span></button></td><td><strong>{REASONS[requirement.reason]}</strong></td><td><span className={`interview-due ${requirement.dueDate < parisDay() ? "late" : ""}`}>{dueText(requirement)}</span></td><td>{slot ? <span className="interview-appointment"><Clock3 size={14} />{displaySlot(slot)}</span> : <span className="interview-no-appointment">En attente du membre</span>}</td><td>{interviewer ? <MemberIdentity member={interviewer} label="Entretien avec" compact /> : <span className="interview-no-appointment">À définir</span>}</td><td><RequirementPill requirement={requirement} /></td><td><div className="interview-row-actions">{booking && <button className="icon-button" type="button" title="Annuler le rendez-vous" disabled={busy === booking.id} onClick={() => { if (window.confirm("Annuler ce rendez-vous ?")) runAction(setBusy, booking.id, onAction, { action: "cancel_interview_booking", bookingId: booking.id }); }}><XCircle size={16} /></button>}<button className="secondary interview-complete" type="button" disabled={busy === requirement.id} onClick={() => { setCompletionTarget(requirement); setCompletionReport(EMPTY_INTERVIEW_REPORT); setCompletionError(""); }}><CheckCircle2 size={15} /> Clôturer</button></div></td></tr>; })}{!openRequirements.length && <tr><td colSpan="7"><EmptyState title="Aucune échéance en attente" text="Les prochains suivis apparaîtront ici automatiquement." /></td></tr>}</tbody></table></div></section>

    <section className="interview-card interview-completed-card"><div className="interview-card-head"><div><p className="eyebrow dark">ENTRETIENS TERMINÉS</p><h2>Réalisés récemment</h2><p>Zone verte : ces rendez-vous sont clôturés. Les comptes rendus détaillés sont classés dans le Google Sheet.</p></div><span className="interview-count"><CheckCircle2 size={17} /></span></div><div className="table-wrap"><table className="interview-table interview-completed-table"><thead><tr><th>Membre</th><th>Motif</th><th>Terminé le</th><th>Responsable</th><th>Compte rendu</th><th>État</th></tr></thead><tbody>{recentCompletedRequirements.map((requirement) => { const member = usersById.get(String(requirement.memberId)); const author = usersById.get(String(requirement.completedBy)); return <tr key={requirement.id}><td><button className="interview-member interview-member-open" type="button" disabled={!member} title={member ? `Ouvrir l’historique de ${memberName(member)}` : undefined} onClick={() => setHistoryMemberId(member.id)}><ProfileAvatar member={member} size="small" /><span><strong>{memberName(member)}</strong><small>{member ? (member.role === "senior" ? "Sous-Officier Supérieur" : "Sous-Officier") : "Compte supprimé"}</small></span></button></td><td><strong>{REASONS[requirement.reason]}</strong></td><td><span className="interview-completed-date"><CheckCircle2 size={14} />{displayCompletedAt(requirement.completedAt)}</span></td><td>{author ? <MemberIdentity member={author} label="Clôturé par" compact /> : <span className="interview-no-appointment">Non renseigné</span>}</td><td><span className="interview-report-state written">Envoyé vers Google Sheet</span></td><td><RequirementPill requirement={requirement} /></td></tr>; })}{!recentCompletedRequirements.length && <tr><td colSpan="6"><EmptyState title="Aucun entretien terminé" text="Les rendez-vous clôturés apparaîtront ici en vert." /></td></tr>}</tbody></table></div></section>

    <section className="interview-card interview-availability-card"><div className="interview-card-head"><div><p className="eyebrow dark">CRÉNEAUX OUVERTS</p><h2>Disponibilités à venir</h2><p>Chaque créneau indique le responsable qui recevra le membre.</p></div><span className="interview-duration"><Clock3 size={15} /> 15 min</span></div><div className="interview-availability-list">{upcomingSlots.map((slot) => { const booking = bookings.find((item) => item.slotId === slot.id); const member = booking ? usersById.get(String(booking.memberId)) : null; const interviewer = usersById.get(String(slot.interviewerId)); const creator = usersById.get(String(slot.createdBy)); return <article key={slot.id}><div className="interview-slot-summary"><strong>{displaySlot(slot)}</strong>{interviewer && <MemberIdentity member={interviewer} label="Entretien assuré par" compact />}{creator && creator.id !== interviewer?.id && <small>Créneau ouvert par {memberName(creator)}</small>}</div>{booking ? <div className="interview-booking-owner">{member && <MemberIdentity member={member} label="Réservé par" compact />}<span className="interview-status booked"><i />Réservé</span></div> : <div className="interview-booking-owner"><span className="interview-status to_book"><i />Disponible</span><button className="icon-button danger" type="button" title="Retirer ce créneau" disabled={busy === slot.id} onClick={() => { if (window.confirm("Retirer ce créneau disponible ?")) runAction(setBusy, slot.id, onAction, { action: "delete_interview_slot", slotId: slot.id }); }}><Trash2 size={16} /></button></div>}</article>; })}{!upcomingSlots.length && <EmptyState title="Aucune disponibilité ouverte" text="Créez une première plage pour permettre les prises de rendez-vous." />}</div></section>

    {completionTarget && <div className="interview-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !sendingToSheet) { setCompletionTarget(null); setCompletionReport(EMPTY_INTERVIEW_REPORT); setCompletionError(""); } }}><form className="interview-modal interview-report-modal" onSubmit={submitCompletion}><button className="icon-button interview-modal-close" type="button" title="Fermer" disabled={sendingToSheet} onClick={() => { setCompletionTarget(null); setCompletionReport(EMPTY_INTERVIEW_REPORT); setCompletionError(""); }}><XCircle size={18} /></button><p className="eyebrow dark">CLÔTURE D’ENTRETIEN</p><h2>Compte rendu d’entretien</h2><p className="interview-modal-intro">Répondez à chaque point. Le compte rendu sera envoyé dans le dossier Google Sheet du membre et ne sera pas conservé dans le portail.</p><div className="interview-modal-member"><MemberIdentity member={usersById.get(String(completionTarget.memberId))} label="Entretien de" /></div><div className="interview-report-form">{INTERVIEW_REPORT_FIELDS.map((field, index) => <label key={field.id}><span>{index + 1}. {field.label}</span>{field.hint && <small>{field.hint}</small>}<textarea value={completionReport[field.id]} onChange={(event) => setCompletionReport((current) => ({ ...current, [field.id]: event.target.value }))} maxLength={1600} rows={4} placeholder={field.placeholder} required autoFocus={index === 0} /></label>)}</div>{completionError && <p className="form-error">{completionError}</p>}<div className="interview-sheet-notice">Les réponses seront classées dans <a href={INTERVIEW_SHEET_URL} target="_blank" rel="noreferrer">le Google Sheet des entretiens</a>, avec un onglet dédié à ce membre.</div><div className="interview-modal-actions"><button className="secondary" type="button" disabled={sendingToSheet} onClick={() => { setCompletionTarget(null); setCompletionReport(EMPTY_INTERVIEW_REPORT); setCompletionError(""); }}>Annuler</button><button className="primary" type="submit" disabled={sendingToSheet || busy === completionTarget.id}><CheckCircle2 size={17} />{sendingToSheet ? "Envoi vers Google…" : busy === completionTarget.id ? "Clôture…" : "Envoyer et clôturer"}</button></div></form></div>}

    {historyMember && <div className="interview-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryMemberId(""); }}><section className="interview-modal interview-history-modal" aria-modal="true" role="dialog" aria-label={`Historique de ${memberName(historyMember)}`}><button className="icon-button interview-modal-close" type="button" title="Fermer" onClick={() => setHistoryMemberId("")}><XCircle size={18} /></button><p className="eyebrow dark">HISTORIQUE INDIVIDUEL</p><h2>Entretiens réalisés</h2><div className="interview-modal-member"><MemberIdentity member={historyMember} label="Membre suivi" /></div><p className="interview-modal-intro">Les réponses détaillées sont conservées uniquement dans le Google Sheet, pas dans le portail.</p><a className="secondary interview-sheet-link" href={INTERVIEW_SHEET_URL} target="_blank" rel="noreferrer">Ouvrir le dossier Google Sheet</a><div className="interview-person-history-list">{historyEntries.map((item) => { const author = usersById.get(String(item.completedBy)); return <article key={item.id}><div className="interview-history-entry-head"><div><strong>{REASONS[item.reason]}</strong><small>Clôturé le {displayCompletedAt(item.completedAt)}</small></div><RequirementPill requirement={item} /></div><small className="interview-report-author">Entretien clôturé par {author ? memberName(author) : "Responsable non renseigné"}</small><p>Compte rendu archivé dans le Google Sheet.</p></article>; })}{!historyEntries.length && <EmptyState title="Aucun entretien terminé" text="Les futurs comptes rendus de ce membre apparaîtront ici." />}</div></section></div>}
  </div>;
}
