# Authenticated Claude Code smoke test

This requires an authenticated local Claude Code installation. Automated runtime tests do not substitute for native plugin loading and agent discovery.

1. Build the checkout with `npm run build`. Inside Claude Code, add the checkout using `/plugin marketplace add <absolute-checkout-path>` and install `/plugin install spec100@spec100-marketplace`. Reload or restart if prompted.
2. Open a disposable Git project whose absolute path contains spaces. Add a README describing a small library and a passing test. Confirm all six `/spec100:*` commands appear in the slash menu and `/spec100:check` reports the uninitialized state.
3. Run `/spec100:setup --dry-run` and verify no harness/configuration files were written. Run `/spec100:setup`; confirm tailored context cites the README and every structural check passes. Restart if needed for first-time agent discovery.
4. Add a project-specific sentence to `harness/skills/research.md`. Run `/spec100:research sample investigate library behavior` and confirm the command follows that customization and writes the expected research file. Run `/spec100:plan sample` and `/spec100:iterate sample simplify the plan`; inspect retained revisions.
5. Run `/spec100:implement sample` for a small low-risk library change. Observe real implementer, parallel code/security review, verifier invocations when findings exist, recorded checkpoints, verification, explicit UAT applicability, and detection/rollback evidence. Confirm no PR, deployment, or worktree was created.
6. In a separate disposable topic, plan an authentication change. Verify approval is requested before a high-risk action and that the approval command invokes native permission. Decline permission and confirm the action does not proceed. Then approve the concrete action and confirm it proceeds only as authorized.
7. Confirm `/spec100:check` reports stale evidence after modifying reviewed code or the selected plan. Verify an unresolved third review produces a blocked handoff without a fourth review or endless Stop-hook retries.
8. Run setup again and confirm instructions, unrelated hooks, customized skills/context/agents, learnings, and thoughts are preserved. Run the standalone CI check without model credentials.

Save screenshots of command discovery and the applicable visual UAT, plus command transcripts and gate results. Do not represent this checklist as executed without running it.
