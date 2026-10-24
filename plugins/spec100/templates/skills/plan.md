---
name: spec100-plan
description: Create an actionable plan from topic research or a direct user request.
argument-hint: "<topic> [request]"
---

Read harness context, learnings, and rules. Resolve the topic, then inspect its research artifacts and relevant project sources. A direct prompt is sufficient when no research artifact exists. Resolve high-impact ambiguity before finalizing; do not ask questions that repository inspection can answer.

Produce a decision-complete plan covering goal, acceptance criteria, affected behavior/interfaces, implementation units and file ownership, dependencies, verification, risk, UAT applicability, detection, and rollback. Identify high-risk steps that require approval before execution. Avoid speculative features. Planning does not authorize implementation.

Write a temporary Markdown file outside the project, then persist it from the root:

```sh
node harness/.runtime/spec100.cjs artifact --kind plan --topic <topic> --name <name> --file <temporary-draft>
```

Default the artifact name to the topic. The output is `harness/thoughts/<topic>/plan_<name>.md`. If there are several candidate plans, identify the intended one rather than choosing silently. Explain the plan's important decisions and remaining blockers. Do not start implementation automatically.
