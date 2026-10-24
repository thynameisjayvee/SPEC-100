# Validation evidence

Validated in this workspace with Node.js v24.19.0 on Linux.

- `npm test`: 32 passing tests, no skipped tests. The build uses Node's TypeScript compiler/stripper without downloading dependencies.
- Tests exercise the committed plugin manifests and slash-command definitions, installed runtime, empty and existing projects, paths with spaces, Git/non-Git ignore behavior, tracked exceptions, ignored harness assets, relative symlinks, collision handling, dry-run, preserved customizations and file permissions, actual rollback after a symlink failure, recovery journals, artifact revisions, append-only learnings, workflow evidence, independent verifier votes, review caps, stale plans/code/permissions/screenshots, approval gates, historical runs, non-software workflows, and hook behavior.
- `npm run typecheck`: unavailable locally (`tsc: not found`). Development dependency installation was interrupted at the environment's network permission boundary. CI is configured to install the type checker and run it on Node 22/24 and Linux/macOS.
- Authenticated Claude Code smoke test: not run; the Claude Code executable is absent. The exact manual procedure is in [claude-smoke-test.md](claude-smoke-test.md). Native command discovery, actual agent delegation, permission UI, and screenshot-based product UAT remain to be verified there.

Fixture screenshots and mocked review/approval records validate runtime checks; they are not presented as evidence of actual human acceptance or live Claude review.
