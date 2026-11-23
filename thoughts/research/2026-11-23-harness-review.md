# SPEC-100 harness review

Date: 2026-11-23. Scope: `src/runtime.cts`, the generated runtimes, the templates, the skills, the build, the CI, and the docs at commit `c9cfc89`.

## Method

1. Read the runtime source, the tests, the templates, the skills, and the docs.
2. Ran `npm run check` on macOS (Darwin 25.3, Node 24.14.1, Git 2.50.1). Result: 64 tests passed, 0 failed, 0 skipped. The run took 144 s.
3. Timed each hook event on a fixture project with 1,800 tracked files. Profiled the slowest event.
4. Wrote a reproduction script for each suspected defect. The script ran against the committed runtime. Each item below that has the tag **[reproduced]** failed in that script.
5. Requested one independent security review of the runtime. Its confirmed results are in the plan.

## Findings: security gates

| ID | Severity | Finding |
|---|---|---|
| S1 | High | **[reproduced]** An agent can record approval without a native permission prompt. The hook asks for permission only for one exact command form. The form `node ./harness/.runtime/spec100.cjs workflow approve ...` and an unquoted absolute path do not match. The hook then allows the command (`runtime.cts:766-772`). |
| S2 | High | **[reproduced]** A file tool can write `harness/thoughts/<topic>/run.json` directly. The hook protects `harness/learnings.md` and `harness/.runtime/` only (`runtime.cts:759-762`). The run record holds all evidence, so a direct write can add approval, review, or capability evidence. |
| S3 | High | **[reproduced]** The hook launcher contains the absolute project path (`runtime.cts:292-296`). Teams commit `.claude/settings.json`. After a clone to another path or a move, the launcher cannot find the runtime and exits 1. Claude Code and Codex treat exit 1 as a non-blocking error, so every gate fails open. |
| S4 | Medium | **[reproduced]** The protected-path check compares case-sensitive strings. On macOS and Windows, `HARNESS/Learnings.md` is the same file, but the hook allows the write. The check also ignores symbolic links in the parent path. |
| S5 | Medium | **[reproduced]** The hook resolves relative paths against the project root, not against the tool `cwd`. A Codex patch for `../harness/learnings.md` from a subfolder passes the check. |
| S6 | Medium | **[reproduced]** The Claude matcher omits `NotebookEdit` and `MultiEdit`. The hook also ignores `notebook_path`. |
| S7 | Medium | **[reproduced]** The risky-command pattern misses `git push -f`, `git push origin +main`, `git branch -D`, `git checkout -- .`, `rd /s`, `del /s`, and `Remove-Item -r`. The policy calls these actions destructive. |
| S8 | Low | The runtime exemption accepts any quoted path that ends in `harness/.runtime/spec100.cjs`. The path can be outside the project. |
| S9 | Low | `prepare` reads YAML excerpts. Its secret filter misses names such as `secrets.yaml`, `id_rsa`, `.npmrc`, `*.pfx`, `*.tfvars`, and `*.tfstate`. |
| S10 | Low | The index and the auto-loaded `CLAUDE.md` section copy file names without escaping control characters. A file name that contains a line break can add text to the agent instructions. |

### Added by the independent review

The independent reviewer ran each item below against the committed runtime, except R2.

| ID | Severity | Finding |
|---|---|---|
| R1 | Medium | The exclusion list (`build`, `dist`, `vendor`, `target`, `.cache`, and others) also removes tracked source files. Edits to a tracked file such as `src/build/gen.js` do not change the fingerprint. They also skip the high-risk path check. |
| R2 | Medium | On Windows, `recover` validates only the parent of a journal path, and it splits on `/` only. The path `a/..\..\..\Windows\x.dll` passes both checks and resolves outside the project. The reviewer calculated this result but did not run it on Windows. |
| R3 | Medium | Each hook reads all run records before it checks the event. A moved plan file (`ENOENT`) or a topic folder with an invalid name makes every hook exit 2. Exit 2 blocks every Bash, Write, and Edit call, so the agent cannot repair the cause. |
| R4 | Low | An agent can edit `.claude/settings.json`, `.codex/hooks.json`, or `.agents/hooks.json` without approval and remove the hooks. Inside a run, the capability fingerprint then becomes stale. Outside a run, nothing asks for approval. |
| R5 | Low | A run that a direct `run.json` edit sets back to `active` with zero rounds accepts new review rounds. This is the effect of S2. |

## Findings: defects

| ID | Severity | Finding |
|---|---|---|
| B1 | High | **[reproduced]** A Stop hook error exits with code 2. Claude Code treats Stop exit 2 as "block the stop". The hook reads all run records before it checks `stop_hook_active`. A malformed `run.json` (for example, after a merge conflict) can block every stop and make a loop. |
| B2 | Medium | **[reproduced]** A writer that stops without cleanup (for example, a hook that hits its timeout) leaves `.spec100-write.lock`. After that, each PostToolUse hook and each mutating command fails until a user runs `recover`. `recover` then also reports "No interrupted installation" if no journal exists. |
| B3 | Medium | Claude Code can run tool calls in parallel. Their PostToolUse hooks then compete for the writer lock. The losers exit 2 and send a lock error to the agent. |
| B4 | Medium | Version `2.0.0` is the only accepted current manifest version (`runtime.cts:184`). Any version increase rejects all existing installations as "Unsupported". |
| B5 | Low | `atomic()` does not flush data to disk before the rename. A power loss can leave an empty recovery journal. Then `recover` cannot parse it. |
| B6 | Low | The same exclusion list applies inside `harness/thoughts/`. A topic named `build`, `dist`, `vendor`, `target`, or `coverage` is missing from the index. `workflow start` cannot find its plan, and `check` ignores its run. |

## Findings: Windows, Linux, and macOS compatibility

| ID | Severity | Finding |
|---|---|---|
| C1 | High | **[reproduced]** Git for Windows checks out text files with CRLF by default (`core.autocrlf=true`). The checks compare raw bytes. After a CRLF checkout, `learnings.append-only`, `index.current`, and every `integration.file.*` check fail. Setup then refuses to run because it reports "Modified generated file". |
| C2 | High | Evidence fingerprints hash raw bytes and the POSIX executable bit. On a Windows checkout, CRLF text and a zero executable bit change the fingerprint. The documented CI command `check` then reports evidence recorded on macOS or Linux as stale. |
| C3 | Medium | The CLAUDE.md layout filter in the fingerprint matches `\n` only. With CRLF, an index refresh changes the fingerprint and makes evidence stale. |
| C4 | Low | On Windows, `rename` fails with `EPERM` or `EBUSY` when an editor, indexer, or antivirus program holds the target file. The runtime does not try again. |
| C5 | Info | The hook launcher passes `--` to `node -e`. Claude Code runs hooks in Git Bash on Windows. The behavior under Windows PowerShell 5.1 is not verified. |

macOS: all 64 tests passed on this machine. Linux: CI covers it. Docker was not available, so this review did not run Linux tests. Windows: no local Windows machine. The CRLF results come from a simulation on macOS.

## Findings: performance

Timings on the 1,800-file fixture: PreToolUse 0.24 s, PostToolUse 0.36 s, SessionStart 1.35 s, Stop 2.88 s, `check` 2.99 s.

| ID | Finding |
|---|---|
| P1 | The Stop hook spent 2.64 s of 2.9 s in file `open` calls. The runtime reads and hashes every project file once per call. On this machine, one read costs about 1.3 ms. |
| P2 | After capability evidence exists, each PreToolUse call computes the full project hash to compare only the instruction files (`capabilitiesFingerprint`). A project with more than about 10,000 files can pass the 15 s hook timeout. A timeout is a non-blocking error, so the gate fails open. |
| P3 | After a run completes, each PreToolUse call runs all workflow checks to decide if the run is stale. This also hashes the full project. |
| P4 | One command calls `inventory()` up to three times. Each call starts Git processes and walks the tree. `allRuns()` uses a full inventory only to find `run.json` files. |
| P5 | The test suite runs 64 tests in series and takes 144 s. Most of the time is in the items above. |

A persistent hash cache (keyed by file size and modification time) can remove most of P1. It adds stored state, a new invalidation risk, and a file that Git shows as untracked. This review does not recommend it without a decision from the user.

## Gaps

- Docs: `docs/validation.md` lists macOS as pending. This review now has a macOS result.
- Docs: the README does not tell users that an upgrade changes hook commands and can make capability evidence stale.
- Tests: no test covers a moved project, CRLF checkouts, the Stop error path, a stale lock, parallel PostToolUse hooks, or the bypass forms above.
