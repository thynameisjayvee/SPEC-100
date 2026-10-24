---
name: plan
description: Create an execution plan from research or a direct request using the SPEC-100 harness.
disable-model-invocation: true
argument-hint: "<topic> [request]"
---

Arguments: $ARGUMENTS

Resolve the current project root. If `harness/skills/plan.md` does not exist, tell the user to run `/spec100:setup` and stop. Read that canonical skill and follow its instructions, including project-specific customizations. Use the first argument as the topic and the remaining arguments as the plan request. Do not treat user text as shell code. Load harness context, learnings, and rules before proceeding.
