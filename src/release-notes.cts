const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');
const os: typeof import('node:os') = require('node:os');
const { createHash, randomUUID }: typeof import('node:crypto') = require('node:crypto');
const { spawnSync }: typeof import('node:child_process') = require('node:child_process');
const { parseArgs }: typeof import('node:util') = require('node:util');

const SCHEMA = 1;
const GENERATOR = 'release-notes-skill/1';
const KINDS = ['project', 'stakeholder'] as const;
const TYPES = ['added', 'changed', 'fixed', 'removed', 'security'] as const;
const MAX_WORDS = 25;
const MAX_FILES = 50;
type Kind = typeof KINDS[number];
type Contributor = { name: string; email: string };
type Entry = {
  id: string; type: string; title: string; description: string; date: string; landed: string;
  commits: string[]; contributors?: string[];
};
type Doc = { schema: number; kind: Kind; title: string; source: { ref: string; cursor: string | null }; updated: string; entries: Entry[] };

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const json = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';

function git(repo: string, args: string[], allowFail = false): string {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`git ${args.join(' ')} failed: ${r.error.message}`);
  if (r.status !== 0) {
    if (allowFail) return '';
    throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || '').trim()}`);
  }
  return r.stdout;
}
function commit(repo: string, rev: string, label: string): string {
  // A value that starts with "-" can act as a Git option.
  assert(rev && !rev.startsWith('-'), `${label} must be a Git revision.`);
  const sha = git(repo, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], true).trim();
  assert(sha, `${label} "${rev}" is not a commit in ${repo}.`);
  return sha;
}
function isAncestor(repo: string, a: string, b: string): boolean {
  return spawnSync('git', ['-C', repo, 'merge-base', '--is-ancestor', a, b]).status === 0;
}
function landingCommits(repo: string, base: string | null, through: string): string[] {
  const out = git(repo, ['rev-list', '--first-parent', '--reverse', base ? `${base}..${through}` : through]);
  return out.split('\n').filter(Boolean);
}

const FIELDS = ['%H', '%cI', '%P', '%aN', '%aE', '%(trailers:key=Co-authored-by,valueonly,separator=%x1f)', '%s', '%b'];
type Info = { sha: string; landed: string; parents: string[]; author: Contributor; coauthors: Contributor[]; subject: string; body: string };
function info(repo: string, shas: string[]): Info[] {
  if (!shas.length) return [];
  // A random record mark cannot occur in a commit message. A fixed control character can.
  const mark = `--record-${randomUUID()}--`;
  const out = git(repo, ['show', '-s', '--no-walk=unsorted', `--format=${FIELDS.join('%x00')}${mark}`, ...shas]);
  const records = out.split(mark).map(s => s.replace(/^\n/, '')).filter(Boolean);
  assert(records.length === shas.length, `Git returned ${records.length} records for ${shas.length} commits.`);
  return records.map(record => {
    const [sha = '', landed = '', parents = '', name = '', email = '', trailers = '', subject = '', body = ''] = record.split('\0');
    const coauthors = trailers.split('\x1f').map(t => t.trim()).filter(Boolean).map(t => {
      const m = /^(.*?)\s*<([^>]*)>\s*$/.exec(t);
      return m ? { name: (m[1] || m[2] || '').trim(), email: (m[2] || '').trim() } : { name: t, email: '' };
    });
    return { sha, landed, parents: parents.split(' ').filter(Boolean), author: { name, email }, coauthors, subject, body: body.trim() };
  });
}
function contributors(repo: string, unit: Info): string[] {
  // The persons who did the work of a merge are the authors of the merged commits, not the person who merged.
  let sources: Info[] = [unit];
  if (unit.parents.length > 1) {
    const merged = git(repo, ['rev-list', `${unit.parents[0]}..${unit.sha}`]).split('\n').filter(s => s && s !== unit.sha);
    if (merged.length) sources = info(repo, merged).reverse();
  }
  const seen = new Map<string, string>();
  const add = (c: Contributor) => {
    const key = (c.email || c.name).toLowerCase();
    if (c.name && !seen.has(key)) seen.set(key, c.name);
  };
  for (const s of sources) { add(s.author); s.coauthors.forEach(add); }
  if (unit.parents.length > 1) unit.coauthors.forEach(add);
  return [...new Set(seen.values())];
}
function files(repo: string, unit: Info): string[] {
  const out = unit.parents[0]
    ? git(repo, ['diff', '--name-only', unit.parents[0], unit.sha])
    : git(repo, ['diff-tree', '-r', '--root', '--no-commit-id', '--name-only', unit.sha]);
  return out.split('\n').filter(Boolean);
}

function readDoc(file: string, kind: Kind): Doc | null {
  if (!fs.existsSync(file)) return null;
  let doc: any;
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error: any) { throw new Error(`${file} is not valid JSON: ${error.message}`); }
  assert(doc && doc.schema === SCHEMA, `${file} has an unknown schema. Expected schema ${SCHEMA}.`);
  assert(doc.kind === kind, `${file} contains ${doc.kind} notes, not ${kind} notes.`);
  assert(doc.source && typeof doc.source.ref === 'string' && Array.isArray(doc.entries), `${file} has no source or entries.`);
  return doc as Doc;
}
function checkHtml(file: string): void {
  if (!fs.existsSync(file)) return;
  const head = fs.readFileSync(file, 'utf8').slice(0, 4096);
  assert(head.includes(`<meta name="generator" content="${GENERATOR}">`), `${file} exists, and this script did not write it. Move it or select another --html path.`);
}
function sleep(ms: number): void { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function atomic(file: string, data: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    // Flush the data before the rename so that a power loss cannot publish an empty file.
    const fd = fs.openSync(temp, 'wx', 0o644);
    try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    for (let attempt = 0; ; attempt++) {
      try { fs.renameSync(temp, file); break; }
      catch (error: any) {
        // On Windows, an editor, indexer, or antivirus scan can hold the target briefly.
        if (process.platform !== 'win32' || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 10) throw error;
        sleep(100);
      }
    }
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function lock(jsonFile: string): () => void {
  const file = `${jsonFile}.lock`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.writeFileSync(file, json({ pid: process.pid, host: os.hostname(), started: new Date().toISOString() }), { flag: 'wx' }); }
  catch (error: any) {
    if (error.code === 'EEXIST') throw new Error(`${file} exists. Another run is active, or a run stopped. Make sure that no other run is active, then remove the lock file.`);
    throw error;
  }
  return () => fs.rmSync(file, { force: true });
}

function words(text: string): number { return (text.match(/\S+/g) || []).length; }
function checkSentences(text: string, label: string): void {
  for (const sentence of text.trim().split(/(?<=[.!?])\s+/)) {
    const count = words(sentence);
    assert(count <= MAX_WORDS, `${label} has a sentence of ${count} words. STE permits ${MAX_WORDS} words or fewer: "${sentence}"`);
  }
}
function checkText(value: unknown, label: string, max: number, singleLine: boolean): string {
  assert(typeof value === 'string' && value.trim(), `${label} must be a text that is not empty.`);
  const text = value.trim();
  assert(text.length <= max, `${label} has more than ${max} characters.`);
  assert(!singleLine || !/[\r\n]/.test(text), `${label} must be one line.`);
  checkSentences(text, label);
  return text;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const LABELS: Record<string, string> = { added: 'Added', changed: 'Changed', fixed: 'Fixed', removed: 'Removed', security: 'Security' };
function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function longDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? m} ${y}`;
}
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
function order(entries: Entry[]): Entry[] {
  // Sort by the calendar date that the page groups by first. Commits in other time zones can have a later
  // date but an earlier instant, and an instant sort would then split or invert the day sections.
  return [...entries].sort((a, b) => compare(b.date, a.date) || Date.parse(b.landed) - Date.parse(a.landed) || compare(a.id, b.id));
}
const STYLE = `
:root{--bg:#fff;--text:#1a1a1a;--muted:#737373;--line:#e8e8e8;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--text:#e8e8e8;--muted:#8f8f8f;--line:#2a2a2a;color-scheme:dark}}
*{box-sizing:border-box}[hidden]{display:none!important}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:720px;margin:0 auto;padding:56px 16px 80px}
h1{font-size:1.5rem;font-weight:600;line-height:1.25;margin:0}
.updated{color:var(--muted);font-size:.875rem;margin:4px 0 32px}
.filters{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;font-size:.875rem;color:var(--muted);padding-bottom:16px;border-bottom:1px solid var(--line)}
.filters label{display:flex;align-items:center;gap:6px}
input,select{font:inherit;color:var(--text);background:transparent;border:1px solid var(--line);border-radius:4px;padding:3px 6px}
button{font:inherit;color:var(--muted);background:none;border:0;padding:3px 0;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
button:hover{color:var(--text)}
#count{color:var(--muted);font-size:.875rem;margin:12px 0 0}
.day{display:grid;grid-template-columns:1fr;gap:4px 24px;padding:24px 0;border-bottom:1px solid var(--line)}
@media (min-width:640px){.day{grid-template-columns:132px 1fr}}
.day h2{font-size:.875rem;font-weight:400;color:var(--muted);margin:2px 0 0}
.entry+.entry{margin-top:20px}
.entry h3{font-size:1rem;font-weight:600;margin:0;overflow-wrap:anywhere}
.entry p{margin:2px 0 0;white-space:pre-line;overflow-wrap:anywhere}
.meta{display:flex;flex-wrap:wrap;margin-top:4px;font-size:.8125rem;color:var(--muted)}
.tags{display:contents;list-style:none}
.meta>*+*::before,.tags li+li::before{content:"\\00b7";margin:0 6px}
.empty{color:var(--muted);padding:24px 0}
`;
const SCRIPT = `
(function(){
var form=document.getElementById('filters'),from=document.getElementById('from'),to=document.getElementById('to'),person=document.getElementById('person');
var entries=[].slice.call(document.querySelectorAll('.entry')),days=[].slice.call(document.querySelectorAll('.day'));
function apply(){
var f=from.value,t=to.value,p=person?person.value:'',shown=0;
entries.forEach(function(e){var d=e.getAttribute('data-date');var ok=(!f||d>=f)&&(!t||d<=t)&&(!p||JSON.parse(e.getAttribute('data-people')||'[]').indexOf(p)>=0);e.hidden=!ok;if(ok)shown++;});
days.forEach(function(s){s.hidden=!s.querySelector('.entry:not([hidden])');});
document.getElementById('empty').hidden=shown>0||entries.length===0;
var count=document.getElementById('count');count.hidden=!(f||t||p);count.textContent='Changes shown: '+shown+' of '+entries.length+'.';
}
form.addEventListener('input',apply);form.addEventListener('change',apply);
form.addEventListener('reset',function(){setTimeout(apply,0);});
apply();
})();
`;
function render(doc: Doc): string {
  const entries = order(doc.entries);
  const stakeholder = doc.kind === 'stakeholder';
  const dates = entries.map(e => e.date);
  const range = dates.length ? ` min="${esc(dates[dates.length - 1] ?? '')}" max="${esc(dates[0] ?? '')}"` : '';
  const people = stakeholder ? [...new Set(entries.flatMap(e => e.contributors ?? []))].sort((a, b) => a.localeCompare(b)) : [];
  const days: string[] = [];
  let current = '';
  for (const e of entries) {
    if (e.date !== current) {
      if (current) days.push('</div></section>');
      current = e.date;
      days.push(`<section class="day" data-date="${esc(e.date)}"><h2><time datetime="${esc(e.date)}">${esc(longDate(e.date))}</time></h2><div>`);
    }
    const tags = stakeholder ? `<ul class="tags" aria-label="Contributors">${(e.contributors ?? []).map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : '';
    const meta = `<div class="meta"><span class="type">${esc(LABELS[e.type] ?? e.type)}</span>${tags}</div>`;
    const data = stakeholder ? ` data-people="${esc(JSON.stringify(e.contributors ?? []))}"` : '';
    days.push(`<article class="entry" id="change-${esc(e.id)}" data-date="${esc(e.date)}"${data}><h3>${esc(e.title)}</h3><p>${esc(e.description)}</p>${meta}</article>`);
  }
  if (current) days.push('</div></section>');
  const personFilter = stakeholder
    ? `<label>Contributor <select id="person"><option value="">All contributors</option>${people.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select></label>`
    : '';
  const updated = doc.updated.slice(0, 10);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="${GENERATOR}">
<title>${esc(doc.title)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header><h1>${esc(doc.title)}</h1><p class="updated">Updated <time datetime="${esc(updated)}">${esc(longDate(updated))}</time></p></header>
<form id="filters" class="filters" role="search" aria-label="Filter the changes">
<label>From <input type="date" id="from"${range}></label>
<label>To <input type="date" id="to"${range}></label>
${personFilter}<button type="reset">Clear filters</button>
</form>
<p id="count" aria-live="polite" hidden></p>
<main>
${days.join('\n')}
</main>
<p id="empty" class="empty"${entries.length ? ' hidden' : ''}>${entries.length ? 'No changes match the filters.' : 'The file contains no changes.'}</p>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

type Options = { [key: string]: string | boolean | undefined };
function required(values: Options, name: string): string {
  const value = values[name];
  assert(typeof value === 'string' && value, `--${name} is required.`);
  return value;
}
function kindOf(values: Options): Kind {
  const kind = required(values, 'kind');
  assert((KINDS as readonly string[]).includes(kind), `--kind must be one of: ${KINDS.join(', ')}.`);
  return kind as Kind;
}

function collect(values: Options): unknown {
  const kind = kindOf(values);
  const repo = path.resolve(typeof values.repo === 'string' ? values.repo : '.');
  const doc = readDoc(path.resolve(required(values, 'json')), kind);
  const ref = (typeof values.ref === 'string' && values.ref) || doc?.source.ref;
  assert(ref, 'No source reference is recorded. Give --ref with the branch or tag to read.');
  const refCommit = commit(repo, ref, '--ref');
  const max = typeof values.max === 'string' ? Number(values.max) : 100;
  assert(Number.isInteger(max) && max > 0 && max <= 1000, '--max must be an integer from 1 to 1000.');
  let base: string | null = doc?.source.cursor ?? null;
  if (base) {
    assert(typeof values.start !== 'string', '--start is valid only on the first run. The JSON file already records a cursor.');
    assert(git(repo, ['cat-file', '-t', base], true).trim() === 'commit', `The recorded cursor ${base} is not in this repository. Fetch the history, or check --repo.`);
    assert(isAncestor(repo, base, refCommit), `${ref} does not contain the recorded cursor ${base}. The history changed, or the reference is wrong.`);
  } else if (typeof values.start === 'string') {
    base = commit(repo, values.start, '--start');
    assert(isAncestor(repo, base, refCommit), `${ref} does not contain --start ${values.start}.`);
  }
  const all = landingCommits(repo, base, refCommit);
  const batch = all.slice(0, max);
  const commits = info(repo, batch).map(unit => {
    const changed = files(repo, unit);
    const merged = unit.parents.length > 1
      ? info(repo, git(repo, ['rev-list', '--reverse', `${unit.parents[0]}..${unit.sha}`]).split('\n').filter(s => s && s !== unit.sha)).map(m => ({ sha: m.sha, subject: m.subject }))
      : undefined;
    return {
      sha: unit.sha, landed: unit.landed, subject: unit.subject, body: unit.body,
      files: changed.slice(0, MAX_FILES), filesOmitted: Math.max(0, changed.length - MAX_FILES),
      ...(merged ? { merged } : {}),
      ...(kind === 'stakeholder' ? { contributors: contributors(repo, unit) } : {})
    };
  });
  return {
    kind, ref, refCommit, base: base ?? 'none', through: batch[batch.length - 1] ?? base ?? 'none',
    remaining: all.length - batch.length, commits
  };
}

function append(values: Options): unknown {
  const kind = kindOf(values);
  const repo = path.resolve(typeof values.repo === 'string' ? values.repo : '.');
  const jsonFile = path.resolve(required(values, 'json'));
  const htmlFile = path.resolve(required(values, 'html'));
  const draftFile = path.resolve(required(values, 'draft'));
  const baseArg = required(values, 'base');
  const throughArg = required(values, 'through');
  let draft: any;
  try { draft = JSON.parse(fs.readFileSync(draftFile, 'utf8')); }
  catch (error: any) { throw new Error(`The draft ${draftFile} is not valid JSON: ${error.message}`); }
  const release = lock(jsonFile);
  try {
    const doc = readDoc(jsonFile, kind);
    if (!doc) assert(!fs.existsSync(htmlFile), `${htmlFile} exists, but ${jsonFile} does not. A new JSON file would remove the old changes from the page. Restore the JSON file or select other paths.`);
    checkHtml(htmlFile);
    const ref = (typeof values.ref === 'string' && values.ref) || doc?.source.ref;
    assert(ref, 'No source reference is recorded. Give --ref with the branch or tag that collect read.');
    const refCommit = commit(repo, ref, '--ref');
    const cursor = doc?.source.cursor ?? null;
    const base = baseArg === 'none' ? null : commit(repo, baseArg, '--base');
    if (doc && cursor !== null) assert(base === cursor, `The JSON file changed after collect. Its cursor is ${cursor}, not ${baseArg}. Run collect again.`);
    if (doc && cursor === null) assert(base === null, `The JSON file has no cursor. Use --base none.`);
    const through = throughArg === 'none' ? null : commit(repo, throughArg, '--through');
    assert(through || base === null, '--through must be a commit when --base is a commit.');
    if (through) {
      assert(isAncestor(repo, through, refCommit), `${ref} does not contain --through ${throughArg}.`);
      assert(!base || isAncestor(repo, base, through), `--through ${throughArg} does not contain --base ${baseArg}.`);
    }
    const range = new Set(through && through !== base ? landingCommits(repo, base, through) : []);

    assert(draft && typeof draft === 'object' && !Array.isArray(draft), 'The draft must be a JSON object.');
    for (const key of Object.keys(draft)) assert(['title', 'entries'].includes(key), `The draft has an unknown key "${key}". Allowed keys: title, entries.`);
    assert(Array.isArray(draft.entries), 'The draft must have an "entries" array. It can be empty.');
    const title = draft.title === undefined ? doc?.title ?? (kind === 'project' ? 'Release notes' : 'Stakeholder release notes') : checkText(draft.title, 'The draft title', 120, true);
    const logged = new Set((doc?.entries ?? []).flatMap(e => e.commits));
    const added: Entry[] = [];
    draft.entries.forEach((raw: any, index: number) => {
      const label = `Entry ${index + 1}`;
      assert(raw && typeof raw === 'object' && !Array.isArray(raw), `${label} must be an object.`);
      for (const key of Object.keys(raw)) assert(['type', 'title', 'description', 'commits'].includes(key), `${label} has an unknown key "${key}". Allowed keys: type, title, description, commits.`);
      assert((TYPES as readonly string[]).includes(raw.type), `${label} type must be one of: ${TYPES.join(', ')}.`);
      const entryTitle = checkText(raw.title, `${label} title`, 160, true);
      const description = checkText(raw.description, `${label} description`, 2000, false);
      assert(Array.isArray(raw.commits) && raw.commits.length, `${label} must list one or more commits.`);
      const commits: string[] = [];
      for (const sha of raw.commits) {
        assert(typeof sha === 'string' && /^([0-9a-f]{40}|[0-9a-f]{64})$/.test(sha), `${label} commit "${sha}" must be a full SHA from collect.`);
        assert(range.has(sha), `${label} commit ${sha} is not a new commit in the range ${baseArg}..${throughArg}.`);
        assert(!logged.has(sha), `${label} commit ${sha} is already in an entry.`);
        logged.add(sha); commits.push(sha);
      }
      const units = info(repo, commits);
      const landed = units.map(u => u.landed).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? '';
      const entry: Entry = {
        id: createHash('sha256').update([...commits].sort().join('\n')).digest('hex').slice(0, 12),
        type: raw.type, title: entryTitle, description, date: landed.slice(0, 10), landed, commits
      };
      if (kind === 'stakeholder') entry.contributors = [...new Set(units.flatMap(u => contributors(repo, u)))];
      added.push(entry);
    });
    const next: Doc = {
      schema: SCHEMA, kind, title, source: { ref, cursor: through ?? cursor },
      updated: new Date().toISOString(), entries: order([...(doc?.entries ?? []), ...added])
    };
    // The JSON file is the source of truth. If the process stops before the HTML rename, render corrects the page.
    atomic(jsonFile, json(next));
    try { atomic(htmlFile, render(next)); }
    catch (error: any) {
      throw new Error(`The script added the entries to ${jsonFile}, but the HTML write failed: ${error.message} Do not run append again. Correct the cause, then run render.`);
    }
    return { added: added.length, total: next.entries.length, cursor: next.source.cursor, json: jsonFile, html: htmlFile };
  } finally { release(); }
}

function renderCommand(values: Options): unknown {
  const kind = kindOf(values);
  const jsonFile = path.resolve(required(values, 'json'));
  const htmlFile = path.resolve(required(values, 'html'));
  const release = lock(jsonFile);
  try {
    const doc = readDoc(jsonFile, kind);
    assert(doc, `${jsonFile} does not exist.`);
    checkHtml(htmlFile);
    atomic(htmlFile, render(doc));
    return { total: doc.entries.length, html: htmlFile };
  } finally { release(); }
}

const USAGE = `Usage:
  release-notes.cjs collect --kind <project|stakeholder> --json <file> [--repo <dir>] [--ref <ref>] [--start <rev>] [--max <n>]
  release-notes.cjs append  --kind <project|stakeholder> --json <file> --html <file> --draft <file> --base <sha|none> --through <sha|none> [--repo <dir>] [--ref <ref>]
  release-notes.cjs render  --kind <project|stakeholder> --json <file> --html <file>`;
function main(argv: string[] = process.argv.slice(2)): void {
  const [command, ...rest] = argv;
  try {
    const { values } = parseArgs({
      args: rest, strict: true,
      options: Object.fromEntries(['kind', 'json', 'html', 'draft', 'repo', 'ref', 'start', 'max', 'base', 'through'].map(name => [name, { type: 'string' as const }]))
    });
    let result: unknown;
    if (command === 'collect') result = collect(values);
    else if (command === 'append') result = append(values);
    else if (command === 'render') result = renderCommand(values);
    else throw new Error(USAGE);
    process.stdout.write(json(result));
  } catch (error: any) {
    process.stderr.write(json({ error: error.message }));
    process.exitCode = 2;
  }
}
module.exports = { main };
if (require.main === module) main();
