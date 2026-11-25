# Release notes skills in the harness setup

Date: 2026-11-25. Question: why does a project that has the SPEC-100 harness not contain the `release-notes-project` and `release-notes-stakeholder` skills?

## Finding

The setup command does not install the two skills. This was a design decision in version 2.3.0, not a fault in one install.

| Fact | Source |
|---|---|
| Setup installs native skill folders only for `check` and the four `SKILLS` (`research`, `plan`, `iterate`, `implement`), plus `spec100-setup`. | `src/runtime.cts:144`, `src/runtime.cts:456-462` |
| Setup reads its files from the setup templates folder. The templates folder has no release notes files. | `src/runtime.cts:320-325`, `skills/spec100-setup/assets/templates/` |
| The build writes the release notes skills only into `skills/release-notes-*` and `plugins/spec100/skills/release-notes-*`. It does not write them into the templates folder. | `scripts/build.mjs:13-25` |
| The README states: "They are separate from the harness and need no setup." | `README.md:120` |
| The 2.3.0 research states: "Release notes are not part of the harness." | `thoughts/research/2026-11-23-release-notes.md` |

Result: the skills are available only through the Claude plugin (`/spec100:release-notes-project`) or through a manual copy of the portable folder. A project with the harness has no copy of them. A teammate who clones the project, or a Codex, Antigravity, or generic agent, cannot find them.

## How setup installs a native skill

- `put(relative, content, preserve, native)` adds a file to one transaction. With `native = true`, the manifest records a digest. `check` then reports a modified file as `integration.file.<path>`.
- `put` refuses a file that exists and that the harness does not own (`Unmanaged file collision`). One exception exists: a file under `.agents/skills/spec100-setup/` or `.claude/skills/spec100-setup/` that is identical to the template. Setup adopts it without a write.
- The native skill folder is `.claude/skills/` for Claude. It is `.agents/skills/` for Codex, Antigravity, and generic.
- `check` verifies every owned file and every generated digest. A new owned file needs no new check code.
- `scan` keeps harness files in the index even when Git ignores them. Its `forced` pattern names only `spec100-*` skill folders.
- `copyTemplates` copies the full templates folder into `harness/.runtime/templates/` and into each `spec100-setup/assets/templates/`. A file in the templates folder therefore travels with each project copy of the setup skill.

## Facts about the release notes skills

- Each portable folder has `SKILL.md` and `scripts/release-notes.cjs`. The two scripts are the same file, 24,289 bytes.
- The portable `SKILL.md` names the script as "the absolute path of `scripts/release-notes.cjs` in this skill folder". This text works in any skill folder.
- The script needs only Node.js and Git. It writes only the paths that the user selects.

## Constraints

- The project copy must be a regular file, not a link, as for the other wrappers.
- Setup must not overwrite a user copy that is different. It can adopt an identical copy.
- A Claude user with the plugin sees two entries for each skill: `release-notes-project` and `spec100:release-notes-project`. The same duplication exists today for `spec100-plan` and `spec100:plan`.
- The generic tool does not discover skills. Its only guide is the managed `AGENTS.md` section.
