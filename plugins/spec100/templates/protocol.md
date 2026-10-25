# SPEC-100 runtime protocol

These commands support SPEC-100 skills in coding tools. Run from the project root with Node.js >=22.13 and Git available. Quote concrete paths. Write input drafts outside the project so temporary inputs do not change its fingerprint.

## Artifacts and learnings

`node harness/.runtime/spec100.cjs artifact --kind research|plan --topic <slug> --name <slug> --file <markdown>` writes a routed artifact, preserving previous versions in `revisions/`.

`node harness/.runtime/spec100.cjs learn --file <markdown>` appends a dated entry and records the accepted prefix. Never directly edit prior entries.

`node harness/.runtime/spec100.cjs index` refreshes `harness/project-index.md` and the managed root section.

## Workflow

```text
node harness/.runtime/spec100.cjs workflow start --topic <topic> [--plan <relative-path>] [--session <session-id>] --tool <tool>
node harness/.runtime/spec100.cjs workflow record --topic <topic> --kind <kind> --file <json>
node harness/.runtime/spec100.cjs workflow approve --topic <topic> --file <json>
node harness/.runtime/spec100.cjs workflow status --topic <topic>
node harness/.runtime/spec100.cjs workflow check --topic <topic>
node harness/.runtime/spec100.cjs workflow finish --topic <topic>
```

The runtime attaches a timestamp, project fingerprint, and selected-plan hash to evidence. These are cooperative gates, not signed external attestations. Faithfully record actual agent and test results. Never invoke approval without the human's explicit response. Native adapters handle supported high-risk tool calls. Claude and Antigravity can request native permission. Codex cannot emit a hook `ask` result; it denies risky actions without current recorded approval. Its agent must obtain explicit consent in chat before recording approval. Hooks do not parse every shell program or control actions outside the selected tool. Completed runs retain an evidence hash; after a later run starts, earlier completed runs are historical and checked for modified evidence/plans instead of comparing them with later code changes.

`start` captures the baseline and never replaces an existing run. `status` and `check` are read-only; `check` exits 1 for incomplete gates. `finish` records completion only when applicable gates pass. Never reset the review cap.

## Evidence inputs

`preflight` and `verification`:

```json
{"passed":true,"commands":[{"command":"npm test","exitCode":0,"output":"Actual results or an accurate excerpt"}]}
```

Preflight precedes implementation changes and remains evidence of the original baseline when a plan is revised. Verification must match the final code and selected plan. Failed results may be recorded but do not pass a gate.

`risk`:

```json
{"level":"low","reason":"Risk classifier assessment of planned actions and actual changes"}
```

Levels are low, medium, high. Deterministic high-risk paths cannot be downgraded. Missing, uncertain, or stale low/medium assessments are high. Path detection covers auth/security, migrations, production, infrastructure, and CI workflows. Apply the broader semantic policy when path matchers cannot identify risk.

`checkpoints` (incremental records merge by agent ID):

```json
{"agents":[{"id":"implementer-1","destination":"Completion state","reason":"Action justification","cost":"Time, tools, complexity","nextAction":"Immediate step","environment":"Dependencies and constraints"}]}
```

Use actual invocation IDs or consistent labels tied to them. Log every participating agent before execution. The completion gate checks coverage of reviewers and finding verifiers.

`review` (one full round):

```json
{"reviewers":[{"id":"code-1","role":"code-reviewer","findings":[{"id":"F1","description":"Specific defect with location and evidence","severity":"medium","votes":[{"verifier":"verify-1","verdict":"confirm","reason":"Reproduction evidence"},{"verifier":"verify-2","verdict":"dismiss","reason":"Independent evidence"}]}]},{"id":"security-1","role":"security-reviewer","findings":[]}]}
```

Severity: low, medium, high, critical. Finding IDs are unique per round. Exactly two distinct verifier identities per finding; neither can be a reviewer. A finding clears only when both dismiss it. Fix confirmed findings and assess them again in the next round. Empty findings are a clean result. Maximum three rounds including the initial review.

`uat`:

```json
{"applicable":true,"scenario":"User acceptance scenario","passed":true,"screenshots":["harness/thoughts/topic/uat.png"]}
```

Screenshots must be PNG, JPEG, or WebP files within the topic, and their hashes are checked later. Inapplicable alternative: `{"applicable":false,"reason":"Explicit task-specific reason, such as a library-only change with no visual user flow"}`. Missing tooling and failed tests are blockers, not inapplicability.

`rollback`:

```json
{"detection":"Specific regression signal to watch","steps":"Concrete recovery steps preserving unrelated changes"}
```

Approval input (separate `workflow approve` action):

```json
{"userResponse":"The user's actual explicit approval","reason":"Concrete high-risk action and plan being approved"}
```

Recorded approval must quote the actual human response. Native permissions remain tool-specific. Relevant project or plan changes invalidate evidence. Topic artifacts, screenshots, project index entries, and learnings are excluded from the code fingerprint to avoid self-invalidation; the selected plan is hashed separately.

## CI

`node harness/.runtime/spec100.cjs check --json` validates structure and all recorded runs without model calls or credentials. Exit 0: compliant; 1: noncompliant/incomplete; 2: execution/configuration error. Stable check IDs and remediation explain failures.

## Setup and tool selection

Use the portable spec100-setup skill for active-session analysis. The runtime does not call a model. `setup --draft <json> --tool claude --tool codex --tool antigravity` adds the selected integrations; repeat `--tool` as needed. Without this flag, setup retains existing integrations or defaults a new project to Claude. `--dry-run` previews all writes. `recover` restores an interrupted installation. All installed runtime resources are self-contained.

`check --tool codex --json` checks the core, all workflow evidence, and the selected integration. Without `--tool`, check validates all installed integrations. Configured hooks are reported separately from native activation, which this read-only command cannot authenticate. Exit 0 confirms local structure and recorded evidence, not native trust or independently authenticated attestations.

## Required capability evidence

After `workflow start`, verify the active tool's hook manager and available agent tools, then record `workflow record --kind capabilities --topic <topic> --file <json>`:

```json
{"tool":"codex","surface":"cli","independentAgents":true,"hooksActive":true,"reason":"Describe the actual native hook inspection and available independent-agent tools."}
```

The example is a schema, not completed evidence. Record false when a capability is unavailable. Software work requires independent agents and active hooks. Non-software implementation still requires active hooks. Antigravity IDE custom subagents are unverified, so independentAgents must be false there. Generic mode has no hook adapter, so hooksActive must be false. Such runs remain blocked; research, planning, and structural checks remain available. Recheck capabilities after changes to integrations, canonical instructions, or the selected plan. Ordinary code edits do not invalidate capability evidence.

The current tool owns each new run. In a project with multiple integrations, pass one explicit `--tool` to start. Tool/session ownership is never transferred automatically. Use one active writer per project. Do not run simultaneous implementation sessions in different coding tools.
