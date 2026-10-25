# Claude Code smoke test

Use the [native client smoke-test procedure](native-smoke-test.md) with the Claude Code integration. Load this checkout with `/plugin marketplace add <absolute-checkout-path>` and `/plugin install spec100@spec100-marketplace`, or use the client's session-only plugin directory option in a disposable test project.

Confirm all six `/spec100:*` commands, project agent discovery, active native hooks, canonical customizations, permission requests, bounded review/Stop behavior, and the standalone runtime check. Record actual native results in the validation guide. Do not treat fixture review or approval records as human acceptance.
