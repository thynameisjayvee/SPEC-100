# Portable SPEC-100 implementation

Approved scope: retain Claude Code; add Codex, Antigravity App/CLI/IDE, and generic use. Use one project harness and a portable setup skill. Support native Windows, macOS, Linux, and WSL. Preserve all evidence and approval gates.

## Work units

- [x] Extract shared templates and package the self-contained setup skill. Generate Claude packaging from the shared source.
- [x] Add tool selection, native wrappers, instruction sections, hooks, capability gates, and shared checks.
- [x] Preserve legacy installations and customizations. Add migration checks, atomic recovery, and Windows support.
- [x] Extend runtime and package tests. Run native Windows and available Linux checks. Configure CI for Windows/Linux/macOS and Node 22/24.
- [x] Update setup, protocol, validation, and live smoke-test instructions.

## Acceptance

- Setup is local, repeatable, and additive. New installations do not require symbolic links.
- All integrations share canonical skills, rules, role instructions, and evidence under harness/.
- Missing required capabilities block implementation. Configured hooks do not imply active or trusted hooks.
- Existing runtime commands and exit codes remain compatible. STE-100.md retains the ASD-STE100 requirement.
- Dry-run, collisions, interrupted installation, customized files, evidence invalidation, and the three-round review cap have regression coverage.
- Live client tests and unavailable platforms are reported separately from fixture results.

## Execution record

Implementation started on 2026-10-24 from the approved plan supplied in chat. The working tree was clean. No plan unit is complete until its checks pass.


Implementation and available automated verification completed on 2026-10-25 (Asia/Manila). Windows Node 22/24: 61 passing tests and two POSIX-only skips per run. Linux/WSL Node 22: all 63 tests passed. Type checking and portable skill validation passed. Final bounded independent reviews closed all reproduced findings.

Native Claude setup, discovery, customized research, a real project reviewer, and eight successful hook responses were observed. Codex skill discovery and read-only checks passed; protected native configuration writes, hook trust, and named-agent/service limits prevented full native workflow acceptance. Antigravity, Codex App/IDE, native approval UI, complete implementation/UAT, and the remote CI matrix are recorded separately as pending in docs/validation.md. Completed work-unit checks do not claim those external acceptance tests passed.
