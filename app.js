/* PookieWise – Oberfläche & Firebase-Anbindung */
import { firebaseConfig } from './firebase-config.js';
import * as C from './core.js';

const { POT, fmt, esc, parseAmount } = C;
const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
const LEGACY_KEY = 'splitclone_v1';

// Feste Kategorien; die Farbe hängt an der Kategorie, nie an ihrem Rang
const CATEGORIES = [
  { id: 'food', svg: 'food', name: 'Essen & Trinken', example: 'Pizza', color: 'var(--s1)' },
  { id: 'groceries', svg: 'cart', name: 'Einkauf', example: 'Supermarkt', color: 'var(--s4)' },
  { id: 'lodging', svg: 'bed', name: 'Unterkunft', example: 'Hotel', color: 'var(--s2)' },
  { id: 'transport', svg: 'car', name: 'Transport', example: 'Tanken', color: 'var(--s3)' },
  { id: 'fun', svg: 'ticket', name: 'Freizeit', example: 'Kino', color: 'var(--s5)' },
  { id: 'home', svg: 'home', name: 'Haushalt & Fixkosten', example: 'Miete', color: 'var(--s6)' },
  { id: 'other', svg: 'box', name: 'Sonstiges', example: 'Geschenk', color: 'var(--s-other)' },
];
// Kategorie-Symbol: Linien-Icon in Kategoriefarbe
const catIcon = c => `<span class="c-ic" style="--c:${c.color}" aria-hidden="true">${ic(c.svg)}</span>`;
const cat = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

/* ---------- State ---------- */
const S = {
  user: null, groups: [], expenses: [], expensesFor: null,
  activeGroupId: lsGet('pw_active'), pendingSelect: null,
  tab: 'overview', view: null, editingId: null, cursor: {}, entryType: 'expense', flashId: null,
};
let fs, authM, auth, db, unsubGroups = null, unsubExp = null;

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
function ssGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function ssSet(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} }
const $ = id => document.getElementById(id);

/* ---------- Icons (inline SVG, erben die Textfarbe) ---------- */
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  scale: '<path d="M7 7h14l-3-3M17 17H3l3 3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18.5 14.8c1.7.8 2.7 2.5 3 5.2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M15 18l-6-6 6-6"/>', right: '<path d="M9 18l6-6-6-6"/>', down: '<path d="M6 9l6 6 6-6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 011-1h10"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  food: '<path d="M7 3v8M5 3v5a2 2 0 004 0V3M7 11v10M17 3c-2 1.5-3 4-3 7h3v11"/>',
  cart: '<circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2 3h3l2.5 12h12L22 7H6"/>',
  bed: '<path d="M3 18V6M3 14h18v4M21 14v-3a3 3 0 00-3-3h-8v6"/><circle cx="6.5" cy="10.5" r="1.5"/>',
  car: '<path d="M5 16l1.5-6A2 2 0 018.4 8.5h7.2a2 2 0 011.9 1.5L19 16"/><rect x="3" y="13" width="18" height="5" rx="1.5"/><path d="M6.5 18v2M17.5 18v2"/>',
  ticket: '<path d="M3 8a2 2 0 002-2h14a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H5a2 2 0 00-2-2v-2a2 2 0 000-4z"/><path d="M14 6v2M14 11v2M14 16v2"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  bell: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 21h4"/>',
  bank: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 01-.6-9 6 6 0 0111.5 1.5A3.8 3.8 0 0117.5 18z"/><path d="M12 11v3l2 1"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  wifi: '<path d="M2 2l20 20M8.5 16.5a5 5 0 017 0M5 12.9a10 10 0 015.2-2.8M19 12.9a10 10 0 00-2.4-1.7M12 20h.01"/>',
};
const ic = (n, label) => `<svg class="i" viewBox="0 0 24 24" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>${ICONS[n]}</svg>`;
const GROUP_ICONS = [['✈️', 'Reise'], ['🏖️', 'Strand'], ['🏠', 'Zuhause'], ['🎉', 'Feier'], ['🍕', 'Essen'], ['🚗', 'Auto'], ['⛺', 'Camping'], ['🎿', 'Ski'], ['🎄', 'Weihnachten'], ['💑', 'Paar'], ['🛒', 'Einkauf'], ['💼', 'Arbeit']];
const groupIcon = g => g.icon || (isRecurring(g) ? '🏠' : '✈️');

/* ---------- Rückmeldungen ---------- */
// Toasts mit Aktion bleiben 10 s stehen, pausieren bei Hover/Fokus; Strg+Z löst „Rückgängig“ aus
let toastTimer, toastUndo = null;
function toast(msg, opt = {}) {
  const t = $('toast');
  t.className = opt.error ? 'error' : '';
  const mac = /Mac|iP/.test(navigator.platform);
  t.innerHTML = `<span>${esc(msg)}</span>${opt.action ? `<button type="button" aria-keyshortcuts="${mac ? 'Meta+Z' : 'Control+Z'}" title="${mac ? '⌘' : 'Strg'}+Z">${esc(opt.action)}</button>` : ''}`;
  toastUndo = opt.action ? () => { hideToast(); opt.onAction(); } : null;
  if (opt.action) t.querySelector('button').onclick = toastUndo;
  t.hidden = false;
  armToast(opt.action ? 10000 : 4000);
}
function armToast(ms) { clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, ms); }
let toastReturn = null;
function hideToast() {
  const had = $('toast').contains(document.activeElement);
  $('toast').hidden = true; toastUndo = null;
  if (had) $(toastReturn)?.focus();
}
$('toast').addEventListener('pointerenter', () => clearTimeout(toastTimer));
$('toast').addEventListener('focusin', () => clearTimeout(toastTimer));
$('toast').addEventListener('pointerleave', () => armToast(4000));
$('toast').addEventListener('focusout', () => armToast(4000));
addEventListener('keydown', e => {
  if (toastUndo && e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
    e.preventDefault(); toastUndo();
  }
});
// Offline-Hinweis: Änderungen werden lokal gespeichert und später übertragen
function updateOnline() {
  const o = $('offline');
  o.hidden = navigator.onLine;
  o.innerHTML = `${ic('wifi')} Offline: Änderungen werden gespeichert und übertragen, sobald du wieder online bist.`;
}
addEventListener('online', updateOnline); addEventListener('offline', updateOnline);
const ERRORS = {
  'permission-denied': 'Dazu fehlt dir die Berechtigung. Bist du noch Mitglied der Gruppe?',
  'unavailable': 'Keine Verbindung. Deine Änderung wird übertragen, sobald du wieder online bist.',
  'not-found': 'Das gibt es nicht mehr. Vielleicht wurde es gerade gelöscht.',
  'auth/network-request-failed': 'Keine Verbindung zum Server. Bist du online?',
  'auth/invalid-email': 'Diese E-Mail-Adresse sieht nicht gültig aus.',
  'auth/too-many-requests': 'Zu viele Versuche. Bitte warte kurz und versuche es dann erneut.',
  'auth/quota-exceeded': 'Heute wurden zu viele Anmeldelinks verschickt. Nutze bitte die Google-Anmeldung.',
};
const errText = (err, what) => ERRORS[err?.code] || `${what} hat nicht geklappt. Bitte versuche es noch einmal.`;
// Schreibvorgänge werden lokal sofort sichtbar; Fehler (z. B. Regeln) kommen später
const write = p => p.catch(err => { console.error(err); toast(errText(err, 'Speichern'), { error: true }); });

// Eigener Bestätigungsdialog statt confirm()
function ask({ title, text = '', ok = 'OK', danger = false }) {
  const d = $('dlg');
  d.className = '';
  d.innerHTML = `<form method="dialog"><div class="dlg-body"><h2 id="dlgTitle">${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}</div>
    <div class="dlg-actions"><button class="btn secondary" value="no">Abbrechen</button>
    <button class="btn ${danger ? 'danger' : ''}" value="yes">${esc(ok)}</button></div></form>`;
  d.returnValue = '';
  d.showModal();
  d.querySelector('[value=no]').focus();
  return new Promise(res => d.addEventListener('close', () => res(d.returnValue === 'yes'), { once: true }));
}

// Inline-Validierung: Fehler direkt am Feld, Fokus auf das erste fehlerhafte Feld
function clearErrors(scope = document) {
  scope.querySelectorAll('.field-error').forEach(e => e.remove());
  scope.querySelectorAll('[aria-invalid]').forEach(e => { e.removeAttribute('aria-invalid'); e.removeAttribute('aria-describedby'); });
}
function invalid(id, msg) {
  const el = $(id);
  if (!el) { toast(msg, { error: true }); return; }
  el.setAttribute('aria-invalid', 'true');
  el.setAttribute('aria-describedby', id + '-err');
  const anchor = el.closest('.amount-wrap, .participants, .chips, .seg') || el;
  anchor.insertAdjacentHTML('afterend', `<div class="field-error" id="${id}-err">${ic('alert')}${esc(msg)}</div>`);
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'center' });
}

function show(screen) {
  for (const s of ['Loading', 'Setup', 'Login', 'App', 'Selftest']) $('screen' + s).hidden = s !== screen;
  $('userBox').hidden = screen !== 'App';
  $('groupSwitch').hidden = screen !== 'App';
}

/* ---------- URL: #g/<gruppe>/<tab> für Zurück-Button und Direktlinks ---------- */
const TABS = ['overview', 'expenses', 'add', 'balances', 'group', 'settings'];
function readRoute() {
  const m = location.hash.match(/^#g\/([\w-]+)(?:\/(\w+))?$/);
  if (!m) return false;
  S.activeGroupId = m[1];
  S.tab = TABS.includes(m[2]) ? m[2] : 'overview';
  S.view = null;
  if (S.tab !== 'add') S.editingId = null;
  return true;
}
function syncRoute(push) {
  const h = S.view === 'newGroup' ? '#neu' : S.activeGroupId ? `#g/${S.activeGroupId}/${S.tab}` : '';
  if (location.hash === h || (!h && !location.hash)) return;
  history[push ? 'pushState' : 'replaceState'](null, '', location.pathname + h);
}
addEventListener('popstate', async () => {
  if (!S.user) return;
  if (S.dirty && S.tab === 'settings') {
    const back = location.hash;
    history.pushState(null, '', location.pathname + `#g/${S.activeGroupId}/settings`);
    if (!await leaveOk()) return;
    history.replaceState(null, '', location.pathname + back);
  }
  if (location.hash === '#neu') { S.view = 'newGroup'; render(); return; }
  if (readRoute()) { lsSet('pw_active', S.activeGroupId); subscribeExpenses(); }
  else S.view = null;
  render();
});

/* ---------- Start ---------- */
async function boot() {
  if (location.hash === '#selftest') return runSelftest();
  captureJoinHash();
  readRoute();
  if (!firebaseConfig.apiKey) return show('Setup');
  let appM;
  try {
    [appM, authM, fs] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(f => import(FB + f)));
  } catch (e) {
    show('Login'); return loginError('PookieWise konnte nicht geladen werden. Bist du online? Lade die Seite neu, sobald du Netz hast.');
  }
  const app = appM.initializeApp(firebaseConfig);
  auth = authM.getAuth(app);
  try {
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch { db = fs.getFirestore(app); }
  // Die Google-Weiterleitung scheitert in manchen Browsern still (Drittanbieter-Speicher blockiert)
  const redirected = ssGet('pw_redirect');
  ssSet('pw_redirect', null);
  authM.getRedirectResult(auth).then(r => {
    if (redirected && !r && !auth.currentUser) loginError('Die Google-Anmeldung ist in diesem Browser nicht durchgekommen. Erlaube Pop-ups für diese Seite oder nutze den Anmeldelink per Mail.');
  }).catch(loginError);
  S.emailLink = authM.isSignInWithEmailLink(auth, location.href);
  if (S.emailLink) await completeEmailLink(lsGet('pw_email'));
  else cleanUrl();
  authM.onAuthStateChanged(auth, user => {
    S.user = user;
    if (user) startApp(); else stopApp();
  });
}

// Einladung kommt als #join=… (Link aus der App) oder ?join=… (Rückkehr aus dem Mail-Link)
function captureJoinHash() {
  const token = location.hash.match(/^#join=([\w-]+\.[\w-]+)$/)?.[1] || new URLSearchParams(location.search).get('join');
  if (token && /^[\w-]+\.[\w-]+$/.test(token)) ssSet('pw_join', token);
}
function cleanUrl() {
  if (location.hash.startsWith('#join=') || location.search) history.replaceState(null, '', location.pathname);
}

function loginError(err) {
  if (!err) return;
  const el = $('loginError');
  el.textContent = typeof err === 'string' ? err : errText(err, 'Die Anmeldung');
  el.hidden = false;
}

async function login() {
  const provider = new authM.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await authM.signInWithPopup(auth, provider);
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      ssSet('pw_redirect', '1');
      return authM.signInWithRedirect(auth, provider);
    }
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') loginError(err);
  }
}

async function emailLogin() {
  const email = $('loginEmail').value.trim();
  $('loginError').hidden = true;
  $('loginEmail').removeAttribute('aria-invalid');
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    $('loginEmail').setAttribute('aria-invalid', 'true'); $('loginEmail').focus();
    return loginError(email ? 'Diese E-Mail-Adresse sieht nicht vollständig aus (z. B. name@mail.de).' : 'Bitte gib deine E-Mail-Adresse ein.');
  }
  if (S.emailLink) return completeEmailLink(email);
  const join = ssGet('pw_join');
  const url = location.origin + location.pathname + (join ? '?join=' + encodeURIComponent(join) : '');
  try {
    await authM.sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true });
    lsSet('pw_email', email);
    $('loginOk').hidden = false;
    $('loginOk').innerHTML = `<b>📬 Link ist unterwegs</b><br>Wir haben einen Anmeldelink an <b>${esc(email)}</b> geschickt. Öffne ihn auf diesem Gerät. Nichts angekommen? Schau im Spam-Ordner nach oder sende den Link erneut.`;
    $('emailBtn').textContent = 'Link erneut senden';
  } catch (err) { loginError(err); }
}

// Rückkehr aus dem Mail-Link. Ohne gespeicherte Adresse (anderes Gerät) muss sie bestätigt werden.
async function completeEmailLink(email) {
  if (!email) {
    show('Login');
    $('loginTitle').textContent = 'Fast geschafft';
    $('loginText').textContent = 'Bitte bestätige die E-Mail-Adresse, an die der Anmeldelink ging. Das ist nötig, weil du den Link auf einem anderen Gerät oder Browser geöffnet hast.';
    $('loginValues').hidden = true;
    $('emailBtn').textContent = 'Anmelden';
    $('emailBtn').className = 'btn block';
    return;
  }
  try {
    await authM.signInWithEmailLink(auth, email, location.href);
    lsSet('pw_email', null);
    S.emailLink = false;
    cleanUrl();
  } catch (err) {
    S.emailLink = false;
    cleanUrl();
    show('Login');
    loginError(err.code === 'auth/invalid-action-code' || err.code === 'auth/expired-action-code'
      ? 'Der Anmeldelink ist abgelaufen oder wurde schon benutzt. Fordere einfach einen neuen an.' : err);
  }
}

function startApp() {
  show('App');
  updateOnline();
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
  }, err => toast(errText(err, 'Das Laden der Gruppen'), { error: true }));
  processJoin();
  render();
}

function stopApp() {
  if (S.emailLink) return; // wartet auf Bestätigung der Adresse
  unsubGroups?.(); unsubExp?.();
  unsubGroups = unsubExp = null;
  Object.assign(S, { groups: [], expenses: [], expensesFor: null });
  show('Login');
  if (ssGet('pw_join')) {
    $('loginTitle').textContent = 'Du wurdest eingeladen 🎉';
    $('loginText').textContent = 'Melde dich an, um der Gruppe beizutreten. Danach siehst du sofort alle gemeinsamen Ausgaben.';
  }
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
      ? 'Dieser Einladungslink gilt nicht mehr. Bitte lass dir einen neuen schicken.' : errText(err, 'Der Beitritt'), { error: true });
  }
}

// Direkt nach Anlegen oder Beitritt kennt der Server die Mitgliedschaft evtl. noch nicht;
// die Regeln lehnen dann ab, also nach kurzer Pause erneut abonnieren.
function subscribeExpenses(attempt = 0) {
  if (S.expensesFor === S.activeGroupId && !attempt) return;
  unsubExp?.(); unsubExp = null;
  if (!attempt) S.expenses = [];
  S.expensesFor = S.activeGroupId;
  if (!S.activeGroupId) return;
  const gid = S.activeGroupId;
  unsubExp = fs.onSnapshot(expCol(gid), { includeMetadataChanges: true }, snap => {
    S.expenses = snap.docs.map(d => ({ id: d.id, ...d.data(), _pending: !!d.metadata?.hasPendingWrites }))
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1);
    cacheBalance();
    softRender();
  }, err => {
    if (S.activeGroupId !== gid) return;
    if (err.code === 'permission-denied' && attempt < 6) {
      setTimeout(() => { if (S.activeGroupId === gid) subscribeExpenses(attempt + 1); }, 500 * 2 ** attempt);
    } else toast(errText(err, 'Das Laden der Ausgaben'), { error: true });
  });
}

/* ---------- Helfer ---------- */
// Eigener Saldo je Gruppe, für die Gruppenliste (zuletzt gesehener Stand)
let balCache = {};
try { balCache = JSON.parse(lsGet('pw_bal')) || {}; } catch {}
function cacheBalance() {
  const g = activeGroup(), me = g && myMember(g);
  if (!me || S.expensesFor !== g.id) return;
  balCache[g.id] = debtsOf(g).b[me.id] || 0;
  lsSet('pw_bal', JSON.stringify(balCache));
}
const balTag = g => {
  const v = balCache[g.id];
  if (v == null) return '';
  return `<span class="g-bal ${v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'}" aria-label="${v > 0 ? 'Du bekommst ' + fmt(v) : v < 0 ? 'Du schuldest ' + fmt(-v) : 'quitt'}">${v > 0 ? '+' + fmt(v) : v < 0 ? '−' + fmt(-v) : 'quitt'}</span> · `;
};
const groupRef = id => fs.doc(db, 'groups', id);
const expCol = gid => fs.collection(db, 'groups', gid, 'expenses');
const activeGroup = () => S.groups.find(g => g.id === S.activeGroupId) || null;
const memberName = (g, id) => id === POT ? 'Kasse' : (g.members.find(m => m.id === id) || { name: '?' }).name;
const myMember = g => g.members.find(m => m.uid === S.user.uid) || null;
const isRecurring = g => g.kind === 'recurring';
const firstName = () => S.user.displayName?.split(' ')[0] || (S.user.email || '').split('@')[0].split(/[._-]/)[0].replace(/^./, c => c.toUpperCase());
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
  closeDialog();
  render(); syncRoute(true);
  scrollTo(0, 0);
}
function go(tab, extra = {}) {
  if (tab === 'add' && S.tab !== 'add') S.prevTab = S.tab;
  Object.assign(S, { tab, view: null }, extra);
  if (tab !== 'add') S.editingId = null;
  render(); syncRoute(true);
  scrollTo(0, 0);
  if (tab === 'add' && !S.editingId) $('expAmount')?.focus({ preventScroll: true });
}
const offlineNote = () => navigator.onLine ? '' : '. Wird übertragen, sobald du online bist';
// Ungespeicherte Einstellungen: Button aktivieren, beim Verlassen nachfragen
function setDirty(v) {
  S.dirty = v;
  if ($('saveSettingsBtn')) { $('saveSettingsBtn').setAttribute('aria-disabled', String(!v)); $('dirtyHint').textContent = v ? 'Ungespeicherte Änderungen' : ''; }
}
addEventListener('beforeunload', e => { if (S.dirty && S.tab === 'settings') { e.preventDefault(); e.returnValue = ''; } });
async function leaveOk() {
  if (!S.dirty || S.tab !== 'settings') return true;
  const ok = await ask({ title: 'Änderungen verwerfen?', text: 'Du hast die Einstellungen geändert, aber noch nicht gespeichert.', ok: 'Verwerfen', danger: true });
  if (ok) S.dirty = false;
  return ok;
}
function closeDialog() { if ($('dlg').open) $('dlg').close(); }

function readGroupForm() {
  clearErrors($('mainArea'));
  const name = $('gName').value.trim();
  const kind = document.querySelector('input[name=gKind]:checked').value;
  const potEnabled = $('gPot').checked;
  const target = $('gTarget').value.trim() ? parseAmount($('gTarget').value) : 0;
  const icon = document.querySelector('input[name=gIcon]:checked')?.value || null;
  if (!name) return invalid('gName', 'Gib der Gruppe einen Namen, z. B. „Italien-Urlaub“.');
  if (potEnabled && (isNaN(target) || target < 0)) return invalid('gTarget', 'Bitte einen Betrag wie 300 oder 12,50 eingeben, oder das Feld leer lassen.');
  const startDate = kind === 'event' ? ($('gStart').value || null) : null;
  const endDate = kind === 'event' ? ($('gEnd').value || null) : null;
  if (startDate && endDate && endDate < startDate) return invalid('gEnd', 'Das Enddatum liegt vor dem Startdatum.');
  return {
    name: name.slice(0, 80), kind, icon,
    period: kind === 'recurring' ? $('gPeriod').value : null,
    startDate, endDate,
    potEnabled, potTargetCents: potEnabled ? target : 0,
  };
}

function createGroup() {
  const data = readGroupForm(); if (!data) return;
  const myName = ($('gMyName').value.trim() || firstName() || 'Ich').slice(0, 40);
  const ref = fs.doc(fs.collection(db, 'groups'));
  write(fs.setDoc(ref, {
    ...data,
    members: [{ id: C.uid(), name: myName, uid: S.user.uid }],
    memberUids: [S.user.uid],
    inviteCode: C.randomCode(),
    createdBy: S.user.uid,
    createdAt: fs.serverTimestamp(),
  }));
  S.tab = 'overview';
  selectGroup(ref.id, true);
  toast(`Gruppe „${data.name}“ angelegt`);
}

function saveSettings() {
  const g = activeGroup(); if (!g) return;
  if (!S.dirty) { $('dirtyHint').textContent = 'Noch nichts geändert.'; return; }
  const data = readGroupForm(); if (!data) return;
  write(fs.updateDoc(groupRef(g.id), data));
  setDirty(false);
  $('dirtyHint').textContent = 'Gespeichert ✓';
  toast('Einstellungen gespeichert' + offlineNote());
}

async function deleteOrLeaveGroup() {
  const g = activeGroup(); if (!g) return;
  if (g.createdBy === S.user.uid) {
    if (!await ask({ title: `„${g.name}“ löschen?`, text: 'Die Gruppe und alle Einträge werden für alle Mitglieder gelöscht. Das lässt sich nicht rückgängig machen.', ok: 'Endgültig löschen', danger: true })) return;
    try {
      const snap = await fs.getDocs(expCol(g.id));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const b = fs.writeBatch(db);
        snap.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
        await b.commit();
      }
      await fs.deleteDoc(groupRef(g.id));
      toast('Gruppe gelöscht');
    } catch (err) { toast(errText(err, 'Das Löschen'), { error: true }); }
  } else {
    if (!await ask({ title: `„${g.name}“ verlassen?`, text: 'Deine bisherigen Einträge bleiben für die anderen erhalten. Du kannst über einen Einladungslink wieder beitreten.', ok: 'Verlassen', danger: true })) return;
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
    clearErrors($('mainArea'));
    const name = ($('claimName').value.trim() || firstName() || 'Ich').slice(0, 40);
    if (g.members.some(m => m.name.toLowerCase() === name.toLowerCase())) return invalid('claimName', `„${name}“ gibt es schon. Bist du das? Dann wähle den Namen oben aus.`);
    members = [...g.members, { id: C.uid(), name, uid: S.user.uid }];
  }
  write(fs.updateDoc(groupRef(g.id), { members }));
}

function addMember() {
  const g = activeGroup(); if (!g) return;
  clearErrors($('mainArea'));
  const inp = $('newMemberName');
  const name = inp.value.trim().slice(0, 40);
  if (!name) return invalid('newMemberName', 'Bitte einen Namen eingeben.');
  if (g.members.some(m => m.name.toLowerCase() === name.toLowerCase())) return invalid('newMemberName', `„${name}“ ist schon in der Gruppe.`);
  inp.value = '';
  if (g.members.length === 1 && S.tab === 'overview') S.focusAfter = 'startFirst';
  write(fs.updateDoc(groupRef(g.id), { members: [...g.members, { id: C.uid(), name, uid: null }] }));
  toast(g.members.length === 1 && S.tab === 'overview' ? `${name} ist dabei. Jetzt die erste Ausgabe eintragen!` : `${name} hinzugefügt`);
}
async function removeMember(id) {
  const g = activeGroup(); if (!g) return;
  const m = g.members.find(x => x.id === id);
  const used = S.expenses.some(e => e.payerId === id || e.shares.some(s => s.memberId === id));
  if (used) return ask({ title: `${m.name} kann nicht entfernt werden`, text: `${m.name} ist an Einträgen beteiligt. Sonst würden die Salden nicht mehr stimmen. Lösche oder ändere zuerst diese Einträge.`, ok: 'Verstanden' });
  if (!await ask({ title: `${m.name} entfernen?`, text: m.uid ? `${m.name} hat ein Konto verknüpft und verliert den Zugriff auf die Gruppe.` : '', ok: 'Entfernen', danger: true })) return;
  write(fs.updateDoc(groupRef(g.id), {
    members: g.members.filter(x => x.id !== id),
    memberUids: g.memberUids.filter(u => u !== m.uid),
  }));
}

function inviteLink(g) { return `${location.origin}${location.pathname}#join=${g.id}.${g.inviteCode}`; }
async function copyInvite() {
  const g = activeGroup(); if (!g) return;
  try { await navigator.clipboard.writeText(inviteLink(g)); toast('Link kopiert. Schick ihn per Messenger oder Mail weiter.'); }
  catch { $('inviteInput').select(); toast('Bitte den markierten Link kopieren'); }
}
async function shareInvite() {
  const g = activeGroup(); if (!g) return;
  if (!navigator.share) return copyInvite();
  try { await navigator.share({ title: `PookieWise: ${g.name}`, text: `Komm in unsere Gruppe „${g.name}“ auf PookieWise:`, url: inviteLink(g) }); }
  catch (err) { if (err.name !== 'AbortError') copyInvite(); }
}
async function renewInvite() {
  const g = activeGroup(); if (!g) return;
  if (!await ask({ title: 'Neuen Einladungslink erzeugen?', text: 'Der bisherige Link funktioniert danach nicht mehr. Wer schon Mitglied ist, bleibt es.', ok: 'Neuen Link erzeugen' })) return;
  write(fs.updateDoc(groupRef(g.id), { inviteCode: C.randomCode() }));
  toast('Neuer Link erzeugt');
}

function shiftCursor(n) {
  const g = activeGroup(); if (!g) return;
  S.cursor[g.id] = C.shiftPeriod(cursor(g), g.period, n);
  render();
}

// Speichert neu oder geändert und bietet Rückgängig an
function commitEntry(g, data, label) {
  const id = S.editingId || newExpenseId(g.id);
  const before = S.editingId ? S.expenses.find(e => e.id === id) : null;
  const firstEver = !before && !S.expenses.some(C.isSpending) && data.type !== 'settlement' && data.type !== 'contribution';
  saveExpense(g, id, data);
  if (isRecurring(g)) S.cursor[g.id] = C.periodKey(data.date, g.period);
  S.flashId = id;
  S.entryType = 'expense';
  go('expenses');
  toast((before ? `${label} geändert` : firstEver ? `${label} gespeichert. Alles bereit 🎉` : `${label} gespeichert`) + offlineNote(), {
    action: 'Rückgängig',
    onAction: () => before ? saveExpense(g, id, stripMeta(before)) : write(fs.deleteDoc(fs.doc(expCol(g.id), id))),
  });
}
const stripMeta = ({ id, createdBy, updatedAt, _pending, ...rest }) => rest;

function submitEntry() {
  const g = activeGroup(); if (!g) return;
  clearErrors($('mainArea'));
  const type = S.entryType;
  const amount = parseAmount($('expAmount').value);
  const date = $('expDate').value || C.today();
  if (!$('expAmount').value.trim()) return invalid('expAmount', 'Wie viel war es? Bitte einen Betrag eingeben.');
  if (isNaN(amount) || amount <= 0) return invalid('expAmount', 'Bitte einen Betrag wie 12,50 eingeben.');

  if (type === 'contribution') {
    const from = $('conFrom').value;
    return commitEntry(g, { type, desc: 'Einzahlung in die Kasse', amountCents: amount, payerId: from, date, mode: 'exact', shares: [{ memberId: POT, cents: amount }], category: 'other' },
      `Einzahlung von ${memberName(g, from)} (${fmt(amount)})`);
  }
  if (type === 'settlement') {
    const from = $('setFrom').value, to = $('setTo').value;
    if (from === to) return invalid('setTo', 'Wähle eine andere Person als beim Absender.');
    return commitEntry(g, { type, desc: 'Ausgleichszahlung', amountCents: amount, payerId: from, date, mode: 'exact', shares: [{ memberId: to, cents: amount }], category: 'other' },
      `Ausgleich ${memberName(g, from)} → ${memberName(g, to)}`);
  }

  const category = document.querySelector('input[name=expCat]:checked')?.value || 'other';
  const desc = ($('expDesc').value.trim() || cat(category).name).slice(0, 200);
  const payerId = $('expPayer').value;
  const mode = document.querySelector('input[name=expMode]:checked').value;
  const checked = [...document.querySelectorAll('.p-check:checked')].map(cb => cb.dataset.mid);
  if (checked.length === 0) return invalid('participants', 'Wähle mindestens eine Person aus, die sich die Ausgabe teilt.');
  const valOf = mid => document.querySelector(`.p-val[data-mid="${mid}"]`).value;

  let shares;
  if (mode === 'equal') {
    shares = C.computeEqualShares(amount, checked);
  } else if (mode === 'exact') {
    shares = [];
    let sum = 0;
    for (const mid of checked) {
      const v = parseAmount(valOf(mid));
      if (isNaN(v) || v < 0) return invalid('pv-' + mid, `Bitte einen Betrag für ${memberName(g, mid)} eingeben.`);
      shares.push({ memberId: mid, cents: v });
      sum += v;
    }
    if (sum !== amount) return invalid('participants', `Die Einzelbeträge ergeben ${fmt(sum)}, die Ausgabe ist aber ${fmt(amount)}. Es fehlen ${fmt(amount - sum)}.`);
  } else {
    const entries = [];
    for (const mid of checked) {
      const w = parseFloat((valOf(mid) || '').replace(',', '.'));
      if (isNaN(w) || w <= 0) return invalid('pv-' + mid, `Bitte eine Anteilszahl für ${memberName(g, mid)} eingeben (z. B. 1 oder 2).`);
      entries.push({ memberId: mid, weight: w });
    }
    shares = C.computeShareSplit(amount, entries);
  }
  const type2 = payerId === POT ? 'potExpense' : 'expense';
  commitEntry(g, { type: type2, desc, amountCents: amount, payerId, date, mode, shares, category }, `„${desc}“ (${fmt(amount)})`);
}

// Zahlungserinnerung über die Teilen-Funktion (oder Zwischenablage)
async function remind(fromId) {
  const g = activeGroup(); if (!g) return;
  const me = myMember(g)?.id;
  const d = debtsOf(g).debts.find(x => x.from === fromId && x.to === me); if (!d) return;
  const text = `Hi ${memberName(g, fromId)}, kleine Erinnerung: Für „${g.name}“ bekomme ich von dir noch ${fmt(d.cents)}. Den Stand siehst du in PookieWise. Danke!`;
  try {
    if (navigator.share) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); toast('Erinnerung kopiert. Füge sie im Messenger ein.'); }
  } catch (err) { if (err.name !== 'AbortError') toast('Erinnerung konnte nicht geteilt werden.', { error: true }); }
}

// Ein-Klick-Ausgleich aus der Schuldenliste, mit Rückgängig
function settleDebt(fromId, toId, cents) {
  const g = activeGroup(); if (!g) return;
  const id = newExpenseId(g.id);
  saveExpense(g, id, {
    type: 'settlement', desc: 'Ausgleichszahlung', amountCents: cents, payerId: fromId,
    date: C.today(), mode: 'exact', shares: [{ memberId: toId, cents }], category: 'other',
  });
  toast(`Erledigt: ${memberName(g, fromId)} → ${memberName(g, toId)} ${fmt(cents)}`, {
    action: 'Rückgängig', onAction: () => write(fs.deleteDoc(fs.doc(expCol(g.id), id))),
  });
}

function deleteExpense(id) {
  const g = activeGroup(); if (!g) return;
  const e = S.expenses.find(x => x.id === id); if (!e) return;
  write(fs.deleteDoc(fs.doc(expCol(g.id), id)));
  if (S.editingId === id) { S.editingId = null; go('expenses'); }
  toast(`„${e.desc}“ gelöscht`, { action: 'Rückgängig', onAction: () => saveExpense(g, id, stripMeta(e)) });
  toastReturn = 'entriesCard';
  $('toast').querySelector('button')?.focus();
}

/* ---------- Migration aus der alten Browser-Version ---------- */
function legacyData() {
  try { const d = JSON.parse(lsGet(LEGACY_KEY)); return d?.groups?.length ? d : null; } catch { return null; }
}
async function migrate() {
  const local = legacyData(); if (!local) return;
  if (!await ask({ title: 'Alte Gruppen übernehmen?', text: `${local.groups.length} Gruppe(n) aus diesem Browser werden in dein Konto übernommen und sind danach auf allen Geräten verfügbar.`, ok: 'Übernehmen' })) return;
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
  } catch (err) { toast(errText(err, 'Die Übernahme'), { error: true }); }
}

/* ---------- Ereignis-Verdrahtung (keine Inline-Handler) ---------- */
const actions = {
  login, emailLogin,
  newGroup: async () => { if (!await leaveOk()) return; S.view = 'newGroup'; S.editingId = null; closeDialog(); render(); syncRoute(true); scrollTo(0, 0); $('gName')?.focus(); },
  cancelNewGroup: () => { S.view = null; render(); syncRoute(true); },
  createGroup, saveSettings, deleteOrLeaveGroup, migrate, copyInvite, shareInvite, renewInvite, addMember,
  logout: () => { closeDialog(); authM.signOut(auth); },
  openAccount: () => openAccount(),
  selectGroup: async d => { if (await leaveOk()) selectGroup(d.id); },
  openGroupSheet: () => openGroupSheet(),
  closeDialog,
  tab: async d => { if (!await leaveOk()) return; if (d.tab === 'settings') S.dirty = false; go(d.tab, d.type ? { entryType: d.type } : {}); },
  prevPeriod: () => shiftCursor(-1), nextPeriod: () => shiftCursor(1),
  thisPeriod: () => { const g = activeGroup(); delete S.cursor[g.id]; render(); },
  claim: d => claimMember(d.id || null),
  removeMember: d => removeMember(d.id),
  submitEntry, cancelEdit: () => { const wasEditing = S.editingId; S.editingId = null; go(wasEditing ? 'expenses' : S.prevTab || 'overview'); },
  settleDebt: d => settleDebt(d.from, d.to, Number(d.cents)),
  editExpense: d => { const e = S.expenses.find(x => x.id === d.id); S.entryType = e?.type === 'settlement' || e?.type === 'contribution' ? e.type : 'expense'; go('add', { editingId: d.id }); },
  deleteExpense: d => deleteExpense(d.id),
  entryType: d => { S.entryType = d.value; const keep = $('expAmount')?.value; renderMain(); if (keep) $('expAmount').value = keep; updateSplitHint(); },
  groupKind: () => { const r = document.querySelector('input[name=gKind]:checked').value; $('gRecurringFields').hidden = r !== 'recurring'; $('gEventFields').hidden = r !== 'event'; updateTargetLabel(); },
  togglePot: () => { $('gTargetField').hidden = !$('gPot').checked; },
  renderParticipants: () => renderParticipants(),
  updateSplitHint: () => updateSplitHint(),
  toggleAll: () => { const cbs = [...document.querySelectorAll('.p-check')]; const all = cbs.every(c => c.checked); cbs.forEach(c => c.checked = !all); renderParticipants(); },
  catPick: () => { const c = cat(document.querySelector('input[name=expCat]:checked')?.value); $('expDesc').placeholder = `z. B. ${c.example} (sonst „${c.name}“)`; },
  settleFrom: () => prefillSettlement(false),
  filterEntries: () => {
    S.q = $('entrySearch').value; S.filter = document.querySelector('input[name=eFilter]:checked')?.value || 'all';
    const g = activeGroup(); $('entryList').innerHTML = entryList(g, visibleExpenses(g));
    // Nur die Trefferzahl ansagen, entprellt
    clearTimeout(S.countTimer);
    S.countTimer = setTimeout(() => { const n = $('entryList')?.querySelectorAll('.entry').length; if ($('entryCount')) $('entryCount').textContent = `${n} ${n === 1 ? 'Eintrag' : 'Einträge'} gefunden`; }, 400);
  },
  clearFilter: () => { S.q = ''; S.filter = 'all'; renderMain(); $('entrySearch')?.focus(); },
  remind: d => remind(d.from),
  potLink: () => actions.tab({ tab: 'balances' }),
  settleCustom: d => { S.settlePair = { from: d.from, to: d.to, cents: Number(d.cents) || 0 }; go('add', { entryType: 'settlement' }); },
  dateQuick: d => {
    if (d.value === 'other') { $('expDate').hidden = false; $('expDate').focus(); try { $('expDate').showPicker(); } catch {} }
    else { $('expDate').value = d.value === 'today' ? C.today() : yesterday(); $('expDate').hidden = true; }
  },
};
document.addEventListener('submit', e => {
  const a = e.target.dataset?.submit;
  if (!a) return;
  e.preventDefault();
  actions[a]?.(e.target.dataset, e.target, e);
});
document.addEventListener('click', e => {
  const t = e.target.closest('[data-action]');
  if (!t || !actions[t.dataset.action]) return;
  if (t.tagName === 'A' || t.closest('form[data-submit]')) e.preventDefault();
  actions[t.dataset.action](t.dataset, t, e);
});
document.addEventListener('change', e => { const a = e.target.dataset?.change; if (a) actions[a]?.({ ...e.target.dataset, value: e.target.value }, e.target); });
const markDirty = e => { if (e.target.closest?.('form[data-submit=saveSettings]')) setDirty(true); };
document.addEventListener('input', markDirty);
document.addEventListener('change', markDirty);
document.addEventListener('input', e => { const a = e.target.dataset?.input; if (a) actions[a]?.(e.target.dataset, e.target); });
document.addEventListener('keydown', e => {
  // Pfeiltasten im Säulendiagramm (Roving Tabindex)
  const col = e.target.closest?.('[data-roving] [tabindex]');
  if (col && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
    const cols = [...col.parentElement.querySelectorAll('[tabindex]')];
    const i = cols.indexOf(col);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? cols.length - 1 : Math.max(0, Math.min(cols.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
    e.preventDefault(); col.tabIndex = -1; cols[n].tabIndex = 0; cols[n].focus();
    return;
  }
  // Pfeiltasten in der Tab-Leiste (WAI-ARIA Tabs)
  if (e.target.getAttribute?.('role') === 'tab' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
    const tabs = [...e.target.parentElement.querySelectorAll('[role=tab]')];
    const i = tabs.indexOf(e.target);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    e.preventDefault(); go(tabs[n].dataset.tab); $('tab-' + tabs[n].dataset.tab)?.focus();
    return;
  }
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
// Tastatur: Tooltip auch bei Fokus zeigen
document.addEventListener('focusin', e => {
  const t = e.target.closest?.('[data-tip]');
  if (!t) { tip.hidden = true; return; }
  const r = t.getBoundingClientRect();
  tip.textContent = t.dataset.tip; tip.hidden = false;
  tip.style.left = Math.max(8, Math.min(r.left, innerWidth - tip.offsetWidth - 8)) + 'px';
  tip.style.top = (r.top - tip.offsetHeight - 8 > 60 ? r.top - tip.offsetHeight - 8 : r.bottom + 8) + 'px';
});

/* ---------- Rendering ---------- */
function render() { renderSidebar(); renderMain(); syncRoute(false); }
// Bei Echtzeit-Updates kein Neuaufbau, während jemand gerade tippt
function softRender() {
  const ae = document.activeElement;
  const typing = ae && ae.closest?.('#mainArea') && /INPUT|SELECT|TEXTAREA/.test(ae.tagName) && ae.value;
  renderSidebar();
  if (!(S.tab === 'add' || S.tab === 'settings' || S.view === 'newGroup' || typing)) renderMain();
}

function renderUser() {
  const u = S.user;
  const initial = (firstName() || '?')[0].toUpperCase();
  $('userBox').innerHTML = `<button class="acct-btn" data-action="openAccount" aria-haspopup="dialog" aria-label="Konto: ${esc(u.displayName || u.email || '')}">
    ${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar" aria-hidden="true">${esc(initial)}</span>`}
    <span class="uname">${esc(firstName())}</span>${ic('down')}</button>`;
}
function openAccount() {
  const u = S.user, d = $('dlg');
  d.className = 'sheet';
  d.innerHTML = `<div class="dlg-body"><div class="card-h"><h2 id="dlgTitle">Dein Konto</h2>
      <button class="icon-btn" data-action="closeDialog" aria-label="Schließen">${ic('x')}</button></div>
    <p><b>${esc(u.displayName || firstName())}</b><br>${esc(u.email || '')}</p>
    <button class="btn secondary block" style="margin-top:16px" data-action="logout">${ic('logout')} Abmelden</button></div>`;
  d.showModal();
}

const groupSub = g => `${g.members.length} ${g.members.length === 1 ? 'Person' : 'Personen'}${isRecurring(g) ? ` · ${g.period === 'week' ? 'wöchentlich' : 'monatlich'}` : ''}${g.potEnabled ? ' · mit Kasse' : ''}`;
function groupListHtml() {
  return S.groups.map(g => `<button class="group-item" data-action="selectGroup" data-id="${esc(g.id)}" ${g.id === S.activeGroupId && !S.view ? 'aria-current="true"' : ''}>
      <span class="g-icon" aria-hidden="true">${groupIcon(g)}</span>
      <span class="g-text"><span class="g-name">${esc(g.name)}</span><span class="g-sub">${balTag(g)}${groupSub(g)}</span></span>
    </button>`).join('');
}

function renderSidebar() {
  const local = legacyData();
  $('migrateBox').innerHTML = local ? `<div class="banner warn">In diesem Browser liegen noch ${local.groups.length} Gruppe(n) aus der alten Version.
    <button class="btn small" style="margin-top:8px" data-action="migrate">In dein Konto übernehmen</button></div>` : '';
  $('groupList').innerHTML = S.groups.length ? groupListHtml() : '<p class="empty">Noch keine Gruppen.</p>';
  $('sideNew').innerHTML = `${ic('plus')} Neue Gruppe`;
  $('sideNew').hidden = !S.groups.length && !S.view;
  document.querySelector('.sidebar').hidden = !S.groups.length && !local;
  const g = activeGroup();
  $('groupSwitch').innerHTML = S.view === 'newGroup' || !g ? `<span>Deine Gruppen</span>${ic('down')}`
    : `<span aria-hidden="true">${groupIcon(g)}</span><span>${esc(g.name)}</span>${ic('down')}`;
  $('groupSwitch').setAttribute('aria-label', g ? `Gruppe wechseln, aktuell: ${g.name}` : 'Gruppen');
}

function openGroupSheet() {
  const d = $('dlg');
  d.className = 'sheet';
  d.innerHTML = `<div class="dlg-body"><div class="card-h"><h2 id="dlgTitle">Deine Gruppen</h2>
      <button class="icon-btn" data-action="closeDialog" aria-label="Schließen">${ic('x')}</button></div>
    ${S.groups.length ? groupListHtml() : '<p class="empty">Noch keine Gruppen.</p>'}
    <button class="btn secondary block" style="margin-top:10px" data-action="newGroup">${ic('plus')} Neue Gruppe</button></div>`;
  d.showModal();
  (d.querySelector('[aria-current]') || d.querySelector('.group-item, .btn'))?.focus();
}

const NAV = [
  ['overview', 'Übersicht', 'home'],
  ['expenses', 'Einträge', 'list'],
  ['balances', 'Ausgleich', 'scale'],
  ['group', 'Gruppe', 'users'],
];

function renderMain() {
  const el = $('mainArea');
  const nav = $('bottomNav');
  nav.hidden = true; $('layout').classList.remove('has-nav', 'form-mode');
  $('layout').classList.toggle('on-overview', S.tab === 'overview');
  if (S.view === 'newGroup') { el.innerHTML = renderGroupForm(null); return; }
  const g = activeGroup();
  if (!g) { el.innerHTML = renderWelcome(); return; }
  if (!myMember(g)) { el.innerHTML = renderClaim(g); return; }

  const vis = visibleExpenses(g);
  const editing = S.tab === 'add' && S.editingId;
  let html = `<div class="group-head"><span class="g-icon" aria-hidden="true">${groupIcon(g)}</span>
      <div><h1>${esc(g.name)}</h1><div class="meta">${groupMeta(g)}</div></div></div>`;
  html += `<div class="tabbar"><div class="tabs" role="tablist" aria-label="Bereiche">${NAV.map(([k, label]) =>
    `<button class="tab" role="tab" id="tab-${k}" aria-controls="panel" aria-selected="${(S.tab === 'settings' ? 'group' : S.tab) === k}" tabindex="${(S.tab === 'settings' ? 'group' : S.tab) === k ? 0 : -1}" data-action="tab" data-tab="${k}">${label}</button>`).join('')}</div>
    ${g.members.length < 2 && !g.potEnabled ? '' : `<button class="btn small" data-action="tab" data-tab="add" data-type="expense">${ic('plus')} Ausgabe hinzufügen</button>`}</div>`;

  let body;
  if (S.tab === 'group') body = renderGroupTab(g);
  else if (S.tab === 'settings') body = renderSettings(g);
  else if (g.members.length < 2 && !g.potEnabled && S.tab !== 'overview') body = renderNeedPeople(g);
  else if (S.tab === 'add') body = renderForm(g);
  else if (S.tab === 'balances') body = renderBalances(g);
  else if (S.tab === 'expenses') body = periodNav(g) + renderExpenses(g, vis);
  else body = renderOverview(g, vis);
  html += `<div id="panel" role="tabpanel" ${S.tab === 'add' ? 'aria-label="Eintrag erfassen"' : `aria-labelledby="tab-${S.tab === 'settings' ? 'group' : S.tab}"`}>${body}</div>`;

  const focusId = document.activeElement?.id;
  el.innerHTML = html;
  if (S.tab === 'add' && $('entryForm')) initForm(g);
  if (focusId && el.querySelector('#' + CSS.escape(focusId))) $(focusId).focus();
  if (S.flashId) { el.querySelector(`[data-id="${CSS.escape(S.flashId)}"]`)?.classList.add('flash'); S.flashId = null; }
  if (S.focusAfter && $(S.focusAfter)) { $(S.focusAfter).focus(); $(S.focusAfter).closest('.card')?.querySelectorAll('li.done').forEach(li => li.classList.add('flash')); S.focusAfter = null; }

  // Im Formular auf Mobile: Vollbild-Formular mit fester Speicherleiste statt Navigation
  if (S.tab === 'add' && $('entryForm')) { $('layout').classList.add('form-mode'); return; }
  nav.hidden = false; $('layout').classList.add('has-nav');
  const cur = editing ? 'add' : S.tab === 'settings' ? 'group' : S.tab;
  const btn = ([k, label, icon]) => `<button data-action="tab" data-tab="${k}" ${cur === k ? 'aria-current="page"' : ''}>${ic(icon)}<span>${label}</span></button>`;
 const solo = g.members.length < 2 && !g.potEnabled;
  nav.innerHTML = btn(NAV[0]) + btn(NAV[1]) + (solo ? '' :
    `<button class="fab" data-action="tab" data-tab="add" data-type="expense" aria-label="Ausgabe hinzufügen" ${cur === 'add' ? 'aria-current="page"' : ''}>${ic('plus')}</button>`) +
    btn(NAV[2]) + btn(NAV[3]);
}

function groupMeta(g) {
  const parts = [groupSub(g).split(' · ')[0]];
  if (!isRecurring(g) && g.startDate) {
    const f = (d, o) => new Date(d + 'T00:00:00').toLocaleDateString('de-DE', o);
    parts.push(g.endDate ? `${f(g.startDate, { day: 'numeric', month: 'short' })} – ${f(g.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}` : `ab ${f(g.startDate, { day: 'numeric', month: 'short' })}`);
  }
  if (isRecurring(g)) parts.push(g.period === 'week' ? 'Wochenansicht' : 'Monatsansicht');
  return parts.join(' · ') + (usesPot(g) ? ` <button type="button" class="badge pot" data-action="potLink" aria-label="Kasse: ${fmt(C.potCash(S.expenses))}, zum Ausgleich">${ic('bank')} Kasse ${fmt(C.potCash(S.expenses))}</button>` : '');
}

function periodNav(g) {
  if (!isRecurring(g)) return '';
  const cur = C.periodKey(C.today(), g.period) === cursor(g);
  const unit = g.period === 'week' ? 'Woche' : 'Monat';
  return `<div class="period-nav" role="group" aria-label="Zeitraum">
    <button class="icon-btn" data-action="prevPeriod" aria-label="Vorherige${g.period === 'week' ? '' : 'r'} ${unit}">${ic('left')}</button>
    <span class="label" aria-live="polite">${esc(C.periodLabel(cursor(g), g.period))}</span>
    ${cur ? '' : `<button class="btn ghost small" data-action="thisPeriod">Aktuelle${g.period === 'week' ? '' : 'r'} ${unit}</button>`}
    <button class="icon-btn" data-action="nextPeriod" aria-label="Nächste${g.period === 'week' ? '' : 'r'} ${unit}">${ic('right')}</button>
  </div>`;
}

function renderWelcome() {
  return `<div class="card empty-state">
    <div class="big" aria-hidden="true">👋</div>
    <h2>Willkommen, ${esc(firstName())}!</h2>
    <p>Leg deine erste Gruppe an, zum Beispiel für einen Urlaub, die WG oder den Haushalt.</p>
    <button class="btn lg" data-action="newGroup">${ic('plus')} Gruppe anlegen</button>
    <ol class="steps" style="max-width:340px;margin:24px auto 0;text-align:left">
      <li><span class="num">1</span><span class="s-text">Gruppe anlegen</span></li>
      <li><span class="num">2</span><span class="s-text">Die anderen per Link einladen</span></li>
      <li><span class="num">3</span><span class="s-text">Ausgaben eintragen, PookieWise rechnet</span></li>
    </ol></div>`;
}

function renderClaim(g) {
  const free = g.members.filter(m => !m.uid);
  return `<div class="group-head"><span class="g-icon" aria-hidden="true">${groupIcon(g)}</span><div><h1>${esc(g.name)}</h1><div class="meta">${groupSub(g)}</div></div></div>
    <div class="card"><h2>Wer bist du in dieser Gruppe?</h2>
      ${free.length ? `<p>Tippe auf deinen Namen. Dann werden dir die Einträge zugeordnet, die schon für dich erfasst wurden.</p>
        <div class="claim-list">${free.map(m => `<button class="btn secondary" data-action="claim" data-id="${esc(m.id)}">${esc(m.name)}</button>`).join('')}</div>
        <h3 style="margin-top:20px">Nicht dabei? Dann tritt mit neuem Namen bei</h3>` : '<p style="margin-bottom:12px">Unter welchem Namen sollen dich die anderen sehen?</p>'}
      <form class="row end" data-submit="claim" novalidate>
        <div><label for="claimName" class="sr-only">Dein Name</label><input type="text" id="claimName" maxlength="40" value="${esc(firstName())}" autocomplete="given-name"></div>
        <button class="btn fixed">Beitreten</button></form>
    </div>`;
}

function renderGroupForm(g) {
  const kind = g?.kind || 'event';
  const pot = g ? g.potEnabled : false;
  const icon = g ? groupIcon(g) : '✈️';
  return `<form class="card" data-submit="${g ? 'saveSettings' : 'createGroup'}" novalidate>
    <h2>${g ? 'Einstellungen' : 'Neue Gruppe'}</h2>
    <div class="field"><label for="gName">Name</label><input type="text" id="gName" maxlength="80" placeholder="z. B. Italien-Urlaub, WG, Haushalt" value="${esc(g?.name || '')}"></div>
    <div class="field"><span class="label" id="gIconL">Symbol</span>
      <div class="chips" role="radiogroup" aria-labelledby="gIconL">${GROUP_ICONS.map(([i, n]) => `<label class="chip emoji" title="${n}"><input type="radio" name="gIcon" value="${i}" ${i === icon ? 'checked' : ''} aria-label="${n}"><span aria-hidden="true">${i}</span></label>`).join('')}</div></div>
    <div class="field"><span class="label" id="gKindL">Art der Gruppe</span>
      <div class="seg" role="radiogroup" aria-labelledby="gKindL">
        <label><input type="radio" name="gKind" value="event" data-change="groupKind" ${kind === 'event' ? 'checked' : ''}>Einmalig<small>z. B. Urlaub, Feier</small></label>
        <label><input type="radio" name="gKind" value="recurring" data-change="groupKind" ${kind === 'recurring' ? 'checked' : ''}>Laufend<small>z. B. Haushalt, WG</small></label>
      </div></div>
    <div class="row" id="gEventFields" ${kind === 'event' ? '' : 'hidden'}>
      <div class="field"><label for="gStart">Von <span class="zero">(optional)</span></label><input type="date" id="gStart" value="${esc(g?.startDate || '')}"></div>
      <div class="field"><label for="gEnd">Bis <span class="zero">(optional)</span></label><input type="date" id="gEnd" value="${esc(g?.endDate || '')}"></div>
    </div>
    <div class="field" id="gRecurringFields" ${kind === 'recurring' ? '' : 'hidden'}><label for="gPeriod">Ansicht und Auswertung pro</label>
      <select id="gPeriod" data-change="groupKind"><option value="month" ${g?.period !== 'week' ? 'selected' : ''}>Monat</option><option value="week" ${g?.period === 'week' ? 'selected' : ''}>Woche</option></select></div>
    <label class="switch-row"><input type="checkbox" id="gPot" data-change="togglePot" ${pot ? 'checked' : ''}>
      <span><b>Gemeinsame Kasse</b><small>Ein gemeinsamer Topf: Alle zahlen ein, bezahlt wird daraus. Wer einzahlt, hat dort ein Guthaben.</small></span></label>
    <div class="field" id="gTargetField" ${pot ? '' : 'hidden'}><label for="gTarget" id="gTargetL">${targetLabel(kind, g?.period)}</label>
      <input type="text" id="gTarget" inputmode="decimal" placeholder="z. B. 300 (optional)" value="${g?.potTargetCents ? C.centsToInput(g.potTargetCents) : ''}">
      <p class="hint">Dient nur als Orientierung in der Übersicht.</p></div>
    ${g ? '' : `<div class="field"><label for="gMyName">Dein Name in der Gruppe</label><input type="text" id="gMyName" maxlength="40" value="${esc(firstName())}" autocomplete="given-name"></div>`}
    <div class="form-actions ${g ? 'sticky-actions' : ''}">
      <button class="btn" ${g ? 'id="saveSettingsBtn" aria-disabled="true" aria-describedby="dirtyHint"' : ''}>${g ? 'Änderungen speichern' : 'Gruppe anlegen'}</button>
      ${g ? '<span class="hint" id="dirtyHint" style="margin:0" aria-live="polite"></span>' : ''}
      ${g || !S.groups.length ? '' : '<button type="button" class="btn secondary" data-action="cancelNewGroup">Abbrechen</button>'}
    </div></form>`;
}
const targetLabel = (kind, period) => `Sollbeitrag pro Person ${kind === 'recurring' ? (period === 'week' ? 'und Woche' : 'und Monat') : 'für die ganze Gruppe'}`;
function updateTargetLabel() {
  const kind = document.querySelector('input[name=gKind]:checked').value;
  $('gTargetL').textContent = targetLabel(kind, $('gPeriod').value);
}

function addMemberForm(g, autofocus) {
  return `<form class="row end" data-submit="addMember" novalidate style="margin-top:12px">
      <div><label for="newMemberName" class="sr-only">Name der neuen Person</label>
      <input type="text" id="newMemberName" maxlength="40" placeholder="Name, z. B. Lena" ${autofocus ? 'autofocus' : ''}></div>
      <button class="btn fixed">${ic('plus')} Hinzufügen</button></form>`;
}
function inviteBox(g, secondary) {
  return `<div class="invite"><label for="inviteInput" class="sr-only">Einladungslink</label><input type="text" id="inviteInput" readonly value="${esc(inviteLink(g))}">
      <button type="button" class="btn ${secondary ? 'secondary' : ''}" data-action="shareInvite">${ic('share')} Link teilen</button>
      <button type="button" class="btn secondary" data-action="copyInvite">${ic('copy')} Kopieren</button></div>`;
}

function renderNeedPeople(g) {
  return `<div class="card"><h2>Noch bist du allein in „${esc(g.name)}“</h2>
    <p>Füge die Personen hinzu, mit denen du Ausgaben teilst. Sie brauchen dafür kein Konto.</p>
    ${addMemberForm(g, true)}
    <h3>Oder lade sie direkt ein</h3>${inviteBox(g)}</div>`;
}

function renderGroupTab(g) {
  const me = myMember(g)?.id;
  const used = id => S.expenses.some(e => e.payerId === id || e.shares.some(x => x.memberId === id));
  return `<div class="card"><h2>Mitglieder (${g.members.length})</h2>
      <div>${g.members.map(m => `<div class="list-row"><span class="grow"><span class="who">${esc(m.name)}</span>${m.id === me ? '<span class="you">Du</span>' : m.uid ? '<span class="tag">hat Konto</span>' : '<span class="tag">ohne Konto</span>'}</span>
        ${m.id === me ? '' : used(m.id) ? `<span class="hint" style="margin:0" title="Kann nicht entfernt werden, solange Einträge mit ${esc(m.name)} existieren.">an Einträgen beteiligt</span>`
          : `<button type="button" class="icon-btn danger" data-action="removeMember" data-id="${esc(m.id)}" aria-label="${esc(m.name)} entfernen">${ic('trash')}</button>`}</div>`).join('')}</div>
      ${addMemberForm(g)}
      <p class="hint">Personen ohne Konto (z. B. Freunde im Urlaub) legst du einfach als Namen an. Treten sie später per Link bei, wählen sie ihren Namen aus.</p>
    </div>
    <div class="card"><h2>Andere einladen</h2>
      <p style="margin-bottom:12px">Schick den Link an die anderen. Wer ihn öffnet und sich anmeldet, tritt der Gruppe bei.</p>
      ${inviteBox(g)}
      <p class="note">Link in falsche Hände geraten? <button type="button" class="btn ghost small" data-action="renewInvite">Neuen Link erzeugen</button></p>
    </div>
    <button type="button" class="card list-link" data-action="tab" data-tab="settings">
      <span class="grow"><b>Einstellungen</b><span class="hint" style="display:block;margin:0">Name, Symbol, Art, Kasse${g.createdBy === S.user.uid ? ', Gruppe löschen' : ', Gruppe verlassen'}</span></span>${ic('right')}</button>`;
}

function renderSettings(g) {
  const isOwner = g.createdBy === S.user.uid;
  return `<button type="button" class="btn ghost small" style="margin:0 0 10px -6px" data-action="tab" data-tab="group">${ic('left')} Zurück zur Gruppe</button>
    ${renderGroupForm(g)}
    <div class="card narrow"><h2>${isOwner ? 'Gruppe löschen' : 'Gruppe verlassen'}</h2>
      <p style="margin-bottom:12px" class="zero">${isOwner ? 'Löscht die Gruppe mit allen Einträgen für alle Mitglieder.' : 'Deine Einträge bleiben für die anderen erhalten.'}</p>
      <button type="button" class="btn danger" data-action="deleteOrLeaveGroup">${ic('trash')} ${isOwner ? 'Gruppe für alle löschen' : 'Gruppe verlassen'}</button></div>`;
}

const dayLabel = iso => {
  const diff = C.daysBetween(iso, C.today()) - 1;
  const d = new Date(iso + 'T00:00:00');
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Gestern';
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
};

function renderExpenses(g, vis) {
  if (vis.length === 0) return `<div class="card empty-state"><div class="big" aria-hidden="true">🧾</div>
    <h2>Noch keine Einträge${isRecurring(g) ? ' in diesem Zeitraum' : ''}</h2>
    <p>Trag die erste Ausgabe ein. PookieWise rechnet dann aus, wer wem etwas schuldet.</p>
    <button class="btn" data-action="tab" data-tab="add" data-type="expense">${ic('plus')} Ausgabe hinzufügen</button></div>`;
  const f = S.filter || 'all';
  const chip = (k, l) => `<label class="chip"><input type="radio" name="eFilter" value="${k}" data-change="filterEntries" ${f === k ? 'checked' : ''}>${l}</label>`;
  return `<div class="card" id="entriesCard" tabindex="-1" aria-label="Einträge">
    <div class="filters"><div class="search"><label for="entrySearch" class="sr-only">Einträge durchsuchen</label>${ic('search')}
      <input type="search" id="entrySearch" placeholder="Suchen, z. B. Pizza" value="${esc(S.q || '')}" data-input="filterEntries" autocomplete="off"></div>
      <div class="chips" role="radiogroup" aria-label="Filter">${chip('all', 'Alle')}${chip('paid', 'Von mir bezahlt')}${chip('mine', 'Mit mir')}${chip('settle', 'Ausgleich & Kasse')}</div></div>
    <div id="entryList">${entryList(g, vis)}</div><p class="sr-only" role="status" id="entryCount"></p>
    <p class="note">Tippe auf einen Eintrag, um ihn zu ändern oder zu löschen.</p></div>`;
}
function entryList(g, vis) {
  const me = myMember(g)?.id;
  const q = (S.q || '').trim().toLowerCase(), f = S.filter || 'all';
  const plain = e => e.type === 'settlement' || e.type === 'contribution';
  const list = [...vis].reverse().filter(e =>
    (!q || [e.desc, cat(e.category).name, memberName(g, e.payerId)].some(t => t.toLowerCase().includes(q))) &&
    (f === 'all' || (f === 'paid' && e.payerId === me && !plain(e)) || (f === 'mine' && !plain(e) && e.shares.some(x => x.memberId === me)) || (f === 'settle' && plain(e))));
  if (!list.length) return `<p class="empty" style="padding:16px 4px">Keine passenden Einträge${isRecurring(g) ? ' in diesem Zeitraum' : ''}. <button type="button" class="btn ghost small" data-action="clearFilter">Filter zurücksetzen</button></p>`;
  let lastDay = null, html = '';
  for (const e of list) {
    if (e.date !== lastDay) { html += `<h3 class="day-h">${esc(dayLabel(e.date))}</h3>`; lastDay = e.date; }
    let icon, title, sub, mine = '';
    const name = id => esc(memberName(g, id));
    if (e.type === 'settlement') {
      icon = `<span class="c-ic" style="--c:var(--brand)" aria-hidden="true">${ic('scale')}</span>`; title = 'Ausgleich';
      const to = e.shares[0].memberId;
      sub = `${e.payerId === me ? 'Du' : name(e.payerId)} an ${to === me ? 'dich' : name(to)}`;
    } else if (e.type === 'contribution') {
      icon = `<span class="c-ic" style="--c:var(--pot)" aria-hidden="true">${ic('bank')}</span>`; title = 'Einzahlung';
      sub = `in die Kasse, von ${e.payerId === me ? 'dir' : name(e.payerId)}`;
    } else {
      icon = catIcon(cat(e.category)); title = esc(e.desc);
      const n = e.shares.length;
      const payer = e.payerId === POT ? 'Aus der Kasse bezahlt' : e.payerId === me ? 'Du hast bezahlt' : `${name(e.payerId)} hat bezahlt`;
      const forWhom = n === g.members.length ? 'alle' : n === 1 ? (e.shares[0].memberId === me ? 'dich' : name(e.shares[0].memberId)) : n + ' Personen';
      const short = `von ${e.payerId === POT ? 'der Kasse' : e.payerId === me ? 'dir' : name(e.payerId)} · für ${n === g.members.length || n === 1 ? forWhom : n}`;
      sub = `<span class="desk-only">${payer} · für ${forWhom}</span><span class="mob-only">${short}</span>`;
      const share = e.shares.find(s => s.memberId === me)?.cents || 0;
      mine = share ? `<small><span class="desk-only">dein Anteil </span><span class="mob-only">du: </span>${fmt(share)}</small>` : '<small>ohne dich</small>';
    }
    if (e._pending) sub += ` · <span class="pending">${ic('cloud')} wird übertragen</span>`;
    const plain = e.type === 'settlement' || e.type === 'contribution';
    html += `<button class="entry ${plain ? 'muted' : ''}" data-action="editExpense" data-id="${esc(e.id)}" aria-label="${esc((plain ? title : e.desc) + ', ' + fmt(e.amountCents))} – bearbeiten">
      <span class="e-icon" aria-hidden="true">${icon}</span>
      <span class="e-text"><span class="e-title">${title}</span><span class="e-sub">${sub}</span></span>
      <span class="e-amt"><b>${fmt(e.amountCents)}</b>${mine}</span></button>`;
  }
  return html;
}

function memberOptions(g, withPot, selected) {
  return (withPot ? `<option value="${POT}" ${selected === POT ? 'selected' : ''}>Gemeinsame Kasse</option>` : '') +
    g.members.map(m => `<option value="${esc(m.id)}" ${selected === m.id ? 'selected' : ''}>${esc(m.name)}${m.uid === S.user.uid ? ' (du)' : ''}</option>`).join('');
}

// Offene Schulden zwischen Personen (ohne Kasse), über alle Zeiträume
function debtsOf(g) {
  const { personTx, potTx } = C.splitPot(S.expenses);
  const b = C.balances(g.members.map(m => m.id), personTx);
  return { b, debts: C.simplifyDebts(b), potTx };
}
// Ausgleich vorbelegen: größte offene Schuld, an der ich beteiligt bin (in beide Richtungen)
function prefillSettlement(initial) {
  const g = activeGroup(); if (!g || !$('setFrom')) return;
  const me = myMember(g)?.id;
  const debts = debtsOf(g).debts.sort((a, b) => b.cents - a.cents);
  let d;
  if (initial) {
    const pair = S.settlePair; S.settlePair = null;
    d = pair ? debts.find(x => x.from === pair.from && x.to === pair.to) || pair : debts.find(x => x.from === me || x.to === me) || debts[0];
    if (d) $('setFrom').value = d.from;
    if (pair) { $('setTo').value = pair.to; $('expAmount').value = ''; $('setHint').textContent = d.cents ? `Offen sind ${fmt(d.cents)}. Trag ein, wie viel davon bezahlt wurde.` : ''; return; }
  } else d = debts.find(x => x.from === $('setFrom').value);
  const from = $('setFrom').value;
  if (d) {
    $('setTo').value = d.to;
    if (!$('expAmount').value || $('expAmount').dataset.auto) { $('expAmount').value = C.centsToInput(d.cents); $('expAmount').dataset.auto = '1'; }
  } else if ($('setTo').value === from) $('setTo').value = g.members.find(m => m.id !== from)?.id || POT;
  const nom = id => id === me ? 'Du' : memberName(g, id);
  const dat = id => id === me ? 'dir' : memberName(g, id);
  $('setHint').textContent = d ? `Offen: ${nom(d.from)} ${d.from === me ? 'schuldest' : 'schuldet'} ${dat(d.to)} noch ${fmt(d.cents)}. Betrag ist vorausgefüllt.`
    : `${from === me ? 'Du hast' : nom(from) + ' hat'} keine offenen Schulden.`;
}

function dateField() {
  return `<div class="field"><span class="label" id="dateL">Datum</span>
    <div class="chips" role="radiogroup" aria-labelledby="dateL">
      <label class="chip"><input type="radio" name="dQ" value="today" data-change="dateQuick">Heute</label>
      <label class="chip"><input type="radio" name="dQ" value="yesterday" data-change="dateQuick">Gestern</label>
      <label class="chip"><input type="radio" name="dQ" value="other" data-change="dateQuick">Anderes Datum</label></div>
    <input type="date" id="expDate" class="date-other" aria-labelledby="dateL" hidden></div>`;
}
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return C.isoDate(d); };
function setDate(v) {
  $('expDate').value = v;
  const q = v === C.today() ? 'today' : v === yesterday() ? 'yesterday' : 'other';
  document.querySelector(`input[name=dQ][value=${q}]`).checked = true;
  $('expDate').hidden = q !== 'other';
}

function renderForm(g) {
  const editing = S.editingId ? S.expenses.find(e => e.id === S.editingId) : null;
  if (S.editingId && !editing) { S.editingId = null; }
  const pot = usesPot(g);
  const types = [['expense', 'Ausgabe']];
  if (g.potEnabled || (editing && editing.type === 'contribution')) types.push(['contribution', 'Einzahlung']);
  if (g.members.length >= 2 || pot) types.push(['settlement', 'Ausgleich']);
  if (!types.some(t => t[0] === S.entryType)) S.entryType = 'expense';
  const type = S.entryType;
  const titles = { expense: editing ? 'Ausgabe bearbeiten' : 'Neue Ausgabe', contribution: editing ? 'Einzahlung bearbeiten' : 'In die Kasse einzahlen', settlement: editing ? 'Ausgleich bearbeiten' : 'Ausgleichszahlung erfassen' };
  const me = myMember(g)?.id;

  let html = `<form class="card" id="entryForm" data-submit="submitEntry" novalidate>
    <div class="card-h"><h2 id="formTitle">${titles[type]}</h2><button type="button" class="icon-btn" data-action="cancelEdit" aria-label="Schließen, ohne zu speichern">${ic('x')}</button></div>
    ${!editing && types.length > 1 ? `<div class="field"><div class="seg" role="radiogroup" aria-label="Art des Eintrags">${types.map(([k, l]) =>
      `<label><input type="radio" name="eType" value="${k}" data-change="entryType" ${k === type ? 'checked' : ''}>${l}</label>`).join('')}</div></div>` : ''}
    <div class="field"><label for="expAmount">Betrag</label>
      <div class="amount-wrap"><input type="text" id="expAmount" class="amount-input" inputmode="decimal" placeholder="0,00" autocomplete="off" data-input="updateSplitHint"><span class="cur" aria-hidden="true">€</span></div></div>`;

  if (type === 'expense') {
    html += `<div class="field"><label for="expDesc">Wofür? <span class="zero">(optional)</span></label>
      <input type="text" id="expDesc" maxlength="200" placeholder="z. B. Pizza (sonst „Essen & Trinken“)"></div>
    <div class="field"><span class="label" id="catL">Kategorie</span>
      <div class="chips" role="radiogroup" aria-labelledby="catL">${CATEGORIES.map((c, i) =>
        `<label class="chip"><input type="radio" name="expCat" value="${c.id}" data-change="catPick" ${i === 0 ? 'checked' : ''}>${catIcon(c)}${c.name}</label>`).join('')}</div></div>
    <div class="field"><label for="expPayer">Bezahlt von</label>
      <select id="expPayer">${memberOptions(g, pot, me)}</select></div>
    ${dateField()}
    <div class="field"><span class="label" id="modeL">Aufteilen</span>
      <div class="seg" role="radiogroup" aria-labelledby="modeL">
        <label><input type="radio" name="expMode" value="equal" data-change="renderParticipants" checked>Gleich</label>
        <label><input type="radio" name="expMode" value="exact" data-change="renderParticipants">Beträge</label>
        <label><input type="radio" name="expMode" value="shares" data-change="renderParticipants">Anteile</label>
      </div></div>
    <div class="field"><div class="participants-h"><span class="label" id="partL" style="margin:0">Wer teilt sich die Ausgabe?</span>
        <button type="button" class="btn ghost small" data-action="toggleAll">Alle / keine</button></div>
      <div class="participants" id="participants" role="group" aria-labelledby="partL" tabindex="-1"></div>
      <div class="split-hint" id="splitHint" aria-live="polite"></div></div>`;
  } else if (type === 'contribution') {
    html += `<div class="row">
      <div class="field"><label for="conFrom">Wer zahlt ein?</label><select id="conFrom">${memberOptions(g, false, me)}</select></div></div>
      ${dateField()}
      ${g.potTargetCents ? `<p class="hint" style="margin:-6px 0 12px">Sollbeitrag: ${fmt(g.potTargetCents)} pro Person.</p>` : ''}`;
  } else {
    html += `<div class="row">
      <div class="field"><label for="setFrom">Wer hat gezahlt?</label><select id="setFrom" data-change="settleFrom">${memberOptions(g, pot, me)}</select></div>
      <div class="field"><label for="setTo">An wen?</label><select id="setTo">${memberOptions(g, pot)}</select></div></div>
      <p class="hint" id="setHint" style="margin:-6px 0 12px"></p>
      ${dateField()}`;
  }
  if (editing) html += `<div class="delete-row"><button type="button" class="btn ghost danger small" data-action="deleteExpense" data-id="${esc(editing.id)}">${ic('trash')} Eintrag löschen</button></div>`;
  html += `<div class="form-actions sticky-actions">
      <button class="btn lg">${ic('check')} ${editing ? 'Änderungen speichern' : 'Speichern'}</button>
      <button type="button" class="btn secondary lg desk-only" data-action="cancelEdit">Abbrechen</button>
    </div></form>`;
  return html;
}

function initForm(g) {
  const editing = S.editingId ? S.expenses.find(e => e.id === S.editingId) : null;
  setDate(editing ? editing.date : defaultDate(g));
  if (editing) $('expAmount').value = C.centsToInput(editing.amountCents);
  const type = S.entryType;
  if (type === 'expense') {
    if (editing) {
      $('expDesc').value = editing.desc;
      $('expPayer').value = editing.payerId;
      document.querySelector(`input[name=expMode][value=${editing.mode}]`).checked = true;
      document.querySelector(`input[name=expCat][value=${cat(editing.category).id}]`).checked = true;
    }
    actions.catPick();
    renderParticipants(editing);
  } else if (type === 'contribution') {
    if (editing) $('conFrom').value = editing.payerId;
    else if (g.potTargetCents) $('expAmount').value = C.centsToInput(g.potTargetCents);
  } else {
    if (editing) { $('setFrom').value = editing.payerId; $('setTo').value = editing.shares[0].memberId; }
    prefillSettlement(!editing);
    if (editing) { $('setTo').value = editing.shares[0].memberId; $('expAmount').value = C.centsToInput(editing.amountCents); delete $('expAmount').dataset.auto; }
  }
}

function renderParticipants(editing) {
  const g = activeGroup(); if (!g || !$('participants')) return;
  editing = editing || (S.editingId ? S.expenses.find(e => e.id === S.editingId) : null);
  const mode = document.querySelector('input[name=expMode]:checked').value;
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
    const input = mode === 'equal' ? `<span class="p-amt" data-amt="${esc(m.id)}"></span>` :
      `<input type="text" class="split-input p-val" id="pv-${esc(m.id)}" data-mid="${esc(m.id)}" inputmode="decimal" aria-label="${mode === 'exact' ? 'Betrag' : 'Anteile'} für ${esc(m.name)}"
        placeholder="${mode === 'exact' ? '0,00 €' : '1'}" value="${val}" data-input="updateSplitHint">`;
    return `<div class="participant-row">
      <label><input type="checkbox" class="p-check" data-mid="${esc(m.id)}" ${checkedAttr} data-change="updateSplitHint">${esc(m.name)}${m.uid === S.user.uid ? ' <span class="zero">(du)</span>' : ''}</label>
      ${input}</div>`;
  }).join('');
  updateSplitHint();
}

function updateSplitHint() {
  if ($('expAmount')) delete $('expAmount').dataset.auto;
  const hint = $('splitHint'); if (!hint) return;
  const mode = document.querySelector('input[name=expMode]:checked').value;
  const amount = parseAmount($('expAmount').value);
  const checked = [...document.querySelectorAll('.p-check:checked')].map(cb => cb.dataset.mid);
  const valOf = mid => document.querySelector(`.p-val[data-mid="${mid}"]`).value;
  hint.className = 'split-hint';
  document.querySelectorAll('[data-amt]').forEach(s => s.textContent = '');
  if (checked.length === 0) { hint.textContent = 'Niemand ausgewählt. Wähle mindestens eine Person.'; hint.classList.add('error'); return; }
  if (mode === 'equal') {
    if (isNaN(amount)) { hint.textContent = `Wird gleichmäßig auf ${checked.length} ${checked.length === 1 ? 'Person' : 'Personen'} verteilt.`; return; }
    C.computeEqualShares(amount, checked).forEach(s => { const el = document.querySelector(`[data-amt="${s.memberId}"]`); if (el) el.textContent = fmt(s.cents); });
    hint.textContent = `${fmt(Math.round(amount / checked.length))} pro Person.`;
  } else if (mode === 'exact') {
    let sum = 0, ok = true;
    checked.forEach(mid => { const v = parseAmount(valOf(mid)); if (isNaN(v)) ok = false; else sum += v; });
    if (!ok) hint.textContent = `Trag für jede Person ein, wie viel ihr Anteil ist.${isNaN(amount) ? '' : ` Noch offen: ${fmt(amount - sum)}.`}`;
    else if (!isNaN(amount) && sum !== amount) { hint.textContent = sum < amount ? `Noch ${fmt(amount - sum)} zu verteilen.` : `${fmt(sum - amount)} zu viel verteilt.`; hint.classList.add('error'); }
    else { hint.textContent = `Passt: ${fmt(sum)} verteilt.`; hint.classList.add('ok'); }
  } else {
    let total = 0, ok = true;
    checked.forEach(mid => { const w = parseFloat((valOf(mid) || '').replace(',', '.')); if (isNaN(w) || w <= 0) ok = false; else total += w; });
    if (ok && !isNaN(amount)) {
      checked.forEach(mid => { const w = parseFloat(valOf(mid).replace(',', '.')); const el = $('pv-' + mid); el.title = fmt(Math.round(amount * w / total)); });
      hint.textContent = `${total} Anteile. 1 Anteil = ${fmt(Math.round(amount / total))}.`;
    } else hint.textContent = ok ? `${total} Anteile insgesamt.` : 'Trag für jede Person eine Zahl ein. Wer 2 Anteile hat, zahlt doppelt so viel wie jemand mit 1.';
  }
}

function renderBalances(g) {
  const pot = usesPot(g);
  const ids = g.members.map(m => m.id);
  const me = myMember(g)?.id;
  const { b, debts, potTx } = debtsOf(g);
  const nm = id => id === me ? 'Du' : esc(memberName(g, id));
  const debtHtml = debts.length === 0
    ? '<div class="empty-state" style="padding:12px"><div class="big" aria-hidden="true">🎉</div><p style="margin:0">Alles ausgeglichen. Niemand schuldet jemandem etwas.</p></div>'
    : debts.map(d => `<div class="list-row debt">
        <span class="grow"><span class="who">${nm(d.from)}</span> <span class="arrow">${ic('arrow', 'an')}</span> <span class="who">${nm(d.to)}</span></span>
        <span class="amt">${fmt(d.cents)}</span>
 <span class="debt-actions">${d.to === me ? `<button type="button" class="btn ghost small" data-action="remind" data-from="${esc(d.from)}" aria-label="${esc(memberName(g, d.from))} an ${fmt(d.cents)} erinnern">${ic('bell')} Erinnern</button>` : ''}<button type="button" class="btn ghost small" data-action="settleCustom" data-from="${esc(d.from)}" data-to="${esc(d.to)}" aria-label="Teilbetrag: ${esc(memberName(g, d.from))} an ${esc(memberName(g, d.to))}">Teilbetrag</button>
        <button type="button" class="btn small ${d.from === me || d.to === me ? '' : 'secondary'}" data-action="settleDebt" data-from="${esc(d.from)}" data-to="${esc(d.to)}" data-cents="${d.cents}" aria-label="Als bezahlt markieren: ${esc(memberName(g, d.from))} an ${esc(memberName(g, d.to))}, ${fmt(d.cents)}">${ic('check')} Bezahlt</button></span>
      </div>`).join('');
  let potHtml = '';
  if (pot) {
    const stake = C.balances(ids, potTx);
    potHtml = `<div class="card"><div class="card-h"><h2>Kasse</h2><span class="badge pot">Stand ${fmt(C.potCash(S.expenses))}</span></div>
      <p class="hint" style="margin:-6px 0 8px">Guthaben jeder Person in der Kasse: eingezahlt minus eigener Anteil an den Ausgaben aus der Kasse.</p>
      ${g.members.map(m => {
        const v = stake[m.id];
        const btn = v > 0 ? `<button type="button" class="btn small secondary" data-action="settleDebt" data-from="${POT}" data-to="${esc(m.id)}" data-cents="${v}" aria-label="${fmt(v)} an ${esc(m.name)} auszahlen">Auszahlen</button>`
          : v < 0 ? `<button type="button" class="btn small secondary" data-action="settleDebt" data-from="${esc(m.id)}" data-to="${POT}" data-cents="${-v}" aria-label="${esc(m.name)}: ${fmt(-v)} nachzahlen">Nachzahlen</button>` : '';
        const part = v ? `<button type="button" class="btn ghost small" data-action="settleCustom" data-from="${v > 0 ? POT : esc(m.id)}" data-to="${v > 0 ? esc(m.id) : POT}" data-cents="${Math.abs(v)}" aria-label="Teilbetrag ${v > 0 ? 'an ' + esc(m.name) + ' auszahlen' : 'von ' + esc(m.name) + ' nachzahlen'}">Teilbetrag</button>` : '';
        return `<div class="list-row debt"><span class="grow who">${esc(m.name)}${m.id === me ? '<span class="you">Du</span>' : ''}</span>
          <span class="amt ${v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'}">${v < 0 ? '−' + fmt(-v) : v > 0 ? '+' + fmt(v) : fmt(0)}</span>${v ? `<span class="debt-actions">${part}${btn}</span>` : ''}</div>`;
      }).join('')}
      <p class="note">Löst ihr die Kasse auf (z. B. am Ende des Urlaubs), wird jedes Guthaben ausgezahlt und fehlende Beträge werden nachgezahlt.</p></div>`;
  }
  const balHtml = g.members.map(m => {
    const v = b[m.id];
    return `<div class="list-row"><span class="grow who">${esc(m.name)}${m.id === me ? '<span class="you">Du</span>' : ''}</span>
      <span class="${v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'}">${v > 0 ? 'bekommt ' + fmt(v) : v < 0 ? 'schuldet ' + fmt(-v) : 'ausgeglichen'}</span></div>`;
  }).join('');
  return `<div class="card"><div class="card-h"><h2>So gleicht ihr aus</h2>
      <button type="button" class="btn ghost small" data-action="tab" data-tab="add" data-type="settlement">${ic('plus')} Zahlung manuell erfassen</button></div>
      ${debtHtml}
      ${debts.length ? `<p class="note">Die wenigsten Überweisungen, mit denen alle quitt sind. Tippe auf „Bezahlt“, sobald das Geld überwiesen ist, oder auf „Teilbetrag“, wenn erst ein Teil überwiesen wurde.${pot ? ' Die Kasse wird getrennt verrechnet.' : ''}${isRecurring(g) ? ' Gilt über alle Zeiträume.' : ''}</p>` : ''}</div>
    ${potHtml}
    <div class="card"><h2>Salden</h2>${balHtml}</div>`;
}

/* ---------- Übersicht ---------- */
function renderOverview(g, vis) {
  const st = C.spendingStats(vis);
  const me = myMember(g);
  let html = renderChecklist(g) + renderStanding(g, me) + periodNav(g);
  const kpis = [];
  kpis.push(kpi(isRecurring(g) ? `Ausgaben ${g.period === 'week' ? 'diese Woche' : 'im Monat'}` : 'Ausgaben gesamt', fmt(st.total), `${st.count} ${st.count === 1 ? 'Ausgabe' : 'Ausgaben'}`));
  if (isRecurring(g)) {
    const prevKey = C.shiftPeriod(cursor(g), g.period, -1);
    const prev = C.spendingStats(S.expenses.filter(e => C.periodKey(e.date, g.period) === prevKey)).total;
    const diff = st.total - prev;
    const prevName = g.period === 'week' ? C.periodLabel(prevKey, 'week', true) : new Date(prevKey + '-01T00:00:00').toLocaleDateString('de-DE', { month: 'long' });
    kpis.push(kpi(`Vergleich zu ${prevName}`, prev ? `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${fmt(Math.abs(diff))}` : '–', prev ? `${prevName}: ${fmt(prev)}` : 'keine Ausgaben davor'));
  } else {
    const dates = vis.filter(C.isSpending).map(e => e.date);
    const from = g.startDate || dates[0], to = g.endDate || dates[dates.length - 1];
    const days = from && to ? Math.max(1, C.daysBetween(from, to)) : 0;
    kpis.push(kpi('Pro Tag', days ? fmt(Math.round(st.total / days)) : '–', days ? `über ${days} Tag${days > 1 ? 'e' : ''}` : 'noch keine Daten'));
  }
  if (me) kpis.push(kpi('Dein Anteil', fmt(st.share[me.id] || 0), `ausgelegt: ${fmt(st.paid[me.id] || 0)}`));

  if (g.members.length < 2 && !g.potEnabled) return html;
  if (st.count === 0 && !g.potEnabled) return html + `<div class="card empty-state"><div class="big" aria-hidden="true">📊</div>
    <h2>Hier entstehen eure Auswertungen</h2><p>Sobald Ausgaben${isRecurring(g) ? ' in diesem Zeitraum' : ''} eingetragen sind, siehst du hier, wer was bezahlt hat und wofür.</p>
    <button class="btn" data-action="tab" data-tab="add" data-type="expense">${ic('plus')} Ausgabe hinzufügen</button></div>`;
  html += `<div class="kpis">${kpis.join('')}</div><div class="charts">`;
  if (st.count) html += personChart(g, st) + categoryChart(st);
  html += timeChart(g, vis);
  if (g.potEnabled) html += potChart(g, vis);
  return html + '</div>';
}

// Erste Schritte, bis die Gruppe eingerichtet ist
function renderChecklist(g) {
  const people = g.members.length >= 2, invited = g.memberUids.length >= 2, first = S.expenses.some(C.isSpending);
  if ((people && invited && first) || (people && first)) return '';
  const step = (n, done, text, body) => `<li class="${done ? 'done' : ''}"><span class="num">${done ? ic('check') : n}</span><span class="s-text">${text}</span>
    ${done ? '<span class="sr-only">erledigt</span>' : ''}${!done && body ? `<div class="s-body">${body}</div>` : ''}</li>`;
  return `<div class="card"><h2>Los geht’s: richte „${esc(g.name)}“ ein</h2><ol class="steps">
    ${step(1, people, 'Wer ist noch dabei?', `<p class="hint" style="margin:0">Nur ein Name genügt, ein Konto ist nicht nötig.</p>${addMemberForm(g, false)}`)}
    ${step(2, invited, 'Die anderen per Link einladen <span class="zero">(optional)</span>', `<p class="hint" style="margin:0 0 8px">Dann sehen und ergänzen alle die Ausgaben auf ihrem eigenen Handy.</p>${inviteBox(g, !people)}`)}
    ${step(3, first, 'Erste Ausgabe eintragen', people ? `<button class="btn" id="startFirst" data-action="tab" data-tab="add" data-type="expense">${ic('plus')} Ausgabe hinzufügen</button>` : '<p class="hint" style="margin:0">Geht los, sobald jemand dabei ist.</p>')}
  </ol></div>`;
}

// Persönlicher Stand: das Wichtigste zuerst
function renderStanding(g, me) {
  if (!me || (g.members.length < 2 && !usesPot(g))) return '';
  const { b, debts } = debtsOf(g);
  const v = b[me.id] || 0;
  const mine = debts.filter(d => d.from === me.id || d.to === me.id);
  const value = v > 0 ? `<span class="pos">Du bekommst ${fmt(v)}</span>` : v < 0 ? `<span class="neg">Du schuldest ${fmt(-v)}</span>` : 'Du bist quitt ✓';
  const rows = mine.map(d => {
    const out = d.from === me.id;
    const other = esc(memberName(g, out ? d.to : d.from));
    return `<div class="list-row debt"><span class="grow">${out ? `Du zahlst <b>${other}</b>` : `<b>${other}</b> zahlt dir`}</span>
      <span class="amt ${out ? 'neg' : 'pos'}">${fmt(d.cents)}</span>
      <span class="debt-actions">${out ? '' : `<button type="button" class="btn ghost small" data-action="remind" data-from="${esc(d.from)}" aria-label="${other} an ${fmt(d.cents)} erinnern">${ic('bell')} Erinnern</button>`}<button type="button" class="btn ghost small" data-action="settleCustom" data-from="${esc(d.from)}" data-to="${esc(d.to)}" aria-label="Teilbetrag ${out ? `an ${other}` : `von ${other}`} erfassen">Teilbetrag</button>
      <button type="button" class="btn small ${out ? '' : 'secondary'}" data-action="settleDebt" data-from="${esc(d.from)}" data-to="${esc(d.to)}" data-cents="${d.cents}" aria-label="${out ? `Bezahlt: ${fmt(d.cents)} an ${other}` : `Erhalten: ${fmt(d.cents)} von ${other}`}">${ic('check')} ${out ? 'Bezahlt' : 'Erhalten'}</button></span></div>`;
  }).join('');
  return `<section class="card" aria-labelledby="standL"><div class="hero">
      <div><div class="h-label" id="standL">Dein Stand${isRecurring(g) ? ' über alle Zeiträume' : ''}</div><div class="h-value">${value}</div>
      ${v === 0 ? '<div class="h-sub">Niemand schuldet dir etwas, und du schuldest niemandem etwas.</div>' : ''}</div>
    </div>${rows ? `<div class="hero-debts">${rows}</div>` : ''}
    <div class="card-foot"><button type="button" class="btn ghost small" data-action="tab" data-tab="balances">Alle Salden ansehen ${ic('right')}</button></div></section>`;
}
const kpi = (label, value, sub) => `<div class="kpi"><div class="k-label">${label}</div><div class="k-value">${value}</div><div class="k-sub">${esc(sub)}</div></div>`;

function personChart(g, st) {
  const rows = g.members.map(m => ({ name: m.name, paid: st.paid[m.id] || 0, share: st.share[m.id] || 0 }));
  if (st.paid[POT]) rows.push({ name: 'Kasse', paid: st.paid[POT], share: 0, pot: true });
  const max = Math.max(1, ...rows.flatMap(r => [r.paid, r.share]));
  const bar = (v, color, label) => `<div class="hbar-line" data-tip="${esc(label)}: ${fmt(v)}">
      <div class="hbar-track"><div class="hbar" style="width:${(v / max * 100).toFixed(1)}%;background:${color}"></div></div><span>${fmt(v)}</span></div>`;
  return `<div class="card"><h2>Bezahlt und Anteil pro Person</h2>
    <div class="legend"><span><i style="background:var(--s1)"></i>bezahlt</span><span><i style="background:var(--s2)"></i>eigener Anteil</span></div>
    ${rows.map(r => `<div class="hbar-row"><span class="sr-only">${esc(r.name)}: bezahlt ${fmt(r.paid)}${r.pot ? '' : `, Anteil ${fmt(r.share)}`}</span>
      <span class="name" title="${esc(r.name)}" aria-hidden="true">${esc(r.name)}</span><div class="hbar-pair" aria-hidden="true">
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
      transform="rotate(-90 80 80)"  data-tip="${esc(c.name)}: ${fmt(c.v)} (${Math.round(c.v / st.total * 100)} %)"></circle>`;
    off += len;
    return s;
  }).join('');
  return `<div class="card"><h2>Nach Kategorie</h2><div class="donut-wrap">
    <svg width="132" height="132" viewBox="0 0 160 160" role="img" aria-label="Ringdiagramm: Ausgaben nach Kategorie, gesamt ${fmt(st.total)}" aria-describedby="catLegend">${segs}
      <text class="d-label" x="80" y="76" text-anchor="middle" font-size="11">gesamt</text>
      <text class="d-value" x="80" y="94" text-anchor="middle" font-size="15" font-weight="700">${fmt(st.total)}</text></svg>
    <div class="cat-legend" id="catLegend">${items.map(c => `<div><span class="cl-name"><i style="background:${c.color}"></i>${esc(c.name)}<small>${fmt(c.v)}</small></span>
      <span class="cl-pct">${Math.round(c.v / st.total * 100)} %</span></div>`).join('')}</div>
  </div></div>`;
}

function timeChart(g, vis) {
  let points, title, labelOf, tipOf, currentKey = null;
  if (isRecurring(g)) {
    points = C.periodSeries(S.expenses, g.period, cursor(g), 6);
    title = `Ausgaben der letzten 6 ${g.period === 'week' ? 'Wochen' : 'Monate'}`;
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
    title = series.weekly ? 'Ausgaben pro Woche' : 'Ausgaben pro Tag';
    const f = (k, o) => new Date(k + 'T00:00:00').toLocaleDateString('de-DE', o);
    labelOf = k => f(k, { day: 'numeric', month: 'numeric' });
    tipOf = k => series.weekly ? 'Woche ab ' + f(k, { day: 'numeric', month: 'long' }) : f(k, { weekday: 'short', day: 'numeric', month: 'long' });
  }
  const max = Math.max(1, ...points.map(p => p.cents));
  const step = niceStep(max / 3);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const grid = [1, 2, 3].map(i => i * step).filter(v => v <= top)
    .map(v => `<div class="gl" aria-hidden="true" style="bottom:${(v / top * 100).toFixed(1)}%"><span>${fmtShort(v)}</span></div>`).join('');
  const every = Math.ceil(points.length / (matchMedia('(max-width: 760px)').matches ? 5 : 10));
  const focusIdx = currentKey ? points.findIndex(p => p.key === currentKey) : points.length - 1;
  // Ein Tab-Stopp für das ganze Diagramm, Pfeiltasten wechseln die Säule
  return `<div class="card wide"><h2 id="tcTitle">${title}</h2>
    <div class="cols" role="list" aria-labelledby="tcTitle" aria-describedby="tcHelp" data-roving>${grid}${points.map((p, i) => `<div class="col ${p.key === currentKey ? 'current' : ''}" role="listitem" tabindex="${i === focusIdx ? 0 : -1}" aria-label="${esc(tipOf(p.key))}: ${fmt(p.cents)}" data-tip="${esc(tipOf(p.key))}\n${fmt(p.cents)}">
      ${p.cents ? `<div class="bar" style="height:${(p.cents / top * 100).toFixed(1)}%"></div>` : ''}</div>`).join('')}</div>
    <div class="xlabels" aria-hidden="true">${points.map((p, i) => `<span class="${p.key === currentKey ? 'cur' : ''}">${(points.length - 1 - i) % every === 0 ? esc(labelOf(p.key)) : ''}</span>`).join('')}</div>
    <p class="sr-only" id="tcHelp">Mit den Pfeiltasten links und rechts zwischen den Säulen wechseln.</p>
  </div>`;
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw);
}
const fmtShort = c => Math.round(c / 100).toLocaleString('de-DE') + ' €';

function potChart(g, vis) {
  const con = C.contributionsBy(vis);
  const target = g.potTargetCents || 0;
  const max = Math.max(1, target, ...Object.values(con));
  const scope = isRecurring(g) ? 'in diesem Zeitraum' : 'insgesamt';
  return `<div class="card wide"><h2>Einzahlungen in die Kasse ${scope}</h2>
    ${g.members.map(m => {
      const v = con[m.id] || 0;
      return `<div class="pot-row" data-tip="${esc(m.name)}: ${fmt(v)}${target ? ' von ' + fmt(target) : ''}">
        <div class="top"><span>${esc(m.name)}</span><span>${fmt(v)}${target ? ` <span class="zero">von ${fmt(target)}</span>${v >= target ? ' ✓' : ''}` : ''}</span></div>
        <div class="progress"><div style="width:${(v / max * 100).toFixed(1)}%"></div></div></div>`;
    }).join('')}
    <div class="card-foot"><button type="button" class="btn small secondary" data-action="tab" data-tab="add" data-type="contribution">${ic('plus')} Einzahlung</button></div>
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
