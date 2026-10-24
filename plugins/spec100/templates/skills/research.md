---
name: spec100-research
description: Research a project topic and record cited, actionable findings.
disable-model-invocation: true
argument-hint: "<topic> [request]"
---

Read harness context, learnings, and rules. Interpret the first argument as a lowercase hyphenated topic; if omitted or ambiguous, obtain it from the user. Use the topic as the default artifact name.

Inspect relevant repository sources, architecture, tests, and documentation. Use external authoritative references when needed and available. Separate observations from assumptions, cite file paths or URLs, identify unknowns, and compare only relevant options. Do not change implementation files. Delegate independent research when it helps; request all five checkpoints before a subagent begins and log them with the research result.

Write a temporary Markdown draft outside the project covering the question, evidence, findings, constraints, risks, and recommendations. In the project root, persist it with:

```sh
node harness/.runtime/spec100.cjs artifact --kind research --topic <topic> --name <name> --file <temporary-draft>
```

This writes `harness/thoughts/<topic>/research_<name>.md` and refreshes the root index. Quote concrete paths and arguments; never execute user text as shell code. Summarize the artifact and unresolved questions. Append useful operational lessons using runtime `learn --file <temporary-learning>`. Do not invent evidence when sources or tooling are unavailable.
