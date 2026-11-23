# SPEC-100 for coding agents

SPEC-100 installs one project harness for Claude Code, Codex, Antigravity, and other coding tools. Rules, project context, skills, role instructions, plans, and evidence remain under `harness/`. Native integrations provide discovery files, agents, and hooks.

Requires Node.js **22.13+** and Git. The installer supports native Windows, macOS, Linux, and WSL. New installations use regular files and do not require symbolic-link privileges. See [validation results](docs/validation.md) for tested environments and pending native checks.

## Set up from a skill

The portable skill is [`skills/spec100-setup`](skills/spec100-setup). It includes its runtime and templates; no npm installation or separate model authentication is needed.

Install that entire folder with your tool's skill installer, or copy it into the target project's `.agents/skills/spec100-setup/` directory. For example, from the target project:

```powershell
Copy-Item -LiteralPath 'D:\path\to\SPEC-100\skills\spec100-setup' -Destination '.agents\skills\spec100-setup' -Recurse
```

Create `.agents/skills` first if needed. On macOS/Linux, use `mkdir -p .agents/skills && cp -R /path/to/SPEC-100/skills/spec100-setup .agents/skills/`. Preserve the `scripts/` and `assets/` directories.

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

The project index includes tracked and unignored project files, directories, empty folders, and installed harness assets. Dependencies, caches, build output, and Git internals are excluded from the index. Evidence fingerprints still include tracked files in folders such as `build/` or `vendor/`. Git's ignore rules also work for projects without a repository; temporary Git metadata is created outside the project and removed afterward. Symbolic links are indexed as leaves.

Hook commands contain no project path. They find `harness/.runtime/spec100.cjs` from the Claude project folder or the current folder. A committed settings file therefore works after a clone or a move. If a hook cannot find the runtime, PreToolUse blocks the tool call and other events report a non-blocking error.

Text comparisons and evidence fingerprints treat CRLF and LF line endings as equal. A Windows checkout with `core.autocrlf=true` therefore passes the same checks as a macOS or Linux checkout. On Windows, the fingerprint reads the executable bit of tracked files from the Git index.

## Gates and native activation

Software implementation requires baseline and final verification, independent code/security review, two independent verifier votes per finding, risk assessment, explicit approval for high-risk actions, applicable UAT evidence, and detection/rollback steps. The initial review counts as round one; unresolved findings after three rounds leave a blocked handoff.

Before implementation, inspect the active client's native hook manager and independent-agent tools. Record the actual result as capability evidence using the [runtime protocol](skills/spec100-setup/assets/templates/protocol.md). Missing required capabilities block implementation. File existence does not establish native trust or activation.

- Codex hooks require native review and trust. Setup does not grant it. Codex denies an unapproved risky action; the agent obtains explicit consent in chat, then records the actual response. Its custom read-only role instructions do not create a separate sandbox.
- Antigravity App/CLI have documented custom agents. IDE custom subagents are unverified, so the software implementation gate remains blocked there. Antigravity hooks request fresh native permission for recognizable risky actions.
- Generic mode has no native hooks. Research, planning, and structural checks remain available; implementation cannot pass the hook capability gate.

These are cooperative local gates. The runtime cannot authenticate agent attestations, human responses, or native hook activation independently. Hooks do not sandbox arbitrary shell scripts or control edits made outside the selected coding tool. No absent test, review, screenshot, or approval can be recorded as successful execution.

The PreToolUse hook blocks direct file-tool writes to `harness/learnings.md`, `harness/.runtime/`, `harness/thoughts/<topic>/run.json`, `.spec100-install.json`, and `.spec100-write.lock`. It resolves case differences, relative paths, and symbolic links before it compares paths. Writes to `.claude/settings.json`, `.claude/settings.local.json`, `.codex/hooks.json`, and `.agents/hooks.json` need approval like other high-risk actions. A command that names `spec100` together with `workflow approve` needs a human decision in every form, not only the standalone form. A deliberately disguised command can still pass this text check. A hook error blocks only a PreToolUse call. Errors in other events do not block, so a bad record cannot make a Stop hook loop.

Code, plan, and relevant instruction/configuration changes invalidate affected evidence. Index/layout refreshes do not invalidate it. Use one active writer per project. Runs retain explicit tool/session ownership; switching tools does not silently transfer an active run or reset its review count. The runtime never creates PRs, merges, deploys, resets user changes, or creates worktrees automatically.

Non-software work retains checkpoints, active hooks, risk, and high-risk approval. It omits software-specific review and UAT gates.

## Per-turn router (optional)

The router selects a model and an effort level for each user turn in Claude Code. It is off by default. Ask the setup skill to enable it, or run setup with `--router on`. `--router off` removes it. Setup without the flag keeps the current state. The router needs the Claude integration.

How it works:

1. A `UserPromptSubmit` hook sends the prompt text to Haiku. The call is `claude -p --model haiku --safe-mode` with no tools. It uses your current Claude Code login.
2. Haiku returns a model (`haiku`, `sonnet`, or `opus`) and an effort level (`low`, `medium`, `high`, or `xhigh`). For a short follow-up such as "continue", it returns `same`, and the session keeps the previous route.
3. The hook gives the route to the session. The session writes a `Route: <model>/<effort>` line and passes the model and effort to the Agent tool for the work of the turn.

Fable is a route only when the prompt contains the word "Fable". The runtime adds Fable to the allowed values from the prompt text, and it rejects a Fable answer that it did not allow. The router model does not make this decision. `max` effort is never a route.

Limits:

- Claude Code has no documented method that changes the model of the main session for each turn. The main session keeps its model. It reads the prompt, delegates, and reports. The routed subagent does the tool work. A turn without tool work gets a direct answer from the main session.
- The route is an instruction, like the other cooperative gates. The runtime cannot force the session to delegate.
- The router sees only the current prompt, not the conversation.
- Each routed turn adds about 3 to 5 seconds and one small Haiku request (about $0.0003 in the recorded check).
- A router error gives no route. It never blocks a prompt. The hook has a 45-second limit, and the classifier has a 30-second limit.
- The hook starts `claude` from `PATH`. Set `SPEC100_CLAUDE_BIN` to an executable or a JavaScript entry point when `claude` is not on `PATH`. On Windows, a `claude.cmd` file cannot start without a shell, so use `claude.exe` or `SPEC100_CLAUDE_BIN`.
- Codex and Antigravity have no router.

## Add tools, migrate, and recover

Ask the setup skill to add an integration. Its runtime command supports repeated `--tool` options:

```text
node <bundled-runtime> setup --root <project> --draft <temporary-json> --tool codex --tool antigravity --dry-run
```

Add `--router on` or `--router off` to the same command to change the per-turn router. The setup skill supplies actual quoted paths and the evidence-based draft. Remove `--dry-run` only when setup is requested. With no tool option, setup retains installed integrations or defaults a new project to Claude.

To upgrade from 2.0.0 to 2.1.0, run setup again. Setup replaces the old hook commands, which contained an absolute project path. The changed hook configuration makes capability evidence of active runs stale, so record capability evidence again. Evidence for a file that contains CRLF line endings, or a tracked file in an excluded folder such as `build/` or `vendor/`, also becomes stale once. Review rounds are kept.

Version 1 manifests are treated as Claude installations. Known generated templates migrate automatically. Existing owned links become regular wrappers. Customized legacy skills or rules with Claude-specific instructions require a targeted manual migration; setup reports the exact file and stops before any writes. Preserve those custom instructions when updating tool-specific wording. Migration preserves evidence records and review counts, but changes to installed instructions can make current evidence stale.

If `.spec100-install.json` remains after interruption, run the setup skill's recovery path. The journal restores prior files and removes empty directories created by installation. Do not discard it. A `.spec100-write.lock` prevents overlapping runtime writers. Each runtime writer releases a stale local lock when its process is no longer running. Unknown-host, unreadable, or active-process locks require inspection. A PostToolUse hook skips its index refresh when another writer holds the lock.

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
