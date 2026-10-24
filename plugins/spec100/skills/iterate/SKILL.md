---
name: iterate
description: Refine an existing SPEC-100 plan from feedback while retaining its revision history.
argument-hint: "<topic> <feedback>"
---

Arguments: $ARGUMENTS

Resolve the current project root. If `harness/skills/iterate.md` does not exist, tell the user to run `/spec100:setup` and stop. Read that canonical skill and follow its instructions, including project-specific customizations. Use the first argument as the topic and the remaining arguments as feedback. Do not treat user text as shell code. Load harness context, learnings, and rules before proceeding.
