import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(repo, 'plugins/spec100/runtime/spec100.cjs');
const roles = ['implementer', 'code-reviewer', 'security-reviewer', 'verifier', 'risk-classifier'];
const draft = (software = true) => ({ software, context: {
  domain: 'Example library', problem: 'Validate values', audience: 'Library consumers', architecture: 'A small module', tooling: 'Node.js', verification: 'node --test', sources: [], uncertainties: 'Unknown deployment environment'
}, agents: Object.fromEntries((software ? roles : ['implementer']).map(role => [role, `Inspect this validation library as its ${role}; preserve the documented API.`])) });
function fixture(t, initialize = true, software = true) {
  // The runtime resolves the root with realpath; on macOS the temporary directory is a symlink.
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'spec100-test-')));
  const root = path.join(base, 'project space'); fs.mkdirSync(root);
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  let sequence = 0;
  const input = (data, extension = 'json') => {
    const file = path.join(base, `input-${sequence++}.${extension}`);
    fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data)); return file;
  };
  const cli = (args, expected = 0, stdin, installed = false) => {
    // File descriptors also work in execution sandboxes that restrict child-process pipes.
    const out = path.join(base, `stdout-${sequence++}`), err = path.join(base, `stderr-${sequence++}`);
    const descriptors = [stdin ? fs.openSync(input(stdin), 'r') : fs.openSync(os.devNull, 'r'), fs.openSync(out, 'w'), fs.openSync(err, 'w')];
    let r;
    try { r = spawnSync(process.execPath, [installed ? path.join(root, 'harness/.runtime/spec100.cjs') : runtime, ...args, '--root', root, '--json'], { stdio: descriptors, timeout: 20000 }); }
    finally { descriptors.forEach(fd => fs.closeSync(fd)); }
    const stdout = fs.readFileSync(out, 'utf8'), stderr = fs.readFileSync(err, 'utf8');
    let details; try { const result = JSON.parse(stdout || stderr); details = result.checks ? JSON.stringify(result.checks.filter(c => !c.ok)) : JSON.stringify(result); } catch { details = stdout + stderr; }
    assert.equal(r.status, expected, `${args.join(' ')}\n${details}`);
    return JSON.parse(stdout || stderr);
  };
  const setup = (data = draft(software), flags = []) => cli(['setup', '--draft', input(data), ...flags]);
  const write = (name, content) => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), content); };
  const read = name => fs.readFileSync(path.join(root, name), 'utf8');
  const art = (kind, content, name = 'topic') => cli(['artifact', '--kind', kind, '--topic', 'topic', '--name', name, '--file', input(content, 'md')]);
  const evidence = (kind, data, expected = 0) => cli(['workflow', 'record', '--topic', 'topic', '--kind', kind, '--file', input(data)], expected);
  if (initialize) setup();
  return { root, base, input, cli, setup, write, read, art, evidence };
}
const verification = { passed: true, commands: [{ command: 'node --test', exitCode: 0, output: 'Actual fixture command result: passed' }] };
const checkpoints = (ids = ['implementer-1', 'code-1', 'security-1']) => ({ agents: ids.map(id => ({ id, destination: 'A correct change', reason: 'Fulfill plan', cost: 'One test run', nextAction: 'Inspect relevant files', environment: 'Fixture project' })) });
const cleanReview = () => ({ reviewers: [{ id: 'code-1', role: 'code-reviewer', findings: [] }, { id: 'security-1', role: 'security-reviewer', findings: [] }] });
const findingReview = verdicts => {
  const result = cleanReview(); result.reviewers[0].findings.push({ id: 'F1', description: 'src/index.js:1 rejects valid input', severity: 'medium', votes: verdicts.map((verdict, i) => ({ verifier: `verifier-${i}`, verdict, reason: 'Independent test evidence' })) }); return result;
};
function start(f, host = 'claude') {
  f.art('plan', '# Plan\n\nImplement the requested validation behavior.');
  f.cli(['workflow', 'start', '--topic', 'topic', '--tool', host]);
  f.evidence('capabilities', capabilities(host));
  f.evidence('preflight', verification);
  f.evidence('checkpoints', checkpoints());
}
const capabilities = (tool = 'claude', surface = 'cli') => ({ tool, surface, independentAgents: true, hooksActive: true, reason: 'Fixture-only capability record; not live client validation.' });
function cleanEvidence(f, uat = { applicable: false, reason: 'A library-only change with no visual user flow.' }, host = 'claude') {
  f.evidence('capabilities', capabilities(host));
  f.evidence('risk', { level: 'low', reason: 'Local validation behavior only' });
  f.evidence('verification', verification);
  f.evidence('review', cleanReview());
  f.evidence('uat', uat);
  f.evidence('rollback', { detection: 'Validation regression test fails', steps: 'Revert only this change, preserving user work' });
}

test('native plugin exposes six skills and valid manifests', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(repo, 'plugins/spec100/.claude-plugin/plugin.json')));
  const marketplace = JSON.parse(fs.readFileSync(path.join(repo, '.claude-plugin/marketplace.json')));
  assert.equal(plugin.name, 'spec100'); assert.equal(marketplace.plugins[0].source, './plugins/spec100');
  for (const name of ['setup', 'check', 'research', 'plan', 'iterate', 'implement']) {
    const skill = fs.readFileSync(path.join(repo, `plugins/spec100/skills/${name}/SKILL.md`), 'utf8');
    assert.match(skill, new RegExp(`^name: ${name}\\r?$`, 'm'));
    if (['research', 'plan', 'iterate', 'implement'].includes(name)) assert.match(skill, new RegExp(`harness/skills/${name}\\.md`));
  }
});
test('setup installs a self-contained compliant harness in an empty project', t => {
  const f = fixture(t);
  assert.equal(f.cli(['check'], 0, undefined, true).ok, true);
  assert.equal(fs.lstatSync(path.join(f.root, '.claude/skills/spec100-plan/SKILL.md')).isSymbolicLink(), false);
  assert.match(f.read('.claude/skills/spec100-plan/SKILL.md'), /harness\/skills\/plan.md/);
  assert.match(f.read('CLAUDE.md'), /harness\/thoughts\//);
  assert.match(f.read('harness/project-context.md'), /Library consumers/);
  assert.match(f.read('.claude/agents/spec100-code-reviewer.md'), /tools: Read, Glob, Grep\n/);
  assert.doesNotMatch(f.read('.claude/agents/spec100-code-reviewer.md'), /tools:.*Bash/);
});
test('dry-run and invalid drafts leave the project unchanged', t => {
  const f = fixture(t, false);
  f.setup(draft(), ['--dry-run']); assert.deepEqual(fs.readdirSync(f.root), []);
  const invalid = draft(); invalid.context.sources = ['../outside'];
  f.cli(['setup', '--draft', f.input(invalid)], 2);
  assert.deepEqual(fs.readdirSync(f.root), []);
  delete invalid.context.sources; f.cli(['setup', '--draft', f.input(invalid)], 2);
});
test('setup preserves existing instructions, imports AGENTS, and merges hooks idempotently', t => {
  const f = fixture(t, false);
  f.write('CLAUDE.md', '# Existing instructions\nPreserve this.\n');
  fs.chmodSync(path.join(f.root, 'CLAUDE.md'), 0o600);
  f.write('AGENTS.md', 'Shared agent instructions\n');
  const existing = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo user-hook' }] };
  f.write('.claude/settings.json', JSON.stringify({ permissions: { deny: ['Read(.env)'] }, hooks: { PreToolUse: [existing] } }));
  fs.chmodSync(path.join(f.root, '.claude/settings.json'), 0o600);
  f.setup();
  f.write('harness/project-context.md', '# Customized context\n');
  f.write('harness/skills/plan.md', f.read('harness/skills/plan.md') + '\n# Customized plan\n');
  f.write('harness/subagents/spec100-implementer.md', f.read('harness/subagents/spec100-implementer.md') + '\n# Customized agent\n');
  const before = f.read('CLAUDE.md'); f.setup();
  assert.equal(f.read('CLAUDE.md'), before);
  assert.match(before, /^# Existing instructions/); assert.match(before, /@AGENTS.md/);
  assert.equal(f.read('harness/project-context.md'), '# Customized context\n');
  assert.match(f.read('harness/skills/plan.md'), /# Customized plan\n$/);
  assert.match(f.read('harness/subagents/spec100-implementer.md'), /# Customized agent\n$/);
  const settings = JSON.parse(f.read('.claude/settings.json'));
  assert.deepEqual(settings.permissions.deny, ['Read(.env)']);
  assert.deepEqual(settings.hooks.PreToolUse[0], existing); assert.equal(settings.hooks.PreToolUse.length, 2);
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(f.root, 'CLAUDE.md')).mode & 0o777, 0o600);
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(f.root, '.claude/settings.json')).mode & 0o777, 0o600);
  assert.equal(f.cli(['check']).ok, true);
});
test('malformed settings and unmanaged collisions fail before writes', t => {
  const f = fixture(t, false);
  f.write('.claude/settings.json', '{broken'); f.cli(['setup', '--draft', f.input(draft())], 2);
  assert.equal(fs.existsSync(path.join(f.root, 'harness')), false);
  f.write('.claude/settings.json', '{}'); f.write('harness/project-context.md', 'User-owned');
  assert.match(f.cli(['setup', '--draft', f.input(draft())], 2).error, /Unmanaged file collision/);
  assert.equal(f.read('harness/project-context.md'), 'User-owned');
});
test('setup rejects symbolic link ancestors and unmanaged Claude agent links', t => {
  const f = fixture(t, false);
  const outside = path.join(f.base, 'outside'); fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(f.root, 'harness'));
  assert.match(f.cli(['setup', '--draft', f.input(draft())], 2).error, /Symlink/);
  assert.deepEqual(fs.readdirSync(outside), []);
  fs.unlinkSync(path.join(f.root, 'harness'));
  f.write('.claude/agents/spec100-implementer.md', 'Existing agent');
  assert.match(f.cli(['setup', '--draft', f.input(draft())], 2).error, /(?:link collision|Unmanaged file collision)/);
});
test('Git ignore rules, tracked exceptions, empty folders and symlink leaves are indexed', t => {
  const f = fixture(t, false);
  spawnSync('git', ['init', '--quiet', f.root]);
  f.write('.gitignore', '*.log\nignored/\nsecret.txt\n');
  f.write('ignored/no.md', 'Ignored'); f.write('event.log', 'Ignored');
  f.write('secret.txt', 'Tracked exception'); spawnSync('git', ['-C', f.root, 'add', '-f', 'secret.txt']);
  f.write('node_modules/lib/index.js', 'Dependency');
  f.write('src/index.js', 'export default 1'); fs.mkdirSync(path.join(f.root, 'empty'));
  fs.symlinkSync(f.root, path.join(f.root, 'cycle'));
  f.setup(); const index = f.read('harness/project-index.md');
  assert.match(index, /secret.txt/); assert.match(index, /empty\//); assert.match(index, /cycle/);
  assert.doesNotMatch(index, /event.log|ignored\/no|node_modules\/lib|cycle\/src/);
  assert.equal(f.cli(['check']).ok, true);
});
test('non-Git projects honor nested ignore rules and index freshness is read-only', t => {
  const f = fixture(t, false);
  f.write('.gitignore', 'ignored/\n'); f.write('ignored/a.md', 'Ignore');
  f.write('src/.gitignore', '*.log\n!keep.log\n'); f.write('src/drop.log', 'Ignore'); f.write('src/keep.log', 'Keep');
  f.setup(); assert.match(f.read('harness/project-index.md'), /keep.log/); assert.doesNotMatch(f.read('harness/project-index.md'), /drop.log|ignored\/a/);
  f.write('new.md', 'New'); const before = f.read('harness/project-index.md');
  assert.equal(f.cli(['check'], 1).checks.find(c => c.id === 'index.current').ok, false);
  assert.equal(f.read('harness/project-index.md'), before);
  f.cli(['index']); assert.equal(f.cli(['check']).ok, true);
});
test('ignored harness assets remain explicitly indexed', t => {
  const f = fixture(t, false);
  f.write('.gitignore', 'harness/\n.claude/\nCLAUDE.md\n');
  f.setup();
  assert.match(f.read('harness/project-index.md'), /harness\/rules\/STE-100.md/);
  assert.match(f.read('harness/project-index.md'), /\.claude\/skills\/spec100-plan\/SKILL.md/);
  f.art('plan', '# Ignored plan');
  assert.match(f.read('harness/project-index.md'), /harness\/thoughts\/topic\/plan_topic.md/);
  assert.equal(f.cli(['check']).ok, true);
});
test('prepare bounds evidence and excludes secret contents', t => {
  const f = fixture(t, false);
  f.write('README.md', 'Library documentation'); f.write('.env', 'DO_NOT_EXPOSE=secret'); f.write('private.key', 'secret');
  const prepared = f.cli(['prepare']);
  assert.equal(prepared.evidence[0].path, 'README.md');
  assert.doesNotMatch(JSON.stringify(prepared.evidence), /DO_NOT_EXPOSE/);
  assert.deepEqual(fs.readdirSync(f.root).sort(), ['.env', 'README.md', 'private.key']);
});
test('research and plan artifacts route precisely and preserve revisions', t => {
  const f = fixture(t); f.art('research', '# Research\nEvidence');
  f.art('plan', '# Original plan'); f.art('plan', '# Revised plan');
  assert.equal(f.read('harness/thoughts/topic/plan_topic.md'), '# Revised plan');
  const revisions = fs.readdirSync(path.join(f.root, 'harness/thoughts/topic/revisions'));
  assert.equal(revisions.length, 1);
  assert.equal(f.read('harness/thoughts/topic/revisions/' + revisions[0]), '# Original plan');
  f.cli(['artifact', '--kind', 'plan', '--topic', '../escape', '--name', 'name', '--file', f.input('No', 'md')], 2);
  assert.equal(f.cli(['check']).ok, true);
});
test('learnings append and detect modification of recorded history', t => {
  const f = fixture(t); const original = f.read('harness/learnings.md');
  f.cli(['learn', '--file', f.input('First lesson', 'md')]); f.cli(['learn', '--file', f.input('Second lesson', 'md')]);
  assert.ok(f.read('harness/learnings.md').startsWith(original));
  assert.match(f.read('harness/learnings.md'), /First lesson[\s\S]*Second lesson/);
  f.write('harness/learnings.md', 'History erased');
  f.cli(['learn', '--file', f.input('Third', 'md')], 2);
  assert.equal(f.cli(['check'], 1).checks.find(c => c.id === 'learnings.append-only').ok, false);
});
test('interrupted installation journal restores original files and removes newly created directories', t => {
  const f = fixture(t, false);
  f.write('CLAUDE.md', 'Partial new value'); f.write('harness/new.md', 'Partial');
  f.write('.spec100-install.json', JSON.stringify({ version: 1, snapshots: [{ path: 'CLAUDE.md', content: Buffer.from('Original').toString('base64'), mode: 0o644 }, { path: 'harness/new.md', absent: true }], directories: ['harness'] }));
  f.cli(['setup', '--draft', f.input(draft())], 2);
  f.cli(['recover']); assert.equal(f.read('CLAUDE.md'), 'Original'); assert.equal(fs.existsSync(path.join(f.root, 'harness')), false);
  assert.equal(fs.existsSync(path.join(f.root, '.spec100-install.json')), false);
  f.setup(); assert.equal(f.cli(['check']).ok, true);
});
test('malformed journal paths cannot escape the project', t => {
  const f = fixture(t, false);
  const outside = path.join(f.base, 'outside.md'); fs.writeFileSync(outside, 'Safe');
  f.write('.spec100-install.json', JSON.stringify({ version: 1, snapshots: [{ path: '../outside.md', absent: true }], directories: [] }));
  f.cli(['recover'], 2); assert.equal(fs.readFileSync(outside, 'utf8'), 'Safe');
});
test('a write failure rolls back the entire installation', t => {
  if (process.platform === 'win32') return t.skip('POSIX directory permissions; portable fault injection is tested separately');
  if (process.getuid?.() === 0) return t.skip('Root bypasses fixture directory permissions');
  const f = fixture(t, false);
  f.write('CLAUDE.md', 'Existing root instructions');
  const blocked = path.join(f.root, '.claude/skills/spec100-plan'); fs.mkdirSync(blocked, { recursive: true }); fs.chmodSync(blocked, 0o555);
  try {
    assert.match(f.cli(['setup', '--draft', f.input(draft())], 2).error, /EACCES/);
    assert.equal(f.read('CLAUDE.md'), 'Existing root instructions');
    assert.equal(fs.existsSync(path.join(f.root, 'harness')), false);
    assert.equal(fs.existsSync(path.join(f.root, '.spec100-install.json')), false);
  } finally { fs.chmodSync(blocked, 0o755); }
});
test('missing and ambiguous plans do not silently start a run', t => {
  const f = fixture(t); f.cli(['workflow', 'start', '--topic', 'topic'], 2);
  f.art('plan', 'Plan one', 'one'); f.art('plan', 'Plan two', 'two');
  f.cli(['workflow', 'start', '--topic', 'topic'], 2);
  f.cli(['workflow', 'start', '--topic', 'topic', '--plan', 'harness/thoughts/topic/plan_one.md']);
  assert.match(f.cli(['workflow', 'start', '--topic', 'topic'], 2).error, /already exists/);
});
test('software workflow passes with complete evidence and becomes stale when code changes', t => {
  const f = fixture(t); start(f); f.write('src/index.js', 'export default true;'); cleanEvidence(f);
  const status = f.cli(['workflow', 'check', '--topic', 'topic']); assert.equal(status.ok, true);
  f.cli(['workflow', 'finish', '--topic', 'topic']); assert.equal(f.cli(['check']).ok, true);
  f.write('src/index.js', 'export default false;');
  const stale = f.cli(['workflow', 'check', '--topic', 'topic'], 1);
  assert.equal(stale.checks.find(c => c.id === 'workflow.verification').ok, false);
  assert.equal(stale.checks.find(c => c.id === 'workflow.review').ok, false);
});
test('failed verification cannot pass and preflight must precede code changes', t => {
  const f = fixture(t); start(f); f.write('src/new.js', 'new');
  f.evidence('preflight', verification, 2);
  f.evidence('verification', { passed: true, commands: [{ command: 'false', exitCode: 1, output: 'Failure' }] }, 2);
  f.evidence('verification', { passed: false, commands: [{ command: 'false', exitCode: 1, output: 'Failure' }] });
  assert.equal(f.cli(['workflow', 'status', '--topic', 'topic']).checks.find(c => c.id === 'workflow.verification').ok, false);
});
test('review votes require independent identities and disputes remain unresolved', t => {
  const f = fixture(t); start(f);
  const invalid = findingReview(['confirm', 'dismiss']); invalid.reviewers[0].findings[0].votes[0].verifier = 'code-1';
  f.evidence('review', invalid, 2);
  const duplicate = findingReview(['dismiss', 'dismiss']); duplicate.reviewers[0].findings[0].votes[1].verifier = 'verifier-0';
  f.evidence('review', duplicate, 2);
  f.evidence('review', findingReview(['confirm', 'dismiss']));
  assert.equal(f.cli(['workflow', 'status', '--topic', 'topic']).checks.find(c => c.id === 'workflow.review').ok, false);
  f.evidence('review', findingReview(['dismiss', 'dismiss']));
  assert.equal(f.cli(['workflow', 'status', '--topic', 'topic']).checks.find(c => c.id === 'workflow.review').ok, true);
});
test('three unresolved review rounds block further execution and cannot be reset', t => {
  const f = fixture(t); start(f);
  for (let i = 0; i < 3; i++) f.evidence('review', findingReview(['confirm', 'confirm']));
  const status = f.cli(['workflow', 'status', '--topic', 'topic']); assert.equal(status.rounds, 3); assert.equal(status.status, 'blocked');
  f.evidence('review', cleanReview(), 2); f.cli(['workflow', 'start', '--topic', 'topic'], 2);
  f.cli(['workflow', 'approve', '--topic', 'topic', '--file', f.input({ userResponse: 'Approved', reason: 'Test' })], 2);
});
test('checkpoint coverage includes all reviewers and verifiers', t => {
  const f = fixture(t); start(f); f.evidence('review', findingReview(['dismiss', 'dismiss']));
  assert.equal(f.cli(['workflow', 'status', '--topic', 'topic']).checks.find(c => c.id === 'workflow.checkpoints').ok, false);
  f.evidence('checkpoints', checkpoints(['verifier-0', 'verifier-1']));
  assert.equal(f.cli(['workflow', 'status', '--topic', 'topic']).checks.find(c => c.id === 'workflow.checkpoints').ok, true);
});
test('high-risk changes require fingerprint-bound human approval', t => {
  const f = fixture(t); start(f); f.write('src/auth.ts', 'export const authorized = true;');
  f.evidence('risk', { level: 'low', reason: 'Incorrect downgrade' }, 2);
  f.evidence('risk', { level: 'high', reason: 'Authentication behavior changes' });
  assert.equal(f.cli(['workflow', 'status', '--topic', 'topic']).checks.find(c => c.id === 'workflow.approval').ok, false);
  f.cli(['workflow', 'approve', '--topic', 'topic', '--file', f.input({ userResponse: 'I approve this specific authentication change', reason: 'Reviewed the current plan and changes' })]);
  assert.equal(f.cli(['workflow', 'status', '--topic', 'topic']).checks.find(c => c.id === 'workflow.approval').ok, true);
  f.write('src/auth.ts', 'export const authorized = false;');
  assert.equal(f.cli(['workflow', 'status', '--topic', 'topic']).checks.find(c => c.id === 'workflow.approval').ok, false);
});
test('plan revisions invalidate previous evidence and approvals', t => {
  const f = fixture(t); start(f); cleanEvidence(f);
  f.cli(['workflow', 'approve', '--topic', 'topic', '--file', f.input({ userResponse: 'Approved', reason: 'Specific plan' })]);
  f.art('plan', '# Changed plan\nDifferent requirements');
  const result = f.cli(['workflow', 'check', '--topic', 'topic'], 1);
  assert.equal(result.checks.find(c => c.id === 'workflow.plan').ok, false);
  assert.equal(result.checks.find(c => c.id === 'workflow.review').ok, false);
  assert.equal(result.checks.find(c => c.id === 'workflow.approval').ok, false);
});
test('plan iteration can resume implementation while retaining its baseline and review count', t => {
  const f = fixture(t); start(f); f.write('library.js', 'export const value = 1;'); cleanEvidence(f);
  f.art('plan', '# Revised plan\nKeep the API and refine validation');
  f.evidence('checkpoints', checkpoints()); cleanEvidence(f);
  const result = f.cli(['workflow', 'check', '--topic', 'topic']);
  assert.equal(result.ok, true); assert.equal(result.rounds, 2);
});
test('executable-bit changes invalidate reviewed code', t => {
  if (process.platform === 'win32') return t.skip('Windows has no POSIX executable bit');
  const f = fixture(t); start(f); f.write('script.sh', '#!/bin/sh\nexit 0\n'); cleanEvidence(f);
  assert.equal(f.cli(['workflow', 'check', '--topic', 'topic']).ok, true);
  fs.chmodSync(path.join(f.root, 'script.sh'), 0o755);
  assert.equal(f.cli(['workflow', 'check', '--topic', 'topic'], 1).checks.find(c => c.id === 'workflow.review').ok, false);
});
test('a clean third review cannot authorize later code changes', t => {
  const f = fixture(t); start(f);
  f.evidence('review', findingReview(['confirm', 'confirm']));
  f.evidence('review', findingReview(['confirm', 'confirm']));
  f.evidence('review', cleanReview());
  f.write('changed.js', 'Unreviewed later change');
  assert.equal(f.cli(['workflow', 'status', '--topic', 'topic']).status, 'blocked');
  f.evidence('review', cleanReview(), 2);
  assert.deepEqual(f.cli(['hook', '--event', 'Stop'], 0, { stop_hook_active: false }), {});
});
test('UAT requires real attachment bytes, explicit inapplicability, and unchanged screenshots', t => {
  const f = fixture(t); start(f);
  f.evidence('uat', { applicable: false }, 2);
  f.evidence('uat', { applicable: true, passed: true, scenario: 'Visual flow', screenshots: [] }, 2);
  f.write('harness/thoughts/topic/fake.png', 'not an image');
  f.evidence('uat', { applicable: true, passed: true, scenario: 'Visual flow', screenshots: ['harness/thoughts/topic/fake.png'] }, 2);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=', 'base64');
  f.write('harness/thoughts/topic/uat.png', png);
  f.evidence('uat', { applicable: true, passed: true, scenario: 'Visual flow', screenshots: ['harness/thoughts/topic/uat.png'] });
  assert.equal(f.cli(['workflow', 'status', '--topic', 'topic']).checks.find(c => c.id === 'workflow.uat').ok, true);
  f.write('harness/thoughts/topic/uat.png', Buffer.concat([png, Buffer.from('changed')]));
  assert.equal(f.cli(['workflow', 'status', '--topic', 'topic']).checks.find(c => c.id === 'workflow.uat').ok, false);
});
test('non-software workflow omits software-specific gates', t => {
  const f = fixture(t, true, false); f.art('plan', '# Editorial plan'); f.cli(['workflow', 'start', '--topic', 'topic']);
  f.evidence('capabilities', capabilities());
  f.evidence('risk', { level: 'low', reason: 'Documentation-only editing' }); f.evidence('checkpoints', checkpoints(['editor-1']));
  const result = f.cli(['workflow', 'check', '--topic', 'topic']); assert.equal(result.ok, true);
  assert.equal(result.checks.some(c => c.id === 'workflow.uat'), false);
});
test('later runs retain completed topics as history without accepting modified historical evidence', t => {
  const f = fixture(t, true, false);
  f.art('plan', '# First plan'); f.cli(['workflow', 'start', '--topic', 'topic']);
  f.evidence('capabilities', capabilities());
  f.evidence('risk', { level: 'low', reason: 'Documentation only' }); f.evidence('checkpoints', checkpoints(['editor-1']));
  f.cli(['workflow', 'finish', '--topic', 'topic']);
  f.cli(['artifact', '--kind', 'plan', '--topic', 'second', '--name', 'second', '--file', f.input('# Second plan', 'md')]);
  f.cli(['workflow', 'start', '--topic', 'second']);
  f.cli(['workflow', 'record', '--topic', 'second', '--kind', 'capabilities', '--file', f.input(capabilities())]);
  f.write('notes.md', 'Second project change');
  for (const [kind, data] of [['risk', { level: 'low', reason: 'Documentation only' }], ['checkpoints', checkpoints(['editor-2'])]]) f.cli(['workflow', 'record', '--topic', 'second', '--kind', kind, '--file', f.input(data)]);
  f.cli(['workflow', 'finish', '--topic', 'second']);
  const result = f.cli(['check']); assert.equal(result.workflows.find(run => run.topic === 'topic').historical, true);
  const first = JSON.parse(f.read('harness/thoughts/topic/run.json')); first.evidence.risk.data.reason = 'Tampered';
  f.write('harness/thoughts/topic/run.json', JSON.stringify(first));
  assert.equal(f.cli(['check'], 1).checks.find(c => c.id === 'workflow.topic').ok, false);
});
test('hooks request approval, protect history, bound stop retries, and respect session ownership', t => {
  const f = fixture(t); f.art('plan', '# Plan'); f.cli(['workflow', 'start', '--topic', 'topic', '--session', 'one']);
  const call = (event, data) => f.cli(['hook', '--event', event], 0, data);
  assert.equal(call('PreToolUse', { session_id: 'one', tool_input: { command: 'node harness/.runtime/spec100.cjs workflow approve --topic topic --file /tmp/a.json' } }).hookSpecificOutput.permissionDecision, 'ask');
  assert.equal(call('PreToolUse', { session_id: 'one', tool_input: { file_path: path.join(f.root, 'harness/learnings.md') } }).hookSpecificOutput.permissionDecision, 'deny');
  f.evidence('capabilities', capabilities());
  assert.equal(call('PreToolUse', { session_id: 'one', tool_input: { command: 'git reset --hard' } }).hookSpecificOutput.permissionDecision, 'ask');
  assert.equal(call('Stop', { session_id: 'one', stop_hook_active: false }).decision, 'block');
  assert.deepEqual(call('Stop', { session_id: 'one', stop_hook_active: true }), {});
  assert.deepEqual(call('Stop', { session_id: 'two', stop_hook_active: false }), {});
  f.write('new.txt', 'New'); call('PostToolUse', { session_id: 'one' }); assert.match(f.read('harness/project-index.md'), /new.txt/);
});
test('CLAUDE.md links to the project index and stays small as the project grows', t => {
  const f = fixture(t, false);
  for (let i = 0; i < 400; i++) f.write(`src/module-${i}/file-${i}.ts`, 'export {};');
  f.setup();
  const root = f.read('CLAUDE.md');
  assert.match(root, /harness\/project-index\.md/);
  assert.doesNotMatch(root, /@harness\/project-index\.md/);
  assert.doesNotMatch(root, /module-1\//);
  assert.ok(root.length < 2000);
  assert.match(f.read('harness/project-index.md'), /module-399\/file-399\.ts/);
  assert.match(root, /Find project files in harness\/project-index\.md before you search/);
  assert.match(root, /^- `src\/`$/m);
  assert.equal(f.cli(['check']).ok, true);
  f.write('docs/guide.md', 'Guide'); f.cli(['index']);
  assert.match(f.read('CLAUDE.md'), /^- `docs\/`$/m);
  assert.equal(fs.existsSync(path.join(f.root, '.spec100-install.json')), false);
  assert.equal(f.cli(['check']).ok, true);
});
test('a large learnings file gives a warning that does not fail compliance', t => {
  const f = fixture(t);
  assert.deepEqual(f.cli(['check']).warnings, []);
  fs.appendFileSync(path.join(f.root, 'harness/learnings.md'), 'x'.repeat(30001));
  const result = f.cli(['check']);
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings.map(w => w.id), ['size.learnings']);
});
test('repeat setup migrates an old install that kept the index inside CLAUDE.md', t => {
  const f = fixture(t, false);
  for (let i = 0; i < 50; i++) f.write(`src/file-${i}.ts`, 'export {};');
  f.setup();
  const manifestPath = 'harness/.runtime/manifest.json';
  const manifest = JSON.parse(f.read(manifestPath)); manifest.owned = manifest.owned.filter(name => name !== 'harness/project-index.md');
  f.write(manifestPath, JSON.stringify(manifest));
  fs.rmSync(path.join(f.root, 'harness/project-index.md'));
  f.write('CLAUDE.md', f.read('CLAUDE.md').replace('<!-- spec100:end -->', '## Project index\n- [`src/file-1.ts`](<src/file-1.ts>)\n<!-- spec100:end -->'));
  f.setup();
  assert.doesNotMatch(f.read('CLAUDE.md'), /file-1\.ts/);
  assert.match(f.read('harness/project-index.md'), /file-49\.ts/);
  assert.equal(f.cli(['check'], 0, undefined, true).ok, true);
});
test('check returns stable failure IDs for broken links and missing rules', t => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.root, '.claude/skills/spec100-plan/SKILL.md'));
  fs.unlinkSync(path.join(f.root, 'harness/rules/YAGNI-KISS.md'));
  const result = f.cli(['check'], 1);
  assert.equal(result.checks.find(c => c.id === 'integration.file..claude/skills/spec100-plan/SKILL.md').ok, false);
  assert.equal(result.checks.find(c => c.id === 'file.harness/rules/YAGNI-KISS.md').ok, false);
});
test('disabled hooks and invalid native frontmatter fail compliance', t => {
  const f = fixture(t);
  const settings = JSON.parse(f.read('.claude/settings.json')); settings.disableAllHooks = true;
  f.write('.claude/settings.json', JSON.stringify(settings));
  f.write('harness/skills/plan.md', '# Not a native skill');
  f.write('.claude/agents/spec100-code-reviewer.md', f.read('.claude/agents/spec100-code-reviewer.md').replace('tools: Read, Glob, Grep', 'tools: Read, Bash'));
  const result = f.cli(['check'], 1);
  for (const id of ['integration.claude.hooks', 'native.skill.plan', 'integration.file..claude/agents/spec100-code-reviewer.md']) assert.equal(result.checks.find(c => c.id === id).ok, false);
});

test('portable setup package is self-contained and matches the Claude runtime', () => {
  const portable = path.join(repo, 'skills/spec100-setup');
  assert.deepEqual(fs.readFileSync(path.join(portable, 'scripts/spec100.cjs')), fs.readFileSync(runtime));
  const compare = (relative = '') => {
    for (const item of fs.readdirSync(path.join(portable, 'assets/templates', relative), { withFileTypes: true })) {
      const name = path.join(relative, item.name);
      if (item.isDirectory()) compare(name);
      else assert.deepEqual(fs.readFileSync(path.join(portable, 'assets/templates', name)), fs.readFileSync(path.join(repo, 'plugins/spec100/templates', name)), name);
    }
  };
  compare();
});

test('a CRLF source checkout generates the correct Claude skill and identical runtime', t => {
  const f = fixture(t, false), checkout = path.join(f.base, 'crlf checkout');
  fs.mkdirSync(path.join(checkout, 'plugins/spec100/skills/setup'), { recursive: true });
  for (const name of ['src/runtime.cts', 'scripts/build.mjs', 'skills/spec100-setup/SKILL.md']) {
    const file = path.join(checkout, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, fs.readFileSync(path.join(repo, name), 'utf8').replace(/\r?\n/g, '\r\n'));
  }
  fs.cpSync(path.join(repo, 'skills/spec100-setup/assets'), path.join(checkout, 'skills/spec100-setup/assets'), { recursive: true });
  const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: checkout, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(fs.readFileSync(path.join(checkout, 'plugins/spec100/skills/setup/SKILL.md'), 'utf8'), /^name: setup$/m);
  assert.deepEqual(fs.readFileSync(path.join(checkout, 'plugins/spec100/runtime/spec100.cjs')), fs.readFileSync(runtime));
});

test('a project-local portable setup skill can bootstrap its own installation', t => {
  const f = fixture(t, false), target = path.join(f.root, '.agents/skills/spec100-setup');
  fs.cpSync(path.join(repo, 'skills/spec100-setup'), target, { recursive: true });
  const bundledRuntime = path.join(target, 'scripts/spec100.cjs');
  const args = [bundledRuntime, 'setup', '--root', f.root, '--tool', 'codex', '--tool', 'antigravity', '--draft', f.input(draft())];
  const before = fs.readFileSync(path.join(target, 'SKILL.md'));
  const preview = spawnSync(process.execPath, [...args, '--dry-run'], { encoding: 'utf8' });
  assert.equal(preview.status, 0, preview.stderr);
  assert.deepEqual(fs.readFileSync(path.join(target, 'SKILL.md')), before);
  const installed = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(f.cli(['check'], 0, undefined, true).ok, true);
  assert.deepEqual(fs.readFileSync(path.join(target, 'SKILL.md')), before);
  f.setup(); assert.equal(f.cli(['check']).ok, true);
});

test('bootstrap adoption does not rewrite identical protected skill assets', t => {
  const f = fixture(t, false), target = path.join(f.root, '.agents/skills/spec100-setup');
  fs.cpSync(path.join(repo, 'skills/spec100-setup'), target, { recursive: true });
  const shim = path.join(f.base, 'protected-assets.cjs');
  fs.writeFileSync(shim, "const fs=require('node:fs');const rename=fs.renameSync;fs.renameSync=function(a,b){if(String(b).replaceAll('\\\\','/').includes('.agents/skills/spec100-setup/'))throw new Error('Protected bootstrap file was rewritten');return rename.apply(this,arguments);};");
  const result = spawnSync(process.execPath, ['--require', shim, path.join(target, 'scripts/spec100.cjs'), 'setup', '--root', f.root, '--tool', 'codex', '--draft', f.input(draft())], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.cli(['check']).ok, true);
});

test('ignored bootstrap assets are indexed immediately after adoption', t => {
  const f = fixture(t, false), target = path.join(f.root, '.agents/skills/spec100-setup');
  fs.cpSync(path.join(repo, 'skills/spec100-setup'), target, { recursive: true });
  f.write('.gitignore', '.agents/\n.codex/\n');
  f.setup(draft(), ['--tool', 'codex']);
  assert.match(f.read('harness/project-index.md'), /\.agents\/skills\/spec100-setup\/assets\/templates\/skills\/research.md/);
  assert.equal(f.cli(['check'], 0, undefined, true).ok, true);
});

test('fresh multi-tool setup does not call the symbolic-link API', t => {
  const f = fixture(t, false), shim = path.join(f.base, 'no-symlinks.cjs');
  fs.writeFileSync(shim, "require('node:fs').symlinkSync=()=>{throw new Error('Symbolic links are unavailable');};");
  const result = spawnSync(process.execPath, ['--require', shim, runtime, 'setup', '--root', f.root, '--tool', 'claude', '--tool', 'codex', '--tool', 'antigravity', '--draft', f.input(draft())], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.cli(['check']).ok, true);
});

for (const host of ['claude', 'codex', 'antigravity', 'generic']) {
  test(`${host} setup installs regular wrappers and only its selected integration`, t => {
    const f = fixture(t, false); f.setup(draft(), ['--tool', host]);
    const result = f.cli(['check'], 0, undefined, true);
    assert.equal(result.ok, true);
    assert.deepEqual(result.integrations.map(item => item.tool), [host]);
    assert.equal(result.integrations[0].activation, host === 'generic' ? 'unsupported' : 'unverified');
    assert.equal(fs.existsSync(path.join(f.root, 'CLAUDE.md')), host === 'claude');
    assert.equal(fs.existsSync(path.join(f.root, '.claude')), host === 'claude');
    const dir = host === 'claude' ? '.claude' : '.agents';
    for (const name of ['setup', 'check', 'research', 'plan', 'iterate', 'implement']) {
      const file = `${dir}/skills/spec100-${name}/SKILL.md`;
      assert.equal(fs.lstatSync(path.join(f.root, file)).isSymbolicLink(), false);
      assert.doesNotMatch(f.read(file), /disable-model-invocation|allow_implicit_invocation: false/);
    }
    if (host === 'codex') assert.match(f.read('.codex/agents/spec100-verifier.toml'), /shell_tool = false/);
    if (host === 'antigravity') assert.match(f.read('.agents/agents/spec100-verifier.md'), /subagent: true/);
    assert.match(f.read('harness/rules/STE-100.md'), /ASD-STE100 Simplified Technical English/);
  });
}

test('tools are additive and share canonical customizations without changing user configuration', t => {
  const f = fixture(t, false);
  f.write('AGENTS.md', '# User instructions\nKeep this text.\n');
  f.write('.codex/config.toml', '# Existing configuration\n[agents]\nenabled = true\n');
  const hook = { hooks: [{ command: 'echo user-hook', type: 'command' }] };
  f.write('.codex/hooks.json', JSON.stringify({ hooks: { Stop: [hook] } }));
  f.write('.agents/hooks.json', JSON.stringify({ custom: { Stop: [hook] } }));
  f.setup(draft(), ['--tool', 'codex']);
  f.write('harness/skills/plan.md', f.read('harness/skills/plan.md') + '\nPreserve the library public API.\n');
  const plan = f.read('harness/skills/plan.md'), config = f.read('.codex/config.toml');
  f.setup(draft(), ['--tool', 'antigravity', '--tool', 'claude']); f.setup();
  assert.equal(f.read('harness/skills/plan.md'), plan);
  assert.equal(f.read('.codex/config.toml'), config);
  assert.match(f.read('AGENTS.md'), /^# User instructions\nKeep this text\./);
  assert.deepEqual(JSON.parse(f.read('.codex/hooks.json')).hooks.Stop[0], hook);
  assert.deepEqual(JSON.parse(f.read('.agents/hooks.json')).custom.Stop[0], hook);
  assert.deepEqual(f.cli(['check']).integrations.map(item => item.tool), ['antigravity', 'claude', 'codex']);
});

test('selected integration checks retain shared checks and exclude other tool files', t => {
  const f = fixture(t, false); f.setup(draft(), ['--tool', 'claude', '--tool', 'codex']);
  const settings = JSON.parse(f.read('.claude/settings.json')); settings.disableAllHooks = true;
  f.write('.claude/settings.json', JSON.stringify(settings));
  assert.equal(f.cli(['check', '--tool', 'codex']).ok, true);
  assert.equal(f.cli(['check'], 1).checks.find(c => c.id === 'integration.claude.hooks').ok, false);
  f.write('harness/rules/STE-100.md', '');
  assert.equal(f.cli(['check', '--tool', 'codex'], 1).ok, false);
  f.cli(['check', '--tool', 'antigravity'], 2);
});

test('tool selection validates before writes and multi-tool dry-run has no side effects', t => {
  const f = fixture(t, false);
  f.cli(['setup', '--tool', 'unknown', '--draft', f.input(draft())], 2);
  assert.deepEqual(fs.readdirSync(f.root), []);
  f.setup(draft(), ['--tool', 'codex', '--tool', 'antigravity', '--dry-run']);
  assert.deepEqual(fs.readdirSync(f.root), []);
});

test('a modified generated wrapper is reported and is never overwritten by setup', t => {
  const f = fixture(t, false); f.setup(draft(), ['--tool', 'codex']);
  f.write('.agents/skills/spec100-plan/SKILL.md', '# User replacement\n');
  const before = f.read('harness/.runtime/manifest.json');
  assert.match(f.cli(['setup', '--tool', 'antigravity', '--draft', f.input(draft())], 2).error, /Modified generated file/);
  assert.equal(f.read('.agents/skills/spec100-plan/SKILL.md'), '# User replacement\n');
  assert.equal(f.read('harness/.runtime/manifest.json'), before);
  assert.equal(fs.existsSync(path.join(f.root, '.agents/hooks.json')), false);
});

function legacyFixture(f) {
  const legacy = JSON.parse(fs.readFileSync(path.join(repo, 'skills/spec100-setup/assets/templates/legacy-v1.json'), 'utf8'));
  for (const [name, body] of Object.entries(legacy)) f.write('harness/' + name, body);
  const manifest = JSON.parse(f.read('harness/.runtime/manifest.json'));
  delete manifest.schema; delete manifest.tools; delete manifest.generated; manifest.version = '1.0.0';
  f.write('harness/.runtime/manifest.json', JSON.stringify(manifest));
}

test('legacy manifests migrate known templates while retaining roles, plans, and learnings', t => {
  const f = fixture(t); f.art('plan', '# Existing plan');
  f.cli(['learn', '--file', f.input('Existing lesson', 'md')]);
  legacyFixture(f);
  f.write('harness/subagents/spec100-verifier.md', f.read('harness/subagents/spec100-verifier.md') + '\nPreserve this role customization.\n');
  const lesson = f.read('harness/learnings.md');
  const result = f.setup(draft(), ['--tool', 'codex']);
  assert.ok(result.migrations.includes('harness/skills/implement.md'));
  assert.equal(f.read('harness/thoughts/topic/plan_topic.md'), '# Existing plan');
  assert.equal(f.read('harness/learnings.md'), lesson);
  assert.match(f.read('harness/subagents/spec100-verifier.md'), /Preserve this role customization/);
  assert.doesNotMatch(f.read('harness/skills/implement.md'), /current Claude session/);
  assert.equal(f.cli(['check']).ok, true);
});

test('customized legacy instructions block migration with an exact path and no partial writes', t => {
  const f = fixture(t); legacyFixture(f);
  const relative = 'harness/skills/implement.md';
  f.write(relative, f.read(relative) + '\n# Custom instructions\n');
  const before = f.read('harness/.runtime/manifest.json'), body = f.read(relative);
  const result = f.cli(['setup', '--tool', 'codex', '--draft', f.input(draft())], 2);
  assert.match(result.error, /Customized legacy instructions need migration: harness\/skills\/implement.md/);
  assert.equal(f.read(relative), body); assert.equal(f.read('harness/.runtime/manifest.json'), before);
  assert.equal(fs.existsSync(path.join(f.root, '.codex')), false);
});

test('owned legacy links become regular wrappers and unowned links remain protected', t => {
  const f = fixture(t); legacyFixture(f);
  const relative = '.claude/skills/spec100-plan/SKILL.md', target = '../../../harness/skills/plan.md';
  fs.unlinkSync(path.join(f.root, relative));
  try { fs.symlinkSync(target, path.join(f.root, relative), 'file'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('This account cannot create legacy symbolic links'); throw error; }
  const manifest = JSON.parse(f.read('harness/.runtime/manifest.json')); manifest.links[relative] = target;
  f.write('harness/.runtime/manifest.json', JSON.stringify(manifest));
  f.setup(draft(), ['--tool', 'codex']);
  assert.equal(fs.lstatSync(path.join(f.root, relative)).isSymbolicLink(), false);
  assert.equal(f.cli(['check']).ok, true);
});

test('injected write failure rolls back a multi-tool installation on every platform', t => {
  const f = fixture(t, false); f.write('AGENTS.md', 'Original shared instructions\n');
  const shim = path.join(f.base, 'fail-write.cjs');
  fs.writeFileSync(shim, "const fs=require('node:fs');const rename=fs.renameSync;let failed=false;fs.renameSync=function(a,b){if(!failed&&String(b).replaceAll('\\\\','/').endsWith('.agents/skills/spec100-plan/SKILL.md')){failed=true;const e=new Error('Injected fixture write failure');e.code='EIO';throw e;}return rename.apply(this,arguments);};");
  const result = spawnSync(process.execPath, ['--require', shim, runtime, 'setup', '--root', f.root, '--tool', 'codex', '--tool', 'antigravity', '--draft', f.input(draft())], { encoding: 'utf8' });
  assert.equal(result.status, 2); assert.match(result.stderr, /Injected fixture write failure/);
  assert.equal(f.read('AGENTS.md'), 'Original shared instructions\n');
  assert.deepEqual(fs.readdirSync(f.root), ['AGENTS.md']);
});

test('a live writer prevents another mutation and leaves user files unchanged', t => {
  const f = fixture(t, false);
  f.write('.spec100-write.lock', JSON.stringify({ host: os.hostname(), pid: process.pid }));
  const before = f.read('.spec100-write.lock');
  assert.match(f.cli(['setup', '--draft', f.input(draft())], 2).error, /Another writer/);
  assert.match(f.cli(['recover'], 2).error, /still active/);
  assert.equal(f.read('.spec100-write.lock'), before);
  assert.equal(fs.existsSync(path.join(f.root, 'harness')), false);
});

test('dry-run cannot bypass locking or perform non-setup mutations', t => {
  const f = fixture(t);
  f.write('.spec100-write.lock', JSON.stringify({ host: os.hostname(), pid: process.pid }));
  const result = f.cli(['artifact', '--kind', 'research', '--topic', 'locked', '--name', 'locked', '--file', f.input('Must not write', 'md'), '--dry-run'], 2);
  assert.match(result.error, /only supported for setup/);
  assert.equal(fs.existsSync(path.join(f.root, 'harness/thoughts/locked')), false);
  f.cli(['index', '--dry-run'], 2);
  f.cli(['recover', '--dry-run'], 2);
  assert.equal(JSON.parse(f.read('.spec100-write.lock')).pid, process.pid);
});

for (const host of ['claude', 'codex', 'antigravity']) {
  test(`shared workflow gates complete for ${host} and invalidate on integration changes`, t => {
    const f = fixture(t, false); f.setup(draft(), ['--tool', host]); start(f, host);
    f.write('src/library.js', 'export const valid = true;'); cleanEvidence(f, undefined, host);
    assert.equal(f.cli(['workflow', 'check', '--topic', 'topic']).ok, true);
    fs.mkdirSync(path.join(f.root, 'empty-new-folder')); f.cli(['index']);
    assert.equal(f.cli(['workflow', 'check', '--topic', 'topic']).ok, true);
    f.cli(['workflow', 'finish', '--topic', 'topic']);
    const instructions = host === 'claude' ? 'CLAUDE.md' : 'AGENTS.md';
    f.write(instructions, f.read(instructions).replace('# SPEC-100 agent harness', '# Changed SPEC-100 agent instructions'));
    const stale = f.cli(['workflow', 'check', '--topic', 'topic'], 1);
    assert.equal(stale.checks.find(c => c.id === 'workflow.review').ok, false);
    assert.equal(stale.checks.find(c => c.id === 'workflow.capabilities').ok, false);
  });
}

test('capability limits block implementation without resetting review history', t => {
  const f = fixture(t, false); f.setup(draft(), ['--tool', 'antigravity']);
  f.art('plan', '# Plan'); f.cli(['workflow', 'start', '--topic', 'topic']);
  f.evidence('capabilities', { ...capabilities('antigravity', 'ide'), independentAgents: false });
  assert.equal(f.cli(['workflow', 'status', '--topic', 'topic']).status, 'blocked');
  f.cli(['workflow', 'finish', '--topic', 'topic'], 2);
  f.evidence('capabilities', capabilities('antigravity', 'ide'), 2);
  f.evidence('capabilities', capabilities('antigravity', 'cli'));
  assert.equal(f.cli(['workflow', 'status', '--topic', 'topic']).rounds, 0);
  const generic = fixture(t, false); generic.setup(draft(), ['--tool', 'generic']);
  generic.art('plan', '# Generic plan'); generic.cli(['workflow', 'start', '--topic', 'topic']);
  generic.evidence('capabilities', capabilities('generic'), 2);
  generic.evidence('capabilities', { ...capabilities('generic'), hooksActive: false });
  assert.equal(generic.cli(['workflow', 'status', '--topic', 'topic']).status, 'blocked');
});

test('multi-tool workflows require an explicit owner and reject another tool capability record', t => {
  const f = fixture(t, false); f.setup(draft(), ['--tool', 'codex', '--tool', 'antigravity']);
  f.art('plan', '# Plan'); f.cli(['workflow', 'start', '--topic', 'topic'], 2);
  f.cli(['workflow', 'start', '--topic', 'topic', '--tool', 'codex', '--session', 'actual-session']);
  f.evidence('capabilities', capabilities('antigravity'), 2);
  assert.equal(JSON.parse(f.read('harness/thoughts/topic/run.json')).tool, 'codex');
});

test('Codex hooks deny unapproved risk, protect patch destinations, and never emit ask', t => {
  const f = fixture(t, false); f.setup(draft(), ['--tool', 'codex']); start(f, 'codex');
  const hook = args => f.cli(['hook', '--tool', 'codex', '--event', 'PreToolUse'], 0, args);
  const risky = { tool_name: 'Bash', tool_input: { command: 'git reset --hard' } };
  assert.equal(hook(risky).hookSpecificOutput.permissionDecision, 'deny');
  for (const command of ['git reset --hard; echo workflow approve', 'echo workflow approve && git reset --hard', 'node harness/.runtime/spec100.cjs workflow approve --topic topic --file approval.json; git reset --hard']) {
    assert.equal(hook({ tool_name: 'Bash', tool_input: { command } }).hookSpecificOutput.permissionDecision, 'deny', command);
  }
  const patch = { tool_name: 'apply_patch', tool_input: { command: '*** Begin Patch\n*** Update File: src/library.js\n*** Move to: harness/.runtime/manifest.json\n@@\n-a\n+b\n*** End Patch' } };
  assert.equal(hook(patch).hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(hook({}).hookSpecificOutput.permissionDecision, 'deny');
  const approval = hook({ tool_name: 'Bash', tool_input: { command: 'node harness/.runtime/spec100.cjs workflow approve --topic topic --file approval.json' } });
  assert.match(approval.hookSpecificOutput.additionalContext, /actual explicit human response/);
  f.cli(['workflow', 'approve', '--topic', 'topic', '--file', f.input({ userResponse: 'Fixture-only approval', reason: 'Test the current fingerprint' })]);
  assert.deepEqual(hook(risky), {});
  f.write('changed.js', 'new code');
  assert.equal(hook(risky).hookSpecificOutput.permissionDecision, 'deny');
});

test('Antigravity hooks translate native payloads and bound stop retries', t => {
  const f = fixture(t, false); f.setup(draft(), ['--tool', 'antigravity']); start(f, 'antigravity');
  const hook = (event, input) => f.cli(['hook', '--tool', 'antigravity', '--event', event], 0, input);
  assert.equal(hook('PreToolUse', { toolCall: { name: 'run_command', args: { CommandLine: 'git reset --hard' } } }).decision, 'force_ask');
  assert.equal(hook('PreToolUse', { toolCall: { name: 'write_to_file', args: { TargetFile: path.join(f.root, 'harness/learnings.md') } } }).decision, 'deny');
  assert.equal(hook('PreToolUse', {}).decision, 'deny');
  assert.equal(hook('Stop', { executionNum: 0, fullyIdle: true }).decision, 'continue');
  assert.deepEqual(hook('Stop', { executionNum: 1, fullyIdle: true }), {});
  assert.deepEqual(hook('Stop', { executionNum: 0, fullyIdle: false }), {});
});

test('Antigravity allows required reads and research routing after a blocked implementation', t => {
  const f = fixture(t, false); f.setup(draft(), ['--tool', 'antigravity']);
  f.art('plan', '# Plan'); f.cli(['workflow', 'start', '--topic', 'topic']);
  f.evidence('capabilities', { ...capabilities('antigravity', 'ide'), independentAgents: false });
  const hook = (name, args) => f.cli(['hook', '--tool', 'antigravity', '--event', 'PreToolUse'], 0, { toolCall: { name, args } });
  for (const file of ['README.md', 'harness/learnings.md', 'harness/.runtime/protocol.md']) {
    assert.equal(hook('view_file', { AbsolutePath: path.join(f.root, file) }).decision, 'allow');
  }
  assert.equal(hook('grep_search', { SearchPath: f.root, Query: 'twice' }).decision, 'allow');
  assert.equal(hook('run_command', { CommandLine: 'node harness/.runtime/spec100.cjs artifact --kind research --topic notes --name notes --file draft.md' }).decision, 'allow');
  assert.equal(hook('write_to_file', { TargetFile: path.join(f.root, 'library.cjs') }).decision, 'deny');
  assert.equal(hook('run_command', { CommandLine: 'node build.cjs' }).decision, 'deny');
});

test('generated hook launchers run from subdirectories and paths with shell metacharacters', t => {
  const f = fixture(t, false), special = path.join(f.root, "cash $() ` tick ' & project");
  fs.mkdirSync(special);
  const result = spawnSync(process.execPath, [runtime, 'setup', '--root', special, '--tool', 'codex', '--draft', f.input(draft())], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const hooks = JSON.parse(fs.readFileSync(path.join(special, '.codex/hooks.json'), 'utf8'));
  fs.mkdirSync(path.join(special, 'nested'));
  const child = spawnSync(hooks.hooks.SessionStart[0].hooks[0].command, { cwd: path.join(special, 'nested'), shell: true, encoding: 'utf8', input: '{}' });
  assert.equal(child.status, 0, child.stderr);
  assert.match(JSON.parse(child.stdout).hookSpecificOutput.additionalContext, /SPEC-100 is installed/);
  const check = spawnSync(process.execPath, [path.join(special, 'harness/.runtime/spec100.cjs'), 'check', '--json'], { cwd: path.join(special, 'nested'), encoding: 'utf8' });
  // Creating the subdirectory makes only the index stale. The runtime must still find the project root.
  assert.equal(check.status, 1); assert.equal(JSON.parse(check.stdout).checks.find(c => c.id === 'installation.manifest'), undefined);
});
