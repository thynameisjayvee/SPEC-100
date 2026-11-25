# Deletion in the project tmp folder without approval

Date: 2026-11-25. Tool: Claude Code 2.1.332 on macOS, `permissions.defaultMode: auto`. Question: why does the SPEC-100 hook ask for approval when the agent deletes files in the scratchpad, and how can the harness stop this for the tmp folder of its own project?

## Requirements

1. In a project with the SPEC-100 harness (for example `ai-crm`), `rm -r` or `rm -f` on files in the tmp or scratchpad folder of that project does not need SPEC-100 approval.
2. The same command on any other folder keeps the current approval gate.
3. `rm file.txt` without `-r` or `-f` already does not ask. This behavior stays.

## Method

1. Read the PreToolUse code in `src/runtime.cts` and the hook tests in `test/runtime.test.mjs`.
2. Read the local hook `.claude/hooks/allow-scratchpad-rm.py` and `.claude/settings.local.json` in this repository.
3. Read the user settings and the `ai-crm` settings.
4. Read the official hook docs at `code.claude.com/docs/en/hooks`.
5. Inspected the tmp layout and the environment of this session.

## Observations from the code

| # | Observation | Source |
|---|---|---|
| 1 | `RISKY_COMMANDS` matches `rm` with any flag that contains `r` or `f`, or `--recursive` or `--force`. The match uses the command text only. | `src/runtime.cts:829-830` |
| 2 | For a Bash call, `targets` is empty, because the hook reads only `file_path`, `notebook_path`, `TargetFile`, and `AbsolutePath`. So the hook does not know the folder of an `rm` target. | `src/runtime.cts:938`, `:948` |
| 3 | When a risky command matches and no active run has current approval, the hook returns `ask`. | `src/runtime.cts:950-953` |
| 4 | With no match, the hook returns `{}` (no decision) unless a capability gate denies the call. | `src/runtime.cts:964-973` |
| 5 | `rm notes-of.txt` gives no decision, and `rm -rf build` gives `ask`. A test asserts both. | `test/runtime.test.mjs:869-877` |
| 6 | `projectPath(root, file)` resolves links in the nearest existing folder and compares in lower case on macOS. `canonical(file)` resolves links. | `src/runtime.cts:846-858` |
| 7 | The hook already knows the session folder through `input.cwd` and the session through `input.session_id`. | `src/runtime.cts:924`, `:937` |
| 8 | This repository has a local hook that returns `allow` for an `rm` whose targets are all in `/private/tmp/claude-504/-Users-jayveetolibas-Documents-SPEC-100`. The path is fixed in the script, so it works for this repository only. | `.claude/hooks/allow-scratchpad-rm.py:11` |
| 9 | `ai-crm` has the SPEC-100 PreToolUse hook and no local scratchpad hook. | `~/Documents/ai-crm/.claude/settings.json` |
| 10 | The user setting is `permissions.defaultMode: auto`. No allow rule names `rm`. | `~/.claude/settings.json` |

## Observations from the docs

| Topic | Fact (quoted or close paraphrase) |
|---|---|
| Hook input | The common input fields include `scratchpad_dir`: "Path to the session's scratchpad directory. Requires Claude Code v2.1.257 or later." The example value is `/tmp/claude-1000/-home-user-my-project/abc123/scratchpad`. |
| Precedence | "When multiple PreToolUse hooks return different decisions, precedence is `deny` > `defer` > `ask` > `allow`." |
| `ask` in auto mode | "In auto mode, a PreToolUse hook's `"ask"` normally sends the tool call to the permission prompt, and the classifier doesn't decide it." |
| No decision | "Exit code 0 with no output means the hook has no decision to report, so the tool call continues through the normal permission flow." |
| `allow` | "`"allow"` skips the permission prompt, except for actions no mode auto-approves ... Deny and ask rules are still evaluated regardless of what the hook returns." |

## Observations from the environment

| Item | Value |
|---|---|
| Scratchpad of this session | `/private/tmp/claude-504/-Users-jayveetolibas-Documents-SPEC-100/<session-id>/scratchpad` |
| Layout | `<tmp>/claude-<uid>/<project folder name>/<session-id>/scratchpad`. The project folder name is the same as the folder name under `~/.claude/projects/`. |
| `/tmp` | A link to `/private/tmp` on macOS. `TMPDIR` is a different folder (`/var/folders/...`), so Claude Code does not use `os.tmpdir()` for this path. |

## Findings

1. Cause. The SPEC-100 hook checks only the command text of `rm`. It does not examine the target folder. So `rm -rf <scratchpad>/x` gets `ask`, the same as `rm -rf src`.
2. The local `allow` hook cannot fix this. Precedence puts `ask` above `allow`, so the SPEC-100 `ask` wins. In auto mode, `ask` always shows a prompt.
3. The hook can find the project tmp folder without a fixed path. Claude Code sends `scratchpad_dir` in each PreToolUse input. The project tmp folder is two levels above it, when the parent folder name is the `session_id`.
4. The SPEC-100 hook does not need to return `allow`. If it returns no decision for these targets, the normal permission flow applies. That is the same flow that `rm file.txt` gets now, which the user reports does not ask.
5. Codex and Antigravity do not send `scratchpad_dir`. A change that depends on this field has no effect on them.

## Constraints

- The hook must not exempt a command that can delete something outside the tmp folder. Compound commands (`;`, `&&`, `|`), substitutions (`$(...)`, backticks), globs, `~`, and redirections can hide other targets. The exemption must refuse them all.
- A target path can contain a link to a project folder. The check must resolve links, as `canonical()` does now.
- The check must compare paths in lower case on macOS, as `projectPath()` does now.
- The project tmp folder itself is not a target to exempt. Only paths inside it are. The local hook uses the same rule.
- Claude Code earlier than 2.1.257 does not send `scratchpad_dir`. In that case the current gate stays.

## Options

| Option | Effect | Assessment |
|---|---|---|
| A. Exempt an `rm` from `RISKY_COMMANDS` when every target is inside the project tmp folder from `scratchpad_dir`. Return no decision. | The SPEC-100 gate does not ask. The normal permission flow decides, as for `rm file.txt`. | Smallest change. No fixed paths. No new setting. Selected. |
| B. Option A, but return `allow`. | Also skips the native prompt of Claude Code. | Gives more than the request. It overrides the native permission mode of the user. Not selected. Flag to the user. |
| C. Install the local Python hook in each project during setup. | Does not work: the SPEC-100 `ask` wins over `allow`. | Rejected. |
| D. Derive the tmp folder from `/tmp/claude-<uid>/` and the `transcript_path` folder name. | Works on older Claude Code. | Depends on an undocumented layout. `scratchpad_dir` is documented. Rejected. |

## Risks

- The exemption depends on a correct parse of a simple `rm` command. A parse that is too loose can hide a project deletion. The plan must refuse every form that is not a plain `rm [flags] path...`.
- If Claude Code changes the layout above `scratchpad_dir`, the session-folder check fails. Then only the scratchpad folder itself is exempt. That result is safe.

## Unknowns

- The docs do not say if a subagent hook receives the same `scratchpad_dir`. This does not change the design, because each value is a folder of the same project.
