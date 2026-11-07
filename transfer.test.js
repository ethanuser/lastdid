// Run with: node transfer.test.js
'use strict';
const assert = require('assert');
const T = require('./transfer.js');

const NOW = Date.parse('2026-11-07T12:00:00Z');
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error('FAIL', name, '\n ', e.message); process.exitCode = 1; } };
const one = (line) => T.parse(line, NOW).items[0];

test('intervals in many spellings', () => {
  const cases = { 'every 4 days': 4, '3d': 3, '2 weeks': 14, '2w': 14, 'weekly': 7, 'daily': 1, 'biweekly': 14,
    'fortnightly': 14, 'monthly': 30, 'every other day': 2, 'every other week': 14, 'twice a week': 3.5,
    'quarterly': 91, 'yearly': 365, 'annually': 365, 'every 1.5 months': 45, '10': 10, 'every 12 hours': 0.5 };
  for (const [s, d] of Object.entries(cases)) assert.strictEqual(T.parseInterval(s), d, s);
  assert.strictEqual(T.parseInterval('sometimes'), null);
  assert.strictEqual(T.parseInterval(99999), 3650, 'clamped to ten years');
});

test('plain lines: separators, bullets, numbering', () => {
  for (const line of ['Water plants, every 4 days', '- Water plants (every 4 days)', '3. Water plants | 4d',
    '[ ] Water plants - every 4 days', 'Water plants\t4 days', '* Water plants: every 4 days.']) {
    const it = one(line);
    assert.strictEqual(it.name, 'Water plants', line);
    assert.strictEqual(it.every, 4, line);
  }
});

test('names keep their own hyphens and words', () => {
  assert.strictEqual(one('Check-in with mom, weekly').name, 'Check-in with mom');
  assert.strictEqual(one('Wash duvet - every 3 months').name, 'Wash duvet');
});

test('an unreadable "every ..." is an error, not part of the name', () => {
  assert.ok(/sometimes/.test(one('Mow the lawn, every sometimes').error));
  assert.strictEqual(one('Mow the lawn, every 2 weeks').every, 14);
});

test('a line without an interval is kept and flagged', () => {
  const it = one('Clean the garage');
  assert.strictEqual(it.name, 'Clean the garage');
  assert.strictEqual(it.every, null);
  assert.strictEqual(it.guessed, true);
});

test('last done dates; future and nonsense dates are dropped', () => {
  assert.deepStrictEqual(one('Laundry, weekly, last 2026-11-02T18:30:00Z').history, ['2026-11-02T18:30:00.000Z']);
  assert.strictEqual(one('Laundry, weekly, last 2026-11-02').history.length, 1);
  const future = one('Laundry, weekly, last 2031-01-01');
  assert.strictEqual(future.history.length, 0);
  assert.strictEqual(future.badDates, 1);
});

test('header row and comments are skipped', () => {
  const r = T.parse('name, every\n# my chores\nLaundry, 7\nVacuum, 14', NOW);
  assert.deepStrictEqual(r.items.map((i) => [i.name, i.every]), [['Laundry', 7], ['Vacuum', 14]]);
});

test('loose JSON shapes', () => {
  const r = T.parse(JSON.stringify([{ title: 'Laundry', frequency: 'weekly' }, { chore: 'Floss', every: 'daily', last_done: '2026-11-06' }, 'Vacuum, 2w']), NOW);
  assert.deepStrictEqual(r.items.map((i) => [i.name, i.every, i.history.length]), [['Laundry', 7, 0], ['Floss', 1, 1], ['Vacuum', 14, 0]]);
  assert.strictEqual(T.parse('{"chores": [{"name": "A", "every_days": 3}]}', NOW).items[0].every, 3);
});

test('bad JSON says so instead of guessing', () => {
  const r = T.parse('[{"name": "A",}]', NOW);
  assert.ok(r.error && /mistake/.test(r.error));
  assert.ok(T.parse('{"x": 1}', NOW).error);
  assert.strictEqual(T.parse(JSON.stringify([{ name: 'A', every: 'whenever' }]), NOW).items[0].error.includes('whenever'), true);
  assert.strictEqual(T.parse(JSON.stringify([{ every: 3 }]), NOW).items[0].error, 'No name');
});

// ---- planning against an existing list ----
const chores = [{ id: 'c1', name: 'Laundry', interval_days: 7 }, { id: 'c2', name: 'Water Plants', interval_days: 4 }];
const comps = [{ id: 'x1', chore_id: 'c1', done_at: '2026-11-02T18:30:00.000Z' }];

test('plan: new, same, differs, matched without case or spacing', () => {
  const p = T.plan(T.parse('laundry, weekly\n  WATER plants , every 5 days\nVacuum, 2w\nMop', NOW).items, chores, comps);
  assert.deepStrictEqual(p.rows.map((r) => [r.name, r.status]), [['Laundry', 'same'], ['Water Plants', 'differs'], ['Vacuum', 'new'], ['Mop', 'new']]);
  assert.strictEqual(p.rows[1].useImported, false, 'your interval wins unless you choose otherwise');
  assert.strictEqual(p.rows[3].every, 7);
  assert.strictEqual(p.rows[3].guessed, true);
});

test('plan: an existing chore without an imported interval keeps its own', () => {
  const p = T.plan(T.parse('Water plants', NOW).items, chores, comps);
  assert.strictEqual(p.rows[0].status, 'same');
  assert.strictEqual(p.rows[0].every, 4);
});

test('plan: history already there (to the minute) is not added again', () => {
  const p = T.plan(T.parse('Laundry, weekly, last 2026-11-02T18:30:20Z', NOW).items, chores, comps);
  assert.strictEqual(p.newHistory, 0);
});

test('plan: duplicates inside the import fold together', () => {
  const p = T.plan(T.parse('Vacuum, 2w, last 2026-11-01\nvacuum, last 2026-11-01\nVacuum, last 2026-11-03', NOW).items, chores, comps);
  assert.strictEqual(p.rows.length, 1);
  assert.strictEqual(p.rows[0].addHistory.length, 2);
  assert.strictEqual(p.rows[0].dupes, 2);
});

test('round trip: exporting then importing changes nothing', () => {
  for (const out of [T.exportJSON('Home', chores, comps, NOW), T.exportText(chores, comps)]) {
    const p = T.plan(T.parse(out, NOW).items, chores, comps);
    assert.strictEqual(p.newChores, 0, out);
    assert.strictEqual(p.differs, 0, out);
    assert.strictEqual(p.newHistory, 0, out);
    assert.strictEqual(p.errors, 0, out);
  }
});

test('round trip into an empty list brings everything over', () => {
  const p = T.plan(T.parse(T.exportJSON('Home', chores, comps, NOW), NOW).items, [], []);
  assert.strictEqual(p.newChores, 2);
  assert.strictEqual(p.newHistory, 1);
});

console.log(`${passed} passed${process.exitCode ? ', some failed' : ''}`);
