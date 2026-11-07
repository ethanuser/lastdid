'use strict';
// Shared controls, ported from VidAnki: segmented control, dropdown, icons, tooltips.

// Segmented control: shows every option, and one highlight slides to the chosen one.
window.Segmented = class Segmented {
  constructor(el, { options, value, onChange = () => {} }) {
    this.el = el;
    this.options = options;
    el.classList.add('seg');
    el.setAttribute('role', 'radiogroup');
    el.style.setProperty('--n', options.length);
    // an option can carry an icon; with iconOnly its label becomes the tooltip and accessible name
    el.innerHTML = options.map((o) => `<button type="button" role="radio" data-value="${o.value}" aria-label="${o.label}"${o.iconOnly || o.tip ? ` data-tip="${o.tip || o.label}"` : ''}${o.style ? ` style="${o.style}"` : ''}>`
      + `${o.icon ? icon(o.icon) : ''}${o.iconOnly ? '' : `<span>${o.text || o.label}</span>`}</button>`).join('');
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && b.dataset.value !== this.value) {
        this.setValue(b.dataset.value);
        window.Sound && Sound.play('toggle');
        onChange(this.value);
      }
    });
    this.setValue(value);
  }
  setValue(v) {
    this.value = String(v);
    this.el.style.setProperty('--i', this.options.findIndex((o) => String(o.value) === this.value));
    this.el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', b.dataset.value === this.value));
  }
};

// Custom dropdown: a button plus a menu, replacing native <select>.
// Arrow keys move, Enter picks, Escape closes. An option with `sep` gets a divider above it,
// and one with `action` runs onChange without becoming the shown value.
window.Dropdown = class Dropdown {
  constructor(el, { options = [], value = null, onChange = () => {} } = {}) {
    this.el = el;
    this.onChange = onChange;
    el.classList.add('dd');
    el.innerHTML = `<button type="button" class="dd-btn" aria-haspopup="listbox"><span class="dd-label"></span><span class="dd-caret"></span></button><div class="dd-menu" role="listbox" hidden></div>`;
    this.btn = el.querySelector('.dd-btn');
    this.menu = el.querySelector('.dd-menu');
    this.btn.addEventListener('click', (e) => { e.stopPropagation(); this.menu.hidden ? this.open() : this.close(); });
    this.menu.addEventListener('click', (e) => {
      const li = e.target.closest('.dd-item');
      if (li) { e.stopPropagation(); this.pick(li.dataset.value); }
    });
    this.btn.addEventListener('keydown', (e) => this.key(e));
    this.menu.addEventListener('keydown', (e) => this.key(e));
    document.addEventListener('click', () => this.close());
    this.setOptions(options, value);
  }
  setOptions(options, value = this.value) {
    this.options = options;
    this.menu.innerHTML = options.map((o) => (o.sep ? '<hr>' : '')
      + `<div class="dd-item${o.action ? ' act' : ''}" role="option" tabindex="-1" data-value="${o.value}">${o.icon ? icon(o.icon) : ''}<span></span></div>`).join('');
    // labels go in as text, so a list called "<b>" stays a name
    this.menu.querySelectorAll('.dd-item span').forEach((s, i) => { s.textContent = options[i].label; s.dataset.tip = options[i].label; s.toggleAttribute('data-clip', true); });
    this.setValue(value);
  }
  setValue(v) {
    this.value = v == null ? null : String(v);
    const o = this.options.find((x) => String(x.value) === this.value);
    const label = this.el.querySelector('.dd-label');
    label.textContent = o ? o.label : '';
    label.dataset.tip = label.textContent;
    label.toggleAttribute('data-clip', true);
    this.menu.querySelectorAll('.dd-item').forEach((li) => {
      const sel = li.dataset.value === this.value;
      li.classList.toggle('sel', sel);
      li.setAttribute('aria-selected', sel);
    });
  }
  pick(v) {
    this.close(true);
    this.btn.focus();
    const o = this.options.find((x) => String(x.value) === v);
    if (o?.action) { this.onChange(v); return; }
    if (v !== this.value) { this.setValue(v); this.onChange(v); window.Sound && Sound.play('toggle'); }
  }
  open() {
    document.querySelectorAll('.dd-menu').forEach((m) => { m.hidden = true; m.parentElement.classList.remove('open'); });
    window.Sound && Sound.play('open');
    this.menu.hidden = false;
    this.el.classList.add('open');
    this.btn.setAttribute('aria-expanded', 'true');
    (this.menu.querySelector('.sel') || this.menu.querySelector('.dd-item'))?.focus();
  }
  close(silent = false) {
    if (!this.menu.hidden && !silent) window.Sound && Sound.play('close');
    this.menu.hidden = true;
    this.el.classList.remove('open');
    this.btn.setAttribute('aria-expanded', 'false');
  }
  key(e) {
    const items = [...this.menu.querySelectorAll('.dd-item')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape' && !this.menu.hidden) { this.close(); this.btn.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (this.menu.hidden) this.open();
      else items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    } else if (e.key === 'Enter' && !this.menu.hidden && i >= 0) this.pick(items[i].dataset.value);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
};

// One stroke icon family (24px grid).
const ICON_PATHS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>',
  pencil: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  'log-in': '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  // look
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  palette: '<path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.5 3.3A1.6 1.6 0 0 1 12 22z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>',
  hue: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  // list display
  sort: '<path d="M3 6h13M3 12h9M3 18h5M18 8v12M15 17l3 3 3-3"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  az: '<path d="M3 16l3.5-9L10 16M4.2 13h4.6M14 7h6l-6 9h6"/>',
  gauge: '<path d="M12 14l4-4"/><path d="M3.3 17a10 10 0 1 1 17.4 0"/>',
  rows: '<path d="M3 5h18M3 12h18M3 19h18"/>',
  'rows-dense': '<path d="M3 4h18M3 9h18M3 14h18M3 19h18"/>',
  bar: '<rect x="2" y="9" width="20" height="6" rx="3"/><path d="M5 12h7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M5 20c1-3.5 3.6-5 7-5s6 1.5 7 5"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  transfer: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M21 16l-4 4-4-4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  // about
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  message: '<path d="M4 5h16v11H9l-5 4z"/>',
  coffee: '<path d="M5 9h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M9 3v3M13 3v3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  // chore groups
  utensils: '<path d="M4 2v7a3 3 0 0 0 6 0V2M7 2v20M17 22V2c-2.5 1.5-4 4-4 7v4h4"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  shirt: '<path d="M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z"/>',
  droplet: '<path d="M12 2.7 6.3 8.4a8 8 0 1 0 11.4 0z"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 4 13C4 7 9 3 20 3c0 11-4 17-10 17zM4 21c3-6 6-9 11-12"/>',
  paw: '<circle cx="5.5" cy="10" r="2"/><circle cx="9" cy="5" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="18.5" cy="10" r="2"/><path d="M12 12c-3 0-6 3.5-6 6.5 0 1.9 1.6 2.5 3 2.5 1.2 0 2-.6 3-.6s1.8.6 3 .6c1.4 0 3-.6 3-2.5 0-3-3-6.5-6-6.5z"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L22 14l-8 8-2.6-2.4a4 4 0 0 0-5-5L4 12l8-8z" transform="rotate(0)"/>',
  car: '<path d="M5 17H3v-5l2-5h14l2 5v5h-2"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M9.5 17h5M3 12h18"/>',
  wallet: '<path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15v13H5a2 2 0 0 1-2-2V5"/><path d="M16 13h.01"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
};
window.icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
window.hydrateIcons = (root = document) => root.querySelectorAll('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); });
hydrateIcons();

// Styled tooltips: anything with data-tip. A trailing "(X)" renders as a key cap,
// and data-clip means only when the text is cut off.
(function () {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);
  let target = null, showT = 0, hideT = 0, warmUntil = 0;
  function render(text) {
    const m = text.match(/^(.*?)\s*\(([^()]{1,8})\)$/);
    tip.textContent = m ? m[1] : text;
    if (m) { const k = document.createElement('kbd'); k.textContent = m[2]; tip.append(k); }
  }
  function show() {
    if (!target || !target.isConnected) return;
    render(target.dataset.tip);
    tip.hidden = false;
    const r = target.getBoundingClientRect(), t = tip.getBoundingClientRect();
    const x = Math.max(8, Math.min(innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2));
    const below = r.bottom + 6 + t.height < innerHeight;
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(below ? r.bottom + 6 : r.top - t.height - 6)}px)`;
  }
  function hide() {
    clearTimeout(showT);
    if (!tip.hidden) warmUntil = performance.now() + 600;
    tip.hidden = true;
    target = null;
  }
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el === target) return;
    clearTimeout(showT); clearTimeout(hideT);
    const clipped = el && 'clip' in el.dataset ? el.scrollWidth > el.clientWidth : true;
    if (!el || !el.dataset.tip || !clipped) { hideT = setTimeout(hide, 150); return; }
    target = el;
    if (performance.now() < warmUntil || !tip.hidden) show();
    else showT = setTimeout(show, 400);
  });
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, hide, true));
  document.addEventListener('scroll', hide, true);
})();

// Popups: lock the page behind while one is open, and on phones let the header be dragged
// down to close it. A short drag springs back; a long or fast one closes, through the same
// Escape path each popup already handles (so unsaved-import warnings still apply).
(function () {
  const modals = () => [...document.querySelectorAll('.modal')];
  const sync = () => document.documentElement.classList.toggle('modal-open', modals().some((m) => !m.hidden));
  const watch = new MutationObserver(sync);
  modals().forEach((m) => watch.observe(m, { attributes: true, attributeFilter: ['hidden'] }));

  const phone = window.matchMedia('(max-width: 520px)');
  let drag = null;
  document.addEventListener('pointerdown', (e) => {
    const head = e.target.closest('.modal .modal-head');
    if (!head || !phone.matches || e.target.closest('button, a, input')) return;
    const sheet = head.closest('.modal-box, .card');
    if (!sheet || sheet.scrollTop > 0) return;  // only from the top, so it never fights scrolling
    drag = { sheet, y: e.clientY, t: performance.now(), dy: 0, id: e.pointerId };
    head.setPointerCapture(e.pointerId);
    sheet.classList.add('sheet-drag');
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dy = Math.max(0, e.clientY - drag.y);
    drag.sheet.style.transform = drag.dy ? `translateY(${drag.dy}px)` : '';
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { sheet, dy, t } = drag;
    drag = null;
    sheet.classList.remove('sheet-drag');
    const fast = dy > 30 && dy / (performance.now() - t) > 0.6;
    sheet.style.transform = '';  // springs back (and stays put if closing is refused)
    if (dy > 110 || fast) sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
})();
