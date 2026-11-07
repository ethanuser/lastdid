'use strict';
// Import and export for chore lists. Pure functions (no DOM, no store), so they're easy to test:
//   node transfer.test.js
//
// Import is additive and idempotent: it never deletes anything, never renames, keeps your
// intervals unless you tick "use imported", and skips history entries you already have.
// Importing the same thing twice changes nothing the second time.
//
// Accepted input:
//   1. A Last Did export file (JSON, see exportJSON).
//   2. Any JSON array of chores, or {chores: [...]}, with loose field names
//      (name/title/chore, every_days/interval_days/every/interval/frequency, history/done/last_done).
//   3. Plain text, one chore per line, e.g.
//        Water plants, every 4 days
//        - Laundry (weekly) last 2026-11-02
//        Change sheets | 2w
//      A header row like "name,every" is skipped. Lines without an interval get 7 days, flagged.
(function (root) {
  const MAX_ITEMS = 500, MAX_HISTORY = 200;
  const MIN_DAYS = 1 / 24, MAX_DAYS = 3650;
  const UNIT = { d: 1, day: 1, days: 1, w: 7, wk: 7, wks: 7, week: 7, weeks: 7, mo: 30, mos: 30, month: 30, months: 30,
    y: 365, yr: 365, yrs: 365, year: 365, years: 365, h: 1 / 24, hr: 1 / 24, hrs: 1 / 24, hour: 1 / 24, hours: 1 / 24 };
  const WORDS = [
    [/\b(twice|2x|two times)\s+(a|per)\s+day\b/i, 0.5],
    [/\b(twice|2x|two times)\s+(a|per)\s+week\b/i, 3.5],
    [/\b(3x|three times)\s+(a|per)\s+week\b/i, 7 / 3],
    [/\b(twice|2x|two times)\s+(a|per)\s+month\b/i, 15],
    [/\bevery\s+other\s+day\b/i, 2], [/\bevery\s+other\s+week\b/i, 14], [/\bevery\s+other\s+month\b/i, 60],
    [/\b(bi-?weekly|fortnightly)\b/i, 14], [/\b(bi-?monthly)\b/i, 60],
    [/\b(daily|every\s*day|each\s+day|nightly)\b/i, 1], [/\b(weekly|every\s+week|each\s+week)\b/i, 7],
    [/\b(monthly|every\s+month|each\s+month)\b/i, 30], [/\b(quarterly|every\s+quarter)\b/i, 91],
    [/\b(yearly|annually|every\s+year|each\s+year)\b/i, 365],
  ];
  // "every 3 days", "3d", "2 weeks", "every 1.5 months"; "per" and "x/week" are handled above
  const NUM_UNIT = /\b(?:every\s+)?(\d+(?:\.\d+)?)\s*-?\s*(hours?|hrs?|h|days?|d|weeks?|wks?|w|months?|mos?|years?|yrs?|y)\b\.?/i;
  const LAST = /\b(?:last(?:\s+done)?|done)\s*[:=]?\s*(\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?)/i;

  const clampDays = (d) => Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(d * 1000) / 1000));
  const key = (name) => String(name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const tidyName = (s) => String(s).replace(/\s+/g, ' ').replace(/^[\s,;:|\-–—()[\]]+|[\s,;:|\-–—()[\]]+$/g, '').trim().slice(0, 80);

  // Interval from a number (days) or a phrase; null when there isn't one.
  function parseInterval(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? clampDays(v) : null;
    const s = String(v).trim();
    if (/^\d+(\.\d+)?$/.test(s)) return clampDays(Number(s));  // a bare number means days
    for (const [re, days] of WORDS) if (re.test(s)) return days;
    const m = s.match(NUM_UNIT);
    if (m) return clampDays(Number(m[1]) * UNIT[m[2].toLowerCase().replace(/s$/, '')] || Number(m[1]) * UNIT[m[2].toLowerCase()]);
    return null;
  }
  // The part of a line that is the interval, so it can be cut out of the name.
  function findInterval(line) {
    for (const [re, days] of WORDS) { const m = line.match(re); if (m) return { days, text: m[0] }; }
    const m = line.match(NUM_UNIT);
    if (m) return { days: parseInterval(m[0]), text: m[0] };
    return null;
  }

  // A real moment in the past (allowing a minute of clock skew), as ISO; null otherwise.
  function parseWhen(v, now) {
    if (v == null || v === '') return null;
    if (typeof v === 'object') v = v.done_at || v.date || v.at || v.when;
    if (typeof v === 'number') v = v < 1e12 ? v * 1000 : v;  // seconds or milliseconds
    // a plain date means local noon that day, so it can't drift to the day before
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) v = v.trim() + 'T12:00:00';
    const t = new Date(v).getTime();
    if (!Number.isFinite(t) || t < Date.UTC(2000, 0, 1) || t > now + 60_000) return null;
    return new Date(t).toISOString();
  }

  function fromObject(o, now, i) {
    if (typeof o === 'string') return fromLine(o, now, i);
    if (!o || typeof o !== 'object') return { line: i + 1, raw: JSON.stringify(o), error: 'Not a chore' };
    const name = tidyName(o.name ?? o.title ?? o.chore ?? o.task ?? '');
    const rawEvery = o.every_days ?? o.interval_days ?? o.days ?? o.every ?? o.interval ?? o.frequency ?? o.repeat;
    const every = parseInterval(rawEvery);
    let hist = o.history ?? o.done ?? o.completions ?? o.log ?? [];
    if (!Array.isArray(hist)) hist = [hist];
    const last = o.last_done ?? o.lastDone ?? o.last;
    if (last) hist = hist.concat([last]);
    const bad = hist.filter((h) => !parseWhen(h, now)).length;
    const history = hist.map((h) => parseWhen(h, now)).filter(Boolean);
    const item = { line: i + 1, raw: name || JSON.stringify(o).slice(0, 80), name, every, guessed: every == null, history, badDates: bad };
    if (!name) item.error = 'No name';
    else if (rawEvery != null && rawEvery !== '' && every == null) item.error = `Can't read “${rawEvery}” as an interval`;
    return item;
  }

  function fromLine(raw, now, i) {
    let s = raw.replace(/^\s*(?:[-*•·+]|\d+[.)]|\[[ xX]?\])\s+/, '');  // list bullets, numbering, checkboxes
    const item = { line: i + 1, raw: raw.trim(), history: [], badDates: 0 };
    const last = s.match(LAST);
    if (last) {
      const when = parseWhen(last[1], now);
      if (when) item.history.push(when); else item.badDates++;
      s = s.replace(last[0], ' ');
    }
    let iv = findInterval(s);
    // a spreadsheet-style line: "Laundry, 7" means every 7 days
    const bare = !iv && s.match(/[,;|\t:]\s*(\d+(?:\.\d+)?)\s*$/);
    if (bare) iv = { days: parseInterval(bare[1]), text: bare[0] };
    if (iv) s = s.replace(iv.text, ' ').replace(/\(\s*\)/g, ' ');
    // "every <something>" that isn't an interval is a mistake to show, not part of the name
    const loose = !iv && s.match(/\bevery\s+[^,;|\t]+/i);
    if (loose) s = s.replace(loose[0], ' ');
    item.name = tidyName(s.replace(/\s*[,;|\t]\s*(?=[,;|\t]|$)/g, ' '));
    item.every = iv ? iv.days : null;
    item.guessed = !iv;
    if (!item.name) item.error = 'No name';
    else if (loose) item.error = `Can't read “${loose[0].trim()}” as an interval`;
    return item;
  }

  // Text or JSON in, a list of items (some may carry .error) out.
  function parse(text, now = Date.now()) {
    const t = String(text || '').trim();
    if (!t) return { format: 'empty', items: [] };
    // JSON starts with { or [, but a checklist line like "[ ] Laundry" is text
    if (/^\{/.test(t) || (/^\[/.test(t) && !/^\[[ xX]?\]\s+\S/.test(t))) {
      let data;
      try { data = JSON.parse(t); } catch (e) { return { format: 'json', items: [], error: 'This looks like JSON but it has a mistake in it: ' + e.message }; }
      const list = Array.isArray(data) ? data : Array.isArray(data?.chores) ? data.chores : null;
      if (!list) return { format: 'json', items: [], error: 'JSON needs a list of chores, or {"chores": [...]}.' };
      const items = list.slice(0, MAX_ITEMS).map((o, i) => fromObject(o, now, i));
      return { format: data?.app === 'lastdid' ? 'lastdid' : 'json', items, truncated: list.length > MAX_ITEMS, listName: data?.list };
    }
    const lines = t.split(/\r?\n/).map((l, i) => ({ l, i })).filter(({ l }) => l.trim() && !/^\s*(#|\/\/)/.test(l));
    // a spreadsheet header row: "name, every" and the like
    if (lines.length && /^\W*(name|chore|task|title)\b/i.test(lines[0].l) && !findInterval(lines[0].l.replace(/^\W*\w+/, ''))?.days) lines.shift();
    const items = lines.slice(0, MAX_ITEMS).map(({ l, i }) => fromLine(l, now, i));
    return { format: 'text', items, truncated: lines.length > MAX_ITEMS };
  }

  // Compare parsed items with what's already on the list. Nothing here writes anything.
  // Each row: {status: 'new'|'same'|'differs'|'error', name, every, current?, addHistory: [iso]}
  function plan(items, chores, comps, { defaultDays = 7 } = {}) {
    const byKey = new Map(chores.map((c) => [key(c.name), c]));
    const minute = (iso) => Math.floor(new Date(iso).getTime() / 60_000);
    const seen = new Map();  // chore key -> Set of minutes already logged (or about to be)
    const seenFor = (k, choreId) => {
      if (!seen.has(k)) seen.set(k, new Set(choreId ? comps.filter((x) => x.chore_id === choreId).map((x) => minute(x.done_at)) : []));
      return seen.get(k);
    };
    const rows = [], merged = new Map();
    for (const it of items) {
      if (it.error) { rows.push({ status: 'error', line: it.line, raw: it.raw, error: it.error }); continue; }
      const k = key(it.name);
      // the same chore twice in the import: fold the second into the first
      if (merged.has(k)) {
        const row = merged.get(k);
        if (row.every == null && it.every != null) { row.every = it.every; row.guessed = false; }
        const mins = seenFor(k, row.current?.id);
        for (const h of it.history.slice(0, MAX_HISTORY)) if (!mins.has(minute(h))) { mins.add(minute(h)); row.addHistory.push(h); }
        row.dupes++;
        continue;
      }
      const existing = byKey.get(k);
      const mins = seenFor(k, existing?.id);
      const addHistory = [];
      for (const h of it.history.slice(0, MAX_HISTORY)) if (!mins.has(minute(h))) { mins.add(minute(h)); addHistory.push(h); }
      const every = it.every ?? (existing ? Number(existing.interval_days) : defaultDays);
      const row = { line: it.line, name: existing ? existing.name : it.name, every, guessed: it.guessed && !existing,
        current: existing || null, addHistory, badDates: it.badDates || 0, dupes: 0, useImported: false };
      row.status = !existing ? 'new' : (it.every != null && Math.abs(it.every - Number(existing.interval_days)) > 1e-6) ? 'differs' : 'same';
      rows.push(row); merged.set(k, row);
    }
    for (const r of rows) if (r.addHistory) r.addHistory.sort();
    const count = (s) => rows.filter((r) => r.status === s).length;
    return {
      rows,
      newChores: count('new'), unchanged: count('same'), differs: count('differs'), errors: count('error'),
      newHistory: rows.reduce((n, r) => n + (r.addHistory?.length || 0), 0),
    };
  }

  // Full-fidelity export: every chore with its whole history.
  function exportJSON(listName, chores, comps, now = Date.now()) {
    return JSON.stringify({
      app: 'lastdid', version: 1, exported_at: new Date(now).toISOString(), list: listName,
      chores: [...chores].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({
        name: c.name, every_days: Number(c.interval_days),
        history: comps.filter((x) => x.chore_id === c.id).map((x) => x.done_at).sort().reverse(),
      })),
    }, null, 2);
  }
  // Readable export: one line per chore with the latest time, and it imports back the same way.
  function exportText(chores, comps) {
    const every = (d) => (d >= 7 && d % 7 === 0 ? `every ${d / 7} week${d === 7 ? '' : 's'}` : `every ${d} day${d === 1 ? '' : 's'}`);
    return [...chores].sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
      const last = comps.filter((x) => x.chore_id === c.id).map((x) => x.done_at).sort().pop();
      return `${c.name}, ${every(Number(c.interval_days))}${last ? `, last ${last}` : ''}`;
    }).join('\n') + '\n';
  }

  root.Transfer = { parse, plan, exportJSON, exportText, parseInterval, key };
  if (typeof module !== 'undefined') module.exports = root.Transfer;
})(typeof window !== 'undefined' ? window : globalThis);
