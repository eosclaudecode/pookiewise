/* PookieWise – Rechenkern ohne Abhängigkeiten (Beträge immer in Cent) */

export const POT = '__pot'; // virtuelles Mitglied „Kasse“

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export function randomCode() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_');
}
export const fmt = c => (c / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
export const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
export function parseAmount(str) {
  if (typeof str !== 'string') return NaN;
  str = str.trim().replace(/\./g, '').replace(',', '.');
  const v = parseFloat(str);
  return isNaN(v) ? NaN : Math.round(v * 100);
}
export const centsToInput = c => (c / 100).toFixed(2).replace('.', ',');

/* ---------- Datum & Perioden ---------- */
const pad = n => String(n).padStart(2, '0');
export const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDate(new Date());
const toDate = s => new Date(s + 'T00:00:00');

// month → 'YYYY-MM', week → Datum des Montags 'YYYY-MM-DD'
export function periodKey(date, period) {
  if (period === 'week') {
    const d = toDate(date);
    d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    return isoDate(d);
  }
  return date.slice(0, 7);
}
export function shiftPeriod(key, period, n) {
  if (period === 'week') {
    const d = toDate(key);
    d.setDate(d.getDate() + 7 * n);
    return isoDate(d);
  }
  let [y, m] = key.split('-').map(Number);
  m += n;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  return `${y}-${pad(m)}`;
}
export const periodStart = (key, period) => period === 'week' ? key : key + '-01';
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 864e5 + 1) / 7);
}
export function periodLabel(key, period, short = false) {
  if (period === 'week') {
    const s = toDate(key), e = toDate(key);
    e.setDate(e.getDate() + 6);
    const f = d => d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
    return short ? `KW ${isoWeek(s)}` : `KW ${isoWeek(s)} · ${f(s)} – ${f(e)}`;
  }
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('de-DE', short ? { month: 'short' } : { month: 'long', year: 'numeric' });
}
export function daysBetween(a, b) { return Math.round((toDate(b) - toDate(a)) / 864e5) + 1; }

/* ---------- Aufteilen ---------- */
export function computeEqualShares(amountCents, memberIds) {
  const n = memberIds.length;
  const base = Math.floor(amountCents / n);
  let rest = amountCents - base * n;
  return memberIds.map(id => ({ memberId: id, cents: base + (rest-- > 0 ? 1 : 0) }));
}
export function computeShareSplit(amountCents, entries) { // entries: [{memberId, weight}]
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let assigned = 0;
  return entries.map((e, i) => {
    let c;
    if (i === entries.length - 1) c = amountCents - assigned;
    else { c = Math.round(amountCents * e.weight / total); assigned += c; }
    return { memberId: e.memberId, cents: c };
  });
}

/* ---------- Salden & Schulden ---------- */
export function balances(memberIds, expenses) {
  const b = {};
  memberIds.forEach(id => b[id] = 0);
  for (const e of expenses) {
    b[e.payerId] = (b[e.payerId] || 0) + e.amountCents;
    for (const s of e.shares) b[s.memberId] = (b[s.memberId] || 0) - s.cents;
  }
  return b;
}
export function simplifyDebts(b) {
  const creditors = [], debtors = [];
  for (const [id, v] of Object.entries(b)) {
    if (v > 0) creditors.push({ id, v });
    else if (v < 0) debtors.push({ id, v: -v });
  }
  creditors.sort((a, b2) => b2.v - a.v);
  debtors.sort((a, b2) => b2.v - a.v);
  const res = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const x = Math.min(debtors[i].v, creditors[j].v);
    res.push({ from: debtors[i].id, to: creditors[j].id, cents: x });
    debtors[i].v -= x; creditors[j].v -= x;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return res;
}
export const potCash = expenses => -(balances([POT], expenses)[POT] || 0);
// Trennt Buchungen mit Kassenbezug von denen zwischen Personen. Salden aus personTx ergeben
// „wer schuldet wem“, Salden aus potTx den Anteil jeder Person am Kassenstand.
export const involvesPot = e => e.payerId === POT || e.shares.some(s => s.memberId === POT);
export function splitPot(expenses) {
  return { personTx: expenses.filter(e => !involvesPot(e)), potTx: expenses.filter(involvesPot) };
}

/* ---------- Auswertung ---------- */
export const isSpending = e => !e.type || e.type === 'expense' || e.type === 'potExpense';
const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };

export function spendingStats(expenses) {
  const spend = expenses.filter(isSpending);
  const paid = {}, share = {}, byCat = {};
  let total = 0;
  for (const e of spend) {
    total += e.amountCents;
    add(paid, e.payerId, e.amountCents);
    add(byCat, e.category || 'other', e.amountCents);
    for (const s of e.shares) add(share, s.memberId, s.cents);
  }
  return { total, count: spend.length, paid, share, byCat };
}
export function contributionsBy(expenses) {
  const res = {};
  for (const e of expenses) if (e.type === 'contribution') add(res, e.payerId, e.amountCents);
  return res;
}
// Ausgaben pro Tag von..bis; über 45 Tage wird nach Wochen zusammengefasst
export function dailySeries(expenses, from, to) {
  const spend = expenses.filter(isSpending);
  const days = daysBetween(from, to);
  const weekly = days > 45;
  const buckets = new Map();
  const d = toDate(weekly ? periodKey(from, 'week') : from);
  const end = toDate(to);
  while (d <= end) { buckets.set(isoDate(d), 0); d.setDate(d.getDate() + (weekly ? 7 : 1)); }
  for (const e of spend) {
    const k = weekly ? periodKey(e.date, 'week') : e.date;
    if (buckets.has(k)) buckets.set(k, buckets.get(k) + e.amountCents);
  }
  return { weekly, points: [...buckets].map(([key, cents]) => ({ key, cents })) };
}
export function periodSeries(expenses, period, lastKey, n) {
  const spend = expenses.filter(isSpending);
  const keys = Array.from({ length: n }, (_, i) => shiftPeriod(lastKey, period, i - n + 1));
  const sums = Object.fromEntries(keys.map(k => [k, 0]));
  for (const e of spend) { const k = periodKey(e.date, period); if (k in sums) sums[k] += e.amountCents; }
  return keys.map(key => ({ key, cents: sums[key] }));
}

/* ---------- Selbsttest (index.html#selftest) ---------- */
export function selftest() {
  const r = [];
  const t = (name, ok) => r.push({ test: name, ok: !!ok });
  t('parseAmount 1.234,56', parseAmount('1.234,56') === 123456);
  t('gleich teilen 10,00/3', computeEqualShares(1000, ['a', 'b', 'c']).map(s => s.cents).join() === '334,333,333');
  t('Anteile summieren', computeShareSplit(1001, [{ memberId: 'a', weight: 2 }, { memberId: 'b', weight: 1 }]).reduce((s, x) => s + x.cents, 0) === 1001);
  const ex = [
    { type: 'contribution', payerId: 'a', amountCents: 10000, shares: [{ memberId: POT, cents: 10000 }], date: '2026-10-01' },
    { type: 'contribution', payerId: 'b', amountCents: 10000, shares: [{ memberId: POT, cents: 10000 }], date: '2026-10-02' },
    { type: 'potExpense', payerId: POT, amountCents: 6000, shares: computeEqualShares(6000, ['a', 'b']), date: '2026-10-03', category: 'food' },
    { type: 'expense', payerId: 'a', amountCents: 4000, shares: computeEqualShares(4000, ['a', 'b']), date: '2026-10-28', category: 'fun' },
  ];
  const b = balances(['a', 'b', POT], ex);
  t('Salden summieren zu 0', Object.values(b).reduce((s, v) => s + v, 0) === 0);
  t('Kassenstand 140 €', potCash(ex) === 14000);
  t('a: +100 −30 +40 −20 = 90 €', b.a === 9000);
  const d = simplifyDebts(b);
  t('Kasse zahlt aus', d.some(x => x.from === POT));
  t('Schulden gleichen Salden aus', d.reduce((s, x) => s + x.cents, 0) === 14000);
  const { personTx, potTx } = splitPot(ex);
  const pb = balances(['a', 'b'], personTx), stake = balances(['a', 'b'], potTx);
  t('Personen-Schulden ohne Kasse', pb.a === 2000 && pb.b === -2000);
  t('Kassenanteile = Kassenstand', stake.a === 7000 && stake.b === 7000 && stake.a + stake.b === potCash(ex));
  const st = spendingStats(ex);
  t('Ausgaben ohne Einzahlungen = 100 €', st.total === 10000 && st.count === 2);
  t('Kategorie food 60 €', st.byCat.food === 6000);
  t('Woche beginnt Montag', periodKey('2026-10-28', 'week') === '2026-10-26');
  t('Monat zurück über Jahresgrenze', shiftPeriod('2026-01', 'month', -1) === '2025-12');
  t('Woche vor', shiftPeriod('2026-12-28', 'week', 1) === '2027-01-04');
  t('Tagesreihe Länge', dailySeries(ex, '2026-10-01', '2026-10-28').points.length === 28);
  t('Lange Reihe wöchentlich', dailySeries(ex, '2026-01-01', '2026-10-28').weekly);
  t('Periodenreihe', periodSeries(ex, 'month', '2026-10', 3).map(p => p.cents).join() === '0,0,10000');
  t('esc', esc('<a "x">') === '&lt;a &quot;x&quot;&gt;');
  return r;
}
