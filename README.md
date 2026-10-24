# SPEC-100 for Claude Code

A native Claude Code plugin implementing SPEC-100. Set up a project harness, research, plan, refine, and implement with project-specific agents—all through slash commands.

## Install inside Claude Code

Requires Claude Code with plugin support, Node.js **22.13+**, and Git. Supported platforms: macOS, Linux, and WSL.

From Claude Code, register this checkout as a local marketplace and install the plugin:

```text
/plugin marketplace add /absolute/path/to/this/checkout
/plugin install spec100@spec100-marketplace
```

Use the actual checkout path (in this workspace, `/workspace`). Select the intended installation scope in Claude's plugin interface. Reload the plugin or restart Claude Code if prompted. For a hosted repository, the marketplace command can take its Git repository URL instead. This project does not publish a marketplace automatically.

Open the target project in Claude Code, then run:

```text
/spec100:setup
/spec100:research authentication investigate the existing login flow
/spec100:plan authentication add session expiration
/spec100:iterate authentication preserve the current public API
/spec100:implement authentication
/spec100:check
```

No npm installation or separate model authentication is required for normal use. The committed runtime runs behind the commands. Setup uses the active Claude session to inspect the repository and generate context and tailored agents; it does not launch another Claude process. First-time agent installation may require restarting the Claude Code session.

## What setup installs

```text
CLAUDE.md                         # Managed imports, top-level folders, and a pointer to the project index
harness/
  project-index.md                # Explicit project index; read on demand, not imported
  project-context.md              # Domain, problem, audience, architecture, evidence
  learnings.md                    # Append-only operational lessons
  rules/
    STE-100.md
    YAGNI-KISS.md
    atomic-operations.md
  subagents/                      # Tailored implementation/review/verifier/risk agents
  skills/
    research.md
    plan.md
    iterate.md
    implement.md
  thoughts/<topic>/
    research_<name>.md
    plan_<name>.md
    revisions/                    # Previous artifact versions
    run.json                      # Review/evidence/approval state
    <uat screenshots>
  .runtime/                       # Self-contained backend, manifest, protocol
.claude/
  agents/                         # Relative symlinks to canonical project agents
  skills/spec100-<skill>/SKILL.md   # Relative symlinks; optional /spec100-<skill> aliases
  settings.json                   # Merged lifecycle hooks
```

`/spec100:*` commands load the canonical project skills, so customizations under `harness/skills/` take effect. Plugin commands stay namespaced to avoid collisions with Claude's built-in `/plan`. `CLAUDE.md` links to the index and does not import it, so the root file stays far below the Claude Code size warning (40,000 characters) in a large project. Existing `AGENTS.md` is preserved and imported by `CLAUDE.md`; unrelated instructions and settings are retained.

The project index (`harness/project-index.md`) includes tracked and unignored project-owned files, folders, empty directories, and harness assets. Git internals, dependencies, caches, and build output are excluded. Symbolic links are indexed as leaves. Git's ignore engine handles nested rules and tracked exceptions, including for projects without a Git repository; scanning creates temporary Git metadata outside the project and removes it afterward.

Use `/spec100:setup --dry-run` to preview installation. Setup rejects unmanaged collisions rather than overwriting them. Repeat setup preserves customized context, rules, agents, skills, thoughts, and learnings. If installation is interrupted, `/spec100:setup recover` restores previous files through the recovery journal before retrying.

## Implementation safeguards

Software implementation records baseline and pre-PR checks, parallel code/security review, two independent verifier votes for each finding, risk assessment, high-risk human approval, UAT evidence, and detection/rollback steps. Both verifiers must dismiss a finding to clear it. The initial review counts as round one; unresolved findings after three rounds leave a blocked handoff.

Agents supply concise destination, reason, cost, next-action, and environment checkpoints. These are operational summaries, not private reasoning traces. Code and selected-plan hashes invalidate stale reviews and approval. Applicable UAT requires screenshot attachments; otherwise an explicit task-specific inapplicability reason is recorded.

High-risk steps require explicit approval inside Claude before acting. Hooks request native permission for identifiable risky actions and approval commands. The harness uses local cooperative evidence; it cannot authenticate attestations independently, sandbox arbitrary shell commands, or control changes made outside Claude Code. Review/test evidence must reflect actual execution. It never automatically creates PRs, merges, deploys, resets user changes, or creates worktrees.

Non-software projects retain checkpoints, risk assessment, and high-risk approval without software-specific review and UAT gates.

## CI checks

After initializing a target project, run this in its CI:

```sh
node harness/.runtime/spec100.cjs check --json
```

This command is read-only, requires no model credentials, and validates structure plus every recorded workflow. Active runs and the latest completed delivery must match current changes. Earlier completed runs become historical when a later run starts; their completion evidence and selected plans must remain unchanged. Exit codes: `0` compliant, `1` noncompliant/incomplete, `2` execution/configuration error. JSON includes stable check IDs and remediation. Configure required status checks in your repository separately.

## Development

```sh
npm test                 # Offline build and runtime/fixture tests; no dependencies needed
npm install              # Optional development dependencies for static type checking
npm run typecheck
```

`npm run build` compiles `src/runtime.cts` with Node's built-in TypeScript stripping. Commit the generated `plugins/spec100/runtime/spec100.cjs` so plugin consumers need no build step. The runtime has no third-party dependencies. TypeScript and Node type declarations are development-only dependencies.

CI runs type checking and fixture tests on Linux/macOS with Node 22 and 24. To perform the authenticated integration smoke test, follow [docs/claude-smoke-test.md](docs/claude-smoke-test.md).
