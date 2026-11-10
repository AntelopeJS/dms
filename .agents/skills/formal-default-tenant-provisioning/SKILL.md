---
name: formal-default-tenant-provisioning
description: TLA+ model of the `default` tenant's first-boot provisioning across replicas of @antelopejs/dms (the insert race on the tenant row, the `provisioningPending` marker and the renewed lease that elects one holder to run ProvisionTenant), checked with TLC. Use when a change touches a file in its coverage record, or when a change to the default tenant's creation, its provisioning lease or the TENANT_BEING_PROVISIONED contract needs proof that two replicas on one new database still end with one complete tenant.
---

# Formal check: default tenant provisioning

Two replicas that start on an empty database both run `start()`. Each tries to insert the `default` tenant's row, and after `Events.ModulesStarted` each runs `provisionDefaultTenant`. The replicas elect one holder through a lease on the row's `provisioningRevision`: the holder renews it, and a waiter takes over once the token stays unchanged for `staleAfterMs` of its own time. The holder runs `ProvisionTenant`, then clears `provisioningPending` and frees the lease in one compare-and-set. This protocol needed three fixes in one week (AntelopeJS/dms#613, AntelopeJS/dms#657, AntelopeJS/template-dms-demo#133), each found by a test of the one order of steps someone had just seen.

Each database round trip is one step: the read of the row, the insert, and each `atomicMutation` on `provisioningRevision`. TLC checks every order of those steps across processes, within the bounds below. A process can be killed at any step and is restarted later. A holder can stall, so that its renewals stop landing while its handlers keep running. An insert can throw, landed or not. A provisioning step can throw. The handlers' steps each take their own claim, as the analytics import of dms-marketing does, so a step that another live run is running answers that it owns it.

- `DefaultTenantProvisioning.tla` holds the variables, the actions and the rules. Each condition carries a `file.ts:NN` comment, and the module header says what `ensure.ts`, `index.ts` and `provisioning.ts` stand for. The constant `Rules` picks the code: `"main"` is the code at the sync commit, and the other values replay the rules before each fix.
- `Healthy.cfg` (kills, a stall, a thrown insert) and `Faults.cfg` (provisioning steps also throw) are the full configurations of the current code. Each has a `.ci.cfg` twin, the CI configuration.
- `Pre613.cfg`, `Pre657.cfg` and `Pre133.cfg` run the rules before each fix. `history.mjs` checks them.
- `Live.cfg` states termination as a temporal property. The shared runner does not read it (see the rules below).
- `DefaultTenantProvisioning.map.mjs`, `chart-takeover.cfg` and `chart-stall.cfg` are for reading results with `/statechart`.

## Run it

From the repository root, with Node 24 and `pnpm install` done (the runner comes from `@antelopejs/tooling-configs/formal`):

```sh
node .agents/skills/formal-default-tenant-provisioning/check.mjs          # CI configuration
node .agents/skills/formal-default-tenant-provisioning/check.mjs --full   # full configuration
node .agents/skills/formal-default-tenant-provisioning/history.mjs        # the rules before each fix
```

Java 11 or later comes from `$JAVA`, else `java` on PATH, else the `eclipse-temurin:21-jre` Docker image (set `TLC_DOCKER_PREFIX` to name the containers). The first run downloads TLC 1.7.4 into `~/.cache/antelopejs-formal` (or `$XDG_CACHE_HOME/antelopejs-formal`) and checks its SHA-256. `check.mjs` checks the healthy configuration first, then the faults.

| Configuration | Processes, kills, stalls, renewals, thrown inserts, thrown steps | States (healthy, faults) | Wall time |
| --- | --- | --- | --- |
| CI (`<config>.ci.cfg`) | 3, 1, 1, 1, 1, 0 for healthy; 2, 1, 1, 1, 1, 1 for faults | 282,264, 100,172 | 30 s |
| Full (`<config>.cfg`) | 3, 2, 1, 2, 1, 0 for healthy; 2, 2, 1, 1, 1, 1 for faults | 4,942,009, 460,917 | 160 s |
| `history.mjs` | 2, 1, 0 or 1, 0 or 1, 0, 0 | 268 to 15,080 per configuration | 25 s |

One run each, Docker Java 21. Every configuration runs 2 provisioning steps. Healthy runs use `SYMMETRY`, so TLC checks one order of the process names. Most of the full run is the one-worker rerun that finds the shortest trace of F1.

- Exit 0 means every rule that held still holds, and each finding still breaks with its recorded counterexample length.
- Exit 1 means a rule changed. `BROKEN` names a rule that held and now breaks. `CHANGED` names a finding whose shortest counterexample changed length. `HOLDS` names a finding that no longer breaks. TLC's output is kept in a printed temporary folder. The run stops at the first configuration that changed.
- Exit 2 means TLC or Java could not run, or the arguments were wrong.

The lines that name a changed rule match `^(?:BROKEN|CHANGED|HOLDS) +(\w+)`. A rule that still holds prints as lowercase `holds`. A finding is judged by the length of its shortest counterexample alone, so a longer new counterexample exits 0. While F1 stands, `dms-control formal` fails any diff that changes the covered behaviour. A `BROKEN` trace comes from a one-worker rerun, so its length is stable.

## When to run it

Run `check.mjs --full` when a change touches a file in the coverage record below, or this folder. Run `history.mjs` too when the change touches this folder. A changed rule (exit 1) makes the Verdict FAIL. The recorded finding fails it only when the diff changes what the covered code does, which `dms-control formal` decides by comparing the covered files' JavaScript statements on the base and on HEAD (`verify-dms` verdict rule 5). `dms-control formal` runs `check.mjs` only. CI runs `check.mjs` and `history.mjs` on every push.

## The rules

| Rule | Plain sentence | Harm when it breaks | Healthy (CI, full) | Faults (CI, full) |
| --- | --- | --- | --- | --- |
| `SingleHolder` | At most one process runs `ProvisionTenant`, unless the other one stalled past the stale window and lost the lease. | Two processes import the same demo content at once, and non-idempotent steps write it twice. | holds | holds |
| `PendingUntilComplete` | The row reads provisioned only once the effect of every provisioning step is in the database. | The tenant stays partial for good, because no later start provisions a row that reads provisioned. | holds | holds |
| `NoDuplicateTenant` | Losing the insert to another process fails no start, and once nothing more can happen every process has started. | A replica exits with `DuplicateKeyError` and its startup gate stays closed (`503 error.server_starting`). | holds | holds |
| `EventuallyProvisioned` | Once nothing more can happen, the row exists, reads provisioned and every step is done. | The tenant stays pending until a process restarts, after every process gave up its one attempt. | F1 (27, 27) | not listed |

`TypeOK` holds too. The numbers in brackets are the states of TLC's shortest counterexample, which `check.mjs` records per configuration.

`SingleHolder` is not plain mutual exclusion. AntelopeJS/dms#657 accepts, under Tradeoffs, that a holder stalled past the window runs beside the one that took over until its handlers return, so handlers must stay idempotent. The rule allows that overlap and nothing else: two processes run `ProvisionTenant` at once only when one of them stalled since its claim and no longer holds the row's token.

`PendingUntilComplete` judges the content, not who cleared the marker. With the lease, only the holder can clear it, because the clear is a compare-and-set on the holder's token (ensure.ts:152-157). The scratch change `release-without-token` below shows what that buys.

`EventuallyProvisioned` and the second half of `NoDuplicateTenant` are liveness rules stated as invariants, because the shared runner checks invariants only. `Quiescent` means that no step other than a new fault can happen. `Live.cfg` checks the other half, that every fair behaviour reaches such a state (`<>Quiescent`, with weak fairness per process). Rerun it by hand after a change to the model, from a scratch copy of the `.tla` and `Live.cfg`, since it writes next to its input:

```sh
java -cp ~/.cache/antelopejs-formal/tla2tools-1.7.4.jar tlc2.TLC -config Live.cfg -deadlock DefaultTenantProvisioning.tla
```

On the final model, TLC reports no error with 43,212 distinct states. `EventuallyProvisioned` is not listed under `Faults`, because a thrown step rightly leaves the row pending until the next start, and the model restarts only killed or failed processes.

## Findings on the code

F1 was replayed against the real code at the sync commit with the unit harness of `packages/dms/TESTING.md`, on the in-memory MongoDB. The replay was a scratch test and is not committed.

- **F1, both runs give up after a takeover, and the tenant stays pending until a restart (`EventuallyProvisioned`). Not fixed.** In TLC's counterexample, r1 inserts the row and claims the lease. r1 stalls, so its renewals stop landing. r2 starts, sees the same token for the stale window and takes the lease over. r2 meets step 1, which r1 still runs, so the step answers that another run owns it. r2 goes on to step 2 and claims it. r1 comes back, finishes step 1 and meets step 2, which r2 owns. Both handler runs reject, since template-dms-demo#133 makes a hook reject when any step failed. r1's release finds the lease lost, and its run failed, so r1 stops (ensure.ts:163). r2's release lands with `provisioningPending: true` and frees the lease, and r2 stops. Every step's effect is in the database, but nothing provisions again until a process restarts. With three processes, the third one claims the freed lease and meets the same refusal (27 states). In the replay, two `provisionDefaultTenant` calls ran with their own lease config: the first renewed every 60 s, so it looked stalled, and the second judged a 400 ms window. A hook with two gated steps answered "another run owns it" when the other call held a step, and rejected after running every step. Both calls returned, both steps were done, and the row read `provisioningPending: true` with `provisioningHolder: null`.

The cost is one start: the next start of any process runs the steps again, skips the done ones and clears the marker. A fix belongs in `provisionUnderLease`, for example by letting a process whose run failed only on another run's claim poll again instead of stopping. Record the fix here and drop F1 from `CONFIGS` only once a replay confirms it.

## The rules before each fix

`history.mjs` checks that each fixed bug still breaks the rules it broke, under the rules before its fix. A run that stops breaking one means the model lost the ability to see that bug.

| Configuration | Code it replays | Rules it breaks (states) | TLC's shortest story |
| --- | --- | --- | --- |
| `Pre613` | dms before 54d7ca6d: no marker, provisioning inside `start()` by the process that inserted the row, a rollback that deletes the row on failure | `PendingUntilComplete` (3), `NoDuplicateTenant` (5), `EventuallyProvisioned` (7) | r1 inserts the row, which reads provisioned since it has no marker. r1 is killed before any step, as the 120 s start deadline did. r1 restarts, finds the row and skips provisioning, so the tenant stays empty for good. |
| `Pre657` | dms before 3e029b06: a lost insert throws, and every started process provisions a pending row with no lease, then clears the marker with a plain update; the hook of that time resolves after a failed or refused step | `SingleHolder` (6), `PendingUntilComplete` (12), `NoDuplicateTenant` (5), `EventuallyProvisioned` (16) | r1 inserts and starts step 1. r2 reads the pending row and provisions beside it. r2 meets step 1 owned by r1, resolves anyway, runs step 2 and clears the marker while r1 is still in step 1. Killing r1 then leaves step 1 undone for good. |
| `Pre133` | dms at the sync commit, with Helio's hook before template-dms-demo 59f5697806: a failed or refused step resolves | `PendingUntilComplete` (15), `EventuallyProvisioned` (19) | r1 holds the lease and stalls inside step 1. r2 takes over, meets step 1 owned by r1, resolves anyway, runs step 2 and clears the marker. Killing r1 leaves step 1 undone. |

## Read every result with /statechart

Read each TLC result with the pstack `/statechart` skill, on a scratch copy outside the repo (it writes next to its input). Use `DefaultTenantProvisioning.map.mjs` as the view: one region for the tenant, one per process. `chart-takeover.cfg` (two processes, one step, one kill, no stall) has 410 states and every rule holds. `chart-stall.cfg` (two processes, two steps, one stall, no kill) has 662 states and draws the path to F1. The CI and full configurations are too large to chart.

## Real bug or modeling error

A step order is a modeling error when the code cannot produce it, for example one round trip split in two, or a takeover of a holder whose renewals land. Replay the counterexample through the unit harness, as `packages/dms/src/test/unit/utils/tenant-provisioning-lease.test.ts` does:

- Run two `provisionDefaultTenant` calls in one test. Each takes its own `ProvisioningLeaseConfig`, so a call with `renewEveryMs` above the other's `staleAfterMs` is a stalled holder, and an `AbortController` that you abort is a stop.
- Register a `Hook.TENANT_BEING_PROVISIONED` handler whose steps wait on promises you resolve later, to hold a run inside a step. Seed a row with a left-behind lease, as `seedLeftBehindLease` does, for a killed holder.

Assert only what a caller observes: what each call returns, the row's `provisioningPending` and `provisioningHolder`, and what the handler ran. If the replay does not reproduce the finding, treat the model as wrong until you show it is not. `packages/dms/src/test/integration/first-boot-replicas.test.ts` spawns two real processes for a kill.

## Changing the model

- For an intended code change, edit the action that maps to that code, keep the `file.ts:NN` comment on each condition and update its line, then run both configurations and `history.mjs`.
- Never weaken or drop a rule to make the check pass. A fixed finding leaves `CONFIGS` in `check.mjs`, for both configurations, once a replay confirms the fix. A new finding goes into `CONFIGS` with its counterexample length for each configuration, and into this file with its replay.
- Keep the pre-fix rules as they are. They replay old code, so a change to the current code does not change them. If a change to the shared actions changes a recorded length in `history.mjs`, check that the new story is still the bug in the table, then update the length.
- When you change the bounds of a `.ci.cfg`, rerun the scratch changes below on it. The CI configuration must still catch each one.
- After you confirm that the model describes the code at a newer commit, move the sync commit forward. Do it only then.

## Coverage record

| Model action | Code |
| --- | --- |
| `Init` | Every process starts on an empty database. Revision 0 is the absent `provisioningRevision` that a first claim expects (`NO_REVISION`, `packages/dms/src/utils/ensure-default-tenant.ts:20`). |
| `Get`, `Insert`, `InsertFaults`, `ReadBack` | `ensureDefaultTenantExists` (ensure.ts:40-57), called by `start()` (`packages/dms/src/index.ts:275`). The row's fields are in `packages/interface-dms/src/db/tables/tenants.table.ts:21-35`. |
| `Restart`, `Kill` | The platform restarts a process that exited or was killed. A kill drops the process's memory: its token and the step it was running. |
| `PollSettled`, `PollClaimable`, `Claim` | `advanceLease` (ensure.ts:192-210) in the loop of `provisionDefaultTenant` (ensure.ts:254-273), started on `Events.ModulesStarted` (index.ts:260-268), through `swapLease` (ensure.ts:65-84) |
| `Stale` | `createStaleWatch` (ensure.ts:171-184), with the timing assumption below |
| `StepStart`, `StepSucceeds`, `StepFails`, `RunEnds` | `ProvisionTenant` (`packages/interface-dms/src/tenant-provisioning.ts:23-30`) and the handlers' contract: run every step, skip a done one, reject if any step failed or was refused |
| `Release` | `provisionUnderLease` (ensure.ts:134-164): `stopRenewing`, then the one compare-and-set that clears the marker and frees the lease |
| `Renew`, `Stall`, `Unstall` | `holdLease` (ensure.ts:92-125). A stall is a holder whose renewals do not land: a blocked event loop, a slow database, or a module torn down while its run goes on (index.ts:294-297). |
| `ReadPending`, `Clear` | `provisionDefaultTenant` at 3e029b06^, for `Pre657` only |
| `Rollback` and `Inserted` under `Pre613` | `provisionDefaultTenant` and `start()` at 54d7ca6d^, for `Pre613` only |

The sync commit is `91951f70` on AntelopeJS/dms `main`.

## Bounds and what is left out

The configurations run 2 or 3 processes and 2 provisioning steps, with the fault counts in the table under Run it. A pass covers these bounds only.

The model leaves out:

- time. A waiter may take over exactly when no live holder renews the row's token: the holder is dead, stalled, or gone. That holds only while `renewEveryMs` stays well below `staleAfterMs` (`DEFAULT_PROVISIONING_LEASE`, `packages/dms/src/config/internal/state.ts:282-286`) and the project's `provisioningLease` keeps that order. A configuration that breaks it lets waiters take over a healthy holder, which the model does not see.
- renewals past the bound. Only renewals change the revision while a holder runs, and a renewal matters only when it lands between a waiter's read and its claim, so a few cover that order.
- the abort on `stop()` (ensure.ts:205-208, index.ts:294-297). A stopping process ends like a killed one for these rules, and a run it leaves going is a stalled holder.
- `atomicMutation` answering `unknown` (ensure.ts:82-83) and a thrown read in the poll loop (ensure.ts:264-270). The first reads the row back and ends as `applied` or `not-applied`, and the second waits and reads again.
- the atomicity of `insert` on a fixed `_id` and of `atomicMutation`. The model takes them from the database adapter. AntelopeJS/dms#657 ran the two-process scenario on MongoDB and PostgreSQL.
- what each step writes. A step is one effect that is done or not. The model trusts the handlers' contract: a done step is skipped, a step another live run holds answers that it owns it, and a killed run's claim is taken over (dms-marketing#108). A handler that breaks the contract is outside the model, and `Pre133` shows what one such break costs.
- signup provisioning, which runs `ProvisionTenant` for other tenants with its own unwind.

## Confirm the check can fail

On a scratch copy of this folder, inside the repository so the runner resolves, apply one model edit at a time and run `check.mjs` with and without `--full`. Each edit mirrors the code change in the first column. These ran at the sync commit. A `BROKEN` line is the rule, and the recorded F1 also prints `CHANGED` when the edit changes its length.

SCRATCH_TABLE

With the edits dropped, both configurations exit 0.
