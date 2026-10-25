---
name: spec100-iterate
description: Revise a selected plan from feedback and preserve its previous version.
---

Read harness context, learnings, and rules. Resolve the topic and the intended existing plan; when more than one is plausible, obtain the exact selection. Apply the user's feedback and inspect affected sources/research as needed. Update the entire plan coherently, including interfaces, risks, acceptance criteria, verification, and rollback where affected. Add a dated revision note explaining the change.

Persist the replacement through runtime `artifact --kind plan --topic <topic> --name <existing-name> --file <temporary-draft>` from the project root. The runtime archives the old content in the topic's `revisions/` directory and refreshes the index. Never revise by deleting the prior version. Explain that changed plans invalidate affected implementation evidence and approval. Do not reset an existing run or its review counter, and do not implement automatically.
