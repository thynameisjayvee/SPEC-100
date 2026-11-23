# Harness review fixes

Source: `thoughts/research/2026-11-23-harness-review.md`. Date: 2026-11-23.

## Goal

Close the reproduced gate bypasses and defects. Make the harness work on Windows CRLF checkouts and after a project move. Reduce the hook cost on large projects. Keep existing evidence valid where possible.

## Decisions

- Keep the per-file digest format for LF text and for binary files. Existing evidence for those files stays valid.
- Normalize CRLF to LF before hashing text files. Text means no NUL byte in the first 8,000 bytes, as Git does. Evidence for files that contain CRLF becomes stale once. The README states this.
- On Windows, read the executable bit from the Git index for tracked files. macOS and Linux keep the file-system bit.
- Use a hook launcher that finds the runtime from `CLAUDE_PROJECT_DIR` or the current folder. Setup replaces the old launchers. The new launcher is the same on all machines, so the settings file does not change between team members.
- Increase the version to `2.1.0`. Accept manifests from `1.0.0`, `2.0.0`, and `2.1.0`.
- Do not add a persistent hash cache. It adds stored state and an invalidation risk. The user decides on it later (see "Not in scope").
- Do not commit. The user did not ask for commits.

## Phase 1: hook failure behavior (B1, B2, B3)

Files: `src/runtime.cts`.

1. In the Stop event, return before any run read when `stop_hook_active` is true or the Antigravity retry fields apply.
2. Give hook errors a safe exit code. PreToolUse errors keep exit 2 (fail closed). Other events use exit 1 (non-blocking).
3. In `writer()`, remove a lock when its host is this host and its process is not alive. Keep the error for a live or unknown-host lock.
4. In the PostToolUse event, skip the index refresh when another writer holds the lock or when a recovery journal exists.

Checks: new tests for each item. `npm run check` passes.

## Phase 2: gate hardening (S1, S2, S4, S5, S6, S7, S8)

Files: `src/runtime.cts`.

1. Treat each command that contains `spec100` and the words `workflow` and `approve` as an approval request. Ask (Claude, Antigravity) or deny (Codex) unless the command is the standalone canonical form.
2. Accept the runtime exemption only when the command path resolves to `<root>/harness/.runtime/spec100.cjs`.
3. Add `harness/thoughts/*/run.json`, `.spec100-install.json`, and `.spec100-write.lock` to the protected paths.
4. Resolve each file path against the hook input `cwd`. Resolve symbolic links in the nearest existing parent. Compare protected paths without case.
5. Add `MultiEdit` and `NotebookEdit` to the Claude matcher. Read `notebook_path`.
6. Add these risky forms: `git push -f`, `git push <remote> +<ref>`, `git branch -D`, `git checkout -- <path>`, `git restore` without `--staged`, `git stash drop|clear`, `rd|rmdir /s`, `del /s|/q`, `Remove-Item` with `-r` or `-fo`, `rm --recursive|--force`, and `TRUNCATE TABLE`. Require white space before an `rm` flag.

Checks: new tests for each bypass form. Existing hook tests pass.

## Phase 3: portable launcher and versions (S3, B4)

Files: `src/runtime.cts`, `package.json`, `plugins/spec100/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`.

1. Replace `hookDefinitions(root, host)` with a launcher that has no project path. If the launcher cannot find the runtime, it writes a message and exits 2 for PreToolUse and 1 for other events.
2. Make `isHarnessHook` also recognize the old base64 launcher for any path. Setup then replaces stale launchers and does not add duplicates.
3. Set `VERSION` to `2.1.0`. Accept a fixed list of supported manifest versions.

Checks: a test copies an installed project to a new path and runs each launcher there. A test upgrades a settings file that has an old launcher.

## Phase 4: cross-platform content (C1, C2, C3, C4, B5)

Files: `src/runtime.cts`.

1. Add `eol(text)` to convert CRLF to LF. Use it for generated-file digests, file adoption, legacy template comparison, the learnings prefix, `index.current`, and `refreshIndex`.
2. Hash text files after CRLF normalization in `projectSnapshot` and `planHash`. Keep raw bytes for binary files and UAT screenshots.
3. Make the CLAUDE.md layout filter accept `\r\n`.
4. On Windows, read the executable bit of tracked files from `git ls-files -s`.
5. In `atomic()`, flush the file data before the rename. On Windows, try the rename again for `EPERM`, `EBUSY`, and `EACCES`, up to about one second.

Checks: tests convert installed files and source files to CRLF and expect checks and evidence to stay valid.

## Phase 5: performance (P2, P3, P4)

Files: `src/runtime.cts`.

1. Keep one `inventory()` result per process. Clear it after each write.
2. Find run records with a directory read of `harness/thoughts/`.
3. Compute the capability fingerprint from the instruction files only. The value must equal the old value.
4. In PreToolUse, decide the capability gates from evidence data and the capability fingerprint. Compute the full fingerprint only for a risky action.

Checks: all workflow tests pass. Measure the hooks on the 1,800-file fixture again.

## Phase 6: low-severity items (S9, S10)

1. Extend the `prepare` secret filter.
2. Escape control characters in index and root-section file names.

## Phase 6a: items from the independent review (R1, R2, R3, R4, B6)

1. R1: Never exclude a file that Git tracks. Keep the exclusion for untracked files. The index and the root section still omit excluded folders. Evidence for projects that track files in excluded folders becomes stale once. The README states this.
2. B6: Apply the exclusion list only outside `harness/`.
3. R2: Reject backslashes, colons, and `..` segments in every journal and transaction path, not only in the parent.
4. R3: Skip topic folders with invalid names when the runtime lists runs. Treat a missing plan file as a changed plan, not as an error. Name the file in a malformed-record error.
5. R4: Treat writes to the hook configuration files as high-risk actions that need approval.

## Phase 7: docs

1. README: the upgrade effect on hooks and evidence, CRLF behavior, and the POSIX copy command.
2. `docs/validation.md`: the macOS result from this review.
3. Protocol template: protected run records and the approval command form.

## Acceptance

- The reproduction script reports no reproduced item.
- `npm run check` passes on macOS. The generated runtimes match the source.
- New tests cover each phase.

## Rollback

Each phase changes `src/runtime.cts` and the generated runtimes. To roll back, restore those files from `c9cfc89` and run `npm run build`. Installed projects keep working after a rollback only if their manifest version is `2.0.0` or lower. A project that ran setup with `2.1.0` needs setup again with the older runtime after its manifest version is set back.

## Not in scope

- A persistent hash cache for P1. Decision for the user.
- Parallel test runs (P5). The runtime changes reduce test time first.
- A Windows PowerShell 5.1 check of `--` (C5). It needs a Windows machine.

## Execution record

Implemented on 2026-11-23 on macOS. All phases are complete. Nothing is committed.

- `npm run check`: type check passed. 77 tests passed, 0 failed, 0 skipped (64 existing and 13 new).
- The 13 new tests fail on the 2.0.0 runtime and pass on 2.1.0.
- The reproduction script reports 15 reproduced defects on 2.0.0 and none on 2.1.0.
- PreToolUse with capability evidence on 1,800 files: 0.83 s before, 0.17 s after.

Residual risks:

- A shell command can still write `run.json` or other protected files. Hooks check file-tool paths and known command patterns only. The README states this limit.
- The approval check is a text match. A disguised command can pass it.
- Stale-lock release has a short race. If three writers start at the same moment after a crash, two writers can hold the lock together. The runtime moves the stale lock aside and restores a live lock with a hard link to make the window small.
- Stop and SessionStart still hash every project file. On a very large project, they can pass the 15 s hook timeout. A timed-out Stop hook does not block the stop.
- Windows behavior (the Git-index executable bit, rename retries, and the hook launcher under PowerShell 5.1) has no Windows run yet. CI must confirm it.
