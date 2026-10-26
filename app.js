/* PookieWise – Oberfläche & Firebase-Anbindung */
import { firebaseConfig } from './firebase-config.js';
import * as C from './core.js';

const { POT, fmt, esc, parseAmount } = C;
const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
const LEGACY_KEY = 'splitclone_v1';

// Feste Kategorien; die Farbe hängt an der Kategorie, nie an ihrem Rang
const CATEGORIES = [
  { id: 'food', icon: '🍽️', name: 'Essen & Trinken', color: 'var(--s1)' },
  { id: 'lodging', icon: '🏨', name: 'Unterkunft', color: 'var(--s2)' },
  { id: 'transport', icon: '🚗', name: 'Transport', color: 'var(--s3)' },
  { id: 'groceries', icon: '🛒', name: 'Einkauf', color: 'var(--s4)' },
  { id: 'fun', icon: '🎉', name: 'Freizeit', color: 'var(--s5)' },
  { id: 'home', icon: '🏠', name: 'Haushalt & Fixkosten', color: 'var(--s6)' },
  { id: 'other', icon: '📦', name: 'Sonstiges', color: 'var(--s-other)' },
];
const cat = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

/* ---------- State ---------- */
const S = {
  user: null, groups: [], expenses: [], expensesFor: null,
  activeGroupId: lsGet('pw_active'), pendingSelect: null,
  tab: 'overview', view: null, editingId: null, cursor: {},
};
let fs, authM, auth, db, unsubGroups = null, unsubExp = null;

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
function ssGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function ssSet(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} }
const $ = id => document.getElementById(id);

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.hidden = true, 4000);
}
// Schreibvorgänge werden lokal sofort sichtbar; Fehler (z. B. Regeln) kommen später
const write = p => p.catch(err => { console.error(err); toast('Speichern fehlgeschlagen: ' + (err.code || err.message)); });

function show(screen) {
  for (const s of ['Loading', 'Setup', 'Login', 'App', 'Selftest']) $('screen' + s).hidden = s !== screen;
  $('userBox').hidden = screen !== 'App';
}

/* ---------- Start ---------- */
async function boot() {
  if (location.hash === '#selftest') return runSelftest();
  captureJoinHash();
  if (!firebaseConfig.apiKey) return show('Setup');
  let appM;
  try {
    [appM, authM, fs] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(f => import(FB + f)));
  } catch (e) {
    show('Login'); return loginError('Firebase konnte nicht geladen werden. Bist du online?');
  }
  const app = appM.initializeApp(firebaseConfig);
  auth = authM.getAuth(app);
  try {
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch { db = fs.getFirestore(app); }
  authM.getRedirectResult(auth).catch(loginError);
  authM.onAuthStateChanged(auth, user => {
    S.user = user;
    if (user) startApp(); else stopApp();
  });
}

function captureJoinHash() {
  const m = location.hash.match(/^#join=([\w-]+)\.([\w-]+)$/);
  if (!m) return;
  ssSet('pw_join', m[1] + '.' + m[2]);
  history.replaceState(null, '', location.pathname + location.search);
}

function loginError(err) {
  if (!err) return;
  const el = $('loginError');
  el.textContent = typeof err === 'string' ? err : 'Anmeldung fehlgeschlagen (' + (err.code || err.message) + ').';
  el.hidden = false;
}

async function login() {
  const provider = new authM.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await authM.signInWithPopup(auth, provider);
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      return authM.signInWithRedirect(auth, provider);
    }
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') loginError(err);
  }
}

function startApp() {
  show('App');
  renderUser();
  unsubGroups?.();
  const q = fs.query(fs.collection(db, 'groups'), fs.where('memberUids', 'array-contains', S.user.uid));
  unsubGroups = fs.onSnapshot(q, snap => {
    S.groups = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'event' ? -1 : 1) || a.name.localeCompare(b.name, 'de'));
    if (S.groups.some(g => g.id === S.pendingSelect)) S.pendingSelect = null;
    if (!S.groups.some(g => g.id === S.activeGroupId) && (!S.activeGroupId || S.activeGroupId !== S.pendingSelect)) {
      S.activeGroupId = S.groups[0]?.id || null;
    }
    subscribeExpenses();
    softRender();
  }, err => toast('Gruppen konnten nicht geladen werden: ' + (err.code || err.message)));
  processJoin();
  render();
}

function stopApp() {
  unsubGroups?.(); unsubExp?.();
  unsubGroups = unsubExp = null;
  Object.assign(S, { groups: [], expenses: [], expensesFor: null });
  show('Login');
  if (ssGet('pw_join')) $('loginText').textContent = 'Du wurdest zu einer Gruppe eingeladen. Melde dich an, um beizutreten.';
}

async function processJoin() {
  const token = ssGet('pw_join');
  if (!token) return;
  ssSet('pw_join', null);
  const [gid, code] = token.split('.');
  try {
    await fs.updateDoc(groupRef(gid), { memberUids: fs.arrayUnion(S.user.uid), joinCode: code });
    selectGroup(gid, true);
    S.tab = 'overview';
    toast('Du bist der Gruppe beigetreten 🎉');
  } catch (err) {
    console.error(err);
    toast(err.code === 'permission-denied' || err.code === 'not-found'
      ? 'Der Einladungslink ist ungültig oder wurde erneuert.' : 'Beitritt fehlgeschlagen: ' + (err.code || err.message));
  }
}

function subscribeExpenses() {
  if (S.expensesFor === S.activeGroupId) return;
  unsubExp?.(); unsubExp = null;
  S.expenses = []; S.expensesFor = S.activeGroupId;
  if (!S.activeGroupId) return;
  const gid = S.activeGroupId;
  unsubExp = fs.onSnapshot(expCol(gid), snap => {
    S.expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1);
    softRender();
  }, err => { if (S.activeGroupId === gid) toast('Zahlungen konnten nicht geladen werden: ' + (err.code || err.message)); });
}

/* ---------- Helfer ---------- */
const groupRef = id => fs.doc(db, 'groups', id);
const expCol = gid => fs.collection(db, 'groups', gid, 'expenses');
const activeGroup = () => S.groups.find(g => g.id === S.activeGroupId) || null;
const memberName = (g, id) => id === POT ? '🏦 Kasse' : (g.members.find(m => m.id === id) || { name: '?' }).name;
const myMember = g => g.members.find(m => m.uid === S.user.uid) || null;
const isRecurring = g => g.kind === 'recurring';
const periodWord = g => isRecurring(g) ? (g.period === 'week' ? 'Woche' : 'Monat') : 'Ereignis';
function cursor(g) { return S.cursor[g.id] || (S.cursor[g.id] = C.periodKey(C.today(), g.period)); }
function visibleExpenses(g) {
  return isRecurring(g) ? S.expenses.filter(e => C.periodKey(e.date, g.period) === cursor(g)) : S.expenses;
}
function usesPot(g) { return g.potEnabled || S.expenses.some(e => e.payerId === POT || e.shares.some(s => s.memberId === POT)); }
function defaultDate(g) {
  if (!isRecurring(g)) return C.today();
  return C.periodKey(C.today(), g.period) === cursor(g) ? C.today() : C.periodStart(cursor(g), g.period);
}
function newExpenseId(gid) { return fs.doc(expCol(gid)).id; }
function saveExpense(g, id, data) {
  write(fs.setDoc(fs.doc(expCol(g.id), id), { ...data, createdBy: S.user.uid, updatedAt: fs.serverTimestamp() }));
}

/* ---------- Aktionen ---------- */
function selectGroup(id, pending = false) {
  S.activeGroupId = id; S.editingId = null; S.view = null;
  if (pending) S.pendingSelect = id;
  if (S.tab === 'add') S.tab = 'overview';
  lsSet('pw_active', id);
  subscribeExpenses();
  render();
}

function readGroupForm() {
  const name = $('gName').value.trim();
  const kind = document.querySelector('input[name=gKind]:checked').value;
  const potEnabled = $('gPot').checked;
  const target = $('gTarget').value.trim() ? parseAmount($('gTarget').value) : 0;
  if (!name) return alert('Bitte einen Namen eingeben.');
  if (isNaN(target) || target < 0) return alert('Bitte einen gültigen Sollbeitrag eingeben (z. B. 300).');
  return {
    name: name.slice(0, 80), kind,
    period: kind === 'recurring' ? $('gPeriod').value : null,
    startDate: kind === 'event' ? ($('gStart').value || null) : null,
    endDate: kind === 'event' ? ($('gEnd').value || null) : null,
    potEnabled, potTargetCents: potEnabled ? target : 0,
  };
}

function createGroup() {
  const data = readGroupForm(); if (!data) return;
  const myName = ($('gMyName').value.trim() || S.user.displayName || 'Ich').slice(0, 40);
  const ref = fs.doc(fs.collection(db, 'groups'));
  write(fs.setDoc(ref, {
    ...data,
    members: [{ id: C.uid(), name: myName, uid: S.user.uid }],
    memberUids: [S.user.uid],
    inviteCode: C.randomCode(),
    createdBy: S.user.uid,
    createdAt: fs.serverTimestamp(),
  }));
  S.tab = 'group';
  selectGroup(ref.id, true);
}

function saveSettings() {
  const g = activeGroup(); if (!g) return;
  const data = readGroupForm(); if (!data) return;
  write(fs.updateDoc(groupRef(g.id), data));
  toast('Einstellungen gespeichert');
}

async function deleteOrLeaveGroup() {
  const g = activeGroup(); if (!g) return;
  if (g.createdBy === S.user.uid) {
    if (!confirm(`Gruppe „${g.name}“ mit allen Zahlungen für alle Mitglieder löschen?`)) return;
    try {
      const snap = await fs.getDocs(expCol(g.id));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const b = fs.writeBatch(db);
        snap.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
        await b.commit();
      }
      await fs.deleteDoc(groupRef(g.id));
      toast('Gruppe gelöscht');
    } catch (err) { toast('Löschen fehlgeschlagen: ' + (err.code || err.message)); }
  } else {
    if (!confirm(`Gruppe „${g.name}“ verlassen? Deine Zahlungen bleiben für die anderen erhalten.`)) return;
    write(fs.updateDoc(groupRef(g.id), {
      members: g.members.map(m => m.uid === S.user.uid ? { ...m, uid: null } : m),
      memberUids: g.memberUids.filter(u => u !== S.user.uid),
    }));
  }
}

function claimMember(memberId) {
  const g = activeGroup(); if (!g) return;
  let members;
  if (memberId) members = g.members.map(m => m.id === memberId ? { ...m, uid: S.user.uid } : m);
  else {
    const name = ($('claimName').value.trim() || S.user.displayName || 'Ich').slice(0, 40);
    if (g.members.some(m => m.name.toLowerCase() === name.toLowerCase())) return alert('Name existiert bereits in der Gruppe – wähle ihn oben aus oder nimm einen anderen.');
    members = [...g.members, { id: C.uid(), name, uid: S.user.uid }];
  }
  write(fs.updateDoc(groupRef(g.id), { members }));
}

function addMember() {
  const g = activeGroup(); if (!g) return;
  const inp = $('newMemberName');
  const name = inp.value.trim().slice(0, 40);
  if (!name) return;
  if (g.members.some(m => m.name.toLowerCase() === name.toLowerCase())) return alert('Name existiert bereits in der Gruppe.');
  inp.value = '';
  write(fs.updateDoc(groupRef(g.id), { members: [...g.members, { id: C.uid(), name, uid: null }] }));
}
function removeMember(id) {
  const g = activeGroup(); if (!g) return;
  const m = g.members.find(x => x.id === id);
  const used = S.expenses.some(e => e.payerId === id || e.shares.some(s => s.memberId === id));
  if (used) return alert('Mitglied ist an Zahlungen beteiligt und kann nicht entfernt werden. Lösche zuerst die betreffenden Zahlungen.');
  if (m.uid && !confirm(`${m.name} hat ein Konto verknüpft und verliert den Zugriff auf die Gruppe. Fortfahren?`)) return;
  write(fs.updateDoc(groupRef(g.id), {
    members: g.members.filter(x => x.id !== id),
    memberUids: g.memberUids.filter(u => u !== m.uid),
  }));
}

function inviteLink(g) { return `${location.origin}${location.pathname}#join=${g.id}.${g.inviteCode}`; }
async function copyInvite() {
  const g = activeGroup(); if (!g) return;
  try { await navigator.clipboard.writeText(inviteLink(g)); toast('Einladungslink kopiert'); }
  catch { $('inviteInput').select(); toast('Bitte den markierten Link kopieren'); }
}
function renewInvite() {
  const g = activeGroup(); if (!g) return;
  if (!confirm('Neuen Link erzeugen? Der alte Link funktioniert dann nicht mehr.')) return;
  write(fs.updateDoc(groupRef(g.id), { inviteCode: C.randomCode() }));
}

function shiftCursor(n) {
  const g = activeGroup(); if (!g) return;
  S.cursor[g.id] = C.shiftPeriod(cursor(g), g.period, n);
  render();
}

function submitExpense() {
  const g = activeGroup(); if (!g) return;
  const desc = $('expDesc').value.trim().slice(0, 200);
  const amount = parseAmount($('expAmount').value);
  const payerId = $('expPayer').value;
  const date = $('expDate').value || C.today();
  const mode = $('expMode').value;
  const category = $('expCat').value;

  if (!desc) return alert('Bitte eine Beschreibung eingeben.');
  if (isNaN(amount) || amount <= 0) return alert('Bitte einen gültigen Betrag eingeben (z. B. 12,50).');
  if (!payerId) return alert('Bitte auswählen, wer bezahlt hat.');

  const checked = [...document.querySelectorAll('.p-check:checked')].map(cb => cb.dataset.mid);
  if (checked.length === 0) return alert('Bitte mindestens eine beteiligte Person auswählen.');
  const valOf = mid => [...document.querySelectorAll('.p-val')].find(i => i.dataset.mid === mid).value;

  let shares;
  if (mode === 'equal') {
    shares = C.computeEqualShares(amount, checked);
  } else if (mode === 'exact') {
    shares = [];
    let sum = 0;
    for (const mid of checked) {
      const v = parseAmount(valOf(mid));
      if (isNaN(v) || v < 0) return alert(`Ungültiger Betrag bei ${memberName(g, mid)}.`);
      shares.push({ memberId: mid, cents: v });
      sum += v;
    }
    if (sum !== amount) return alert(`Die Einzelbeträge (${fmt(sum)}) müssen den Gesamtbetrag (${fmt(amount)}) ergeben.`);
  } else {
    const entries = [];
    for (const mid of checked) {
      const w = parseFloat((valOf(mid) || '').replace(',', '.'));
      if (isNaN(w) || w <= 0) return alert(`Ungültiger Anteil bei ${memberName(g, mid)}.`);
      entries.push({ memberId: mid, weight: w });
    }
    shares = C.computeShareSplit(amount, entries);
  }

  const type = payerId === POT ? 'potExpense' : 'expense';
  saveExpense(g, S.editingId || newExpenseId(g.id), { type, desc, amountCents: amount, payerId, date, mode, shares, category });
  if (isRecurring(g)) S.cursor[g.id] = C.periodKey(date, g.period);
  S.editingId = null;
  S.tab = 'expenses';
  render();
}

function submitSettlement(fromId, toId, cents) {
  const g = activeGroup(); if (!g) return;
  let from = fromId, to = toId, amt = cents;
  if (!from) {
    from = $('setFrom').value; to = $('setTo').value;
    amt = parseAmount($('setAmount').value);
    if (from === to) return alert('Zahler und Empfänger müssen verschieden sein.');
    if (isNaN(amt) || amt <= 0) return alert('Bitte einen gültigen Betrag eingeben.');
    $('setAmount').value = '';
  }
  saveExpense(g, newExpenseId(g.id), {
    type: 'settlement', desc: 'Ausgleichszahlung', amountCents: amt, payerId: from,
    date: C.today(), mode: 'exact', shares: [{ memberId: to, cents: amt }], category: 'other',
  });
  toast('Ausgleichszahlung erfasst');
  if (S.tab !== 'add') render();
}

function submitContribution() {
  const g = activeGroup(); if (!g) return;
  const from = $('conFrom').value;
  const amt = parseAmount($('conAmount').value);
  const date = $('conDate').value || C.today();
  if (isNaN(amt) || amt <= 0) return alert('Bitte einen gültigen Betrag eingeben.');
  saveExpense(g, newExpenseId(g.id), {
    type: 'contribution', desc: 'Einzahlung in die Kasse', amountCents: amt, payerId: from,
    date, mode: 'exact', shares: [{ memberId: POT, cents: amt }], category: 'other',
  });
  $('conAmount').value = g.potTargetCents ? C.centsToInput(g.potTargetCents) : '';
  toast(`${memberName(g, from)} hat ${fmt(amt)} eingezahlt`);
}

function deleteExpense(id) {
  const g = activeGroup(); if (!g) return;
  if (!confirm('Diesen Eintrag löschen?')) return;
  write(fs.deleteDoc(fs.doc(expCol(g.id), id)));
  if (S.editingId === id) S.editingId = null;
}

/* ---------- Migration aus der alten Browser-Version ---------- */
function legacyData() {
  try { const d = JSON.parse(lsGet(LEGACY_KEY)); return d?.groups?.length ? d : null; } catch { return null; }
}
async function migrate() {
  const local = legacyData(); if (!local) return;
  if (!confirm(`${local.groups.length} lokale Gruppe(n) in die Cloud übernehmen?`)) return;
  try {
    for (const lg of local.groups) {
      const ref = fs.doc(fs.collection(db, 'groups'));
      await fs.setDoc(ref, {
        name: String(lg.name).slice(0, 80), kind: 'event', period: null, startDate: null, endDate: null,
        potEnabled: false, potTargetCents: 0,
        members: lg.members.map(m => ({ id: m.id, name: String(m.name).slice(0, 40), uid: null })),
        memberUids: [S.user.uid], inviteCode: C.randomCode(), createdBy: S.user.uid, createdAt: fs.serverTimestamp(),
      });
      for (let i = 0; i < lg.expenses.length; i += 400) {
        const b = fs.writeBatch(db);
        for (const e of lg.expenses.slice(i, i + 400)) {
          const { id, ...rest } = e;
          b.set(fs.doc(expCol(ref.id), id), { ...rest, desc: String(rest.desc).slice(0, 200), category: 'other', createdBy: S.user.uid, updatedAt: fs.serverTimestamp() });
        }
        await b.commit();
      }
    }
    lsSet(LEGACY_KEY + '_migrated', lsGet(LEGACY_KEY));
    lsSet(LEGACY_KEY, null);
    toast('Übernommen – wähle in jeder Gruppe aus, wer du bist.');
    renderSidebar();
  } catch (err) { toast('Übernahme fehlgeschlagen: ' + (err.code || err.message)); }
}

/* ---------- Ereignis-Verdrahtung (keine Inline-Handler) ---------- */
const actions = {
  login, newGroup: () => { S.view = 'newGroup'; S.editingId = null; render(); },
  cancelNewGroup: () => { S.view = null; render(); },
  createGroup, saveSettings, deleteOrLeaveGroup, migrate, copyInvite, renewInvite, addMember,
  logout: () => authM.signOut(auth),
  selectGroup: d => selectGroup(d.id),
  tab: d => { S.tab = d.tab; if (d.tab !== 'add') S.editingId = null; render(); },
  prevPeriod: () => shiftCursor(-1), nextPeriod: () => shiftCursor(1),
  thisPeriod: () => { const g = activeGroup(); delete S.cursor[g.id]; render(); },
  claim: d => claimMember(d.id || null),
  removeMember: d => removeMember(d.id),
  submitExpense, cancelEdit: () => { S.editingId = null; S.tab = 'expenses'; render(); },
  submitSettlement: () => submitSettlement(),
  settleDebt: d => submitSettlement(d.from, d.to, Number(d.cents)),
  submitContribution,
  editExpense: d => { S.editingId = d.id; S.tab = 'add'; render(); },
  deleteExpense: d => deleteExpense(d.id),
  groupKind: () => { const r = document.querySelector('input[name=gKind]:checked').value; $('gRecurringFields').hidden = r !== 'recurring'; $('gEventFields').hidden = r !== 'event'; },
  togglePot: () => { $('gTargetField').hidden = !$('gPot').checked; },
  renderParticipants: () => renderParticipants(),
  updateSplitHint: () => updateSplitHint(),
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-action]');
  if (!t || !actions[t.dataset.action]) return;
  if (t.tagName === 'A') e.preventDefault();
  actions[t.dataset.action](t.dataset, t, e);
});
document.addEventListener('change', e => { const a = e.target.dataset?.change; if (a) actions[a]?.(e.target.dataset, e.target); });
document.addEventListener('input', e => { const a = e.target.dataset?.input; if (a) actions[a]?.(e.target.dataset, e.target); });
document.addEventListener('keydown', e => {
  const a = e.key === 'Enter' && e.target.dataset?.enter;
  if (a) { e.preventDefault(); actions[a]?.(e.target.dataset, e.target); }
});
// Tooltip für Diagramme
const tip = $('tip');
document.addEventListener('pointerover', e => {
  const t = e.target.closest('[data-tip]');
  if (!t) { tip.hidden = true; return; }
  tip.textContent = t.dataset.tip; tip.hidden = false;
});
document.addEventListener('pointermove', e => {
  if (tip.hidden) return;
  const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8);
  tip.style.left = x + 'px'; tip.style.top = (e.clientY + 14) + 'px';
});
document.addEventListener('scroll', () => tip.hidden = true, true);

/* ---------- Rendering ---------- */
function render() { renderSidebar(); renderMain(); }
// Bei Echtzeit-Updates kein Neuaufbau, während jemand gerade tippt
function softRender() {
  const ae = document.activeElement;
  const typing = ae && ae.closest?.('#mainArea') && /INPUT|SELECT|TEXTAREA/.test(ae.tagName) && ae.value;
  renderSidebar();
  if (!(S.tab === 'add' || S.view === 'newGroup' || typing)) renderMain();
}

function renderUser() {
  const u = S.user;
  $('userBox').innerHTML = `${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : ''}
    <span class="uname">${esc(u.displayName || u.email || '')}</span>
    <button class="btn small" data-action="logout">Abmelden</button>`;
}

function renderSidebar() {
  const local = legacyData();
  $('migrateBox').innerHTML = local ? `<div class="banner warn">In diesem Browser liegen noch ${local.groups.length} Gruppe(n) aus der alten Version.
    <button class="btn small" style="margin-top:8px" data-action="migrate">In die Cloud übernehmen</button></div>` : '';
  const el = $('groupList');
  if (S.groups.length === 0) { el.innerHTML = '<div class="empty">Noch keine Gruppen.</div>'; return; }
  el.innerHTML = S.groups.map(g => `
    <div class="group-item ${g.id === S.activeGroupId && !S.view ? 'active' : ''}" data-action="selectGroup" data-id="${esc(g.id)}">
      <span>${isRecurring(g) ? '🔁' : '✈️'} ${esc(g.name)}</span>
      <span class="sub">${g.potEnabled ? '🏦' : ''} ${g.memberUids.length > 1 ? '👥' : ''}</span>
    </div>`).join('');
}

function renderMain() {
  const el = $('mainArea');
  if (S.view === 'newGroup') { el.innerHTML = renderGroupForm(null); return; }
  const g = activeGroup();
  if (!g) {
    el.innerHTML = `<div class="card"><h2>Willkommen bei PookieWise</h2>
      <p style="font-size:14.5px;line-height:1.6">Lege eine Gruppe an: ein <b>Ereignis</b> wie „Italien-Urlaub“ oder <b>laufende Ausgaben</b>
      wie „Haushalt“ mit Monats- oder Wochenansicht. Optional bekommt jede Gruppe eine <b>gemeinsame Kasse</b>.
      Über einen Einladungslink teilst du die Gruppe mit anderen – alle sehen Änderungen sofort.</p>
      <button class="btn" style="margin-top:12px" data-action="newGroup">+ Neue Gruppe</button></div>`;
    return;
  }
  if (!myMember(g)) { el.innerHTML = renderClaim(g); return; }

  const vis = visibleExpenses(g);
  const spend = vis.filter(C.isSpending);
  const tabs = [
    ['overview', 'Übersicht'],
    ['expenses', 'Zahlungen'],
    ['add', S.editingId ? 'Zahlung bearbeiten' : '+ Eintragen'],
    ['balances', 'Wer schuldet wem?'],
    ['group', `Gruppe (${g.members.length})`],
  ];
  let html = `<div class="group-title">${isRecurring(g) ? '🔁' : '✈️'} ${esc(g.name)}
      <span class="badge">${spend.length} Ausgaben · ${fmt(spend.reduce((s, e) => s + e.amountCents, 0))}</span>
      ${usesPot(g) ? `<span class="badge pot">🏦 Kasse ${fmt(C.potCash(S.expenses))}</span>` : ''}
    </div>`;
  if (isRecurring(g) && ['overview', 'expenses'].includes(S.tab)) {
    const cur = C.periodKey(C.today(), g.period) === cursor(g);
    html += `<div class="period-nav">
      <button class="btn secondary small" data-action="prevPeriod" aria-label="Vorherige Periode">‹</button>
      <span class="label">${esc(C.periodLabel(cursor(g), g.period))}</span>
      <button class="btn secondary small" data-action="nextPeriod" aria-label="Nächste Periode">›</button>
      ${cur ? '' : `<button class="btn secondary small" data-action="thisPeriod">Heute</button>`}
    </div>`;
  }
  html += `<div class="tabs">${tabs.map(([k, label]) =>
    `<button class="tab ${S.tab === k ? 'active' : ''}" data-action="tab" data-tab="${k}">${label}</button>`).join('')}</div>`;

  if (S.tab === 'group') html += renderGroupTab(g);
  else if (g.members.length < 2 && !g.potEnabled) html += `<div class="card"><div class="empty">Füge zuerst eine weitere Person hinzu (Tab „Gruppe“) – oder schalte dort die Kasse ein.</div></div>`;
  else if (S.tab === 'add') html += renderForm(g);
  else if (S.tab === 'balances') html += renderBalances(g);
  else if (S.tab === 'expenses') html += renderExpenses(g, vis);
  else html += renderOverview(g, vis);

  const focusId = document.activeElement?.id;
  el.innerHTML = html;
  if (S.tab === 'add' && $('expForm')) initForm(g);
  if (focusId && el.querySelector('#' + focusId)) $(focusId).focus();
}

function renderClaim(g) {
  const free = g.members.filter(m => !m.uid);
  return `<div class="group-title">${esc(g.name)}</div>
    <div class="card"><h2>Wer bist du in dieser Gruppe?</h2>
      ${free.length ? `<p style="font-size:14px">Wähle deinen Namen, damit deine bisherigen Zahlungen dir zugeordnet werden:</p>
        <div class="claim-list">${free.map(m => `<button class="btn secondary" data-action="claim" data-id="${esc(m.id)}">${esc(m.name)}</button>`).join('')}</div>
        <h3 style="margin-top:18px">… oder als neue Person beitreten</h3>` : '<p style="font-size:14px;margin-bottom:10px">Unter welchem Namen möchtest du in der Gruppe erscheinen?</p>'}
      <div class="row"><input type="text" id="claimName" maxlength="40" value="${esc(S.user.displayName?.split(' ')[0] || '')}" data-enter="claim">
        <button class="btn" style="flex:0 0 auto" data-action="claim">Beitreten</button></div>
    </div>`;
}

function renderGroupForm(g) {
  const kind = g?.kind || 'event';
  const pot = g ? g.potEnabled : false;
  return `<div class="card"><h2>${g ? 'Einstellungen' : 'Neue Gruppe'}</h2>
    <div class="field"><label>Name</label><input type="text" id="gName" maxlength="80" placeholder="z. B. Italien-Urlaub, Haushalt…" value="${esc(g?.name || '')}"></div>
    <div class="field"><label>Art</label>
      <div class="seg">
        <label><input type="radio" name="gKind" value="event" data-change="groupKind" ${kind === 'event' ? 'checked' : ''}>✈️ Ereignis</label>
        <label><input type="radio" name="gKind" value="recurring" data-change="groupKind" ${kind === 'recurring' ? 'checked' : ''}>🔁 Laufend</label>
      </div></div>
    <div class="row" id="gEventFields" ${kind === 'event' ? '' : 'hidden'}>
      <div class="field"><label>Von (optional)</label><input type="date" id="gStart" value="${esc(g?.startDate || '')}"></div>
      <div class="field"><label>Bis (optional)</label><input type="date" id="gEnd" value="${esc(g?.endDate || '')}"></div>
    </div>
    <div class="field" id="gRecurringFields" ${kind === 'recurring' ? '' : 'hidden'}><label>Abrechnung pro</label>
      <select id="gPeriod"><option value="month" ${g?.period !== 'week' ? 'selected' : ''}>Monat</option><option value="week" ${g?.period === 'week' ? 'selected' : ''}>Woche</option></select></div>
    <label class="check"><input type="checkbox" id="gPot" data-change="togglePot" ${pot ? 'checked' : ''}> 🏦 Gemeinsame Kasse führen</label>
    <div class="field" id="gTargetField" ${pot ? '' : 'hidden'}><label>Sollbeitrag pro Person (optional, pro Monat/Woche bzw. für das Ereignis)</label>
      <input type="text" id="gTarget" inputmode="decimal" placeholder="z. B. 300" value="${g?.potTargetCents ? C.centsToInput(g.potTargetCents) : ''}"></div>
    ${g ? '' : `<div class="field"><label>Dein Name in der Gruppe</label><input type="text" id="gMyName" maxlength="40" value="${esc(S.user.displayName?.split(' ')[0] || '')}"></div>`}
    <div style="display:flex;gap:8px">
      <button class="btn" data-action="${g ? 'saveSettings' : 'createGroup'}">${g ? 'Speichern' : 'Gruppe anlegen'}</button>
      ${g ? '' : '<button class="btn secondary" data-action="cancelNewGroup">Abbrechen</button>'}
    </div></div>`;
}

function renderGroupTab(g) {
  const isOwner = g.createdBy === S.user.uid;
  return `<div class="card"><h2>Mitglieder</h2>
      <div>${g.members.map(m => `<span class="member-chip">${esc(m.name)}${m.uid === S.user.uid ? ' <small>(du)</small>' : m.uid ? ' <small>👤</small>' : ''}
        <button title="Entfernen" data-action="removeMember" data-id="${esc(m.id)}">✕</button></span>`).join('')}</div>
      <div class="row" style="margin-top:12px">
        <input type="text" id="newMemberName" maxlength="40" placeholder="Name (auch ohne Konto möglich)…" data-enter="addMember">
        <button class="btn" style="flex:0 0 auto" data-action="addMember">Hinzufügen</button>
      </div>
      <p class="note">👤 = mit Konto verknüpft. Personen ohne Konto (z. B. Freunde im Urlaub) kannst du einfach als Namen anlegen.
      Wer später per Link beitritt, kann sich einem dieser Namen zuordnen.</p>
    </div>
    <div class="card"><h2>Einladen</h2>
      <div class="invite"><input type="text" id="inviteInput" readonly value="${esc(inviteLink(g))}">
        <button class="btn" style="flex:0 0 auto" data-action="copyInvite">Link kopieren</button></div>
      <p class="note">Schick den Link z. B. deiner Partnerin. Wer ihn öffnet und sich mit Google anmeldet, tritt der Gruppe bei.
      <a href="#" data-action="renewInvite">Neuen Link erzeugen</a> macht den alten ungültig.</p>
    </div>
    ${renderGroupForm(g)}
    <div class="card"><h2>${isOwner ? 'Gruppe löschen' : 'Gruppe verlassen'}</h2>
      <button class="btn danger" data-action="deleteOrLeaveGroup">${isOwner ? 'Gruppe für alle löschen' : 'Gruppe verlassen'}</button></div>`;
}

function renderExpenses(g, vis) {
  if (vis.length === 0) return `<div class="card"><div class="empty">Noch keine Einträge${isRecurring(g) ? ' in diesem Zeitraum' : ''}. Trage den ersten über „+ Eintragen“ ein.</div></div>`;
  const modeLabel = { equal: 'gleichmäßig', exact: 'exakte Beträge', shares: 'nach Anteilen' };
  const rows = [...vis].reverse().map(e => {
    const d = new Date(e.date + 'T00:00:00');
    const date = `<div class="date">${d.toLocaleString('de-DE', { month: 'short' })}<b>${d.getDate()}</b></div>`;
    const del = `<button class="icon-btn" title="Löschen" data-action="deleteExpense" data-id="${esc(e.id)}">🗑️</button>`;
    if (e.type === 'settlement' || e.type === 'contribution') {
      const title = e.type === 'settlement' ? '💸 Ausgleichszahlung' : '🏦 Einzahlung in die Kasse';
      const sub = e.type === 'settlement' ? `${esc(memberName(g, e.payerId))} → ${esc(memberName(g, e.shares[0].memberId))}` : `${esc(memberName(g, e.payerId))} hat eingezahlt`;
      return `<div class="expense">${date}
        <div class="desc"><div class="title">${title}</div><div class="sub">${sub}</div></div>
        <div class="amount settle">${fmt(e.amountCents)}</div><div class="actions">${del}</div></div>`;
    }
    const who = e.payerId === POT ? 'aus der Kasse bezahlt' : `${esc(memberName(g, e.payerId))} hat bezahlt`;
    return `<div class="expense">${date}
      <div class="desc"><div class="title">${cat(e.category).icon} ${esc(e.desc)}</div>
        <div class="sub">${who} · ${e.shares.length} Beteiligte · ${modeLabel[e.mode] || ''}</div></div>
      <div class="amount">${fmt(e.amountCents)}</div>
      <div class="actions">
        <button class="icon-btn" title="Bearbeiten" data-action="editExpense" data-id="${esc(e.id)}">✏️</button>${del}
      </div></div>`;
  }).join('');
  return `<div class="card"><h2>${isRecurring(g) ? 'Einträge im Zeitraum' : 'Alle Einträge'}</h2>${rows}</div>`;
}

function memberOptions(g, withPot) {
  return (withPot ? `<option value="${POT}">🏦 Kasse</option>` : '') +
    g.members.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
}

function renderForm(g) {
  const editing = S.editingId ? S.expenses.find(e => e.id === S.editingId) : null;
  const pot = usesPot(g);
  const people = memberOptions(g, false);
  let html = '';
  if (g.members.length >= 1) html += `<div class="card" id="expForm">
    <h2>${editing ? 'Zahlung bearbeiten' : 'Neue Ausgabe'}</h2>
    <div class="field"><label>Beschreibung</label>
      <input type="text" id="expDesc" maxlength="200" placeholder="z. B. Supermarkt, Pizza, Hotel…"></div>
    <div class="row">
      <div class="field"><label>Betrag (€)</label>
        <input type="text" id="expAmount" inputmode="decimal" placeholder="0,00" data-input="updateSplitHint"></div>
      <div class="field"><label>Bezahlt von</label>
        <select id="expPayer"><option value="">– wählen –</option>${memberOptions(g, pot)}</select></div>
      <div class="field"><label>Datum</label><input type="date" id="expDate"></div>
    </div>
    <div class="row">
      <div class="field"><label>Kategorie</label>
        <select id="expCat">${CATEGORIES.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}</select></div>
      <div class="field"><label>Aufteilung</label>
        <select id="expMode" data-change="renderParticipants">
          <option value="equal">Gleichmäßig</option><option value="exact">Exakte Beträge</option><option value="shares">Nach Anteilen</option>
        </select></div>
    </div>
    <div class="field"><label>Beteiligte</label>
      <div class="participants" id="participants"></div>
      <div class="split-hint" id="splitHint"></div></div>
    <div style="display:flex;gap:8px">
      <button class="btn" data-action="submitExpense">${editing ? 'Änderungen speichern' : 'Ausgabe speichern'}</button>
      ${editing ? '<button class="btn secondary" data-action="cancelEdit">Abbrechen</button>' : ''}
    </div>
  </div>`;
  if (g.potEnabled && !editing) html += `<div class="card">
    <h2>🏦 Einzahlung in die Kasse</h2>
    <div class="row" style="align-items:flex-end">
      <div class="field" style="margin-bottom:0"><label>Von</label><select id="conFrom">${people}</select></div>
      <div class="field" style="margin-bottom:0"><label>Betrag (€)</label><input type="text" id="conAmount" inputmode="decimal" placeholder="0,00" value="${g.potTargetCents ? C.centsToInput(g.potTargetCents) : ''}"></div>
      <div class="field" style="margin-bottom:0"><label>Datum</label><input type="date" id="conDate" value="${defaultDate(g)}"></div>
      <button class="btn" style="flex:0 0 auto" data-action="submitContribution">Einzahlen</button>
    </div></div>`;
  if (!editing && (g.members.length >= 2 || pot)) html += `<div class="card">
    <h2>Ausgleichszahlung erfassen</h2>
    <div class="row" style="align-items:flex-end">
      <div class="field" style="margin-bottom:0"><label>Von</label><select id="setFrom">${memberOptions(g, pot)}</select></div>
      <div class="field" style="margin-bottom:0"><label>An</label><select id="setTo">${memberOptions(g, pot)}</select></div>
      <div class="field" style="margin-bottom:0"><label>Betrag (€)</label><input type="text" id="setAmount" inputmode="decimal" placeholder="0,00"></div>
      <button class="btn orange" style="flex:0 0 auto" data-action="submitSettlement">Erfassen</button>
    </div></div>`;
  return html;
}

function initForm(g) {
  const editing = S.editingId ? S.expenses.find(e => e.id === S.editingId) : null;
  $('expDate').value = editing ? editing.date : defaultDate(g);
  if (editing) {
    $('expDesc').value = editing.desc;
    $('expAmount').value = C.centsToInput(editing.amountCents);
    $('expPayer').value = editing.payerId;
    $('expMode').value = editing.mode;
    $('expCat').value = cat(editing.category).id;
  } else {
    $('expPayer').value = myMember(g)?.id || '';
  }
  renderParticipants(editing);
}

function renderParticipants(editing) {
  const g = activeGroup(); if (!g) return;
  editing = editing || (S.editingId ? S.expenses.find(e => e.id === S.editingId) : null);
  const mode = $('expMode').value;
  const prev = {};
  document.querySelectorAll('.p-check').forEach(cb => prev[cb.dataset.mid] = cb.checked);
  const hasPrev = Object.keys(prev).length > 0;

  $('participants').innerHTML = g.members.map(m => {
    let checkedAttr, val = '';
    if (hasPrev) checkedAttr = prev[m.id] ? 'checked' : '';
    else if (editing) {
      const sh = editing.shares.find(s => s.memberId === m.id);
      checkedAttr = sh ? 'checked' : '';
      if (sh && mode === 'exact' && editing.mode === 'exact') val = C.centsToInput(sh.cents);
    } else checkedAttr = 'checked';
    const input = mode === 'equal' ? '' :
      `<input type="text" class="split-input p-val" data-mid="${esc(m.id)}" inputmode="decimal"
        placeholder="${mode === 'exact' ? '0,00 €' : 'Anteile'}" value="${val}" data-input="updateSplitHint">`;
    return `<div class="participant-row">
      <label><input type="checkbox" class="p-check" data-mid="${esc(m.id)}" ${checkedAttr} data-change="updateSplitHint">${esc(m.name)}</label>
      ${input}</div>`;
  }).join('');
  updateSplitHint();
}

function updateSplitHint() {
  const hint = $('splitHint'); if (!hint) return;
  const mode = $('expMode').value;
  const amount = parseAmount($('expAmount').value);
  const checked = [...document.querySelectorAll('.p-check:checked')].map(cb => cb.dataset.mid);
  const valOf = mid => [...document.querySelectorAll('.p-val')].find(i => i.dataset.mid === mid).value;
  hint.classList.remove('error');
  if (checked.length === 0) { hint.textContent = 'Keine Person ausgewählt.'; hint.classList.add('error'); return; }
  if (mode === 'equal') {
    hint.textContent = isNaN(amount) ? `${checked.length} Beteiligte – Betrag wird gleichmäßig geteilt.` :
      `${fmt(Math.round(amount / checked.length))} pro Person (${checked.length} Beteiligte).`;
  } else if (mode === 'exact') {
    let sum = 0, ok = true;
    checked.forEach(mid => { const v = parseAmount(valOf(mid)); if (isNaN(v)) ok = false; else sum += v; });
    if (!ok) hint.textContent = 'Trage für jede beteiligte Person einen Betrag ein.';
    else if (!isNaN(amount) && sum !== amount) { hint.textContent = `Summe ${fmt(sum)} ≠ Gesamtbetrag ${fmt(amount)} (Differenz ${fmt(amount - sum)}).`; hint.classList.add('error'); }
    else hint.textContent = `Summe: ${fmt(sum)} ✓`;
  } else {
    let total = 0, ok = true;
    checked.forEach(mid => { const w = parseFloat((valOf(mid) || '').replace(',', '.')); if (isNaN(w) || w <= 0) ok = false; else total += w; });
    hint.textContent = ok ? `Gesamt ${total} Anteile – z. B. 2 Anteile = doppelter Betrag.` : 'Trage für jede beteiligte Person eine Anteilszahl ein (z. B. 1, 2, 0,5).';
  }
}

function renderBalances(g) {
  const pot = usesPot(g);
  const ids = g.members.map(m => m.id);
  // immer kumuliert über alle Perioden; die Kasse wird getrennt betrachtet
  const { personTx, potTx } = C.splitPot(S.expenses);
  const b = C.balances(ids, personTx);
  const debts = C.simplifyDebts(b);
  const balHtml = g.members.map(m => {
    const v = b[m.id];
    const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero';
    const label = v > 0 ? 'bekommt' : v < 0 ? 'schuldet' : '';
    return `<div class="balance-row"><span>${esc(m.name)}</span>
      <span class="${cls}">${label ? label + ' ' : ''}${v === 0 ? '±0,00 €' : fmt(Math.abs(v))}</span></div>`;
  }).join('');
  const debtHtml = debts.length === 0
    ? '<div class="empty">🎉 Alles ausgeglichen – niemand schuldet jemandem etwas.</div>'
    : debts.map(d => `<div class="debt-row">
        <span class="who">${esc(memberName(g, d.from))}</span><span class="arrow">schuldet</span>
        <span class="who">${esc(memberName(g, d.to))}</span>
        <span class="amt neg">${fmt(d.cents)}</span>
        <button class="btn small orange" data-action="settleDebt" data-from="${esc(d.from)}" data-to="${esc(d.to)}" data-cents="${d.cents}">Als erledigt markieren</button>
      </div>`).join('');
  let potHtml = '';
  if (pot) {
    const stake = C.balances(ids, potTx);
    potHtml = `<div class="card"><h2>🏦 Kasse</h2>
      <div class="balance-row"><span><b>Kassenstand</b></span><span class="pos">${fmt(C.potCash(S.expenses))}</span></div>
      <h3>Anteil am Kassenstand</h3>
      ${g.members.map(m => {
        const v = stake[m.id];
        const btn = v > 0 ? `<button class="btn small secondary" data-action="settleDebt" data-from="${POT}" data-to="${esc(m.id)}" data-cents="${v}">Auszahlen</button>`
          : v < 0 ? `<button class="btn small secondary" data-action="settleDebt" data-from="${esc(m.id)}" data-to="${POT}" data-cents="${-v}">Nachzahlen</button>` : '';
        return `<div class="debt-row"><span class="who">${esc(m.name)}</span>
          <span class="amt ${v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'}">${v < 0 ? 'schuldet der Kasse ' + fmt(-v) : fmt(v)}</span>${btn}</div>`;
      }).join('')}
      <p class="note">Anteil = eigene Einzahlungen minus eigener Anteil an den Ausgaben aus der Kasse. Löst ihr die Kasse auf
      (z. B. am Ende des Urlaubs), bekommt jede Person ihren Anteil ausgezahlt, und dann geht alles auf.</p></div>`;
  }
  return `<div class="card"><h2>Vereinfachte Schulden</h2>${debtHtml}
      ${pot ? '<p class="note">Ohne die Kasse: Geld in der Kasse und Ausgaben daraus stehen unten.</p>' : ''}
      ${isRecurring(g) ? '<p class="note">Salden gelten über alle Zeiträume hinweg.</p>' : ''}</div>
    ${potHtml}
    <div class="card"><h2>Saldo pro Person</h2>${balHtml}</div>`;
}

/* ---------- Übersicht ---------- */
function renderOverview(g, vis) {
  const st = C.spendingStats(vis);
  const me = myMember(g);
  const kpis = [];
  kpis.push(kpi(isRecurring(g) ? `Ausgaben im ${g.period === 'week' ? 'Zeitraum' : 'Monat'}` : 'Ausgaben gesamt', fmt(st.total), `${st.count} Ausgaben`));
  if (isRecurring(g)) {
    const prevKey = C.shiftPeriod(cursor(g), g.period, -1);
    const prev = C.spendingStats(S.expenses.filter(e => C.periodKey(e.date, g.period) === prevKey)).total;
    const delta = prev ? Math.round((st.total - prev) / prev * 100) : null;
    kpis.push(kpi('Vorperiode', fmt(prev), delta == null ? 'keine Daten' : `${delta > 0 ? '+' : ''}${delta} % im Vergleich`));
  } else {
    const dates = vis.filter(C.isSpending).map(e => e.date);
    const from = g.startDate || dates[0], to = g.endDate || dates[dates.length - 1];
    const days = from && to ? Math.max(1, C.daysBetween(from, to)) : 0;
    kpis.push(kpi('Pro Tag', days ? fmt(Math.round(st.total / days)) : '–', days ? `über ${days} Tag${days > 1 ? 'e' : ''}` : 'noch keine Daten'));
  }
  if (me) kpis.push(kpi('Dein Anteil', fmt(st.share[me.id] || 0), `bezahlt: ${fmt(st.paid[me.id] || 0)}`));
  if (usesPot(g)) kpis.push(kpi('🏦 Kassenstand', fmt(C.potCash(S.expenses)), 'insgesamt'));

  let html = `<div class="kpis">${kpis.join('')}</div>`;
  if (st.count === 0 && !g.potEnabled) return html + `<div class="card"><div class="empty">Noch keine Ausgaben${isRecurring(g) ? ' in diesem Zeitraum' : ''}.</div></div>`;
  html += '<div class="charts">';
  if (st.count) html += personChart(g, st) + categoryChart(st);
  html += timeChart(g, vis);
  if (g.potEnabled) html += potChart(g, vis);
  return html + '</div>';
}
const kpi = (label, value, sub) => `<div class="kpi"><div class="k-label">${label}</div><div class="k-value">${value}</div><div class="k-sub">${esc(sub)}</div></div>`;

function personChart(g, st) {
  const rows = g.members.map(m => ({ name: m.name, paid: st.paid[m.id] || 0, share: st.share[m.id] || 0 }));
  if (st.paid[POT]) rows.push({ name: '🏦 Kasse', paid: st.paid[POT], share: 0, pot: true });
  const max = Math.max(1, ...rows.flatMap(r => [r.paid, r.share]));
  const bar = (v, color, label) => `<div class="hbar-line" data-tip="${esc(label)}: ${fmt(v)}">
      <div class="hbar-track"><div class="hbar" style="width:${(v / max * 100).toFixed(1)}%;background:${color}"></div></div><span>${fmt(v)}</span></div>`;
  return `<div class="card"><h2>Wer hat was bezahlt?</h2>
    <div class="legend"><span><i style="background:var(--s1)"></i>bezahlt</span><span><i style="background:var(--s2)"></i>Anteil an den Ausgaben</span></div>
    ${rows.map(r => `<div class="hbar-row"><span class="name" title="${esc(r.name)}">${esc(r.name)}</span><div class="hbar-pair">
      ${bar(r.paid, 'var(--s1)', `${r.name} hat bezahlt`)}${r.pot ? '' : bar(r.share, 'var(--s2)', `Anteil von ${r.name}`)}</div></div>`).join('')}
  </div>`;
}

function categoryChart(st) {
  const items = CATEGORIES.filter(c => st.byCat[c.id]).map(c => ({ ...c, v: st.byCat[c.id] }));
  const R = 60, W = 22, L = 2 * Math.PI * R, gap = items.length > 1 ? 2 : 0;
  let off = 0;
  const segs = items.map(c => {
    const len = c.v / st.total * L;
    const s = `<circle class="seg" cx="80" cy="80" r="${R}" fill="none" stroke="${c.color}" stroke-width="${W}"
      stroke-dasharray="${Math.max(0.5, len - gap).toFixed(2)} ${(L - Math.max(0.5, len - gap)).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"
      transform="rotate(-90 80 80)" data-tip="${esc(c.icon + ' ' + c.name)}: ${fmt(c.v)} (${Math.round(c.v / st.total * 100)} %)"></circle>`;
    off += len;
    return s;
  }).join('');
  return `<div class="card"><h2>Nach Kategorie</h2><div class="donut-wrap">
    <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Ausgaben nach Kategorie">${segs}
      <text x="80" y="76" text-anchor="middle" font-size="11" fill="#7a8a99">gesamt</text>
      <text x="80" y="94" text-anchor="middle" font-size="15" font-weight="700" fill="#24313d">${fmt(st.total)}</text></svg>
    <div class="cat-legend">${items.map(c => `<div><span><i style="background:${c.color}"></i>${c.icon} ${esc(c.name)}</span>
      <span>${fmt(c.v)} · ${Math.round(c.v / st.total * 100)} %</span></div>`).join('')}</div>
  </div></div>`;
}

function timeChart(g, vis) {
  let points, title, labelOf, tipOf, currentKey = null;
  if (isRecurring(g)) {
    points = C.periodSeries(S.expenses, g.period, cursor(g), 6);
    title = `Verlauf (letzte 6 ${g.period === 'week' ? 'Wochen' : 'Monate'})`;
    labelOf = k => C.periodLabel(k, g.period, true);
    tipOf = k => C.periodLabel(k, g.period);
    currentKey = cursor(g);
  } else {
    const dates = vis.filter(C.isSpending).map(e => e.date);
    if (!dates.length) return '';
    const from = g.startDate && g.startDate < dates[0] ? g.startDate : dates[0];
    const last = dates[dates.length - 1];
    const to = g.endDate && g.endDate > last ? g.endDate : last;
    const series = C.dailySeries(vis, from, to);
    points = series.points;
    title = series.weekly ? 'Verlauf pro Woche' : 'Verlauf pro Tag';
    const f = (k, o) => new Date(k + 'T00:00:00').toLocaleDateString('de-DE', o);
    labelOf = k => f(k, { day: 'numeric', month: 'numeric' });
    tipOf = k => series.weekly ? 'Woche ab ' + f(k, { day: 'numeric', month: 'long' }) : f(k, { weekday: 'short', day: 'numeric', month: 'long' });
  }
  const max = Math.max(1, ...points.map(p => p.cents));
  const step = niceStep(max / 3);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const grid = [1, 2, 3].map(i => i * step).filter(v => v <= top)
    .map(v => `<div class="gl" style="bottom:${(v / top * 100).toFixed(1)}%"><span>${fmtShort(v)}</span></div>`).join('');
  const every = Math.ceil(points.length / 10);
  return `<div class="card wide"><h2>${title}</h2>
    <div class="cols">${grid}${points.map(p => `<div class="col ${p.key === currentKey ? 'current' : ''}" data-tip="${esc(tipOf(p.key))}\n${fmt(p.cents)}">
      ${p.cents ? `<div class="bar" style="height:${(p.cents / top * 100).toFixed(1)}%"></div>` : ''}</div>`).join('')}</div>
    <div class="xlabels">${points.map((p, i) => `<span>${i % every === 0 ? esc(labelOf(p.key)) : ''}</span>`).join('')}</div>
  </div>`;
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw);
}
const fmtShort = c => c >= 100000 ? (c / 100000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' T€' : Math.round(c / 100).toLocaleString('de-DE') + ' €';

function potChart(g, vis) {
  const con = C.contributionsBy(vis);
  const target = g.potTargetCents || 0;
  const max = Math.max(1, target, ...Object.values(con));
  const scope = isRecurring(g) ? 'in diesem Zeitraum' : 'insgesamt';
  return `<div class="card wide"><h2>🏦 Einzahlungen ${scope}</h2>
    ${g.members.map(m => {
      const v = con[m.id] || 0;
      return `<div class="pot-row" data-tip="${esc(m.name)}: ${fmt(v)}${target ? ' von ' + fmt(target) : ''}">
        <div class="top"><span>${esc(m.name)}</span><span>${fmt(v)}${target ? ` <span class="zero">von ${fmt(target)}</span>${v >= target ? ' ✓' : ''}` : ''}</span></div>
        <div class="progress"><div style="width:${(v / max * 100).toFixed(1)}%"></div></div></div>`;
    }).join('')}
    <p class="note">Kassenstand jetzt: <b>${fmt(C.potCash(S.expenses))}</b>. Einzahlungen erfasst du unter „+ Eintragen“.</p>
  </div>`;
}

/* ---------- Selbsttest ---------- */
function runSelftest() {
  show('Selftest');
  const r = C.selftest();
  console.table(r);
  const ok = r.every(x => x.ok);
  $('selftestOut').innerHTML = `<h2>${ok ? '✅ Alle Tests bestanden' : '❌ Tests fehlgeschlagen'}</h2>
    <table class="selftest" style="margin:12px auto">${r.map(x => `<tr><td>${x.ok ? '✅' : '❌'}</td><td>${esc(x.test)}</td></tr>`).join('')}</table>`;
}

boot();
