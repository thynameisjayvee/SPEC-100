# Native client smoke tests

Use disposable projects. Record the OS, Node version, client version, source/runtime hashes, commands, and actual results. Keep runtime fixtures distinct from native client evidence. Do not fabricate capability or approval records to make these tests pass.

## Shared setup and discovery

1. Create a small Git project with a README, one function, and a passing test. Use a path with spaces.
2. For Codex or Antigravity, copy the entire portable setup skill into `.agents/skills/spec100-setup/`. For Claude, load the plugin from this checkout. Confirm discovery before supplying the skill's file path manually.
3. Invoke the setup skill with dry-run. Confirm no harness/configuration files were changed. Then run setup and the installed runtime check.
4. Inspect the cited project context, all six skills, and five software role definitions. Check that the client actually loads native role definitions. Reload the client if required.
5. Customize the canonical research skill, invoke it, and verify that it honors the customization and saves the expected artifact. Create and revise a plan; inspect revision history.
6. Add a second integration. Verify that it uses the same context, rules, roles, skills, and evidence. Repeat setup and confirm that unrelated instructions, hooks, and canonical customizations remain unchanged.

## Native hooks and independent agents

1. Inspect native hook status in the client. In Codex, use `/hooks` to review definitions; the human user must grant trust through the native interface. Do not use a trust bypass to claim ordinary installation success.
2. Confirm that the native agent list includes the project roles. Have real independent invocations return their five operational checkpoints. Record actual invocation identities.
3. Record capability evidence only after these checks. For unavailable capabilities, record false and verify a blocked handoff. Antigravity IDE custom agents are unverified. Generic mode has no native hooks.
4. On a disposable topic, implement a low-risk library change with real baseline/final tests, code/security review, verifier votes for any findings, risk, UAT applicability, and rollback instructions.
5. Attempt a recognizable risky action without current approval. Confirm it is intercepted before execution. Decline the native permission where offered. In Codex, confirm denial and a request for consent in chat; it must not emit the unsupported hook `ask` result.
6. Have the human approve a concrete action. Record the actual response, then confirm the authorized action can proceed. Never approve on behalf of the user for a smoke test.
7. Modify reviewed code, the selected plan, or integration instructions and confirm stale evidence. Confirm that index-only layout updates retain valid evidence.
8. Confirm that unresolved findings in review round three produce a blocked handoff, without a fourth round or an endless Stop-hook loop.

## Platforms and surfaces

Run setup/recovery/check tests on native Windows without symbolic-link privileges, Linux, macOS, and WSL. Test both Node 22.13+ and Node 24. Test from a project subdirectory. Native client testing covers Claude Code, Codex App/CLI/IDE, and Antigravity App/CLI/IDE where available. Record unavailable surfaces as pending; fixture success is not native acceptance.
