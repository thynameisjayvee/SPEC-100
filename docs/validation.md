# Validation evidence

Recorded on 2026-10-25 (Asia/Manila). This records observed results, not universal client certification.

## Final automated checks

| Environment | Node | Result |
|---|---|---|
| Native Windows | 22.22.1 | 63 tests: 61 passed, 0 failed, 2 POSIX-only skips |
| Native Windows | 24.22.1 | 63 tests: 61 passed, 0 failed, 2 POSIX-only skips |
| Linux through WSL Ubuntu | 22.18.0 | All 63 tests passed; no skips |

Type checking passed on Windows and Linux/WSL. The portable setup skill passed the skill-creator validator in WSL. Node 22 and 24 produced identical runtime bytes from the same source.

The Windows skips cover POSIX directory permissions and the executable bit. Cross-platform fault injection separately verified multi-file rollback. A fixture that rejects every symbolic-link API call verified fresh three-tool installation without symbolic-link privileges.

Coverage includes all four integration selections, additive setup, project-local bootstrap, ignored/adopted assets, unchanged bootstrap timestamps, canonical customizations, unrelated settings, selected integration checks, dry-run, collisions, legacy templates and links, recovery, writer exclusion, capability limits, actual native hook payload formats, protected file reads versus writes, compound approval-command denial, review limits, stale evidence, historical runs, UAT attachments, and root/index refreshes.

CI is configured for Windows, Linux, and macOS with Node 22.13.0 and 24. The local results above do not substitute for a completed remote matrix run. Current remote results are available in [Harness checks](https://github.com/thynameisjayvee/SPEC-100/actions/workflows/ci.yml).

A fresh Windows CI checkout exposed a CRLF-dependent setup-skill rename. The generator now normalizes its source inputs, repository text uses LF, and a regression test builds from an explicit CRLF fixture. All three focused package/generation tests passed after this correction. The shared runtime source and generated runtime hashes below are unchanged.

## Review update on 2026-11-23 (version 2.1.0)

A review found gate bypasses, hook failure loops, Windows CRLF failures, and hook launchers that failed open after a project move. See `thoughts/research/2026-11-23-harness-review.md` and `thoughts/plans/2026-11-23-harness-review-fixes.md`. A reproduction script confirmed 15 defects on the 2.0.0 runtime and none on the 2.1.0 runtime. An independent security review confirmed most of them and added four more. Thirteen new regression tests fail on the 2.0.0 runtime and pass on 2.1.0.

| Environment | Node | Result |
|---|---|---|
| macOS (Darwin 25.3, Apple Git 2.50.1) | 24.14.1 | 77 tests: 77 passed, 0 failed, 0 skipped |

On a project with 1,800 tracked files, a PreToolUse hook with recorded capability evidence took 0.17 s with 2.1.0 and 0.83 s with 2.0.0. The 2.1.0 PreToolUse cost no longer grows with the number of project files. Stop and SessionStart still hash all project files.

Windows and Linux results for 2.1.0 are pending the CI matrix. The CRLF and Windows path tests ran as simulations on macOS. The Windows executable-bit source (the Git index) has no Windows run yet.

## Per-turn router check on 2026-11-23 (version 2.2.0)

See `thoughts/research/2026-11-23-turn-router.md` and `thoughts/plans/2026-11-23-turn-router.md`. Environment: macOS, Node 24.14.1, Claude Code 2.1.330, a claude.ai login, and no gateway.

- The offline tests use a fake classifier. They cover the setup option, the hook output, the Fable rule, the failure paths, and the recursion guard.
- Live classifier calls through the installed hook: "Use Fable to count the .txt files" gave `fable/low`. A lock-free B-tree design with proofs gave `opus/xhigh`. "Do not use Fable. Fix the typo in the README title." gave `haiku/low`. A one-function rename gave `haiku/low`. Each call took 3.0 s to 5.0 s.
- Live session with the installed hooks and a Haiku main session: the router returned `sonnet/medium`. The main session wrote `Route: sonnet/medium` and called the Agent tool with `model: "sonnet"` and `effort: "medium"`. The subagent ran on `claude-sonnet-5-5`. SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, and Stop hooks exited 0 through the launcher.

Not tested: an interactive session, a main session on Opus, Windows, Linux, and a session through a gateway or a cloud provider.

## Independent review

A forward test found a project-local bootstrap collision. A second pass found that ignored, unchanged bootstrap assets were missing from the initial index. Both were fixed and given regression coverage.

A separate security review found non-setup dry-run lock bypass, Antigravity read blocking, and a compound-command bypass in Codex approval translation. All were fixed and reproduced as closed in the final bounded review. Both reviewers found no remaining concrete defect in that pass.

Final reviewed source SHA256: `8306b00053579b641b405309d2eb386fef8f750cb3c77fe8bd121d9c9d50698e`.

Final generated runtime SHA256: `2b3464cfa223073bca4eabc2069cc41d2383161d0b4dc24eaef5a36e662116a9`.

## Live native client checks

### Claude Code 2.1.207 on Windows

Authenticated plugin setup completed in a disposable Node library project. The active session inspected actual source files, prepared context, previewed setup, installed the Claude integration, and passed the installed runtime check.

A second session confirmed all six plugin commands and six project skill entries in the native initialization event, plus all five project agent definitions. Research honored a canonical customization marker and wrote its artifact through the runtime. A real independent project code reviewer read the canonical role, returned five checkpoints, and reported its actual findings. The runtime check passed afterward. Eight native hook responses covering SessionStart, PreToolUse, and PostToolUse returned exit code 0. No permission override or sandbox bypass was used in this second session.

The first setup session could not remove its external draft under the test permission policy; cleanup was not claimed. Native approval UI, a complete software implementation run with verifier findings, and human UAT were not tested.

### Codex CLI 0.164.0-alpha.11.1 on Windows

The native skill list discovered the portable setup skill. The active session inspected the fixture, created a source-based draft, and completed dry-run. The actual installation was blocked by native protected-folder permissions. Recovery of that disposable fixture also remained permission-blocked. No native trust or sandbox bypass was granted. Setup now adopts identical bootstrap files without rewriting them; writing native configuration still requires the client's normal permission.

In a separate fixture prepared by the runtime outside the client sandbox, Codex confirmed native discovery of spec100-research and spec100-check. Its installed read-only runtime check passed with no failures or warnings. The session exposed no named custom-agent selector, and an independent agent attempt failed in the client thread service. No reviewer result was fabricated. Native hook activation and a full implementation workflow remain unverified in this tested client mode.

### Antigravity and other surfaces

Antigravity CLI was not on PATH. Live Antigravity App/CLI/IDE testing remains pending. Generated configuration and native payload contracts were covered by fixtures. The IDE's unverified independent-agent capability produces a blocked software implementation state.

Codex App/IDE live testing, native permission/trust interactions, macOS client testing, and complete human-approved implementation/UAT scenarios remain pending. Use the [native smoke-test procedure](native-smoke-test.md). Generic mode has no native hook adapter and cannot pass implementation capability gates.

Fixture screenshots and mock review/capability/approval records validate runtime behavior. They are not evidence of native trust, actual independent reviews, or human acceptance.
