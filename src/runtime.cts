const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');
const { createHash, randomUUID }: typeof import('node:crypto') = require('node:crypto');

const VERSION = '1.0.0';
const BEGIN = '<!-- spec100:begin -->';
const END = '<!-- spec100:end -->';
const INDEX = 'harness/project-index.md';
const LEARNINGS_WARN_CHARS = 30000;
const JOURNAL = '.spec100-install.json';
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function text(value: unknown, label: string): string {
  assert(typeof value === 'string' && value.trim().length > 0, `${label} must be a nonempty string`);
  return value;
}
function slug(value: string): string {
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80, `Invalid topic/name: ${value}. Use lowercase letters, numbers, and hyphens.`);
  return value;
}
function exists(file: string): boolean {
  try { fs.lstatSync(file); return true; } catch (e: any) { if (e.code === 'ENOENT') return false; throw e; }
}
function safe(root: string, relative: string): string {
  assert(relative && !path.isAbsolute(relative) && !relative.includes('\\') && !relative.split('/').includes('..'), `Unsafe relative path: ${relative}`);
  const target = path.resolve(root, relative);
  assert(target.startsWith(root + path.sep), `Path escapes project: ${relative}`);
  let cursor = root;
  for (const segment of relative.split('/').filter(Boolean)) {
    cursor = path.join(cursor, segment);
    assert(!exists(cursor) || !fs.lstatSync(cursor).isSymbolicLink(), `Symlink is not a writable harness path: ${relative}`);
  }
  return target;
}
function readJSON(file: string): any { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function json(value: unknown): string { return JSON.stringify(value, null, 2) + '\n'; }
function digest(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function atomic(file: string, data: string | Buffer, mode?: number): void {
  mode ??= exists(file) && !fs.lstatSync(file).isSymbolicLink() ? fs.statSync(file).mode & 0o777 : 0o644;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temp, data, { mode, flag: 'wx' }); fs.renameSync(temp, file); }
  finally { if (exists(temp)) fs.unlinkSync(temp); }
}
type Entry = { path: string; content?: string; link?: string };
type Snapshot = { path: string; content?: string; link?: string; mode?: number; absent?: boolean };
function snapshot(root: string, relative: string): Snapshot {
  const file = path.join(root, relative);
  if (!exists(file)) return { path: relative, absent: true };
  const st = fs.lstatSync(file);
  assert(!st.isDirectory(), `Expected file, found directory: ${relative}`);
  return st.isSymbolicLink() ? { path: relative, link: fs.readlinkSync(file) } : { path: relative, content: fs.readFileSync(file).toString('base64'), mode: st.mode & 0o777 };
}
function recover(root: string): void {
  const journal = safe(root, JOURNAL);
  assert(exists(journal), 'No interrupted installation to recover');
  const data = readJSON(journal);
  assert(data.version === 1 && Array.isArray(data.snapshots) && Array.isArray(data.directories), 'Invalid installation recovery journal');
  for (const s of [...data.snapshots].reverse() as Snapshot[]) {
    // Validate parents while allowing replacement of a snapshotted symlink itself.
    safe(root, path.posix.dirname(s.path) === '.' ? s.path + '.validation' : path.posix.dirname(s.path));
    assert(!path.isAbsolute(s.path) && !s.path.split('/').includes('..'), 'Unsafe journal path');
    const file = path.join(root, s.path);
    if (exists(file)) { assert(!fs.lstatSync(file).isDirectory(), `Recovery blocked by directory: ${s.path}`); fs.unlinkSync(file); }
    if (!s.absent) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (s.link !== undefined) fs.symlinkSync(s.link, file);
      else atomic(file, Buffer.from(s.content!, 'base64'), s.mode);
    }
  }
  for (const dir of [...data.directories].reverse()) {
    const target = safe(root, dir);
    if (exists(target) && fs.readdirSync(target).length === 0) fs.rmdirSync(target);
  }
  fs.unlinkSync(journal);
}
function transaction(root: string, entries: Entry[], directories: string[] = []): void {
  const journal = safe(root, JOURNAL);
  assert(!exists(journal), 'Interrupted setup detected. Run setup recovery before continuing.');
  const needed = new Set<string>();
  for (const entry of entries) {
    safe(root, path.posix.dirname(entry.path) === '.' ? entry.path + '.validation' : path.posix.dirname(entry.path));
    assert(!path.isAbsolute(entry.path) && !entry.path.split('/').includes('..'), 'Unsafe transaction path');
    let dir = path.posix.dirname(entry.path);
    while (dir !== '.') { needed.add(dir); dir = path.posix.dirname(dir); }
  }
  for (const dir of directories) { safe(root, dir); needed.add(dir); }
  const missing = [...needed].sort((a, b) => a.split('/').length - b.split('/').length).filter(dir => !exists(path.join(root, dir)));
  const snapshots = entries.map(entry => snapshot(root, entry.path));
  atomic(journal, json({ version: 1, snapshots, directories: missing }), 0o600);
  try {
    for (const dir of missing) fs.mkdirSync(safe(root, dir), { recursive: true });
    for (const entry of entries) {
      const file = path.join(root, entry.path);
      if (entry.link !== undefined) {
        if (exists(file)) fs.unlinkSync(file);
        fs.symlinkSync(entry.link, file);
      } else atomic(file, entry.content!);
    }
    fs.unlinkSync(journal);
  } catch (error) {
    recover(root);
    throw error;
  }
}

const { spawnSync }: typeof import('node:child_process') = require('node:child_process');
const os: typeof import('node:os') = require('node:os');
const { parseArgs }: typeof import('node:util') = require('node:util');
const SKILLS = ['research', 'plan', 'iterate', 'implement'] as const;
const ROLES = ['implementer', 'code-reviewer', 'security-reviewer', 'verifier', 'risk-classifier'] as const;
const EXCLUDED = new Set(['.git', 'node_modules', 'vendor', '.cache', 'dist', 'build', 'coverage', '.venv', 'venv', '__pycache__', 'target', '.next', '.nuxt', '.spec100-install.json']);
const SECRET = /(?:^|\/)(?:\.env(?:\..*)?|credentials(?:\..*)?|.*\.(?:pem|key|p12))$/i;
type Manifest = { version: string; software: boolean; agents: string[]; owned: string[]; links: Record<string, string> };
type Draft = { software: boolean; context: { domain: string; problem: string; audience: string; architecture: string; tooling: string; verification: string; sources: string[]; uncertainties: string }; agents: Record<string, string> };
function git(args: string[], root: string, gitdir?: string): string {
  const result = spawnSync('git', [...(gitdir ? ['--git-dir', gitdir, '--work-tree', root] : ['-C', root]), ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert(result.status === 0, `Git inspection failed: ${result.error?.message || result.stderr?.trim()}. Install Git and retry.`);
  return result.stdout;
}
function inventory(root: string): string[] {
  const probe = spawnSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  let temporary: string | undefined;
  if (probe.status !== 0) {
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'spec100-scan-'));
    git(['init', '--bare', '--quiet', temporary], root);
  }
  try {
    const names = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], root, temporary).split('\0').filter(Boolean);
    const result = new Set<string>();
    for (const name of names) {
      if (name.split('/').some(part => EXCLUDED.has(part)) || !exists(path.join(root, name))) continue;
      result.add(name);
      let parent = path.posix.dirname(name);
      while (parent !== '.') { result.add(parent + '/'); parent = path.posix.dirname(parent); }
    }
    const forced = (name: string) => name === 'CLAUDE.md' || name === 'harness' || name.startsWith('harness/') || name === '.claude/settings.json' || /^\.claude\/(?:agents\/spec100-[^/]+\.md|skills\/spec100-[^/]+(?:\/SKILL\.md)?)$/.test(name);
    const container = (name: string) => ['.claude', '.claude/agents', '.claude/skills'].includes(name);
    // Git enumerates files; retain empty folders and installed harness assets even if ignored.
    const walk = (relative = '') => {
      for (const item of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
        if (EXCLUDED.has(item.name)) continue;
        const name = relative + item.name;
        if (!item.isDirectory()) { if (forced(name)) result.add(name); continue; }
        if (!result.has(name + '/')) {
          const ignored = spawnSync('git', [...(temporary ? ['--git-dir', temporary, '--work-tree', root] : ['-C', root]), 'check-ignore', '-q', '--', name + '/'], { encoding: 'utf8' });
          assert(ignored.status === 0 || ignored.status === 1, 'Could not inspect directory ignore rules');
          if (ignored.status === 0 && !forced(name) && !container(name)) continue;
        }
        result.add(name + '/');
        walk(name + '/');
      }
    };
    walk();
    // A tracked gitlink or symbolic link is a leaf, never a traversable folder.
    return [...result].filter(name => {
      const parts = name.replace(/\/$/, '').split('/');
      return !parts.slice(0, -1).some((_, i) => fs.lstatSync(path.join(root, ...parts.slice(0, i + 1))).isSymbolicLink());
    }).sort();
  } finally { if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); }
}
function installed(root: string): Manifest {
  const file = safe(root, 'harness/.runtime/manifest.json');
  assert(exists(file), 'Project is not initialized. Run /spec100:setup in Claude Code.');
  const manifest = readJSON(file);
  assert(manifest.version === VERSION && typeof manifest.software === 'boolean' && Array.isArray(manifest.owned) && Array.isArray(manifest.agents) && manifest.links && typeof manifest.links === 'object', 'Unsupported or malformed harness manifest');
  return manifest;
}
function validateDraft(root: string, draft: any): asserts draft is Draft {
  assert(draft && typeof draft.software === 'boolean' && draft.context && draft.agents, 'Draft needs software, context, and agents');
  for (const field of ['domain', 'problem', 'audience', 'architecture', 'tooling', 'verification', 'uncertainties']) text(draft.context[field], `context.${field}`);
  assert(Array.isArray(draft.context.sources) && draft.context.sources.length <= 64, 'context.sources must contain at most 64 repository paths');
  for (const source of draft.context.sources) {
    const file = safe(root, text(source, 'source'));
    assert(exists(file) && fs.statSync(file).isFile() && !SECRET.test(source), `Invalid context evidence: ${source}`);
  }
  const required = draft.software ? ROLES : ['implementer'];
  for (const role of required) text(draft.agents[role], `agents.${role}`);
  for (const role of Object.keys(draft.agents)) assert((ROLES as readonly string[]).includes(role), `Unknown agent role: ${role}`);
}
function prepare(root: string) {
  const files = inventory(root);
  let remaining = 80000;
  const evidence: { path: string; excerpt: string }[] = [];
  for (const name of files.filter(name => /(?:^|\/)(?:readme[^/]*|package\.json|pyproject\.toml|Cargo\.toml|go\.mod|.*\.ya?ml)$/i.test(name)).slice(0, 30)) {
    const file = path.join(root, name);
    if (SECRET.test(name) || fs.lstatSync(file).isSymbolicLink() || !fs.statSync(file).isFile() || remaining <= 0) continue;
    const fd = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(Math.min(6000, remaining));
    let bytes: number;
    try { bytes = fs.readSync(fd, buffer, 0, buffer.length, 0); } finally { fs.closeSync(fd); }
    const excerpt = buffer.subarray(0, bytes).toString('utf8');
    if (!excerpt.includes('\0')) { evidence.push({ path: name, excerpt }); remaining -= bytes; }
  }
  return { root, files, evidence, draftSchema: {
    software: 'boolean',
    context: { domain: 'string', problem: 'string', audience: 'string', architecture: 'string', tooling: 'string', verification: 'commands or explicit unknown', sources: ['repository-relative evidence paths'], uncertainties: 'string; explicitly state unknowns' },
    agents: Object.fromEntries(ROLES.map(role => [role, 'project-specific instructions; all five roles required for software']))
  } };
}
function indexFile(files: string[]): string {
  const links = files.map(name => {
    const escaped = name.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
    return `- [\`${escaped}\`](<${name.split('/').map(encodeURIComponent).join('/')}>)`;
  }).join('\n');
  return `# Project index\n\n${links}\n`;
}
// The index grows with the project, so CLAUDE.md lists only top-level folders and links to the index without importing it.
function managedSection(files: string[], agentsImport: boolean): string {
  const folders = files.filter(name => /^[^/]+\/$/.test(name)).sort().map(name => `- \`${name}\``).join('\n');
  return `${BEGIN}\n# SPEC-100 agent harness\n${agentsImport ? '\n@AGENTS.md\n' : ''}\n@harness/project-context.md\n@harness/learnings.md\n@harness/rules/STE-100.md\n@harness/rules/YAGNI-KISS.md\n@harness/rules/atomic-operations.md\n\nUse /spec100:research, /spec100:plan, /spec100:iterate, /spec100:implement, and /spec100:check.\nCanonical skills: harness/skills/. Topic artifacts: harness/thoughts/.\n\n## Project layout\n\nFind project files in ${INDEX} before you search. Claude Code does not import that file; read it on demand.\n\nTop-level folders:\n${folders}\n${END}`;
}
function withSection(previous: string, section: string): string {
  const start = previous.indexOf(BEGIN), end = previous.indexOf(END);
  assert((start === -1) === (end === -1) && (start === -1 || end > start), 'Malformed SPEC-100 root section');
  if (start === -1) return previous + (previous && !previous.endsWith('\n') ? '\n' : '') + '\n' + section + '\n';
  assert(previous.indexOf(BEGIN, start + BEGIN.length) === -1 && previous.indexOf(END, end + END.length) === -1, 'Duplicate SPEC-100 root sections');
  return previous.slice(0, start) + section + previous.slice(end + END.length);
}
function refreshIndex(root: string): void {
  installed(root);
  const files = inventory(root);
  const index = safe(root, INDEX), nextIndex = indexFile(files);
  const indexChanged = !exists(index) || fs.readFileSync(index, 'utf8') !== nextIndex;
  const file = safe(root, 'CLAUDE.md');
  const current = fs.readFileSync(file, 'utf8');
  const next = withSection(current, managedSection(files, exists(path.join(root, 'AGENTS.md'))));
  // The journal restores both files if a write stops between them; index-only updates need one atomic write.
  if (current !== next) transaction(root, [...(indexChanged ? [{ path: INDEX, content: nextIndex }] : []), { path: 'CLAUDE.md', content: next }]);
  else if (indexChanged) atomic(index, nextIndex);
}
function projectContext(draft: Draft): string {
  return '# Project context\n\n' + Object.entries(draft.context).map(([key, value]) => `## ${key[0]!.toUpperCase() + key.slice(1)}\n\n${Array.isArray(value) ? value.map(item => '- ' + item).join('\n') || 'No project evidence yet; context is unknown.' : value}\n`).join('\n');
}
function agent(role: string, prompt: string, context: string): string {
  return `---\nname: spec100-${role}\ndescription: ${JSON.stringify(`Project-specific ${role} for ${context.replace(/\n/g, ' ').slice(0, 150)}`)}\ntools: ${role === 'implementer' ? 'Read, Glob, Grep, Bash, Write, Edit' : 'Read, Glob, Grep'}\n---\n\n# ${role}\n\n${prompt}\n\nRead harness/project-context.md, harness/learnings.md, and all harness/rules/ files.\nBefore executing, return five concise operational checkpoints: destination, reason, cost, next action, environment. Do not expose private reasoning. The parent records these in topic evidence.\n${role !== 'implementer' ? 'Remain read-only. Return findings/votes and checkpoints to the parent; do not edit files or delegate.' : 'Work only within the plan and assigned files. Do not create worktrees unless explicitly requested. Ask the parent before any high-risk action.'}\n`;
}
function pluginTemplates(): string {
  const dir = path.resolve(__dirname, '../templates');
  assert(exists(dir), 'Setup templates unavailable. Run setup through the installed SPEC-100 plugin.');
  return dir;
}
function hookDefinitions(): Record<string, any[]> {
  const command = 'node "${CLAUDE_PROJECT_DIR}/harness/.runtime/spec100.cjs" hook --event ';
  return Object.fromEntries(['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop'].map(event => [event, [{ ...(event === 'PreToolUse' ? { matcher: 'Bash|Write|Edit' } : event === 'PostToolUse' ? { matcher: 'Write|Edit|Bash' } : {}), hooks: [{ type: 'command', command: command + event, timeout: 15 }] }]]));
}
function settings(root: string): any {
  const file = safe(root, '.claude/settings.json');
  const result = exists(file) ? readJSON(file) : {};
  assert(result && typeof result === 'object' && !Array.isArray(result), 'Claude settings must be a JSON object');
  result.hooks ??= {};
  assert(typeof result.hooks === 'object' && !Array.isArray(result.hooks), 'Claude hooks must be an object');
  for (const [event, definitions] of Object.entries(hookDefinitions())) {
    const existing = result.hooks[event] ?? [];
    assert(Array.isArray(existing), `Claude hooks.${event} must be an array`);
    result.hooks[event] = [...existing.filter((item: any) => !isHarnessHook(item)), ...definitions];
  }
  return result;
}
function isHarnessHook(item: any): boolean {
  return Array.isArray(item?.hooks) && item.hooks.length === 1 && typeof item.hooks[0]?.command === 'string' && /^node "\$\{CLAUDE_PROJECT_DIR\}\/harness\/\.runtime\/spec100\.cjs" hook --event (SessionStart|PreToolUse|PostToolUse|Stop)$/.test(item.hooks[0].command);
}
function setup(root: string, draft: any, dryRun = false): any {
  assert(!exists(safe(root, JOURNAL)), 'Interrupted installation detected. Run runtime recover first.');
  validateDraft(root, draft);
  const old = exists(safe(root, 'harness/.runtime/manifest.json')) ? installed(root) : undefined;
  if (old) assert(old.software === draft.software, 'Project type changed; preserve the existing harness and migrate explicitly.');
  const templates = pluginTemplates();
  const entries: Entry[] = [];
  const owned = new Set(old?.owned ?? []);
  const links: Record<string, string> = { ...old?.links };
  const put = (relative: string, content: string, preserve = false) => {
    const file = safe(root, relative);
    if (exists(file)) {
      assert(old?.owned.includes(relative) || relative === 'CLAUDE.md' || relative === INDEX || relative === '.claude/settings.json', `Unmanaged file collision: ${relative}`);
      if (preserve) return;
    }
    entries.push({ path: relative, content }); owned.add(relative);
  };
  put('harness/project-context.md', projectContext(draft), true);
  put('harness/learnings.md', '# Operational learnings\n\nAppend entries through the harness runtime. Preserve all previous entries.\n', true);
  for (const rule of ['STE-100', 'YAGNI-KISS', 'atomic-operations']) put(`harness/rules/${rule}.md`, fs.readFileSync(path.join(templates, 'rules', rule + '.md'), 'utf8'), true);
  const roles = draft.software ? [...ROLES] : ['implementer'];
  for (const role of roles) put(`harness/subagents/spec100-${role}.md`, agent(role, draft.agents[role]!, draft.context.domain), true);
  const link = (relative: string, canonical: string) => {
    safe(root, path.posix.dirname(relative));
    const target = path.posix.relative(path.posix.dirname(relative), canonical);
    const file = path.join(root, relative);
    if (exists(file)) assert(old?.links[relative] === target && fs.lstatSync(file).isSymbolicLink() && fs.readlinkSync(file) === target, `Unmanaged or modified link collision: ${relative}`);
    links[relative] = target;
    entries.push({ path: relative, link: target });
  };
  for (const role of roles) link(`.claude/agents/spec100-${role}.md`, `harness/subagents/spec100-${role}.md`);
  for (const skill of SKILLS) {
    put(`harness/skills/${skill}.md`, fs.readFileSync(path.join(templates, 'skills', skill + '.md'), 'utf8'), true);
    link(`.claude/skills/spec100-${skill}/SKILL.md`, `harness/skills/${skill}.md`);
  }
  put('harness/.runtime/spec100.cjs', fs.readFileSync(__filename, 'utf8'));
  put('harness/.runtime/protocol.md', fs.readFileSync(path.join(templates, 'protocol.md'), 'utf8'));
  put('harness/.runtime/learnings-prefix.json', json({ content: exists(safe(root, 'harness/learnings.md')) ? fs.readFileSync(safe(root, 'harness/learnings.md'), 'utf8') : entries.find(e => e.path === 'harness/learnings.md')!.content }), true);
  put('.claude/settings.json', json(settings(root)));
  const manifest: Manifest = { version: VERSION, software: draft.software, agents: roles, owned: [...owned, 'harness/.runtime/manifest.json', 'CLAUDE.md', INDEX].filter((v, i, a) => a.indexOf(v) === i).sort(), links };
  put('harness/.runtime/manifest.json', json(manifest));
  const files = new Set(inventory(root));
  for (const entry of [...entries, { path: 'CLAUDE.md' }, { path: INDEX }, { path: 'harness/thoughts/' }]) {
    files.add(entry.path);
    let parent = path.posix.dirname(entry.path.replace(/\/$/, ''));
    while (parent !== '.') { files.add(parent + '/'); parent = path.posix.dirname(parent); }
  }
  const rootFile = safe(root, 'CLAUDE.md');
  put(INDEX, indexFile([...files].sort()));
  put('CLAUDE.md', withSection(exists(rootFile) ? fs.readFileSync(rootFile, 'utf8') : '', managedSection([...files].sort(), exists(path.join(root, 'AGENTS.md')))));
  if (!dryRun) { transaction(root, entries, ['harness/thoughts']); refreshIndex(root); }
  return { version: VERSION, dryRun, files: entries.map(e => e.path), commands: ['setup', 'check', ...SKILLS].map(name => '/spec100:' + name) };
}

type Finding = { id: string; description: string; severity: string; votes: { verifier: string; verdict: 'confirm' | 'dismiss'; reason: string }[] };
type Review = { fingerprint: string; planHash: string; reviewers: { id: string; role: string; findings: Finding[] }[]; at: string };
type Evidence = { fingerprint: string; planHash: string; at: string; data: any };
type Run = { version: 1; topic: string; plan: string; planHash: string; baseline: Record<string, string>; rounds: Review[]; evidence: Record<string, Evidence>; started: string; status: 'active' | 'complete' | 'blocked'; session?: string; completion?: { at: string; fingerprint: string; planHash: string; evidenceHash: string } };
const HIGH_RISK_PATH = /(?:^|\/)(?:auth(?:entication|orization)?|security|migrations?|production|prod|terraform|infra(?:structure)?)(?:[/.\-_]|$)|(?:^|\/)\.github\/workflows\//i;
// One CLI invocation sees a single code state; its own writes affect excluded evidence/index files.
const snapshotCache = new Map<string, Record<string, string>>();
function projectSnapshot(root: string): Record<string, string> {
  if (snapshotCache.has(root)) return snapshotCache.get(root)!;
  const snapshot: Record<string, string> = {};
  for (const name of inventory(root)) {
    if (name.endsWith('/') || name.startsWith('harness/thoughts/') || name === INDEX || name === 'harness/learnings.md' || name === 'harness/.runtime/learnings-prefix.json') continue;
    const file = path.join(root, name), st = fs.lstatSync(file);
    if (st.isSymbolicLink()) snapshot[name] = digest('link:' + fs.readlinkSync(file));
    else if (st.isFile()) {
      let value: string | Buffer = fs.readFileSync(file);
      if (name === 'CLAUDE.md') value = value.toString('utf8').replace(/<!-- spec100:begin -->[\s\S]*?<!-- spec100:end -->\n?/, '');
      snapshot[name] = digest(Buffer.concat([Buffer.from(`file:${st.mode & 0o100}:`), typeof value === 'string' ? Buffer.from(value) : value]));
    }
  }
  snapshotCache.set(root, snapshot);
  return snapshot;
}
function fingerprint(root: string): string { return digest(JSON.stringify(projectSnapshot(root))); }
function runPath(root: string, topic: string): string { return safe(root, `harness/thoughts/${slug(topic)}/run.json`); }
function loadRun(root: string, topic: string): Run {
  installed(root);
  const file = runPath(root, topic);
  assert(exists(file), `No implementation run for ${topic}`);
  const run = readJSON(file);
  assert(run.version === 1 && run.topic === topic && Array.isArray(run.rounds) && run.evidence && run.baseline && typeof run.plan === 'string', 'Malformed workflow record');
  safe(root, run.plan);
  return run;
}
function saveRun(root: string, run: Run): void { atomic(runPath(root, run.topic), json(run)); refreshIndex(root); }
function planHash(root: string, run: Run): string { return digest(fs.readFileSync(safe(root, run.plan))); }
function current(root: string, run: Run, evidence: { fingerprint: string; planHash: string } | undefined): boolean {
  return !!evidence && evidence.fingerprint === fingerprint(root) && evidence.planHash === planHash(root, run);
}
function changedFiles(root: string, run: Run): string[] {
  const now = projectSnapshot(root);
  return [...new Set([...Object.keys(now), ...Object.keys(run.baseline)])].filter(name => now[name] !== run.baseline[name]).sort();
}
function riskLevel(root: string, run: Run): 'low' | 'medium' | 'high' {
  if (changedFiles(root, run).some(name => HIGH_RISK_PATH.test(name))) return 'high';
  const assessment = run.evidence.risk;
  if (!assessment || assessment.planHash !== planHash(root, run)) return 'high';
  // A high assessment stays high. A lower assessment must cover the exact changes.
  if (assessment.data.level === 'high') return 'high';
  return current(root, run, assessment) ? assessment.data.level : 'high';
}
function runChecks(root: string, run: Run): { id: string; ok: boolean; remediation: string }[] {
  const manifest = installed(root);
  const checks: { id: string; ok: boolean; remediation: string }[] = [];
  const add = (id: string, ok: boolean, remediation: string) => checks.push({ id, ok, remediation: ok ? '' : remediation });
  add('workflow.plan', planHash(root, run) === run.planHash, 'Plan changed; obtain approval for the revised plan and refresh affected evidence.');
  const risk = run.evidence.risk;
  add('workflow.risk', current(root, run, risk), 'Record a risk assessment against the current changes.');
  const approval = run.evidence.approval;
  add('workflow.approval', riskLevel(root, run) !== 'high' || current(root, run, approval), 'Obtain explicit human approval inside Claude Code for these high-risk changes.');
  const points = run.evidence.checkpoints;
  const participantIds = new Set(run.rounds.flatMap(round => round.reviewers.flatMap(reviewer => [reviewer.id, ...reviewer.findings.flatMap(finding => finding.votes.map(vote => vote.verifier))])));
  const loggedIds = new Set(points?.data.agents.map((agent: any) => agent.id) ?? []);
  add('workflow.checkpoints', !!points && points.planHash === planHash(root, run) && [...participantIds].every(id => loggedIds.has(id)), 'Record five operational checkpoints for each participating agent, including all reviewers and verifiers.');
  if (manifest.software) {
    add('workflow.preflight', !!run.evidence.preflight && run.evidence.preflight.fingerprint === digest(JSON.stringify(run.baseline)) && run.evidence.preflight.data.passed === true, 'Record successful pre-implementation baseline verification.');
    add('workflow.verification', current(root, run, run.evidence.verification) && run.evidence.verification!.data.passed === true, 'Run verification commands and record successful results for the current changes.');
    const last = run.rounds.at(-1);
    const clean = !!last && last.reviewers.every(reviewer => reviewer.findings.every(finding => finding.votes.length === 2 && finding.votes.every(vote => vote.verdict === 'dismiss')));
    add('workflow.review', run.rounds.length > 0 && run.rounds.length <= 3 && current(root, run, last) && clean, run.rounds.length >= 3 ? 'Review cap reached; provide a blocked handoff for unresolved findings.' : 'Complete independent code/security review and resolve or unanimously dismiss all findings.');
    const uat = run.evidence.uat;
    let validUat = current(root, run, uat);
    if (validUat && uat!.data.applicable) validUat = uat!.data.screenshots.every((image: any) => {
      try { return digest(fs.readFileSync(safe(root, image.path))) === image.hash; } catch { return false; }
    });
    add('workflow.uat', validUat, 'Record applicable UAT with screenshot attachments, or an explicit reason it is inapplicable.');
    add('workflow.rollback', current(root, run, run.evidence.rollback), 'Record detection signals and concrete rollback steps.');
  }
  return checks;
}
function workflowStart(root: string, topic: string, plan?: string, session?: string): any {
  installed(root);
  const location = runPath(root, topic);
  assert(!exists(location), 'A run already exists for this topic. Resume it; do not reset the review cap.');
  const candidates = inventory(root).filter(name => name.startsWith(`harness/thoughts/${topic}/plan_`) && name.endsWith('.md'));
  if (!plan) { assert(candidates.length === 1, 'Specify exactly one plan with --plan; no unique plan was found.'); plan = candidates[0]!; }
  assert(plan.startsWith(`harness/thoughts/${topic}/plan_`) && plan.endsWith('.md'), 'Plan must be a plan artifact in this topic');
  text(fs.readFileSync(safe(root, plan), 'utf8'), 'plan');
  const run: Run = { version: 1, topic, plan, planHash: digest(fs.readFileSync(safe(root, plan))), baseline: projectSnapshot(root), rounds: [], evidence: {}, started: new Date().toISOString(), status: 'active', ...(session ? { session } : {}) };
  saveRun(root, run);
  return run;
}
function validateReview(data: any): void {
  assert(Array.isArray(data.reviewers) && data.reviewers.length === 2, 'A review needs exactly two independent reviewers');
  assert(new Set(data.reviewers.map((r: any) => text(r.id, 'reviewer id'))).size === 2, 'Reviewer identities must be distinct');
  assert(data.reviewers.some((r: any) => r.role === 'code-reviewer') && data.reviewers.some((r: any) => r.role === 'security-reviewer'), 'Both code and security reviews are required');
  const ids = new Set<string>();
  for (const reviewer of data.reviewers) {
    assert(Array.isArray(reviewer.findings), 'reviewer.findings must be an array');
    for (const finding of reviewer.findings) {
      text(finding.id, 'finding id'); text(finding.description, 'finding description');
      assert(['low', 'medium', 'high', 'critical'].includes(finding.severity), 'Invalid finding severity');
      assert(!ids.has(finding.id), 'Finding IDs must be unique within the round'); ids.add(finding.id);
      assert(Array.isArray(finding.votes) && finding.votes.length === 2, 'Every finding requires two verifier votes');
      const verifiers = new Set<string>();
      for (const vote of finding.votes) {
        text(vote.verifier, 'verifier identity'); text(vote.reason, 'vote reason');
        assert(!data.reviewers.some((r: any) => r.id === vote.verifier), 'Verifiers must be independent of reviewers');
        assert(!verifiers.has(vote.verifier), 'Verifier identities must be distinct'); verifiers.add(vote.verifier);
        assert(['confirm', 'dismiss'].includes(vote.verdict), 'Vote must confirm or dismiss');
      }
    }
  }
}
function record(root: string, topic: string, kind: string, data: any): Run {
  const run = loadRun(root, topic);
  assert(run.status !== 'blocked', 'Run is blocked; the three-round review cap cannot be reset.');
  assert(data && typeof data === 'object' && !Array.isArray(data), 'Evidence must be a JSON object');
  if (kind === 'risk') {
    assert(['low', 'medium', 'high'].includes(data.level), 'Risk must be low, medium, or high');
    text(data.reason, 'risk reason');
    assert(data.level === 'high' || !changedFiles(root, run).some(name => HIGH_RISK_PATH.test(name)), 'Deterministic high-risk paths cannot be downgraded');
  } else if (kind === 'preflight' || kind === 'verification') {
    assert(typeof data.passed === 'boolean' && Array.isArray(data.commands) && data.commands.length > 0, 'Verification needs passed and commands');
    for (const command of data.commands) { text(command.command, 'command'); text(command.output, 'command output'); assert(Number.isInteger(command.exitCode), 'Command requires an exitCode'); }
    assert(!data.passed || data.commands.every((cmd: any) => cmd.exitCode === 0), 'Failed commands cannot be recorded as passing');
    if (kind === 'preflight') assert(run.rounds.length === 0 && changedFiles(root, run).length === 0, 'Preflight must precede implementation changes and reviews');
  } else if (kind === 'review') {
    assert(run.rounds.length < 3, 'Maximum of three review rounds reached');
    validateReview(data);
    run.rounds.push({ fingerprint: fingerprint(root), planHash: planHash(root, run), at: new Date().toISOString(), reviewers: data.reviewers });
    if (run.rounds.length === 3 && data.reviewers.some((r: any) => r.findings.some((f: any) => f.votes.some((v: any) => v.verdict !== 'dismiss')))) run.status = 'blocked';
  } else if (kind === 'uat') {
    assert(typeof data.applicable === 'boolean', 'UAT needs applicable: true or false');
    if (!data.applicable) text(data.reason, 'explicit UAT inapplicability reason');
    else {
      text(data.scenario, 'UAT scenario'); assert(data.passed === true, 'UAT must pass');
      assert(Array.isArray(data.screenshots) && data.screenshots.length > 0, 'Applicable UAT requires screenshots');
      data = { ...data, screenshots: data.screenshots.map((name: string) => {
        text(name, 'screenshot path');
        assert(name.startsWith(`harness/thoughts/${topic}/`), 'Screenshot must be stored in this topic');
        const bytes = fs.readFileSync(safe(root, name));
        assert((bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.length > 24) || (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.length > 20) || (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.length > 20), 'Screenshot must be a nonempty PNG, JPEG, or WebP image');
        return { path: name, hash: digest(bytes) };
      }) };
    }
  } else if (kind === 'rollback') { text(data.detection, 'detection signals'); text(data.steps, 'rollback steps'); }
  else if (kind === 'checkpoints') {
    assert(Array.isArray(data.agents) && data.agents.length > 0, 'Checkpoints require participating agents');
    for (const agent of data.agents) for (const key of ['id', 'destination', 'reason', 'cost', 'nextAction', 'environment']) text(agent[key], `checkpoint ${key}`);
    const previous = run.evidence.checkpoints;
    if (previous) data = { agents: [...new Map([...previous.data.agents, ...data.agents].map((agent: any) => [agent.id, agent])).values()] };
  } else throw new Error(`Unknown evidence kind: ${kind}`);
  if (kind !== 'review') run.evidence[kind] = { fingerprint: fingerprint(root), planHash: planHash(root, run), at: new Date().toISOString(), data };
  run.planHash = planHash(root, run);
  if (run.status !== 'blocked') run.status = 'active';
  saveRun(root, run);
  return run;
}
function approve(root: string, topic: string, data: any): Run {
  const run = loadRun(root, topic);
  assert(run.status !== 'blocked', 'A blocked run cannot be approved');
  text(data?.userResponse, 'explicit human approval response'); text(data?.reason, 'approval reason');
  run.evidence.approval = { fingerprint: fingerprint(root), planHash: planHash(root, run), at: new Date().toISOString(), data };
  run.planHash = planHash(root, run);
  saveRun(root, run);
  return run;
}
function workflowStatus(root: string, topic: string, finalize = false): any {
  const run = loadRun(root, topic);
  const checks = runChecks(root, run);
  const ok = run.status !== 'blocked' && checks.every(check => check.ok);
  if (finalize) {
    assert(ok, 'Workflow gates are incomplete. Inspect workflow status.');
    run.status = 'complete';
    run.completion = { at: new Date().toISOString(), fingerprint: fingerprint(root), planHash: planHash(root, run), evidenceHash: evidenceHash(run) };
    saveRun(root, run);
  }
  const reviewFailed = checks.find(check => check.id === 'workflow.review')?.ok === false;
  const status = !ok && run.rounds.length >= 3 && reviewFailed ? 'blocked' : !ok && run.status === 'complete' ? 'stale' : run.status;
  return { topic, status, risk: riskLevel(root, run), rounds: run.rounds.length, ok, checks, changedFiles: changedFiles(root, run) };
}
function evidenceHash(run: Run): string { return digest(JSON.stringify({ rounds: run.rounds, evidence: run.evidence, planHash: run.planHash })); }
function allRuns(root: string): Run[] {
  return inventory(root).filter(name => /^harness\/thoughts\/[^/]+\/run\.json$/.test(name)).map(name => loadRun(root, name.split('/')[2]!));
}
function historical(run: Run, runs: Run[]): boolean {
  return run.status === 'complete' && !!run.completion && runs.some(other => other.topic !== run.topic && other.started > run.completion!.at);
}
function artifact(root: string, kind: string, topic: string, name: string, content: string): any {
  installed(root); slug(topic); slug(name);
  assert(kind === 'research' || kind === 'plan', 'Artifact kind must be research or plan');
  text(content, 'artifact content');
  const relative = `harness/thoughts/${topic}/${kind}_${name}.md`;
  const file = safe(root, relative);
  const entries: Entry[] = [];
  if (exists(file)) {
    const revisions = safe(root, `harness/thoughts/${topic}/revisions`);
    const revision = `${kind}_${name}_${Date.now()}_${randomUUID()}.md`;
    entries.push({ path: path.posix.join(`harness/thoughts/${topic}/revisions`, revision), content: fs.readFileSync(file, 'utf8') });
    void revisions;
  }
  entries.push({ path: relative, content });
  transaction(root, entries); refreshIndex(root);
  return { path: relative };
}
function learn(root: string, entry: string): any {
  installed(root); text(entry, 'learning');
  const file = safe(root, 'harness/learnings.md');
  const checkpoint = safe(root, 'harness/.runtime/learnings-prefix.json');
  const previous = readJSON(checkpoint).content;
  const content = fs.readFileSync(file, 'utf8');
  assert(typeof previous === 'string' && content.startsWith(previous), 'Append-only learning history was modified. Restore it before appending.');
  const next = content + `\n## ${new Date().toISOString()}\n\n${entry.trim()}\n`;
  transaction(root, [{ path: 'harness/learnings.md', content: next }, { path: 'harness/.runtime/learnings-prefix.json', content: json({ content: next }) }]);
  return { appended: true };
}

function compliance(root: string): any {
  const checks: { id: string; ok: boolean; remediation: string }[] = [];
  const add = (id: string, test: () => boolean, remediation: string) => {
    try { const ok = test(); checks.push({ id, ok, remediation: ok ? '' : remediation }); }
    catch (e: any) { checks.push({ id, ok: false, remediation: `${remediation} (${e.message})` }); }
  };
  add('installation.journal', () => !exists(safe(root, JOURNAL)), 'Recover the interrupted installation.');
  let manifest: Manifest;
  try { manifest = installed(root); }
  catch (e: any) { checks.push({ id: 'installation.manifest', ok: false, remediation: e.message }); return { ok: false, checks }; }
  for (const relative of manifest.owned) add('file.' + relative, () => {
    const file = safe(root, relative);
    return exists(file) && fs.statSync(file).isFile() && fs.statSync(file).size > 0;
  }, `Restore ${relative}.`);
  add('structure.required', () => {
    const required = ['harness/project-context.md', 'harness/learnings.md', ...['STE-100', 'YAGNI-KISS', 'atomic-operations'].map(name => `harness/rules/${name}.md`), ...SKILLS.map(name => `harness/skills/${name}.md`)];
    return required.every(name => manifest.owned.includes(name) && exists(safe(root, name))) && (manifest.software ? ROLES : ['implementer']).every(role => manifest.agents.includes(role));
  }, 'Restore the mandatory SPEC-100 files and agents.');
  add('structure.thoughts', () => fs.statSync(safe(root, 'harness/thoughts')).isDirectory(), 'Restore the thoughts directory.');
  for (const [relative, target] of Object.entries(manifest.links)) add('link.' + relative, () => {
    safe(root, path.posix.dirname(relative));
    const file = path.join(root, relative);
    return exists(file) && fs.lstatSync(file).isSymbolicLink() && fs.readlinkSync(file) === target && exists(path.resolve(path.dirname(file), target));
  }, `Restore relative symlink ${relative}.`);
  add('integration.links', () => [...SKILLS.map(skill => `.claude/skills/spec100-${skill}/SKILL.md`), ...manifest.agents.map(role => `.claude/agents/spec100-${role}.md`)].every(name => typeof manifest.links[name] === 'string'), 'Restore the required skill and agent links.');
  const frontmatter = (relative: string, name: string): string => {
    const body = fs.readFileSync(safe(root, relative), 'utf8');
    const header = body.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
    assert(header && new RegExp(`^name: *${name} *$`, 'm').test(header) && /^description: *\S.*$/m.test(header), `Missing native name/description frontmatter: ${relative}`);
    return header;
  };
  for (const skill of SKILLS) add('native.skill.' + skill, () => !!frontmatter(`harness/skills/${skill}.md`, 'spec100-' + skill), 'Restore the canonical skill frontmatter for native discovery.');
  for (const role of manifest.agents) add('native.agent.' + role, () => {
    const header = frontmatter(`harness/subagents/spec100-${role}.md`, 'spec100-' + role);
    const tools = header.match(/^tools: *(.*)$/m)?.[1];
    return !!tools && (role === 'implementer' || tools.split(/[,\s\[\]]+/).filter(Boolean).every(tool => ['Read', 'Glob', 'Grep'].includes(tool)));
  }, 'Restore native agent frontmatter and keep reviewers/verifiers/risk classifiers read-only.');
  add('integration.hooks', () => {
    const config = readJSON(safe(root, '.claude/settings.json'));
    return config.disableAllHooks !== true && Object.entries(hookDefinitions()).every(([event, definitions]) => Array.isArray(config.hooks?.[event]) && config.hooks[event].some((item: any) => isHarnessHook(item) && item.matcher === definitions[0].matcher && item.hooks[0].type === 'command' && item.hooks[0].command === definitions[0].hooks[0].command && item.hooks[0].async !== true));
  }, 'Restore the harness hooks with /spec100:setup.');
  add('index.current', () => {
    const content = fs.readFileSync(safe(root, 'CLAUDE.md'), 'utf8');
    const index = safe(root, INDEX), files = inventory(root);
    return content.includes(BEGIN) && withSection(content, managedSection(files, exists(path.join(root, 'AGENTS.md')))) === content && exists(index) && fs.readFileSync(index, 'utf8') === indexFile(files);
  }, 'Refresh the root index through the harness runtime index command.');
  add('learnings.append-only', () => fs.readFileSync(safe(root, 'harness/learnings.md'), 'utf8').startsWith(readJSON(safe(root, 'harness/.runtime/learnings-prefix.json')).content), 'Restore the previously recorded learning prefix.');
  const workflows: any[] = [];
  const runs = allRuns(root);
  for (const run of runs) {
    const topic = run.topic;
    try {
      if (historical(run, runs)) {
        const valid = run.completion!.evidenceHash === evidenceHash(run) && run.completion!.planHash === planHash(root, run);
        workflows.push({ topic, status: 'complete', historical: true, ok: valid, rounds: run.rounds.length });
        add('workflow.' + topic, () => valid, `Historical implementation ${topic} has modified completion evidence or plan.`);
        continue;
      }
      const result = workflowStatus(root, topic); workflows.push(result);
      // Explicitly in-progress work is reported but is not represented as a completed delivery.
      add('workflow.' + topic, () => result.ok, `Implementation ${topic} has incomplete or stale workflow gates.`);
    } catch (e: any) { checks.push({ id: 'workflow.' + topic, ok: false, remediation: e.message }); }
  }
  // Warnings do not fail compliance. CLAUDE.md imports learnings.md, so a large file adds to the memory load.
  const warnings: { id: string; message: string }[] = [];
  const learnings = fs.readFileSync(safe(root, 'harness/learnings.md'), 'utf8').length;
  if (learnings > LEARNINGS_WARN_CHARS) warnings.push({ id: 'size.learnings', message: `harness/learnings.md has ${learnings} characters (limit ${LEARNINGS_WARN_CHARS}). Plan an archive before Claude Code reports a large memory file.` });
  return { ok: checks.every(check => check.ok), checks, workflows, warnings };
}
function activeRuns(root: string, session?: string): Run[] {
  const found = allRuns(root);
  return found.filter(run => !historical(run, found) && (!run.session || run.session === session) && (run.status === 'active' || run.status === 'complete' && !runChecks(root, run).every(check => check.ok)));
}
function hook(root: string, event: string, input: any): any {
  if (!exists(path.join(root, 'harness/.runtime/manifest.json'))) return {};
  const runs = activeRuns(root, input.session_id);
  if (event === 'SessionStart') {
    const result = compliance(root);
    const structural = result.checks.filter((check: any) => !check.id.startsWith('workflow.'));
    return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `SPEC-100 is installed. Use /spec100:check for compliance. ${[...structural.filter((c: any) => !c.ok).map((c: any) => c.id + ': ' + c.remediation), ...result.warnings.map((w: any) => w.id + ': ' + w.message)].join('\n')}` } };
  }
  if (event === 'PostToolUse') { refreshIndex(root); return {}; }
  if (event === 'PreToolUse') {
    const command = input.tool_input?.command ?? '';
    const file = input.tool_input?.file_path;
    const deny = (reason: string) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
    if (typeof file === 'string') {
      const relative = path.relative(root, path.resolve(root, file)).split(path.sep).join('/');
      if (relative === 'harness/learnings.md' || relative.startsWith('harness/.runtime/')) return deny('Use the SPEC-100 runtime; direct changes to learning history and runtime records are prohibited.');
    }
    if (/\bworkflow\s+approve\b/.test(command)) return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: 'SPEC-100 requires explicit human approval for this plan and change fingerprint.' } };
    // Cooperative gate: deterministic paths and obvious destructive commands. This is not a shell sandbox.
    const dangerous = /(?:\brm\s+[^\n]*-[a-z]*[rf]|\bgit\s+(?:reset\s+--hard|clean\s+-|push\s+[^\n]*--force)|\b(?:terraform\s+(?:apply|destroy)|kubectl\s+(?:apply|delete))\b|\bDROP\s+(?:TABLE|DATABASE)\b)/i.test(command) || typeof file === 'string' && HIGH_RISK_PATH.test(path.relative(root, path.resolve(root, file)).split(path.sep).join('/'));
    if (dangerous && (!runs.length || runs.some(run => !current(root, run, run.evidence.approval)))) return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: 'This action is high risk under SPEC-100. Obtain explicit approval before proceeding.' } };
    return {};
  }
  if (event === 'Stop') {
    if (input.stop_hook_active || runs.length === 0) return {};
    const pending = runs.filter(run => run.rounds.length < 3 && !runChecks(root, run).every(check => check.ok));
    if (pending.length) return { decision: 'block', reason: `SPEC-100 implementation gates remain incomplete for ${pending.map(run => run.topic).join(', ')}. Continue verification or explain a blocked handoff. This hook will not repeatedly block the same stop.` };
    return {};
  }
  throw new Error(`Unsupported hook event: ${event}`);
}
function main(): void {
  const [major, minor] = process.versions.node.split('.').map(Number);
  assert(major! > 22 || major === 22 && minor! >= 13, 'SPEC-100 requires Node.js >=22.13');
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    root: { type: 'string' }, draft: { type: 'string' }, file: { type: 'string' }, topic: { type: 'string' }, name: { type: 'string' }, kind: { type: 'string' }, plan: { type: 'string' }, session: { type: 'string' }, event: { type: 'string' }, json: { type: 'boolean' }, 'dry-run': { type: 'boolean' }
  } });
  const root = fs.realpathSync(values.root ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  assert(fs.statSync(root).isDirectory(), 'Project root must be a directory');
  const command = positionals[0];
  const required = (value: string | undefined, flag: string) => text(value, flag);
  let result: any;
  if (command === 'prepare') result = prepare(root);
  else if (command === 'setup') result = setup(root, readJSON(path.resolve(required(values.draft, '--draft'))), values['dry-run']);
  else if (command === 'recover') { recover(root); result = { recovered: true }; }
  else if (command === 'index') { refreshIndex(root); result = { refreshed: true }; }
  else if (command === 'check') { result = compliance(root); process.exitCode = result.ok ? 0 : 1; }
  else if (command === 'artifact') result = artifact(root, required(values.kind, '--kind'), required(values.topic, '--topic'), required(values.name, '--name'), fs.readFileSync(path.resolve(required(values.file, '--file')), 'utf8'));
  else if (command === 'learn') result = learn(root, fs.readFileSync(path.resolve(required(values.file, '--file')), 'utf8'));
  else if (command === 'workflow') {
    const topic = slug(required(values.topic, '--topic'));
    const action = positionals[1];
    if (action === 'start') result = workflowStart(root, topic, values.plan, values.session);
    else if (action === 'record') result = record(root, topic, required(values.kind, '--kind'), readJSON(path.resolve(required(values.file, '--file'))));
    else if (action === 'approve') result = approve(root, topic, readJSON(path.resolve(required(values.file, '--file'))));
    else if (action === 'status' || action === 'check' || action === 'finish') { result = workflowStatus(root, topic, action === 'finish'); if (action === 'check') process.exitCode = result.ok ? 0 : 1; }
    else throw new Error('Workflow action must be start, record, approve, status, check, or finish');
  } else if (command === 'hook') {
    result = hook(root, required(values.event, '--event'), JSON.parse(fs.readFileSync(0, 'utf8')));
  } else throw new Error('Command must be prepare, setup, recover, index, check, artifact, learn, workflow, or hook');
  if (values.json || command === 'hook' || command === 'prepare') process.stdout.write(json(result));
  else if (command === 'check') process.stdout.write([...result.checks.map((c: any) => `${c.ok ? 'PASS' : 'FAIL'} ${c.id}${c.ok ? '' : ': ' + c.remediation}`), ...(result.warnings ?? []).map((w: any) => `WARN ${w.id}: ${w.message}`)].join('\n') + '\n');
  else process.stdout.write(json(result));
}
if (require.main === module) {
  try { main(); }
  catch (error: any) { process.stderr.write(json({ error: error.message })); process.exitCode = 2; }
}
