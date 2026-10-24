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
    assert.equal(r.status, expected, `${args.join(' ')}\n${stdout}\n${stderr}`);
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
function start(f) {
  f.art('plan', '# Plan\n\nImplement the requested validation behavior.');
  f.cli(['workflow', 'start', '--topic', 'topic']);
  f.evidence('preflight', verification);
  f.evidence('checkpoints', checkpoints());
}
function cleanEvidence(f, uat = { applicable: false, reason: 'A library-only change with no visual user flow.' }) {
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
    assert.match(skill, new RegExp(`name: ${name}\\n`));
    if (['research', 'plan', 'iterate', 'implement'].includes(name)) assert.match(skill, new RegExp(`harness/skills/${name}\\.md`));
  }
});
test('setup installs a self-contained compliant harness in an empty project', t => {
  const f = fixture(t);
  assert.equal(f.cli(['check'], 0, undefined, true).ok, true);
  assert.equal(fs.readlinkSync(path.join(f.root, '.claude/skills/spec100-plan/SKILL.md')), '../../../harness/skills/plan.md');
  assert.match(f.read('CLAUDE.md'), /harness\/thoughts\//);
  assert.match(f.read('harness/project-context.md'), /Library consumers/);
  assert.match(f.read('harness/subagents/spec100-code-reviewer.md'), /tools: Read, Glob, Grep\n/);
  assert.doesNotMatch(f.read('harness/subagents/spec100-code-reviewer.md'), /tools:.*Bash/);
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
  assert.equal(fs.statSync(path.join(f.root, 'CLAUDE.md')).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(f.root, '.claude/settings.json')).mode & 0o777, 0o600);
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
  assert.match(f.cli(['setup', '--draft', f.input(draft())], 2).error, /link collision/);
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
test('a symlink creation failure rolls back the entire installation', t => {
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
  f.evidence('risk', { level: 'low', reason: 'Documentation-only editing' }); f.evidence('checkpoints', checkpoints(['editor-1']));
  const result = f.cli(['workflow', 'check', '--topic', 'topic']); assert.equal(result.ok, true);
  assert.equal(result.checks.some(c => c.id === 'workflow.uat'), false);
});
test('later runs retain completed topics as history without accepting modified historical evidence', t => {
  const f = fixture(t, true, false);
  f.art('plan', '# First plan'); f.cli(['workflow', 'start', '--topic', 'topic']);
  f.evidence('risk', { level: 'low', reason: 'Documentation only' }); f.evidence('checkpoints', checkpoints(['editor-1']));
  f.cli(['workflow', 'finish', '--topic', 'topic']);
  f.cli(['artifact', '--kind', 'plan', '--topic', 'second', '--name', 'second', '--file', f.input('# Second plan', 'md')]);
  f.cli(['workflow', 'start', '--topic', 'second']);
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
  assert.equal(result.checks.find(c => c.id === 'link..claude/skills/spec100-plan/SKILL.md').ok, false);
  assert.equal(result.checks.find(c => c.id === 'file.harness/rules/YAGNI-KISS.md').ok, false);
});
test('disabled hooks and invalid native frontmatter fail compliance', t => {
  const f = fixture(t);
  const settings = JSON.parse(f.read('.claude/settings.json')); settings.disableAllHooks = true;
  f.write('.claude/settings.json', JSON.stringify(settings));
  f.write('harness/skills/plan.md', '# Not a native skill');
  f.write('harness/subagents/spec100-code-reviewer.md', f.read('harness/subagents/spec100-code-reviewer.md').replace('tools: Read, Glob, Grep', 'tools: Read, Bash'));
  const result = f.cli(['check'], 1);
  for (const id of ['integration.hooks', 'native.skill.plan', 'native.agent.code-reviewer']) assert.equal(result.checks.find(c => c.id === id).ok, false);
});
