'use strict';
// The look of the app, ported from VidAnki. One hue tints every surface and the accent
// (the tokens are in style.css), so a theme is just a hue. Mode and font sit on <html>.
// Saved per device. Loaded in <head> so the first paint is right.
window.Theme = (function () {
  // in rainbow order, left to right
  const THEMES = [
    { id: 'rose', name: 'Rose', hue: 5 },
    { id: 'hearth', name: 'Hearth', hue: 45 },
    { id: 'amber', name: 'Amber', hue: 75 },
    { id: 'moss', name: 'Moss', hue: 135 },
    { id: 'tide', name: 'Tide', hue: 205 },
    { id: 'slate', name: 'Slate', hue: 255 },
    { id: 'dusk', name: 'Dusk', hue: 305 },
  ];
  const DEFAULT = 'amber';
  const MODES = [{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }];
  const FONTS = [{ value: 'cozy', label: 'Cozy' }, { value: 'book', label: 'Book' }, { value: 'plain', label: 'Plain' }];

  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const pref = (() => {
    try { return JSON.parse(localStorage.getItem('lastdone.look')) || {}; } catch { return {}; }
  })();
  let hue = typeof pref.hue === 'number' ? pref.hue : THEMES.find((t) => t.id === DEFAULT).hue;
  let mode = MODES.some((m) => m.value === pref.mode) ? pref.mode : 'auto';
  let font = FONTS.some((f) => f.value === pref.font) ? pref.font : 'cozy';
  const listeners = [];

  const isDark = () => (mode === 'auto' ? system.matches : mode === 'dark');
  function apply() {
    root.style.setProperty('--h', hue);
    root.dataset.mode = isDark() ? 'dark' : 'light';
    root.dataset.font = font;
    // the tab icon takes the theme's color too
    const icon = document.querySelector('link[rel=icon]');
    if (icon) {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='oklch(.55 .13 ${hue})'/><path d='M17 33l10 10 20-22' stroke='white' stroke-width='7' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>`;
      icon.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
    }
  }
  function changed() {
    apply();
    try { localStorage.setItem('lastdone.look', JSON.stringify({ hue, mode, font })); } catch {}
    listeners.forEach((fn) => fn());
  }
  system.addEventListener('change', () => {
    if (mode !== 'auto') return;
    apply();
    listeners.forEach((fn) => fn());
  });
  apply();

  return {
    THEMES, MODES, FONTS,
    // crossfade the next change; not for the slider, which changes on every step
    fade() {
      root.classList.add('theming');
      clearTimeout(this.fadeT);
      this.fadeT = setTimeout(() => root.classList.remove('theming'), 260);
    },
    onChange(fn) { listeners.push(fn); },
    get dark() { return isDark(); },
    get theme() { return THEMES.find((t) => t.hue === hue)?.id || 'custom'; },
    get hue() { return hue; },
    set hue(v) { hue = Math.round(v); changed(); },
    get mode() { return mode; },
    set mode(v) { mode = v; changed(); },
    get font() { return font; },
    set font(v) { font = v; changed(); },
  };
})();
