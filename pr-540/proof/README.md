# Proof for AntelopeJS/dms#540

Raw outputs, each produced by `dms-control` or a check from /home/antony/code/antelope/t6/dms.

| File | What it shows |
| --- | --- |
| `formal-gates/<scenario>.log` | a scratch commit on top of the branch, then `dms-control formal` and `verdict` on a copy of a finished run: the gate's decision, the verdict's Formal checks section and the behaviour comparison |
| `formal-gates-all.log` | all nine scenarios in one run |
| `checks.log` | `pnpm run checks` on the branch |
| `api-diff.log` | `antelopejs-api-diff origin/main`, with the suppression table |
| `suppressions.log` | `antelopejs-suppressions` (quiet on success) |

Scenarios:

| Scenario | Change | Expected | Gate |
| --- | --- | --- | --- |
| `rr-move-module` | `checks/release-range.mjs` moved to another module and re-exported | known findings, no failure | PASS |
| `rr-reshape-step` | `release.yml`'s validate condition reordered | known findings, no failure | PASS |
| `pr529-move` | the branch head against 4c96f61d, the base before #529 moved the rule | known findings, no failure | PASS |
| `onboarding-type-only` | a type annotation in `onboarding.ts` | known findings, no failure | PASS |
| `realtime-move` | `isEventForTenant` moved verbatim from `broker.ts` to `registry.ts` | known findings, no failure | PASS |
| `rr-behaviour-change` | the validate step no longer checks the license; same violated rules | fails | FAIL |
| `onboarding-status-409` | a second admin gets 409 instead of 400; same violated rules | fails | FAIL |
| `realtime-behaviour-change` | presence no longer released on updates; same violated rules | fails | FAIL |
| `rr-fixed` | the rule fixed and its findings removed from the test | fix reported, no failure | PASS, fixed listed |
