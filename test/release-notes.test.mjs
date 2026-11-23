import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = kind => path.join(repoRoot, `skills/release-notes-${kind}/scripts/release-notes.cjs`);
const ANA = { name: 'Ana Cruz', email: 'ana@example.com' };
const BEN = { name: 'Ben Lee', email: 'ben@example.com' };

function fixture(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'release-notes-test-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const repo = path.join(base, 'repo space'); fs.mkdirSync(repo);
  const out = path.join(base, 'out');
  const json = path.join(out, 'notes.json'), html = path.join(out, 'notes.html');
  const git = (args, env = {}) => {
    const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', HOME: base, ...env } });
    assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
  };
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.name', ANA.name]); git(['config', 'user.email', ANA.email]);
  let file = 0;
  const commit = (message, date, author = ANA) => {
    fs.writeFileSync(path.join(repo, `f${file++}.txt`), message);
    git(['add', '.']);
    git(['commit', '-q', '-m', message], { GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
    return git(['rev-parse', 'HEAD']);
  };
  let sequence = 0;
  const run = (kind, args, expected = 0) => {
    const r = spawnSync(process.execPath, [script(kind), ...args], { encoding: 'utf8' });
    assert.equal(r.status, expected, `${args.join(' ')}\n${r.stdout}${r.stderr}`);
    return JSON.parse(r.stdout || r.stderr);
  };
  const draft = data => { const f = path.join(base, `draft-${sequence++}.json`); fs.writeFileSync(f, JSON.stringify(data)); return f; };
  const collect = (kind, extra = []) => run(kind, ['collect', '--kind', kind, '--json', json, '--repo', repo, ...extra]);
  const append = (kind, collected, entries, { title, expected = 0 } = {}) => run(kind, ['append', '--kind', kind, '--json', json, '--html', html,
    '--draft', draft(title ? { title, entries } : { entries }), '--base', collected.base, '--through', collected.through, '--repo', repo, '--ref', 'main'], expected);
  const entry = (commits, title = 'The export keeps the column order', type = 'fixed') => ({ type, title, description: 'The export writes the columns in the order that the table shows.', commits });
  const read = () => ({ json: fs.readFileSync(json, 'utf8'), html: fs.readFileSync(html, 'utf8') });
  return { base, repo, json, html, git, commit, run, draft, collect, append, entry, read };
}

test('stakeholder notes add only new changes and tag the persons who did the work', t => {
  const f = fixture(t);
  const first = f.commit('Initial setup', '2026-11-01T09:00:00+00:00');
  f.git(['checkout', '-q', '-b', 'feature']);
  f.commit('Add export\n\nCo-authored-by: Cy Dee <cy@example.com>', '2026-11-02T09:00:00+00:00', BEN);
  f.git(['checkout', '-q', 'main']);
  f.git(['merge', '-q', '--no-ff', 'feature', '-m', 'Merge feature'], { GIT_COMMITTER_DATE: '2026-11-03T09:00:00+00:00' });
  const merge = f.git(['rev-parse', 'HEAD']);

  const c1 = f.collect('stakeholder', ['--ref', 'main']);
  assert.equal(c1.base, 'none');
  assert.deepEqual(c1.commits.map(c => c.sha), [first, merge]);
  assert.deepEqual(c1.commits[1].contributors, ['Ben Lee', 'Cy Dee'], 'a merge names the merged authors, not the person who merged');
  assert.equal(c1.commits[1].merged[0].subject, 'Add export');
  const r1 = f.append('stakeholder', c1, [f.entry([merge], 'The <b>export</b> is available', 'added')]);
  assert.equal(r1.added, 1); assert.equal(r1.cursor, merge);

  const late = f.commit('Fix the date parser', '2026-11-10T09:00:00+00:00', BEN);
  const c2 = f.collect('stakeholder');
  assert.equal(c2.base, merge);
  assert.deepEqual(c2.commits.map(c => c.sha), [late], 'the second run reads only the commits after the cursor');
  f.append('stakeholder', c2, [f.entry([late], 'Dates parse correctly')]);

  const doc = JSON.parse(f.read().json);
  assert.equal(doc.kind, 'stakeholder'); assert.equal(doc.source.ref, 'main'); assert.equal(doc.source.cursor, late);
  assert.deepEqual(doc.entries.map(e => e.date), ['2026-11-10', '2026-11-03']);
  assert.deepEqual(doc.entries.map(e => e.contributors), [['Ben Lee'], ['Ben Lee', 'Cy Dee']]);
  const html = f.read().html;
  assert.deepEqual([...html.matchAll(/<section class="day" data-date="([^"]+)"><h2><time datetime="[^"]+">([^<]+)</g)].map(m => [m[1], m[2]]),
    [['2026-11-10', '10 November 2026'], ['2026-11-03', '3 November 2026']], 'new to old');
  assert.match(html, /<select id="person"><option value="">All contributors<\/option><option value="Ben Lee">Ben Lee<\/option><option value="Cy Dee">Cy Dee<\/option><\/select>/);
  assert.match(html, /<input type="date" id="from" min="2026-11-03" max="2026-11-10">/);
  assert.match(html, /data-people="\[&quot;Ben Lee&quot;,&quot;Cy Dee&quot;\]"/);
  assert.ok(html.includes('The &lt;b&gt;export&lt;/b&gt; is available') && !html.includes('<b>export'), 'text is escaped');
  assert.deepEqual(f.collect('stakeholder').commits, [], 'nothing new after the last append');
});

test('project notes store no names and show only a date filter', t => {
  const f = fixture(t);
  const a = f.commit('Add login', '2026-11-01T09:00:00+00:00');
  const b = f.commit('Refactor tests', '2026-11-02T09:00:00+00:00', BEN);
  const c = f.collect('project', ['--ref', 'main']);
  assert.equal(c.commits[0].contributors, undefined);
  f.append('project', c, [f.entry([a], 'You can sign in with a password', 'added')], { title: 'Example release notes' });
  const { json, html } = f.read();
  const doc = JSON.parse(json);
  assert.equal(doc.title, 'Example release notes');
  assert.equal(doc.source.cursor, b, 'a commit without an entry still moves the cursor');
  assert.equal(doc.entries[0].contributors, undefined);
  assert.ok(!json.includes('Ana Cruz') && !html.includes('Ana Cruz'));
  assert.ok(!html.includes('id="person"'));
  assert.match(html, /id="from"/); assert.match(html, /id="to"/);
  assert.match(html, /<title>Example release notes<\/title>/);
});

test('refusals leave both files unchanged', t => {
  const f = fixture(t);
  const a = f.commit('One', '2026-11-01T09:00:00+00:00');
  const c1 = f.collect('stakeholder', ['--ref', 'main']);
  f.append('stakeholder', c1, [f.entry([a])]);
  const b = f.commit('Two', '2026-11-02T09:00:00+00:00');
  f.git(['checkout', '-q', '-b', 'side']);
  const outside = f.commit('Side', '2026-11-03T09:00:00+00:00');
  f.git(['checkout', '-q', 'main']);
  const c2 = f.collect('stakeholder');
  const before = f.read();
  const refuse = (entries, pattern, collected = c2) => {
    const r = f.append('stakeholder', collected, entries, { expected: 2 });
    assert.match(r.error, pattern); assert.deepEqual(f.read(), before);
  };
  refuse([f.entry([a])], /not a new commit/);
  refuse([f.entry([outside])], /not a new commit/);
  refuse([f.entry([b]), f.entry([b])], /already in an entry/);
  refuse([f.entry([b.slice(0, 7)])], /full SHA/);
  refuse([{ ...f.entry([b]), type: 'improved' }], /type must be one of/);
  refuse([{ ...f.entry([b]), contributors: ['Someone'] }], /unknown key "contributors"/);
  refuse([{ ...f.entry([b]), description: Array(26).fill('word').join(' ') + '.' }], /26 words/);
  refuse([f.entry([b])], /changed after collect/, { ...c2, base: 'none' });
  const wrong = f.run('project', ['append', '--kind', 'project', '--json', f.json, '--html', f.html, '--draft', f.draft({ entries: [] }), '--base', c2.base, '--through', c2.through, '--repo', f.repo], 2);
  assert.match(wrong.error, /contains stakeholder notes/);
  fs.writeFileSync(`${f.json}.lock`, '{}');
  refuse([f.entry([b])], /lock file/);
  fs.rmSync(`${f.json}.lock`);
  f.append('stakeholder', c2, [f.entry([b])]);
  assert.equal(JSON.parse(f.read().json).entries.length, 2);
  assert.ok(!fs.existsSync(`${f.json}.lock`));
  assert.deepEqual(fs.readdirSync(path.dirname(f.json)).sort(), ['notes.html', 'notes.json'], 'no temporary files remain');
});

test('the script protects HTML files that it did not write and old pages without JSON', t => {
  const f = fixture(t);
  const a = f.commit('One', '2026-11-01T09:00:00+00:00');
  const c = f.collect('project', ['--ref', 'main']);
  fs.mkdirSync(path.dirname(f.html), { recursive: true });
  fs.writeFileSync(f.html, '<!doctype html><title>Hand-written page</title>');
  assert.match(f.append('project', c, [f.entry([a])], { expected: 2 }).error, /exists, but .* does not/);
  assert.ok(!fs.existsSync(f.json));
  fs.writeFileSync(f.json, JSON.stringify({ schema: 1, kind: 'project', title: 'Notes', source: { ref: 'main', cursor: null }, updated: '2026-11-01T00:00:00.000Z', entries: [] }));
  assert.match(f.append('project', c, [f.entry([a])], { expected: 2 }).error, /did not write it/);
  assert.equal(fs.readFileSync(f.html, 'utf8'), '<!doctype html><title>Hand-written page</title>');
});

test('collect returns the oldest commits first in batches, and render restores the page', t => {
  const f = fixture(t);
  const shas = [1, 2, 3, 4, 5].map(n => f.commit(`Change ${n}`, `2026-11-0${n}T09:00:00+00:00`));
  const c1 = f.collect('project', ['--ref', 'main', '--start', shas[0], '--max', '2']);
  assert.equal(c1.base, shas[0]);
  assert.deepEqual(c1.commits.map(c => c.sha), shas.slice(1, 3));
  assert.equal(c1.remaining, 2); assert.equal(c1.through, shas[2]);
  f.append('project', c1, [f.entry([shas[1], shas[2]])]);
  assert.match(f.run('project', ['collect', '--kind', 'project', '--json', f.json, '--repo', f.repo, '--start', shas[0]], 2).error, /only on the first run/);
  const c2 = f.collect('project', ['--max', '2']);
  assert.deepEqual(c2.commits.map(c => c.sha), shas.slice(3));
  assert.equal(c2.remaining, 0);
  const doc = JSON.parse(f.read().json);
  assert.equal(doc.entries[0].date, '2026-11-03', 'an entry has the latest date of its commits');

  fs.rmSync(f.html);
  const r = f.run('project', ['render', '--kind', 'project', '--json', f.json, '--html', f.html]);
  assert.equal(r.total, 1);
  assert.match(fs.readFileSync(f.html, 'utf8'), /<section class="day" data-date="2026-11-03">/);
});

test('dates in other time zones keep the days in order, and control characters do not split a commit', t => {
  const f = fixture(t);
  const a = f.commit('Late in UTC', '2026-11-03T23:00:00+00:00');
  // An earlier instant than a, but a later calendar date in its own time zone.
  const b = f.commit('Early in Tokyo\n\nA body with \x1e a record separator.', '2026-11-04T01:00:00+09:00');
  const c3 = f.commit('Also late in UTC', '2026-11-03T22:00:00+00:00');
  const c = f.collect('stakeholder', ['--ref', 'main']);
  assert.deepEqual(c.commits.map(x => x.sha), [a, b, c3]);
  assert.match(c.commits[1].body, /\x1e a record separator/);
  f.append('stakeholder', c, [f.entry([a], 'Entry A'), f.entry([b], 'Entry B'), f.entry([c3], 'Entry C')]);
  const html = f.read().html;
  assert.deepEqual([...html.matchAll(/<section class="day" data-date="([^"]+)"/g)].map(m => m[1]), ['2026-11-04', '2026-11-03'], 'one section for each day, new to old');
  assert.match(html, /<input type="date" id="from" min="2026-11-03" max="2026-11-04">/);
});

test('collect refuses a reference that no longer contains the cursor', t => {
  const f = fixture(t);
  f.commit('One', '2026-11-01T09:00:00+00:00');
  const b = f.commit('Two', '2026-11-02T09:00:00+00:00');
  const c = f.collect('project', ['--ref', 'main']);
  f.append('project', c, [f.entry([b])]);
  f.git(['reset', '-q', '--hard', 'HEAD~1']);
  f.commit('Two again', '2026-11-03T09:00:00+00:00');
  const r = f.run('project', ['collect', '--kind', 'project', '--json', f.json, '--repo', f.repo], 2);
  assert.match(r.error, /does not contain the recorded cursor/);
});

test('the Claude plugin ships both skills with a plugin-root script path and the same script', () => {
  for (const kind of ['project', 'stakeholder']) {
    const dir = path.join(repoRoot, `plugins/spec100/skills/release-notes-${kind}`);
    const skill = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
    assert.match(skill, new RegExp(`^name: release-notes-${kind}$`, 'm'));
    assert.ok(skill.includes(`\`\${CLAUDE_PLUGIN_ROOT}/skills/release-notes-${kind}/scripts/release-notes.cjs\``));
    assert.deepEqual(fs.readFileSync(path.join(dir, 'scripts/release-notes.cjs')), fs.readFileSync(script(kind)));
  }
});
