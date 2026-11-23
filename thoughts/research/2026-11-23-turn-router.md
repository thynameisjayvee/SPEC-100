# Per-turn model and effort router

Date: 2026-11-23. Tool: Claude Code 2.1.330 on macOS. Question: how can the harness select a model or an effort level for each turn, with Haiku as the router, without an external router project?

## Requirements

1. A router selects the model or the effort level for each turn.
2. The router model is Haiku.
3. Fable is a routing option only when the user explicitly asks for it.
4. The feature is part of this repository and the installed harness.
5. The feature does not use jev-router.

## Method

1. Read the official Claude Code docs for hooks, settings, model configuration, subagents, the CLI, and gateways.
2. Ran four experiments in a scratch project. Each experiment removed the router variables of the current session (`ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, and related variables) so that requests went directly to Anthropic.

## Facts from the docs

| Topic | Fact | Source |
|---|---|---|
| Native routing | Claude Code has no per-turn model selection by prompt difficulty. `opusplan` switches by mode. | code.claude.com/docs/en/model-config |
| `UserPromptSubmit` input | The hook receives `prompt`, `session_id`, `cwd`, `permission_mode`, and `transcript_path`. | code.claude.com/docs/en/hooks |
| `UserPromptSubmit` output | The hook can return `additionalContext` or block the prompt. No field sets the model, the effort, or the thinking budget. | same |
| Model switch hooks | `PreModelSwitch` can allow or deny a switch. It cannot select a model. | same |
| Prompt hooks | A `type: "prompt"` hook returns `ok` and `reason` only. It cannot add context. | same |
| Settings | Claude Code reloads permissions, hooks, and credential helpers from changed settings files. The docs do not say that `model` reloads. | code.claude.com/docs/en/settings |
| Subagents | The Agent tool accepts `model` (an alias) and `effort` for each call. The call value overrides the agent file. `effort` exists from 2.1.292. | code.claude.com/docs/en/sub-agents |
| Effort levels | `low`, `medium`, `high`, `xhigh`, `max`. | code.claude.com/docs/en/model-config |
| Gateway | A gateway at `ANTHROPIC_BASE_URL` must pass headers and body fields through unchanged. A gateway that changes `model` for each request is not documented. | code.claude.com/docs/en/llm-gateway-protocol |

## Experiments

| # | Experiment | Result |
|---|---|---|
| 1 | A `UserPromptSubmit` hook wrote a new `model` into `.claude/settings.local.json` before turn 2 of a headless session. | No effect. Both turns used the first model. A settings write cannot route a turn. |
| 2 | `claude -p --model haiku --safe-mode --tools "" --output-format json --json-schema ...` with a routing system prompt, for three prompts. | Correct structured output each time: a typo fix gave `haiku/low`, a race-condition redesign gave `opus/high`, and "yes, continue" gave `same`. Wall time 3.1 s to 3.9 s. Cost $0.0002 to $0.0003 for each call. The call used the existing login. `--safe-mode` disables hooks, so the call cannot start itself again. |
| 3 | A `UserPromptSubmit` hook returned a fixed route (`sonnet/low`) as `additionalContext`. The main session ran on Haiku. | The main session wrote `Route: sonnet/low` and called the Agent tool with `model: "sonnet"` and `effort: "low"`. The subagent ran on `claude-sonnet-5-5`. |
| 4 | A hook wrote its `CLAUDE*` environment variables to a file. | A hook receives `CLAUDE_PROJECT_DIR` and the session variables. It does not receive the path of the Claude executable. |

## Options

| Option | Per-turn effect | Assessment |
|---|---|---|
| A. Local proxy at `ANTHROPIC_BASE_URL` that rewrites `model` in each request | Changes the model of the main session. | Not documented. The proxy handles the login token of the user. It must also correct the effort, thinking, and context fields that Claude Code sends for the model it believes it uses. It needs a process that runs before Claude Code starts. It repeats the design of an external router. Rejected. |
| B. Hook that writes `model` and `effortLevel` to a settings file | None (experiment 1). | Rejected. |
| C. Hook that classifies the prompt with Haiku and returns a route. The session applies the route through the Agent tool `model` and `effort` parameters. | Changes the model and effort of the work of the turn. The main session model stays the same. | Uses documented features only. Works with the existing login. No process to manage. Selected. |

## Design constraints from the findings

- The main session keeps its model. It reads the prompt, delegates, and reports. The routed subagent does the tool work. This is the largest limit of option C.
- The router sees only the current prompt. A short follow-up such as "continue" has no meaning alone. The router returns `same` for it, and the session keeps the previous route.
- The route is an instruction to the session, like the other cooperative gates of this harness. The runtime cannot force the session to delegate.
- Each routed turn adds about 3 s to 4 s and one small Haiku request. The feature must be optional.
- The Fable rule must not depend on the judgment of a model. The runtime adds `fable` to the allowed values only when the prompt text contains the word. The runtime then rejects a `fable` answer that it did not allow.
- A router failure must never block or delay a prompt beyond its timeout. The hook returns no route on any error.
- On Windows, Node cannot start a `.cmd` file without a shell. The classifier needs `claude.exe` on `PATH` or an explicit path.
