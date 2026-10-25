# SPEC-100 for coding agents

SPEC-100 installs one project harness for Claude Code, Codex, Antigravity, and other coding tools. Rules, project context, skills, role instructions, plans, and evidence remain under `harness/`. Native integrations provide discovery files, agents, and hooks.

Requires Node.js **22.13+** and Git. The installer supports native Windows, macOS, Linux, and WSL. New installations use regular files and do not require symbolic-link privileges. See [validation results](docs/validation.md) for tested environments and pending native checks.

## Set up from a skill

The portable skill is [`skills/spec100-setup`](skills/spec100-setup). It includes its runtime and templates; no npm installation or separate model authentication is needed.

Install that entire folder with your tool's skill installer, or copy it into the target project's `.agents/skills/spec100-setup/` directory. For example, from the target project:

```powershell
Copy-Item -LiteralPath 'D:\path\to\SPEC-100\skills\spec100-setup' -Destination '.agents\skills\spec100-setup' -Recurse
```

Create `.agents/skills` first if needed. On macOS/Linux, copy the same folder with your file manager or `cp -R`. Preserve the `scripts/` and `assets/` directories.

Then ask the active coding agent to use `spec100-setup` for this project. In Codex, use `$spec100-setup`; in Antigravity, select the skill or use `/spec100-setup` where available. Reload the client if discovery requires it. Name any additional integrations you want; setup retains those already installed.

If another tool cannot discover Agent Skills, ask it to read the portable `SKILL.md` and follow it. It must be able to read project files and run Node/Git. Generic mode supports research, planning, and checks. It has no native hook adapter, so required implementation gates remain blocked.

The active session inspects the project, prepares a draft outside the project, previews changes, and runs setup. A client sandbox can require native permission to write `.agents/`, `.codex/`, or `.claude/`; grant it through that client when setup was requested. Setup does not bypass those controls. It does not launch another model process or modify global settings. An empty project can retain explicit unknowns until its purpose is known.

## Keep using the Claude Code plugin

Inside Claude Code:

```text
/plugin marketplace add https://github.com/thynameisjayvee/SPEC-100
/plugin install spec100@spec100-marketplace
/spec100:setup
```

A local checkout path can replace the repository URL. Reload the plugin or restart Claude if prompted. All existing commands remain available:

```text
/spec100:research authentication investigate the login flow
/spec100:plan authentication add session expiration
/spec100:iterate authentication preserve the public API
/spec100:implement authentication
/spec100:check
```

## Installed files

```text
harness/
  project-index.md                 # Read on demand; never imported
  project-context.md
  learnings.md                     # Append-only
  rules/STE-100.md                  # Includes ASD-STE100 instructions
  rules/YAGNI-KISS.md
  rules/atomic-operations.md
  subagents/spec100-<role>.md       # Canonical project role instructions
  skills/<phase>.md                # Canonical research/plan/iterate/implement skills
  thoughts/<topic>/                # Artifacts, revisions, screenshots, run evidence
  .runtime/                        # Runtime, protocol, templates, ownership manifest
```

| Tool | Root instructions | Skills | Agents and hooks |
|---|---|---|---|
| Claude Code | Managed `CLAUDE.md` section | Plugin commands and `.claude/skills/spec100-*` | `.claude/agents/`, `.claude/settings.json` |
| Codex | Managed `AGENTS.md` section | `.agents/skills/spec100-*` | `.codex/agents/*.toml`, `.codex/hooks.json` |
| Antigravity | Same managed `AGENTS.md` section | Same `.agents/skills/spec100-*` | `.agents/agents/*.md`, `.agents/hooks.json` |
| Generic | Managed `AGENTS.md` section | Portable skills or explicit canonical file reads | No native agent/hook adapter |

Codex uses `$spec100-research`, `$spec100-plan`, `$spec100-iterate`, `$spec100-implement`, and `$spec100-check`. Antigravity uses the same skill names, with slash invocation where supported. Keep automatic skill selection enabled.

Customize canonical files under `harness/`. Native wrappers read those files. Setup preserves customized context, rules, role instructions, skills, learnings, and thoughts. It preserves unrelated root instructions and hook settings. Do not edit generated native wrappers; setup reports modified wrappers instead of overwriting them.

The project index includes tracked and unignored project files, directories, empty folders, and installed harness assets. Dependencies, caches, build output, and Git internals are excluded. Git's ignore rules also work for projects without a repository; temporary Git metadata is created outside the project and removed afterward. Symbolic links are indexed as leaves.

## Gates and native activation

Software implementation requires baseline and final verification, independent code/security review, two independent verifier votes per finding, risk assessment, explicit approval for high-risk actions, applicable UAT evidence, and detection/rollback steps. The initial review counts as round one; unresolved findings after three rounds leave a blocked handoff.

Before implementation, inspect the active client's native hook manager and independent-agent tools. Record the actual result as capability evidence using the [runtime protocol](skills/spec100-setup/assets/templates/protocol.md). Missing required capabilities block implementation. File existence does not establish native trust or activation.

- Codex hooks require native review and trust. Setup does not grant it. Codex denies an unapproved risky action; the agent obtains explicit consent in chat, then records the actual response. Its custom read-only role instructions do not create a separate sandbox.
- Antigravity App/CLI have documented custom agents. IDE custom subagents are unverified, so the software implementation gate remains blocked there. Antigravity hooks request fresh native permission for recognizable risky actions.
- Generic mode has no native hooks. Research, planning, and structural checks remain available; implementation cannot pass the hook capability gate.

These are cooperative local gates. The runtime cannot authenticate agent attestations, human responses, or native hook activation independently. Hooks do not sandbox arbitrary shell scripts or control edits made outside the selected coding tool. No absent test, review, screenshot, or approval can be recorded as successful execution.

Code, plan, and relevant instruction/configuration changes invalidate affected evidence. Index/layout refreshes do not invalidate it. Use one active writer per project. Runs retain explicit tool/session ownership; switching tools does not silently transfer an active run or reset its review count. The runtime never creates PRs, merges, deploys, resets user changes, or creates worktrees automatically.

Non-software work retains checkpoints, active hooks, risk, and high-risk approval. It omits software-specific review and UAT gates.

## Add tools, migrate, and recover

Ask the setup skill to add an integration. Its runtime command supports repeated `--tool` options:

```text
node <bundled-runtime> setup --root <project> --draft <temporary-json> --tool codex --tool antigravity --dry-run
```

The setup skill supplies actual quoted paths and the evidence-based draft. Remove `--dry-run` only when setup is requested. With no tool option, setup retains installed integrations or defaults a new project to Claude.

Version 1 manifests are treated as Claude installations. Known generated templates migrate automatically. Existing owned links become regular wrappers. Customized legacy skills or rules with Claude-specific instructions require a targeted manual migration; setup reports the exact file and stops before any writes. Preserve those custom instructions when updating tool-specific wording. Migration preserves evidence records and review counts, but changes to installed instructions can make current evidence stale.

If `.spec100-install.json` remains after interruption, run the setup skill's recovery path. The journal restores prior files and removes empty directories created by installation. Do not discard it. A `.spec100-write.lock` prevents overlapping runtime writers. Recovery can release a stale local lock only when its process is no longer running. Unknown-host or active-process locks require inspection.

## Read-only CI check

After setup:

```sh
node harness/.runtime/spec100.cjs check --json
node harness/.runtime/spec100.cjs check --tool codex --json
```

The default checks the core, all installed integrations, and every recorded workflow. `--tool` narrows integration checks; shared evidence checks remain required. Exit codes are `0` for valid local structure and recorded evidence, `1` for noncompliant/incomplete results, and `2` for configuration/execution errors. JSON includes check IDs, remediation, warnings, workflows, and separate integration activation status. A successful structural check does not certify active native enforcement. Configure required repository status checks separately.

Earlier completed runs become historical when a later run starts. Their evidence and selected plans must remain unchanged. Active runs and the latest completed delivery must match current relevant changes.

## Development

```sh
npm install --ignore-scripts
npm run check
```

`npm test` builds and runs offline runtime/fixture tests without development dependencies. Type checking needs the development dependencies. CI covers Windows/Linux/macOS with Node 22 and 24.

Edit `src/runtime.cts`, the portable setup skill, and its assets as the shared source. `npm run build` generates the portable runtime, its setup reference, and the Claude runtime/templates/setup command. Commit generated output. The runtime has no third-party dependencies. See [native smoke tests](docs/native-smoke-test.md) and [validation evidence](docs/validation.md).
