# Fix round proof for AntelopeJS/dms#540

Each `formal-gates/<scenario>.log` is a scratch commit on top of the branch head (83e79a4c), then `dms-control formal` and `verdict` on a copy of a finished run.

| Scenario | Change | Expected | Gate |
| --- | --- | --- | --- |
| order-swap | `await enforcePageValidation();` and `await checkPageMetadata(...)` swapped in the covered `[...slug].vue` | fails | FAIL |
| statement-move | `const NO_LISTENER_LIMIT` moved from broker.ts to registry.ts, both covered | fails | FAIL |
| type-reflow | a long type annotation in onboarding.ts, reflowed by oxfmt | known findings | PASS |
| format-only | redundant parentheses, quote style and line breaks | known findings | PASS |
| comment-only | a TSDoc comment | known findings | PASS |
| import-retarget | an import retargeted to another module | fails | FAIL |
| import-alias | an alias of the same binding, same origin | known findings | PASS |
| side-effect-import | a binding import replaced by a side-effect import and a local | fails | FAIL |
| onboarding-type-only | a type annotation | known findings | PASS |
| realtime-move | isEventForTenant moved verbatim between covered files | known findings | PASS |
| rr-move-module | release-range.mjs moved to another module and re-exported | known findings | PASS |
| rr-reshape-step | release.yml validate condition reordered | known findings | PASS |
| pr529-move | the branch head against 4c96f61d | known findings | PASS |
| rr-behaviour-change | the validate step no longer checks the license | fails | FAIL |
| onboarding-status-409 | 409 instead of 400 | fails | FAIL |
| realtime-behaviour-change | presence no longer released on updates | fails | FAIL |
| rr-rule-removed | a rule removed from the release-range test | fails (absent at HEAD) | FAIL |
| rr-fixed | the rule fixed, its findings removed | fixed reported | PASS |

`checks.log` is `pnpm run checks`; `api-diff.log` is `antelopejs-api-diff origin/main`.
