# Per-turn router plan

Source: `thoughts/research/2026-11-23-turn-router.md`. Date: 2026-11-23.

## Goal

Add an optional router to the harness. For each user turn in Claude Code, Haiku selects a model and an effort level. The session applies them to the work of the turn through the Agent tool.

## Decisions

- Mechanism: a `UserPromptSubmit` command hook in the installed runtime (research option C).
- Router model: `haiku`, called with `claude -p --safe-mode`. The call uses the login of the user.
- Models: `haiku`, `sonnet`, `opus`. `fable` is allowed only when the prompt text contains the word "fable". The router can also return `same` for a follow-up.
- Efforts: `low`, `medium`, `high`, `xhigh`. `max` is not an option, because it is a high-cost level that a user selects.
- The router is off by default. `setup --router on` enables it, and `setup --router off` disables it. Setup without the flag keeps the current state.
- The router needs the Claude integration. Setup refuses `--router on` without it.
- A router error gives no route. It never blocks a prompt.
- The runtime keeps no router state. No new files appear in the project.
- Version 2.2.0. Manifests from 2.1.0 stay valid.
- Do not commit. The user did not ask for commits in this goal.

## Phase 1: runtime

File: `src/runtime.cts`.

1. Add `router?: boolean` to the manifest. Add the `--router on|off` option to `setup`.
2. Add the `UserPromptSubmit` hook definition for Claude when the router is on. Use a 45 s hook timeout. Setup removes the hook when the router is off.
3. Add `classify(prompt)`. It starts the Claude executable (`SPEC100_CLAUDE_BIN`, or `claude` from `PATH`) with the Haiku model, no tools, safe mode, a JSON schema, and a 30 s limit. It sends the prompt on standard input. It sets `SPEC100_ROUTER_ACTIVE=1` for the child process.
4. Validate the answer in the runtime. Reject a model or an effort that is not allowed, including `fable` without an explicit request.
5. Add the `UserPromptSubmit` event to `hook()`. It returns the route as `additionalContext`. It returns nothing when the router is off, when the prompt is empty, when `SPEC100_ROUTER_ACTIVE` is set, or when the classifier fails.
6. Add one router paragraph to the managed `CLAUDE.md` section when the router is on.
7. Report the router state in the Claude integration result of `check`.

## Phase 2: tests

File: `test/runtime.test.mjs`. All tests use a fake classifier script through `SPEC100_CLAUDE_BIN`. No test calls a real model.

1. Setup with `--router on` installs the hook and the paragraph, and `check` passes. Setup without the flag keeps the state. `--router off` removes both.
2. The hook returns the route of the classifier. The classifier call uses Haiku, safe mode, and no tools.
3. `fable` is in the schema only when the prompt names Fable. A `fable` answer without a request gives no route.
4. A failed classifier, an invalid answer, and the recursion guard give no route and exit 0.
5. `same` tells the session to keep the previous route.
6. `--router on` without the Claude integration fails before any write.

## Phase 3: docs and live check

1. README: the router section, its limits, its cost, and the Windows note.
2. Setup skill: the `--router` option.
3. `docs/validation.md`: the live result.
4. Live check in a scratch project with the built runtime: one routed turn, and one turn that names Fable.

## Acceptance

- `npm run check` passes.
- The live check shows a `Route:` line, an Agent call with the routed model and effort, and a subagent on that model.
- A prompt without "fable" never gets a `fable` route.

## Rollback

Run `setup --router off` in a project to remove the hook. To remove the feature from the repository, restore `src/runtime.cts` and the generated runtimes from the previous commit and run `npm run build`.

## Not in scope

- A change of the main session model for each turn. Claude Code has no documented method for it. A request proxy can do it, with the risks in the research report. Decision for the user.
- Routing for Codex and Antigravity.
- A route log.

## Execution record

Implemented on 2026-11-23 on macOS with Claude Code 2.1.330. All phases are complete. Nothing is committed. The work is on the local branch `turn-router`, which starts from `harness-review-fixes`.

- `npm run check`: type check passed. 82 tests passed, 0 failed, 0 skipped (77 existing and 5 new).
- Live classifier calls through the installed hook gave `fable/low` for an explicit Fable request, `opus/xhigh` for a hard design task, and `haiku/low` for "Do not use Fable. Fix the typo". Each call took 3.0 s to 5.0 s.
- Live session: the router returned `sonnet/medium`. The Haiku main session wrote the `Route:` line and called the Agent tool with that model and effort. The subagent ran on `claude-sonnet-5-5`. All five hook events exited 0.

Residual risks:

- The main session keeps its model. Only the delegated work uses the routed model and effort.
- The session can ignore the route. The runtime cannot force delegation.
- The Fable rule is a word match on the prompt. A prompt that names Fable for another reason, for example a question about Fable, makes Fable an allowed value. Haiku then decides if the user asked for it.
- The router sees only the current prompt.
- No run on Windows, on Linux, in an interactive session, or with an Opus main session.
