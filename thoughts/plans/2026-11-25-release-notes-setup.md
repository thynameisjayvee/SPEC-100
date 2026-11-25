# Release notes skills in the harness setup plan

Source: `thoughts/research/2026-11-25-release-notes-setup.md`. Date: 2026-11-25.

## Goal

Setup installs `release-notes-project` and `release-notes-stakeholder` into each project native skill folder, together with the other harness skills.

## Decisions

- The project folders keep the names `release-notes-project` and `release-notes-stakeholder`. The user knows the skills by these names.
- The project `SKILL.md` is the portable `SKILL.md`, unchanged. The script is `scripts/release-notes.cjs` next to it.
- The build writes three files into the setup templates: `release-notes/release-notes-project.md`, `release-notes/release-notes-stakeholder.md`, and `release-notes/release-notes.cjs`. The existing copy step then puts them into the plugin templates.
- Setup writes the files with `native = true`. `check` then finds a deleted or modified file.
- Setup adopts an identical existing copy, as it does for `spec100-setup`. It refuses a different copy.
- The managed `AGENTS.md` section names the two skills and their folder, so that a generic agent can find them. The managed `CLAUDE.md` section does not change, because Claude discovers `.claude/skills/`.
- Version 2.4.0, so that installed plugins update.
- No commit, because the user did not ask for one. The work is on the local branch `release-notes-setup`.

## Phase 1: build

File: `scripts/build.mjs`.

1. Write the generated release notes script and the two portable `SKILL.md` files into `skills/spec100-setup/assets/templates/release-notes/` before the templates copy step.

## Phase 2: runtime

File: `src/runtime.cts`.

1. Add `const NOTES = ['release-notes-project', 'release-notes-stakeholder']`.
2. In `setup`, in the native skill folder loop, put `<dir>/skills/<name>/SKILL.md` and `<dir>/skills/<name>/scripts/release-notes.cjs` from the templates, with `native = true`.
3. Extend the identical-copy adoption to `<dir>/skills/release-notes-(project|stakeholder)/`.
4. Add the two skills to the `commands` result.
5. Add one sentence to the shared managed section.
6. Set `VERSION` to 2.4.0. Add 2.3.1 to `SUPPORTED_VERSIONS`.

## Phase 3: tests

File: `test/runtime.test.mjs`.

1. For each tool, setup writes both skills as regular files. Each file is identical to the portable file. `check` passes.
2. The installed script runs: `collect` in the project prints a result.
3. `check` reports a modified project copy.
4. Setup adopts an identical portable copy and refuses a different copy without a write.

## Phase 4: docs and version

1. README: the release notes section and the tool table.
2. `skills/spec100-setup/SKILL.md`: name the two skills in the command list.
3. Version 2.4.0 in `package.json`, `package-lock.json`, `plugin.json`, and `marketplace.json`.

## Acceptance

- `npm run check` passes.
- Setup in a new temporary project writes both skill folders for Claude and for `.agents`.
- A second setup in an existing 2.3.1 project adds the two folders and changes no customized file.

## Atomicity

Setup writes all files in one journal transaction. A stopped setup rolls back on `recover`. No new risk.

## Rollback

Restore the changed files from the previous commit. In a project, setup does not remove the two folders. The user deletes them and restores the project from version control.

## Not in scope

- A setup option to leave out the release notes skills.
- A canonical, customizable copy under `harness/skills/`.

## Execution record

Implemented on 2026-11-25 on macOS. All phases are complete. Nothing is committed. The changes are on the local branch `release-notes-setup`.

- `npm run check`: the type check passed. The runtime tests: 86 passed, 0 failed. The release notes tests: 8 passed, 0 failed.
- An end-to-end run in a temporary project: the 2.3.1 setup from `HEAD` installed no release notes skills. The new setup then added both skills to `.claude/skills/` and `.agents/skills/`. `check` passed. A third setup from the project copy of `spec100-setup` wrote no files.
- Change from the plan: the `forced` pattern in `scan` did not change. `scan` already keeps every owned folder, also when Git ignores it. A test with an ignored `.agents/` folder covers this.

Residual risks:

- A Claude user with the plugin sees each skill two times: `release-notes-project` and `spec100:release-notes-project`.
- Setup refuses an existing copy that is different from the template. The user must remove or rename it first.
- No live run of the installed skills through Claude Code, Codex, or Antigravity.
