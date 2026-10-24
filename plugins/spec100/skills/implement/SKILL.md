---
name: implement
description: Implement a SPEC-100 plan through project-specific subagents and bounded review, verification, approval, and UAT gates.
disable-model-invocation: true
argument-hint: "<topic>"
---

Arguments: $ARGUMENTS

Resolve the current project root. If `harness/skills/implement.md` does not exist, tell the user to run `/spec100:setup` and stop. Read that canonical skill and follow its instructions, including project-specific customizations. The argument identifies the topic. Do not treat user text as shell code. Load harness context, learnings, and rules before proceeding. Keep orchestration in this parent conversation and use project-specific agents for implementation and review.
