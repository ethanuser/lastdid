'use strict';

// ═══ Storage backends ════════════════════════════════════════════════════
// Both expose the same async methods, so the UI doesn't care which is live.

const CFG = window.LASTDONE_CONFIG || {};
const CLOUD = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);  // sign-in and sync are possible
const here = () => location.origin + location.pathname + location.search;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

function makeDemoStore() {
  const KEY = 'lastdone-demo-v1';
  const ME = { id: 'demo-user', email: 'you@demo' };
  const load = () => {
    try { const d = JSON.parse(localStorage.getItem(KEY)); if (d) return d; } catch {}
    const hid = uid();
    return {
      households: [{ id: hid, name: 'Home', invite_code: 'DEMO1234', created_by: ME.id }],
      members: [{ household_id: hid, user_id: ME.id, display_name: 'You' }],
      chores: [], completions: [],
    };
  };
  let db = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} };
  const ok = (v) => Promise.resolve(structuredClone(v));
  return {
    guest: true,
    me: () => ME,
    async user() { return ME; },
    onAuth() {},
    async signInGoogle() {}, async signInEmail() {}, async signOut() {},
    households: () => ok(db.households),
    async createHousehold(name) {
      const h = { id: uid(), name, invite_code: Math.random().toString(36).slice(2, 10).toUpperCase(), created_by: ME.id };
      db.households.push(h); db.members.push({ household_id: h.id, user_id: ME.id, display_name: 'You' }); save(); return h;
    },
    async joinHousehold() { throw new Error('Joining a shared list needs sign-in.'); },
    // what a guest has made, for copying into an account after sign-in
    snapshot: () => structuredClone({ chores: db.chores, completions: db.completions }),
    clearChores() { db.chores = []; db.completions = []; save(); },
    async resetCode(hid) { const h = db.households.find(x => x.id === hid); h.invite_code = Math.random().toString(36).slice(2, 10).toUpperCase(); save(); return h.invite_code; },
    async renameHousehold(hid, name) { db.households.find(x => x.id === hid).name = name; save(); },
    async leaveHousehold(hid) {
      db.households = db.households.filter(x => x.id !== hid);
      db.members = db.members.filter(x => x.household_id !== hid);
      const gone = new Set(db.chores.filter(c => c.household_id === hid).map(c => c.id));
      db.chores = db.chores.filter(c => !gone.has(c.id));
      db.completions = db.completions.filter(c => !gone.has(c.chore_id)); save();
    },
    members: (hid) => ok(db.members.filter(m => m.household_id === hid)),
    async renameMe(hid, name) { db.members.find(m => m.household_id === hid && m.user_id === ME.id).display_name = name; save(); },
    chores: (hid) => ok(db.chores.filter(c => c.household_id === hid)),
    async addChore(hid, name, interval_days) {
      const c = { id: uid(), household_id: hid, name, interval_days, created_at: new Date().toISOString() };
      db.chores.push(c); save(); return c;
    },
    async updateChore(id, patch) { Object.assign(db.chores.find(c => c.id === id), patch); save(); },
    async deleteChore(id) { db.chores = db.chores.filter(c => c.id !== id); db.completions = db.completions.filter(c => c.chore_id !== id); save(); },
    completions: (hid) => ok(db.completions.filter(c => c.household_id === hid).sort((a, b) => b.done_at.localeCompare(a.done_at))),
    async complete(hid, chore_id, done_at) {
      const c = { id: uid(), household_id: hid, chore_id, user_id: ME.id, done_at: done_at || new Date().toISOString() };
      db.completions.push(c); save(); return c;
    },
    async undo(id) { db.completions = db.completions.filter(c => c.id !== id); save(); },
    subscribe() { return () => {}; },
  };
}

function makeSupabaseStore() {
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  const q = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
  let me = null;
  return {
    guest: false,
    me: () => me,
    async user() { const { data } = await sb.auth.getSession(); me = data.session?.user ?? null; return me; },
    onAuth(cb) { sb.auth.onAuthStateChange((_e, s) => { me = s?.user ?? null; cb(me); }); },
    signInGoogle: () => q(sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: here() } })),
    signInEmail: (email) => q(sb.auth.signInWithOtp({ email, options: { emailRedirectTo: here() } })),
    signOut: () => sb.auth.signOut(),
    households: () => q(sb.from('households').select('*').order('created_at')),
    createHousehold: (name) => q(sb.rpc('create_household', { p_name: name })),
    joinHousehold: (code) => q(sb.rpc('join_household', { p_code: code })),
    resetCode: (hid) => q(sb.rpc('reset_invite_code', { hid })),
    renameHousehold: (hid, name) => q(sb.from('households').update({ name }).eq('id', hid)),
    leaveHousehold: (hid) => q(sb.from('household_members').delete().eq('household_id', hid).eq('user_id', me.id)),
    members: (hid) => q(sb.from('household_members').select('*').eq('household_id', hid).order('joined_at')),
    renameMe: (hid, name) => q(sb.from('household_members').update({ display_name: name }).eq('household_id', hid).eq('user_id', me.id)),
    chores: (hid) => q(sb.from('chores').select('*').eq('household_id', hid)),
    addChore: (hid, name, interval_days) => q(sb.from('chores').insert({ household_id: hid, name, interval_days }).select().single()),
    updateChore: (id, patch) => q(sb.from('chores').update(patch).eq('id', id)),
    deleteChore: (id) => q(sb.from('chores').delete().eq('id', id)),
    completions: (hid) => q(sb.from('completions').select('id,chore_id,household_id,user_id,done_at')
      .eq('household_id', hid).order('done_at', { ascending: false }).limit(5000)),
    complete: (hid, chore_id, done_at) => q(sb.from('completions')
      .insert({ household_id: hid, chore_id, ...(done_at ? { done_at } : {}) }).select().single()),
    undo: (id) => q(sb.from('completions').delete().eq('id', id)),
    subscribe(hid, onChange) {
      const ch = sb.channel('h-' + hid)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'completions', filter: 'household_id=eq.' + hid }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chores', filter: 'household_id=eq.' + hid }, onChange)
        .subscribe();
      return () => sb.removeChannel(ch);
    },
  };
}

// Everyone starts as a guest (data on this device). Signing in switches to the cloud store.
const guest = makeDemoStore();
const cloud = CLOUD ? makeSupabaseStore() : null;
let store = guest;

// ═══ State ═══════════════════════════════════════════════════════════════

const S = {
  user: null, households: [], hid: null, members: [], chores: [], comps: [],
  open: null,        // id of the expanded chore
  view: 'list',      // 'list' | 'settings'
  adding: false, addUnit: 'd',
  loaded: false,
  ticked: null,      // id of the chore just marked done, for its one-shot animation
};
const pref = {
  get(k) { try { return localStorage.getItem('lastdone-' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('lastdone-' + k, v); } catch {} },
};
let unsubscribe = () => {};

// How the list looks and sorts. Per device, next to Theme and Sound.
const View = (() => {
  const DEF = { sort: 'overdue', warn: '0.75', density: 'cozy', meters: true, who: true, chips: true };
  let v = DEF;
  try { v = { ...DEF, ...JSON.parse(localStorage.getItem('lastdone.view')) }; } catch {}
  const apply = () => { document.documentElement.dataset.density = v.density; };
  apply();
  return {
    get: (k) => v[k],
    set(k, val) { v[k] = val; apply(); try { localStorage.setItem('lastdone.view', JSON.stringify(v)); } catch {} render(); },
  };
})();
const SORTS = [
  { value: 'overdue', label: 'Most overdue first', icon: 'alert', iconOnly: true },
  { value: 'next', label: 'Next due first', icon: 'calendar', iconOnly: true },
  { value: 'name', label: 'A to Z', icon: 'az', iconOnly: true },
];
const WARNS = [{ value: '0.5', label: '50%' }, { value: '0.75', label: '75%' }, { value: '0.9', label: '90%' }];
const DENSITIES = [{ value: 'cozy', label: 'Cozy', icon: 'rows', iconOnly: true }, { value: 'compact', label: 'Compact', icon: 'rows-dense', iconOnly: true }];
const MODE_ICONS = { auto: ['monitor', 'Auto: follow the system'], light: ['sun', 'Light'], dark: ['moon', 'Dark'] };
const FONT_FACES = { cozy: 'var(--font-sans)', book: 'var(--font-serif)', plain: '-apple-system, BlinkMacSystemFont, sans-serif' };
const UNITS = [{ value: 'd', label: 'days' }, { value: 'w', label: 'weeks' }];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// ═══ Helpers ═════════════════════════════════════════════════════════════

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 864e5;
const play = (name) => window.Sound && Sound.play(name);

function spanText(days) {
  if (days < 1 / 24) return Math.max(1, Math.round(days * 1440)) + 'm';
  if (days < 1) return Math.round(days * 24) + 'h';
  if (days < 14) return Math.round(days) + 'd';
  if (days < 60) return Math.round(days / 7) + 'w';
  return Math.round(days / 30) + 'mo';
}
function ago(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / DAY;
  if (d < 1 / 1440) return 'just now';
  if (d >= 1 && d < 2 && new Date(iso).getDate() === new Date(Date.now() - DAY).getDate()) return 'yesterday';
  return spanText(d) + ' ago';
}
function everyText(n) {
  n = Number(n);
  if (n === 1) return 'daily';
  if (n % 7 === 0) return n === 7 ? 'weekly' : `every ${n / 7}w`;
  return `every ${n}d`;
}
function whenText(iso) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
const nameOf = (userId) => {
  if (S.user && userId === S.user.id) return 'you';
  return S.members.find((m) => m.user_id === userId)?.display_name || 'someone';
};
const hueOf = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

function status(chore) {
  const last = S.comps.find((c) => c.chore_id === chore.id);
  const iv = Number(chore.interval_days);
  if (!last) return { last: null, ratio: Infinity, left: -Infinity, cls: 'never', label: 'never done' };
  const days = (Date.now() - new Date(last.done_at).getTime()) / DAY;
  const ratio = days / iv;
  const left = iv - days;
  let label;
  if (left >= 1) label = `due in ${spanText(left)}`;
  else if (left > 0) label = 'due today';
  else label = `${spanText(-left)} overdue`;
  return { last, ratio, left, cls: ratio >= 1 ? 'due' : ratio >= Number(View.get('warn')) ? 'soon' : 'ok', label };
}

let toastTimer;
function toast(msg, { action, err = false } = {}) {
  const t = $('#toast');
  t.className = 'toast' + (err ? ' err' : '');
  t.innerHTML = icon(err ? 'x' : 'check') + `<span>${esc(msg)}</span>` + (action ? `<button class="btn small primary">${esc(action.label)}</button>` : '');
  if (action) t.querySelector('button').onclick = () => { hideToast(); action.run(); };
  t.hidden = false;
  // restart the entrance when one toast replaces another
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 6000 : 3500);
}
function hideToast() {
  const t = $('#toast');
  t.classList.add('out');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; t.classList.remove('out'); }, 150);
}
const fail = (e) => { play('error'); toast(e?.message || String(e), { err: true }); };

// A button shows its own result for a moment: a check and a word, then back.
function confirmOn(btn, label = 'Done') {
  const html = btn.innerHTML;
  btn.innerHTML = icon('check') + label;
  btn.classList.add('ok');
  play('confirm');
  setTimeout(() => { if (btn.isConnected) { btn.innerHTML = html; btn.classList.remove('ok'); } }, 1500);
}
// Shake an input that can't be submitted as it is.
function reject(input) {
  input.setAttribute('aria-invalid', 'true');
  input.classList.remove('nudge'); void input.offsetWidth; input.classList.add('nudge');
  input.focus();
  play('limit');
  input.addEventListener('input', () => input.removeAttribute('aria-invalid'), { once: true });
}
// Two-step destructive buttons: the first click arms, the second acts.
function arm(btn, armedLabel, run) {
  btn.onclick = () => {
    if (!btn.classList.contains('armed')) {
      const html = btn.innerHTML;
      btn.classList.add('armed'); btn.innerHTML = icon('trash') + esc(armedLabel);
      play('limit');
      setTimeout(() => { if (btn.isConnected) { btn.classList.remove('armed'); btn.innerHTML = html; } }, 4000);
      return;
    }
    run();
  };
}

// Small in-page dialog that asks for one line of text.
function ask(title, { value = '', placeholder = '', okLabel = 'Save', note = '' } = {}) {
  return new Promise((resolve) => {
    const m = $('#modal');
    m.innerHTML = `<form class="card stack" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title)}</h2>
      ${note ? `<div class="note">${esc(note)}</div>` : ''}
      <input type="text" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="80">
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn quiet">Cancel</button><button class="btn primary">${esc(okLabel)}</button></div></form>`;
    m.hidden = false;
    play('open');
    const input = m.querySelector('input');
    input.focus(); input.select();
    const done = (v) => { m.hidden = true; m.innerHTML = ''; m.onkeydown = null; if (v == null) play('close'); resolve(v); };
    m.querySelector('form').onsubmit = (e) => { e.preventDefault(); const v = input.value.trim(); if (v) done(v); else reject(input); };
    m.querySelector('button[type=button]').onclick = () => done(null);
    m.onclick = (e) => { if (e.target === m) done(null); };
    m.onkeydown = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
  });
}

// Small in-page dialog with two choices; resolves true for the main one.
function choose(title, { note = '', okLabel = 'OK', cancelLabel = 'Cancel' } = {}) {
  return new Promise((resolve) => {
    const m = $('#modal');
    m.innerHTML = `<div class="card stack" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title)}</h2>
      ${note ? `<p>${esc(note)}</p>` : ''}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn quiet" data-no>${esc(cancelLabel)}</button><button type="button" class="btn primary" data-yes>${esc(okLabel)}</button></div></div>`;
    m.hidden = false;
    play('open');
    const done = (v) => { m.hidden = true; m.innerHTML = ''; m.onkeydown = null; resolve(v); };
    m.querySelector('[data-yes]').onclick = () => done(true);
    m.querySelector('[data-no]').onclick = () => { play('close'); done(false); };
    m.onclick = (e) => { if (e.target === m) { play('close'); done(false); } };
    m.onkeydown = (e) => { if (e.key === 'Escape') { e.stopPropagation(); play('close'); done(false); } };
    m.querySelector('[data-yes]').focus();
  });
}

// ═══ Loading ═════════════════════════════════════════════════════════════

async function loadHouseholds() {
  S.households = await store.households();
  const saved = pref.get('hid');
  S.hid = S.households.find((h) => h.id === saved)?.id || S.households[0]?.id || null;
}

async function loadHousehold() {
  unsubscribe();
  if (!S.hid) { S.chores = []; S.comps = []; S.members = []; return; }
  pref.set('hid', S.hid);
  const hid = S.hid;
  const [chores, comps, members] = await Promise.all([store.chores(hid), store.completions(hid), store.members(hid)]);
  if (hid !== S.hid) return;
  Object.assign(S, { chores, comps, members });
  let t;
  unsubscribe = store.subscribe(hid, () => { clearTimeout(t); t = setTimeout(refresh, 300); });
}

async function refresh() {
  if (!S.user || !S.hid) return;
  const hid = S.hid;
  try {
    const [chores, comps] = await Promise.all([store.chores(hid), store.completions(hid)]);
    if (hid === S.hid) { S.chores = chores; S.comps = comps; render(); }
  } catch (e) { /* offline or signed out; keep what we have */ }
}

async function start() {
  wireSettings();
  render();  // first paint while the session loads
  if (cloud) {
    const u = await cloud.user().catch(() => null);
    if (u) store = cloud;
    S.user = await store.user();  // before listening, so the first auth event isn't mistaken for a change
    cloud.onAuth(async (u) => {
      const next = u ? cloud : guest;
      if (next === store && (u?.id ?? null) === (store === cloud ? S.user?.id : null)) return;  // token refresh, same person
      store = next;
      S.user = await store.user();
      S.view = 'list'; S.open = null;
      await boot();
    });
  }
  S.user = await store.user();
  await boot();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  // keep "2h ago" fresh, but never while someone is typing in the list
  setInterval(() => { if (!document.hidden && S.view === 'list' && !$('#app').contains(document.activeElement)) render(); }, 60_000);
}

async function boot() {
  S.loaded = false;
  unsubscribe();
  try {
    if (S.user) {
      await loadHouseholds();
      // A new account starts with a list called Home, like a guest does. Only the first time,
      // so someone who leaves every list later gets the choice to start or join one.
      if (!store.guest && !S.households.length && !pref.get('home-' + S.user.id)) {
        await store.createHousehold('Home');
        pref.set('home-' + S.user.id, '1');
        await loadHouseholds();
      }
      // An invite link (?join=CODE) joins straight away once signed in.
      const code = new URLSearchParams(location.search).get('join');
      if (code && store.guest && cloud) S.view = 'signin';  // a guest signs in first, then joins
      else if (code) {
        history.replaceState(null, '', location.pathname);
        try {
          const h = await store.joinHousehold(code);
          await loadHouseholds(); S.hid = h.id; toast(`Joined ${h.name}`);
        } catch (e) { fail(e); }
      }
      await loadHousehold();
    }
  } catch (e) { fail(e); }
  S.loaded = true;
  render();
  if (!store.guest) offerGuestImport();
}

// After signing in, a guest's chores (and their history) can move into the account, once.
let importing = false;
async function offerGuestImport() {
  if (importing) return;
  const g = guest.snapshot();
  const key = 'imported-' + S.user.id;
  if (!g.chores.length || pref.get(key)) return;
  const target = S.households.find((h) => h.id === S.hid);
  const n = g.chores.length, one = n === 1;
  const yes = await choose(`Bring your ${n} guest chore${one ? '' : 's'}?`, {
    note: `You made ${one ? 'a chore' : 'some chores'} before signing in. Copy ${one ? 'it' : 'them'}, with ${one ? 'its' : 'their'} history, into ${target ? `“${target.name}”` : 'a new list called “Home”'}?`,
    okLabel: 'Copy them', cancelLabel: 'Not now',
  });
  pref.set(key, '1');
  if (!yes) return;
  importing = true;
  try {
    if (!S.hid) { const h = await store.createHousehold('Home'); await loadHouseholds(); S.hid = h.id; }
    const hid = S.hid;
    const have = new Map(S.chores.map((c) => [c.name.toLowerCase(), c]));
    for (const c of g.chores) {
      const into = have.get(c.name.toLowerCase()) || await store.addChore(hid, c.name, c.interval_days);
      const done = g.completions.filter((x) => x.chore_id === c.id).slice(0, 50);
      for (const x of done) await store.complete(hid, into.id, x.done_at);
    }
    guest.clearChores();
    await loadHousehold(); render();
    play('milestone'); toast(`Copied ${n} chore${one ? '' : 's'} into your account`);
  } catch (e) { fail(e); }
  importing = false;
}

// ═══ Rendering ═══════════════════════════════════════════════════════════

// Things that appear get a short rise, but only the render they first show up in.
let shownPrev = new Set(), shownNow = new Set();
const enter = (key) => { shownNow.add(key); return shownPrev.has(key) ? '' : ' enter'; };

function render() {
  const before = rowTops();
  shownNow = new Set();
  renderHeader();
  const app = $('#app');
  if (S.view === 'signin' && S.loaded) renderSignIn(app);
  else if (!S.user || !S.loaded) app.innerHTML = '<div class="empty loading-msg">Loading…</div>';
  else if (!S.hid) renderOnboarding(app);
  else if (S.view === 'settings') renderListSettings(app);
  else renderList(app);
  shownPrev = shownNow;
  slideRows(before);
}

// Rows that move to a new place (marked done, re-sorted, one above opened) slide there.
function rowTops() {
  const m = new Map();
  document.querySelectorAll('.chore[data-id]').forEach((el) => m.set(el.dataset.id, el.getBoundingClientRect().top));
  return m;
}
function slideRows(before) {
  if (!before.size || reduceMotion.matches) return;
  document.querySelectorAll('.chore[data-id]').forEach((el) => {
    const top = before.get(el.dataset.id);
    if (top == null) return;
    const dy = top - el.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
  });
}

let picker = null;
function renderHeader() {
  const el = $('#house-picker');
  const listBtn = $('#list-btn');
  const show = !!(S.user && S.hid);
  el.hidden = !show; listBtn.hidden = !show;
  const signinBtn = $('#signin-btn');
  signinBtn.hidden = !(cloud && store.guest && S.loaded);
  signinBtn.setAttribute('aria-pressed', S.view === 'signin');
  signinBtn.onclick = () => { S.view = S.view === 'signin' ? 'list' : 'signin'; play(S.view === 'signin' ? 'open' : 'close'); render(); };
  if (!show) return;
  if (!picker) {
    picker = new Dropdown(el, {
      onChange: async (v) => {
        if (v === '__new') return newHousehold();
        if (v === '__join') return joinHousehold();
        S.hid = v; S.open = null; S.view = 'list';
        await loadHousehold().catch(fail); render();
      },
    });
    picker.btn.setAttribute('aria-label', 'Switch list');
  }
  picker.setOptions([
    ...S.households.map((h) => ({ value: h.id, label: h.name })),
    { value: '__new', label: 'New list…', icon: 'plus', sep: true, action: true },
    { value: '__join', label: 'Join with code…', icon: 'link', action: true },
  ], S.hid);
  listBtn.setAttribute('aria-pressed', S.view === 'settings');
  listBtn.onclick = () => { S.view = S.view === 'settings' ? 'list' : 'settings'; play(S.view === 'settings' ? 'open' : 'close'); render(); };
}

function renderSignIn(app) {
  const joining = new URLSearchParams(location.search).get('join');
  const hasChores = guest.snapshot().chores.length > 0;
  app.innerHTML = `<div class="card hero-card stack${enter('signin')}">
    <span class="logo" aria-hidden="true">${icon('check')}</span>
    <div><h1>Sign in</h1><p>Sync your chores across devices and share lists with the people you live with.${hasChores ? ' The chores you made as a guest can come with you.' : ''}</p></div>
    ${joining ? `<div class="note success">Sign in to join the list you were invited to.</div>` : ''}
    ${CFG.googleSignIn ? `<button class="btn primary block" id="google">${icon('log-in')}Continue with Google</button>
    <div class="or">or</div>` : ''}
    <form class="row" id="email-form"><input type="email" required placeholder="you@example.com" autocomplete="email" aria-label="Email"><button class="btn${CFG.googleSignIn ? '' : ' primary'}">${icon('mail')}Email me a link</button></form>
    <div id="signin-msg" class="note" role="status"></div>
    <button class="btn quiet" id="as-guest">Keep using as a guest</button></div>`;
  app.querySelector('#as-guest').onclick = () => {
    S.view = 'list';
    if (joining) history.replaceState(null, '', location.pathname);
    play('close'); render();
  };
  app.querySelector('#google')?.addEventListener('click', (e) => { const b = e.currentTarget; b.classList.add('loading'); cloud.signInGoogle().catch((err) => { b.classList.remove('loading'); fail(err); }); });
  app.querySelector('#email-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = e.target.querySelector('input').value.trim();
    const btn = e.target.querySelector('button');
    const msg = app.querySelector('#signin-msg');
    btn.classList.add('loading');
    try { await cloud.signInEmail(email); msg.textContent = `Check ${email} for a sign-in link.`; msg.className = 'note success'; confirmOn(btn, 'Sent'); }
    catch (err) { msg.textContent = err.message; msg.className = 'note error'; play('error'); }
    btn.classList.remove('loading');
  };
}

function renderOnboarding(app) {
  app.innerHTML = `<div class="card stack${enter('onboard')}">
    <div><h1>Start a list</h1><p>A list is shared by everyone in it. Start your own, or join a roommate's with their invite code.</p></div>
    <form class="row" id="create"><input type="text" value="Home" maxlength="60" aria-label="List name"><button class="btn primary">${icon('plus')}Create list</button></form>
    <div class="or">or</div>
    <form class="row" id="join"><input type="text" placeholder="Invite code" maxlength="12" aria-label="Invite code" style="text-transform:uppercase"><button class="btn">${icon('link')}Join</button></form>
    <button class="btn quiet small" id="out" style="align-self:flex-start">${icon('logout')}Sign out</button></div>`;
  app.querySelector('#create').onsubmit = async (e) => {
    e.preventDefault();
    const name = e.target.querySelector('input').value.trim() || 'Home';
    try { const h = await store.createHousehold(name); await loadHouseholds(); S.hid = h.id; await loadHousehold(); play('confirm'); render(); } catch (err) { fail(err); }
  };
  app.querySelector('#join').onsubmit = async (e) => {
    e.preventDefault();
    const input = e.target.querySelector('input');
    const code = input.value.trim(); if (!code) return reject(input);
    try { const h = await store.joinHousehold(code); await loadHouseholds(); S.hid = h.id; await loadHousehold(); play('confirm'); render(); } catch (err) { fail(err); }
  };
  app.querySelector('#out').onclick = () => store.signOut();
}

const SUGGESTIONS = [['Sweep floors', 7], ['Laundry', 7], ['Work out', 2], ['Change sheets', 14], ['Clean bathroom', 7], ['Water plants', 4], ['Vacuum', 7], ['Take out trash', 3], ['Clean fridge', 30]];

function sortRows(rows) {
  const by = View.get('sort');
  const name = (a, b) => a.c.name.localeCompare(b.c.name);
  if (by === 'name') return rows.sort(name);
  if (by === 'next') return rows.sort((a, b) => (a.s.left - b.s.left) || name(a, b));
  return rows.sort((a, b) => (b.s.ratio - a.s.ratio) || name(a, b));
}

function renderList(app) {
  const rows = sortRows(S.chores.map((c) => ({ c, s: status(c) })));
  const count = (cls) => rows.filter((r) => cls.includes(r.s.cls)).length;
  const due = count(['due', 'never']), soon = count(['soon']);
  const showForm = S.adding || !S.chores.length;

  const have = new Set(S.chores.map((c) => c.name.toLowerCase()));
  const chips = !View.get('chips') ? '' : SUGGESTIONS.filter(([n]) => !have.has(n.toLowerCase()))
    .map(([n, d]) => `<button type="button" class="chip" data-name="${esc(n)}" data-days="${d}" data-tip="Add ${esc(n)}, ${everyText(d)}">${icon('plus')}${esc(n)} <span class="muted">${everyText(d)}</span></button>`).join('');

  let summary = '';
  if (S.chores.length) {
    summary = due || soon
      ? (due ? `<span class="pill due">${due} due</span>` : '') + (soon ? `<span class="pill soon">${soon} soon</span>` : '')
      : `<span class="pill ok">All caught up</span>`;
  }

  // a re-render (live update, adding a chore) keeps whatever was half-typed
  const old = app.querySelector('#add-form');
  const draft = old && { name: old.querySelector('[name=name]').value, n: old.n.value, focus: old.contains(document.activeElement) && document.activeElement.name };

  app.innerHTML = `
    <div class="toolbar">
      <span class="summary">${summary}</span>
      ${S.chores.length ? `<button class="btn small" id="add-toggle" aria-expanded="${S.adding}" data-tip="${S.adding ? 'Close' : 'Add a chore'} (N)">${icon('plus')}${S.adding ? 'Close' : 'Add chore'}</button>` : ''}
    </div>
    ${showForm ? `<form class="add-form${enter('add')}" id="add-form" novalidate>
      <div class="row">
        <div class="combo">${icon('search')}
          <input type="text" name="name" placeholder="Search or type any chore" maxlength="80" aria-label="Chore name" autocomplete="off"
            role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="combo-list">
          <div class="combo-list" id="combo-list" role="listbox" aria-label="Chore ideas" hidden></div>
        </div>
        <span class="every"><span>every</span>
          <input type="number" name="n" value="7" min="1" max="999" step="1" aria-label="Interval">
          <span class="unit" id="unit" aria-label="Unit"></span></span>
        <button class="btn primary">${icon('plus')}Add</button>
      </div>
      ${chips ? `<div class="chips">${chips}</div>` : ''}
    </form>` : ''}
    ${rows.length ? `<div class="list">${rows.map(choreRow).join('')}</div>`
      : `<div class="empty">${icon('list')}No chores yet. Add one above${chips ? ', or tap a suggestion' : ''}.</div>`}`;

  const toggle = app.querySelector('#add-toggle');
  if (toggle) toggle.onclick = () => toggleAdd();
  const form = app.querySelector('#add-form');
  if (form) {
    const unit = new Segmented(form.querySelector('#unit'), { options: UNITS, value: S.addUnit, onChange: (v) => { S.addUnit = v; } });
    form.querySelector('#unit').classList.add('unit');
    if (draft) {
      form.querySelector('[name=name]').value = draft.name; form.n.value = draft.n;
      if (draft.focus) form.querySelector(`[name=${draft.focus}]`)?.focus();
    }
    wireCombo(form, unit, have);
    form.onsubmit = (e) => {
      e.preventDefault();
      const input = form.querySelector('[name=name]');
      const name = input.value.trim();
      if (!name) return reject(input);
      const n = Math.max(1, Math.round(Number(form.n.value) || 1));
      addChore(name, S.addUnit === 'w' ? n * 7 : n);
    };
    form.querySelectorAll('.chip').forEach((b) => { b.onclick = () => addChore(b.dataset.name, Number(b.dataset.days)); });
  }
  app.querySelectorAll('.chore').forEach(wireChore);
}

// The chore name field doubles as a search over CHORE_CATALOG. Picking an idea fills in its
// name and usual interval (both still editable); anything typed can be added as it is.
function wireCombo(form, unit, have) {
  const input = form.querySelector('[name=name]');
  const list = form.querySelector('.combo-list');
  const all = (window.CHORE_CATALOG || []).flatMap((g) => g.items.map(([name, days]) => ({ name, days, group: g.group, gicon: g.icon })))
    .filter((x) => !have.has(x.name.toLowerCase()));
  let items = [], active = -1;

  const mark = (txt, q) => {
    const i = txt.toLowerCase().indexOf(q);
    return i < 0 || !q ? esc(txt) : esc(txt.slice(0, i)) + '<b>' + esc(txt.slice(i, i + q.length)) + '</b>' + esc(txt.slice(i + q.length));
  };
  const option = (x, q) => {
    const i = items.push(x) - 1;
    return x.custom
      ? `<div class="combo-opt custom" role="option" id="combo-opt-${i}" data-i="${i}">${icon('plus')}<span class="co-name">Add “${esc(x.name)}”</span><span class="co-meta">your own</span></div>`
      : `<div class="combo-opt" role="option" id="combo-opt-${i}" data-i="${i}">${icon(x.gicon)}<span class="co-name">${mark(x.name, q)}</span><span class="co-meta">${everyText(x.days)}</span></div>`;
  };
  function build() {
    const raw = input.value.trim(), q = raw.toLowerCase();
    items = [];
    let html = '';
    if (!q) {
      // nothing typed: browse every idea by area
      for (const g of window.CHORE_CATALOG || []) {
        const inGroup = all.filter((x) => x.group === g.group);
        if (!inGroup.length) continue;
        html += `<div class="combo-group">${esc(g.group)}</div>` + inGroup.map((x) => option(x, '')).join('');
      }
    } else {
      // words that start with what you typed rank first; mid-word matches only once you've typed a few letters
      const starts = (txt) => txt.toLowerCase().split(/[\s&-]+/).some((w) => w.startsWith(q));
      const rank = (x) => { const n = x.name.toLowerCase(); return n.startsWith(q) ? 0 : starts(x.name) ? 1 : n.includes(q) ? 2 : 3; };
      const found = all.filter((x) => starts(x.name) || (q.length >= 4 && x.name.toLowerCase().includes(q)) || starts(x.group))
        .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, 40);
      const exact = found.some((x) => x.name.toLowerCase() === q);
      if (!exact && !have.has(q)) html += option({ custom: true, name: raw }, q);
      html += found.map((x) => option(x, q)).join('');
      if (have.has(q)) html = `<div class="combo-empty">Already on this list</div>` + html;
    }
    list.innerHTML = html || '<div class="combo-empty">No ideas left. Type your own.</div>';
    setActive(q ? 0 : -1);
  }
  function setActive(i) {
    active = items.length ? Math.max(-1, Math.min(items.length - 1, i)) : -1;
    list.querySelectorAll('.combo-opt').forEach((o) => o.classList.toggle('active', Number(o.dataset.i) === active));
    const el = list.querySelector(`#combo-opt-${active}`);
    if (el) { input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  }
  const open = () => { if (list.hidden) { list.hidden = false; input.setAttribute('aria-expanded', 'true'); } build(); };
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
  function pick(x) {
    close();
    if (x.custom) return form.requestSubmit();
    input.value = x.name;
    const weeks = x.days >= 7 && x.days % 7 === 0;
    form.n.value = weeks ? x.days / 7 : x.days;
    S.addUnit = weeks ? 'w' : 'd'; unit.setValue(S.addUnit);
    // show that the interval was filled in for you
    const every = form.querySelector('.every');
    every.classList.remove('filled'); void every.offsetWidth; every.classList.add('filled');
    play('select');
    input.focus();
  }

  input.addEventListener('focus', open);
  input.addEventListener('input', open);
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) close(); }, 0));
  list.addEventListener('mousedown', (e) => e.preventDefault());  // keep focus in the field
  list.addEventListener('click', (e) => { const o = e.target.closest('.combo-opt'); if (o) pick(items[o.dataset.i]); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) return open();
      setActive(active + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter' && !list.hidden && active >= 0) {
      e.preventDefault(); pick(items[active]);
    } else if (e.key === 'Escape' && !list.hidden) {
      e.stopPropagation(); close();
    }
  });
}

function toggleAdd() {
  S.adding = !S.adding;
  play(S.adding ? 'open' : 'close');
  render();
  if (S.adding) $('#add-form input')?.focus();
}

function choreRow({ c, s }) {
  const open = S.open === c.id;
  const width = s.ratio === Infinity ? 100 : Math.min(100, Math.round(s.ratio * 100));
  let ticked = '';
  if (S.ticked === c.id) { ticked = shownPrev.has('tick-' + c.id) ? '' : ' ticked'; shownNow.add('tick-' + c.id); }
  const lastBit = s.last ? `<span class="mi" data-tip="Last done ${esc(whenText(s.last.done_at))}">${icon('history')}${ago(s.last.done_at)}${View.get('who') ? ` by ${esc(nameOf(s.last.user_id))}` : ''}</span>` : '';
  let detail = '';
  if (open) {
    const hist = S.comps.filter((x) => x.chore_id === c.id).slice(0, 10);
    detail = `<div class="chore-detail${enter('detail-' + c.id)}">
      <div><div class="sec-label">${icon('history')}History</div>${hist.length ? `<ul class="history">${hist.map((h) => `<li>
        <span>${esc(whenText(h.done_at))}<span class="who">${esc(nameOf(h.user_id))}</span></span>
        ${S.user && h.user_id === S.user.id ? `<button class="icon-btn" data-undo="${h.id}" aria-label="Remove this entry" data-tip="Remove this entry">${icon('trash')}</button>` : ''}</li>`).join('')}</ul>`
        : '<div class="note">Not done yet.</div>'}</div>
      <div><div class="sec-label">${icon('clock')}Did it earlier?</div><form class="row" data-earlier>
        <input type="datetime-local" required value="${localInputValue(new Date(Date.now() - DAY))}" max="${localInputValue(new Date())}" aria-label="When">
        <button class="btn">${icon('check')}Log it</button></form></div>
      <div><div class="sec-label">${icon('pencil')}Edit</div><form class="edit-row" data-edit novalidate>
        <input type="text" name="name" value="${esc(c.name)}" maxlength="80" aria-label="Chore name">
        <span class="every"><span>every</span>
          <input type="number" name="n" value="${Number(c.interval_days) % 7 === 0 ? c.interval_days / 7 : c.interval_days}" min="1" max="999" step="1" aria-label="Interval">
          <span data-unit aria-label="Unit"></span></span>
        <button class="btn">Save</button>
        <button type="button" class="btn danger" data-delete>${icon('trash')}Delete</button></form></div>
    </div>`;
  }
  return `<div class="chore ${s.cls}${open ? ' open' : ''}${ticked}" data-id="${c.id}">
    <div class="chore-main" role="button" tabindex="0" aria-expanded="${open}">
      <div class="chore-text">
        <div class="chore-title"><span class="chore-name" data-tip="${esc(c.name)}" data-clip>${esc(c.name)}</span>${icon('chevron-down')}</div>
        <div class="chore-meta"><span class="status">${esc(s.label)}</span><span class="mi" data-tip="Repeats ${everyText(c.interval_days)}">${icon('repeat')}${everyText(c.interval_days)}</span>${lastBit}</div>
        ${View.get('meters') ? `<div class="meter"><i style="width:${width}%"></i></div>` : ''}
      </div>
      <button class="done-btn" data-done aria-label="Mark ${esc(c.name)} done" data-tip="Mark done now">${icon('check')}<span>Done</span></button>
    </div>${detail}</div>`;
}

function localInputValue(d) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function wireChore(el) {
  const id = el.dataset.id;
  const chore = S.chores.find((c) => c.id === id);
  const main = el.querySelector('.chore-main');
  const toggle = () => { S.open = S.open === id ? null : id; play(S.open ? 'open' : 'close'); render(); };
  main.onclick = (e) => { if (!e.target.closest('[data-done]')) toggle(); };
  main.onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === main) { e.preventDefault(); toggle(); } };
  el.querySelector('[data-done]').onclick = () => markDone(chore);
  el.querySelectorAll('[data-undo]').forEach((b) => { b.onclick = () => undoCompletion(b.dataset.undo, true); });
  const earlier = el.querySelector('[data-earlier]');
  if (earlier) earlier.onsubmit = (e) => {
    e.preventDefault();
    const input = earlier.querySelector('input');
    if (!input.value || new Date(input.value) > new Date()) return reject(input);
    markDone(chore, new Date(input.value).toISOString());
  };
  const edit = el.querySelector('[data-edit]');
  if (edit) {
    const unit = new Segmented(edit.querySelector('[data-unit]'), { options: UNITS, value: Number(chore.interval_days) % 7 === 0 ? 'w' : 'd' });
    edit.querySelector('[data-unit]').classList.add('unit');
    edit.onsubmit = async (e) => {
      e.preventDefault();
      const input = edit.querySelector('[name=name]');
      const n = Math.max(1, Math.round(Number(edit.n.value) || 1));
      const patch = { name: input.value.trim(), interval_days: unit.value === 'w' ? n * 7 : n };
      if (!patch.name) return reject(input);
      const btn = edit.querySelector('button:not([type])');
      btn.classList.add('loading');
      try { await store.updateChore(id, patch); Object.assign(chore, patch); render(); toast(`Saved ${patch.name}`); play('confirm'); }
      catch (err) { btn.classList.remove('loading'); fail(err); }
    };
    arm(edit.querySelector('[data-delete]'), 'Delete with history?', async () => {
      try {
        await store.deleteChore(id);
        S.chores = S.chores.filter((c) => c.id !== id);
        S.comps = S.comps.filter((c) => c.chore_id !== id);
        S.open = null; play('close'); toast(`Deleted ${chore.name}`); render();
      } catch (err) { fail(err); }
    });
  }
}

// ═══ Actions ═════════════════════════════════════════════════════════════

async function addChore(name, days) {
  try {
    const c = await store.addChore(S.hid, name, days);
    S.chores.push(c); S.adding = true; play('confirm'); render();
    const input = $('#add-form input[name=name]'); if (input) { input.value = ''; input.focus(); }
    toast(`Added ${name}, ${everyText(days)}`);
  } catch (e) { fail(e); }
}

const dueNow = () => S.chores.filter((c) => ['due', 'never'].includes(status(c).cls)).length;

async function markDone(chore, doneAt) {
  const dueBefore = dueNow();
  // Show it straight away, then swap in the saved row.
  const temp = { id: 'tmp-' + uid(), chore_id: chore.id, household_id: S.hid, user_id: S.user.id, done_at: doneAt || new Date().toISOString() };
  S.comps.unshift(temp); sortComps();
  S.ticked = chore.id;
  setTimeout(() => { if (S.ticked === chore.id) S.ticked = null; }, 1000);
  play(dueBefore > 0 && dueNow() === 0 ? 'milestone' : 'done');  // the last overdue one gets the bigger chord
  render();
  try {
    const saved = await store.complete(S.hid, chore.id, doneAt);
    const i = S.comps.indexOf(temp); if (i >= 0) S.comps[i] = saved; sortComps(); render();
    toast(`${chore.name}: done ${doneAt ? whenText(doneAt) : 'now'}`, { action: { label: 'Undo', run: () => undoCompletion(saved.id) } });
  } catch (e) {
    S.comps = S.comps.filter((c) => c !== temp); render(); fail(e);
  }
}
const sortComps = () => S.comps.sort((a, b) => b.done_at.localeCompare(a.done_at));

async function undoCompletion(id, fromHistory = false) {
  const before = S.comps;
  S.comps = S.comps.filter((c) => c.id !== id); play('close'); render();
  try { await store.undo(id); if (fromHistory) toast('Entry removed'); } catch (e) { S.comps = before; render(); fail(e); }
}

async function newHousehold() {
  const name = await ask('New list', { placeholder: 'e.g. Apartment', okLabel: 'Create', note: 'A separate list with its own chores and members.' });
  if (!name) return;
  try { const h = await store.createHousehold(name); await loadHouseholds(); S.hid = h.id; S.view = 'list'; await loadHousehold(); render(); toast(`Created ${h.name}`); play('confirm'); } catch (e) { fail(e); }
}
async function joinHousehold() {
  if (store.guest) {
    if (!cloud) return fail(new Error('Joining a shared list needs sign-in.'));
    S.view = 'signin'; play('open'); render();
    return toast('Sign in first, then join with the code');
  }
  const code = await ask('Join a list', { placeholder: 'Invite code', okLabel: 'Join', note: 'Ask someone in the list for its code (under its members button).' });
  if (!code) return;
  try { const h = await store.joinHousehold(code); await loadHouseholds(); S.hid = h.id; S.view = 'list'; await loadHousehold(); render(); toast(`Joined ${h.name}`); play('confirm'); } catch (e) { fail(e); }
}

// ═══ List settings view (invite, members, this list, account) ═══════════

function renderListSettings(app) {
  const h = S.households.find((x) => x.id === S.hid);
  const link = location.origin + location.pathname + '?join=' + h.invite_code;
  const mine = S.members.find((m) => m.user_id === S.user.id);
  const initials = (n) => String(n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  app.innerHTML = `<div class="card settings${enter('listset')}">
    <div class="settings-head"><button class="icon-btn" id="back" aria-label="Back to chores" data-tip="Back to chores (Esc)">${icon('chevron-left')}</button><h2>${esc(h.name)}</h2></div>

    ${store.guest ? `<section><div class="sec-label">Invite people</div>
      <div class="note">Sharing a list needs an account, so everyone sees the same chores.</div>
      ${cloud ? `<button class="btn primary" id="go-signin" style="margin-top:var(--s2)">${icon('log-in')}Sign in to share</button>` : ''}</section>` : `<section><div class="sec-label">Invite people</div>
      <div class="code-row"><span class="code" aria-label="Invite code">${esc(h.invite_code)}</span>
        <button class="btn primary" id="copy-link">${icon('copy')}Copy invite link</button>
        <button class="icon-btn" id="new-code" aria-label="New code" data-tip="New code: the old one stops working">${icon('reset')}</button></div>
      <div class="note" style="margin-top:var(--s2)">Anyone with the code or link can join this list after signing in.</div></section>`}

    <section><div class="sec-label">Members</div>
      <ul class="members">${S.members.map((m) => `<li><span class="member"><span class="avatar" style="--ah:${hueOf(m.user_id)}">${esc(initials(m.display_name))}</span>${esc(m.display_name)}${m.user_id === S.user.id ? ' <span class="tag">you</span>' : ''}</span>
        ${m.user_id === S.user.id ? `<button class="icon-btn" id="rename-me" aria-label="Change your name" data-tip="Change your name">${icon('pencil')}</button>` : ''}</li>`).join('')}</ul></section>

    <section><div class="sec-label">This list</div>
      <div class="row">
        <button class="btn" id="rename">${icon('pencil')}Rename list</button>
        <button class="btn danger" id="leave">${store.guest ? `${icon('trash')}Delete list` : `${icon('logout')}Leave list`}</button>
      </div></section>

    <section><div class="sec-label">Account</div>
      <div class="row"><span class="note">${esc(store.guest ? 'Guest: saved on this device only' : `Signed in as ${S.user.email || ''}`)}</span><span class="spacer"></span>
        ${store.guest ? (cloud ? `<button class="btn" id="go-signin2">${icon('log-in')}Sign in</button>` : '')
          : `<button class="btn" id="signout" data-tip="Your account's lists stay saved; you go back to guest chores">${icon('logout')}Sign out</button>`}</div></section>
  </div>`;

  app.querySelector('#back').onclick = () => { S.view = 'list'; play('close'); render(); };
  app.querySelectorAll('#go-signin, #go-signin2').forEach((b) => { b.onclick = () => { S.view = 'signin'; play('open'); render(); }; });
  const copy = app.querySelector('#copy-link');
  if (copy) copy.onclick = async () => {
    try { await navigator.clipboard.writeText(link); confirmOn(copy, 'Copied'); } catch { await ask('Invite link', { value: link, okLabel: 'Done' }); }
  };
  if (copy) app.querySelector('#new-code').onclick = async () => {
    try { h.invite_code = await store.resetCode(h.id); render(); toast('New code made; the old one no longer works'); play('confirm'); } catch (e) { fail(e); }
  };
  app.querySelector('#rename-me')?.addEventListener('click', async () => {
    const n = await ask('Your name in this list', { value: mine?.display_name }); if (!n) return;
    try { await store.renameMe(S.hid, n); mine.display_name = n; render(); play('confirm'); } catch (e) { fail(e); }
  });
  app.querySelector('#rename').onclick = async () => {
    const n = await ask('Rename list', { value: h.name }); if (!n) return;
    try { await store.renameHousehold(h.id, n); h.name = n; render(); play('confirm'); } catch (e) { fail(e); }
  };
  arm(app.querySelector('#leave'), store.guest ? 'Delete with all chores?' : S.members.length > 1 ? 'Confirm: leave' : 'Confirm: you are the last member', async () => {
    try { await store.leaveHousehold(h.id); await loadHouseholds(); S.view = 'list'; await loadHousehold(); render(); toast(`Left ${h.name}`); } catch (e) { fail(e); }
  });
  app.querySelector('#signout')?.addEventListener('click', () => store.signOut());
}

// ═══ App settings modal (look, sound, list display) ════════════════════

function wireSettings() {
  const modal = $('#settings-modal');
  const btn = $('#settings-btn');
  let lastFocus = null;
  const open = () => {
    lastFocus = document.activeElement;
    modal.hidden = false; btn.setAttribute('aria-pressed', 'true'); play('open');
    modal.querySelector('[data-close]').focus();
  };
  const close = () => {
    if (modal.hidden) return;
    modal.hidden = true; btn.setAttribute('aria-pressed', 'false'); play('close');
    lastFocus?.focus?.();
  };
  btn.onclick = () => (modal.hidden ? open() : close());
  modal.querySelector('[data-close]').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };

  new Segmented($('#sort-pick'), { options: SORTS, value: View.get('sort'), onChange: (v) => View.set('sort', v) });
  new Segmented($('#warn-pick'), { options: WARNS, value: View.get('warn'), onChange: (v) => View.set('warn', v) });
  new Segmented($('#density-pick'), { options: DENSITIES, value: View.get('density'), onChange: (v) => View.set('density', v) });
  ['#sort-pick', '#density-pick', '#mode-pick', '#font-pick'].forEach((sel) => $(sel).style.setProperty('--w', '44px'));
  const fb = $('#feedback-link');
  if (CFG.feedbackUrl) { fb.href = CFG.feedbackUrl; fb.hidden = false; }
  [['#meters-on', 'meters'], ['#who-on', 'who'], ['#chips-on', 'chips']].forEach(([sel, k]) => {
    const box = $(sel); box.checked = View.get(k);
    box.onchange = () => { play('toggle'); View.set(k, box.checked); };
  });

  // look: theme swatches, a hue of your own, mode and font
  const swatches = $('#theme-pick');
  swatches.innerHTML = Theme.THEMES.map((t) => `<button type="button" class="swatch" role="radio" data-hue="${t.hue}" style="--sw:${t.hue}"><span class="sw-chip"></span>${t.name}</button>`).join('');
  const hue = $('#hue-slider');
  const syncLook = () => {
    swatches.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-checked', Number(b.dataset.hue) === Theme.hue));
    hue.value = Theme.hue;
  };
  swatches.onclick = (e) => { const b = e.target.closest('.swatch'); if (!b) return; Theme.fade(); Theme.hue = Number(b.dataset.hue); play('toggle'); };
  hue.oninput = () => { Theme.hue = Number(hue.value); };
  new Segmented($('#mode-pick'), { options: Theme.MODES.map((m) => ({ value: m.value, label: MODE_ICONS[m.value][1], icon: MODE_ICONS[m.value][0], iconOnly: true })), value: Theme.mode, onChange: (v) => { Theme.fade(); Theme.mode = v; } });
  // each font option is written in its own face
  new Segmented($('#font-pick'), { options: Theme.FONTS.map((f) => ({ value: f.value, label: f.label, text: 'Aa', tip: f.label, style: `font-family:${FONT_FACES[f.value]};font-size:14px` })), value: Theme.font, onChange: (v) => { Theme.fade(); Theme.font = v; } });
  Theme.onChange(syncLook);
  syncLook();

  // sound
  const on = $('#sound-on'), vol = $('#sound-vol');
  on.checked = Sound.on; vol.value = Sound.volume; vol.disabled = !Sound.on;
  on.onchange = () => { Sound.on = on.checked; vol.disabled = !on.checked; play('toggle'); };
  vol.onchange = () => { Sound.volume = Number(vol.value); play('select'); };
  vol.oninput = () => { Sound.volume = Number(vol.value); };

  // keyboard: , settings; N add a chore; Esc closes whatever is on top
  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest?.('input, textarea, [contenteditable]');
    if (e.key === 'Escape') {
      if (!modal.hidden) return close();
      if (!$('#modal').hidden) return;
      if (S.view === 'settings') { S.view = 'list'; play('close'); return render(); }
      if (S.open && !typing) { S.open = null; play('close'); return render(); }
      if (S.adding && S.chores.length) { e.target.blur?.(); return toggleAdd(); }
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey || !$('#modal').hidden) return;
    if (e.key === ',') { e.preventDefault(); modal.hidden ? open() : close(); }
    else if ((e.key === 'n' || e.key === 'N') && modal.hidden && S.user && S.hid && S.view === 'list' && S.chores.length) { e.preventDefault(); if (!S.adding) toggleAdd(); else $('#add-form input')?.focus(); }
  });
}

start();
