# Project tmp deletion plan

Source: `thoughts/research/2026-11-25-scratchpad-rm.md`. Date: 2026-11-25.

## Goal

In a Claude Code project with the SPEC-100 harness, the PreToolUse hook does not ask for approval for an `rm` whose targets are all inside the tmp folder of that project. Every other risky command keeps the current gate.

## Acceptance criteria

1. The hook returns no decision for `rm -rf <project tmp>/<session>/scratchpad/x` when no run has approval.
2. The hook returns no decision for a target in another session folder of the same project tmp folder.
3. The hook returns `ask` (Claude) for each of these forms:
   - the project tmp folder itself;
   - a mix of a tmp target and a project target;
   - a compound command, a glob, a variable, `~`, or a quoted path;
   - a `..` path that leaves the tmp folder;
   - a link in the tmp folder that points into the project;
   - a command name other than `rm` (for example `sudo rm`);
   - an input without `scratchpad_dir`.
4. If the folder above `scratchpad_dir` is not named with the `session_id`, only the scratchpad folder is exempt.
5. Codex and Antigravity behavior does not change.
6. `npm run check` passes.

## Decisions

- Source of the folder: the documented `scratchpad_dir` hook input field (Claude Code 2.1.257 or later). The project tmp folder is `dirname(dirname(scratchpad_dir))` when `basename(dirname(scratchpad_dir))` equals `session_id`. Otherwise it is `scratchpad_dir`.
- Result: no decision (`{}`), not `allow`. The normal permission flow of Claude Code then decides, as it does now for `rm file.txt`. Option B of the research (`allow`) is not built. Flag it to the user.
- Parse: accept only `rm`, then flags, then paths, separated by spaces. Accepted flags: short groups of `r`, `R`, `f`, `v`, `d`; `--recursive`; `--force`; `--`. Refuse the command if it has any of these characters: ``; & | ` $ ( ) < > * ? [ ] { } ~ " ' \ # !``, CR, or LF.
- Path check: resolve each path against `input.cwd`, then use `projectPath(canonical(tmp), target)`. A path is inside when the relative path is not empty, is not `..`, does not start with `../`, and is not absolute.
- Scope: the Claude host only.
- Version 2.3.1. Add `2.3.0` to the supported versions.
- Do not commit. The user did not ask for commits in this goal.
- Do not change `.claude/hooks/allow-scratchpad-rm.py` or `.claude/settings.local.json`. They are local to this repository and outside the request.

## Phase 1: runtime

File: `src/runtime.cts`.

1. Add `projectTmp(input)`. It returns the canonical project tmp folder, or `undefined` when `scratchpad_dir` is missing or not absolute.
2. Add `tmpRemoval(command, base, input)`. It applies the parse and the path check above.
3. In `hook()`, change the `dangerous` test. A risky command is not dangerous when `host === 'claude'` and `tmpRemoval(...)` is true. The file-target tests stay the same.

Sketch:

```ts
function projectTmp(input: any): string | undefined {
  const scratchpad = input.scratchpad_dir;
  if (typeof scratchpad !== 'string' || !path.isAbsolute(scratchpad)) return undefined;
  const session = path.dirname(scratchpad);
  return canonical(input.session_id && path.basename(session) === input.session_id ? path.dirname(session) : scratchpad);
}
function tmpRemoval(command: string, base: string, input: any): boolean {
  const tmp = projectTmp(input);
  if (!tmp || /[;&|`$()<>*?[\]{}~"'\\#!\r\n]/.test(command)) return false;
  const [name, ...words] = command.trim().split(/\s+/);
  if (name !== 'rm') return false;
  // ... flags, then paths; every path inside tmp
}
```

## Phase 2: tests

File: `test/runtime.test.mjs`. Add one test that builds a fake tmp layout under the fixture base folder. It checks each acceptance criterion from 1 to 5. Keep the existing destructive-command test unchanged.

## Phase 3: version and docs

1. Version 2.3.1 in `src/runtime.cts`, `package.json`, `package-lock.json`, `plugins/spec100/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and the manifest assertion in `test/runtime.test.mjs`.
2. README: one sentence in the PreToolUse paragraph.
3. `skills/spec100-setup/assets/templates/protocol.md`: one sentence after the hook sentences. The build copies it to `plugins/spec100/templates/`.
4. Run `npm run build` to regenerate the two runtime copies and the plugin templates.

## Verification

1. Baseline: `npm run check` before any change.
2. Final: `npm run check` after all changes.
3. Live check: set up the built runtime in a scratch project. Send a PreToolUse input with the real `scratchpad_dir` of this session to the hook. Confirm no decision for a scratchpad target and `ask` for a project target.
4. Independent review: one code reviewer and one security reviewer. Two independent verifiers for each finding. Maximum three rounds.

## Risk

- Level: medium. The change makes a destructive-command gate less strict. It does not touch authentication, migrations, production, or CI.
- A loose parse can hide a project deletion. The strict character list, the `rm`-only rule, the canonical path check, and the tests reduce this risk.
- No step in this plan deletes user data or changes another project. No high-risk action needs approval.

## UAT

Not applicable. The change is in a library hook with no visual user flow. The live hook check in Verification replaces it.

## Detection

- A user reports a prompt for a scratchpad `rm` on Claude Code 2.1.257 or later.
- A user reports that an `rm` outside the tmp folder ran without the SPEC-100 prompt.

## Rollback

1. Revert the changes in this plan.
2. Run `npm run build`.
3. In each affected project, run setup again with the 2.3.0 plugin.

## Not in scope (flag to the user)

- Return `allow` so that the native Claude Code prompt is also skipped.
- Exempt other delete forms (`find -delete`, `git clean`, PowerShell `Remove-Item`).
- Re-run setup in `ai-crm`. The user decides when to update that project.
