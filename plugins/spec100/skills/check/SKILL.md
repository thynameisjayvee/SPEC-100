---
name: check
description: Inspect SPEC-100 structure, native Claude links, index freshness, and implementation evidence without changing the project.
---

Resolve the current project root, then run `node "${CLAUDE_PLUGIN_ROOT}/runtime/spec100.cjs" check --root <root> --json` there. This command is read-only and does not call a model.

Report overall compliance, failed check IDs, and the smallest corrective action. Report each warning separately; a warning does not fail compliance. Also report incomplete/stale workflow gates and review rounds. Exit 1 means noncompliance; exit 2 means invalid configuration or execution failure. An uninitialized project should be initialized with `/spec100:setup`. Do not silently set up, repair, approve, or mark workflows complete. Do not claim that absent evidence proves a review or test was performed.
