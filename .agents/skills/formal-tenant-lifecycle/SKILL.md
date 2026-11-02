---
name: formal-tenant-lifecycle
description: TLA+ model of the tenant lifecycle row of @antelopejs/interface-dms (runTenantLifecycleOperation, the barrier of pause and resume, closeTenantLifecycleAdmission and the deletion after it), checked with TLC. Use when a change touches a file in its coverage record, or when a change to tenant admission, a barrier or tenant deletion needs proof that deletion cannot overtake a writer.
---

# Formal check: tenant lifecycle

Every membership and invitation write runs under `runTenantLifecycleOperation`, which writes its attempt id into one row per tenant, runs the work and removes the id. dms-saas pauses admission on that row around a plan change, and tenant deletion closes admission on it for good before it deletes anything. A write to the row is one compare-and-set on its `revision`. A deletion that overtakes a writer leaves orphaned member or billing rows.

The model treats each database round trip as one step, and TLC checks every order of those steps across invocations, barrier owners and a deletion, within the bounds below. The database can throw or answer `unknown`. Any actor can stall between two steps, and an admitted invocation can stay suspended for as long as it likes. The promise it checks is that deletion cannot overtake a writer, and that a barrier stops new writers only while it is held.

- `TenantLifecycle.tla` holds the variables, the actions and the rules. Each condition carries a `file.ts:NN` comment; the module header says what `model.ts`, `lifecycle.ts` and `deleted.ts` stand for.
- `Healthy.cfg` (no database fault) and `Faults.cfg` (database calls fail) are the full configurations. Each has a `.ci.cfg` twin, the CI configuration.
- `Live.cfg` states `ResumeAdmits` as a temporal property. The shared runner does not read it (see the rules below).
- `TenantLifecycle.map.mjs`, `chart-refusal.cfg` and `chart-barrier.cfg` are for reading results with `/statechart`.

## Run it

From the repository root, with Node 24 and `pnpm install` done (the runner comes from `@antelopejs/tooling-configs/formal`):

```sh
node .agents/skills/formal-tenant-lifecycle/check.mjs          # CI configuration
node .agents/skills/formal-tenant-lifecycle/check.mjs --full   # full configuration
```

Java 11 or later comes from `$JAVA`, else `java` on PATH, else the `eclipse-temurin:21-jre` Docker image (set `TLC_DOCKER_PREFIX` to name the containers). The first run downloads TLC 1.7.4 into `~/.cache/antelopejs-formal` (or `$XDG_CACHE_HOME/antelopejs-formal`) and checks its SHA-256. Each run checks the healthy database first, then the faults.

| Configuration | Invocations, owners, faults | States (healthy, faults) | Wall time |
| --- | --- | --- | --- |
| CI (`<config>.ci.cfg`) | 2, 1, 0 and 1 | 182,178, 676,680 | not timed again |
| Full (`<config>.cfg`) | 2, 2, 0 for healthy; 2, 1, 2 for faults | 9,977,042, 1,384,896 | not timed again |

Both configurations allow up to 2 closes. The state counts are one run each in Docker Java 21 after the release retry of dms#653. The wall times of the earlier model (7.9 to 8.4 s for CI, 44.2 s for full) were not measured again.

- Exit 0 means every rule that held still holds, and each finding still breaks with its recorded counterexample length.
- Exit 1 means a rule changed. `BROKEN` names a rule that held and now breaks. `CHANGED` names a finding whose shortest counterexample changed length. `HOLDS` names a finding that no longer breaks. The script keeps TLC's output in a temporary folder and prints its path. The run stops at the first configuration that changed.
- Exit 2 means TLC or Java could not run, or the arguments were wrong.

The lines that name a changed rule match `^(?:BROKEN|CHANGED|HOLDS) +(\w+)`. A rule that still holds prints as lowercase `holds`.

A rule with a recorded finding is judged by the length of its shortest counterexample alone, so a change that adds a longer counterexample to that rule exits 0 while the finding stands. No rule has a recorded finding now. `dms-control formal` closes that gap for a diff: while a finding stands, it fails a verdict whose diff changes the covered behaviour. The trace printed after `BROKEN` comes from a run on every core, so its length can vary between runs, and when a break violates two rules either can be the one named. Only the exit code and the fact of a `BROKEN` line are stable. Findings run on one worker, so their lengths are stable.

## When to run it

Run `--full` when a change touches a file in the coverage record below, or this folder. A changed rule (exit 1) makes the Verdict FAIL. The recorded finding fails it only when the diff changes what the covered code does, which `dms-control formal` decides by comparing the covered files' JavaScript statements on the base and on HEAD (`verify-dms` verdict rule 5). CI runs the CI configuration on every push.

## The rules

| Rule | Plain sentence | Harm when it breaks | Healthy (CI, full) | Faults (CI, full) |
| --- | --- | --- | --- | --- |
| `NoWriterDuringDeletion` | Deletion runs only when no attempt is admitted, in flight, failed or uncertain. | Deletion overtakes a writer, and member or billing rows outlive the tenant. | holds | holds |
| `PauseBlocksAdmission` | No admission is ever written while the row holds a barrier. | A plan change validates an inventory that a new writer is changing. | holds | holds |
| `RefusalReleases` | An attempt that answered with its 4xx refusal holds no admission. | The tenant can never be deleted, for an attempt that wrote nothing. | holds | holds |
| `SuccessReleases` | An attempt that finished holds no admission. | The tenant can never be deleted, for an attempt whose effects are all done. | holds | holds |
| `FailureRetains` | A failed attempt keeps its admission, whatever any other attempt does. | Deletion overtakes an effect whose outcome is unknown. | holds | holds |
| `ResumeAdmits` | An attempt that asks after every owner's resume returned is admitted, unless a deletion closed the row. | The tenant stays frozen after the plan change that paused it. | holds | not listed |

`TypeOK` holds too. The numbers in brackets are the states of TLC's shortest counterexample, which `check.mjs` records per configuration.

`FailureRetains` differs from the plan that proposed this check, which said a failed attempt blocks "until it is replayed". The code has no such release. A replay is a new attempt with a new id and never retires the failed one (`tenant-lifecycle.test.ts`, "retains failed invocations even when a separate replay succeeds"), and no API retires an attempt. A failed attempt blocks the tenant's deletion for good, by design (`packages/interface-dms/docs/1.core/5.tenancy.md`, "There is no automatic expiry or reconciliation API"). In the model, a replay is another attempt.

`ResumeAdmits` is a liveness rule stated as an invariant, because the shared runner checks invariants only. The model has no cycle, so under weak fairness every behaviour ends in a state with no step that changes anything (`Quiescent`), and the rule asks for admission in those states. `Quiescent` also counts a step that changes nothing as no step, so an admission loop that spins breaks the rule. It is not listed under `Faults` because a database error may refuse an attempt, and that is correct. `Init` starts some behaviours with no deletion to come, so a closure cannot excuse an attempt that stays stuck.

`Live.cfg` checks both halves as real temporal properties, with weak fairness per actor: `<>Quiescent`, and `owed[a] ~> AdmittedOrClosed(a)`. Rerun it by hand after a change to the model, from a scratch copy of the `.tla` and `Live.cfg`, since it writes next to its input:

```sh
java -cp ~/.cache/antelopejs-formal/tla2tools-1.7.4.jar tlc2.TLC -config Live.cfg -deadlock TenantLifecycle.tla
```

On the final model, TLC reports no error with 125,786 distinct states. It reports `Temporal properties were violated` on each of the four `ResumeAdmits` scratch changes in the last section. The shared runner cannot run this file, because it writes only `INVARIANT` lines into its config, so CI runs the invariant form.

## Findings on the code

F1 was replayed against the real code at the sync commit with the integration harness of `packages/dms/TESTING.md`, on the in-memory MongoDB. The replay was a scratch test and is not committed. F1 is fixed (AntelopeJS/dms#653); the committed tests are in `packages/dms/src/test/integration/tenant-lifecycle-refusal.test.ts`.

- **F1, a refused attempt keeps its admission when the release fails (`RefusalReleases`). Fixed, AntelopeJS/dms#653.** A 4xx refusal released with `model.finish(...).catch(() => undefined)`, so a failed release was swallowed and never tried again. In TLC's counterexample, the attempt asks for admission, reads the row, writes its admission, the work refuses with a 4xx, and the release read throws. In the replay, `model.get` threw from inside the work: the call answered 402, `activeAttemptIds` kept 1 entry and `closeTenantLifecycleAdmission` rejected with `Tenant lifecycle deletion blocked by active or indeterminate attempts`. The same happened when the release's compare-and-set answered `unknown` without landing.
- **F2, a finished attempt keeps its admission when the release fails (`SuccessReleases`). Fixed, AntelopeJS/dms#653.** Found by the verifier of the first model, which had no rule for it. A success propagated a failed `finish` but did not try again, so one transient fault blocked the tenant's deletion for good. The fix is the same as for F1: `releaseAttempt` (lifecycle.ts:35-52) tries `finish` `RELEASE_ATTEMPTS` (3) times, which is safe because `finish` is idempotent. If every try fails, the admission stays and the call rejects with the release failure (after a refusal, an `AggregateError` of the refusal and the release failure), so the blocked deletion is reported. The model retries a faulted release and assumes `MaxFaults < ReleaseAttempts`, so it does not reach the exhausted state; that state is the same as a failed attempt, which `FailureRetains` already covers.

## Read every result with /statechart

Read each TLC result with the pstack `/statechart` skill. Work on a copy of `TenantLifecycle.tla`, the map and the chart configs in a scratch folder outside the repo, since it writes its output next to its input. Use `TenantLifecycle.map.mjs` as the view: one region for the tenant, one per invocation, one per barrier owner and one for the deletion. `chart-barrier.cfg` (one invocation, one owner, no deletion, no fault) has 352 states and every rule holds. `chart-refusal.cfg` (one invocation, one deletion, one fault) is the configuration that drew the path to F1; since the fix it has no counterexample, and its state count was not charted again. The other configurations are too large to chart, and `/statechart` checks them only.

## Real bug or modeling error

Node runs other requests at every `await`, so any order of round trips across concurrent calls can happen. A step order is a modeling error when the code cannot produce it, for example one round trip split in two. Replay the counterexample through the integration harness, one action per step:

- Hold an invocation inside its `work` callback with a promise you resolve later, then call the other actor. `packages/dms/src/test/integration/tenant-lifecycle.test.ts` has examples.
- Inject a database fault by replacing `model.get` to throw, or `table.atomicMutation` to answer `unknown`, on the object `GetModel(TenantLifecycleModel, tenantId)` returns.

Assert only what a caller observes: the answer, `observeTenantLifecycle`, and whether `closeTenantLifecycleAdmission` resolves. If the replay does not reproduce the finding, treat the model as wrong until you show it is not.

## Changing the model

- For an intended code change, edit the action that maps to that code, keep the `file.ts:NN` comment on each condition and update its line, then run both configurations.
- Never weaken or drop a rule to make the check pass. A fixed finding leaves `CONFIGS` in `check.mjs`, for both configurations, once a replay confirms the fix. A new finding goes into `CONFIGS` with its counterexample length for each configuration, and into this file with its replay.
- When you change the bounds of a `.ci.cfg`, rerun the scratch changes below on it. The CI configuration must still catch each one.
- After you confirm that the model describes the code at a newer commit, move the sync commit forward. Do it only then.

## Coverage record

| Model action | Code |
| --- | --- |
| `Init` | `state()` initializes the row once (`packages/interface-dms/src/db/internal/tenantLifecycle.model.ts:22-43`). A loser of the insert reads the winner's row, so the model starts with the row. A legacy row reads the same way. |
| `Start`, `AdmitRead`, `AdmitApplied`, `AdmitStale` and their faults | `model.admit` (model.ts:64-80), `transition` (model.ts:45-61), called at `runTenantLifecycleOperation` (`packages/interface-dms/src/tenant-lifecycle.ts:41-43`) |
| `WorkSucceeds`, `WorkRefuses`, `WorkFails` | lifecycle.ts:76-92, `isDeliberateRefusal` (lifecycle.ts:20-27), `changeTenantMembers` as the work (`packages/interface-dms/src/tenant-members.ts:29-40`) |
| `FinishRead`, `FinishApplied`, `FinishStale` and their faults | `model.finish` (model.ts:109-118), called through `releaseAttempt` (lifecycle.ts:35-52) after a success, where a fault is tried again |
| `ReleaseRead`, `ReleaseApplied`, `ReleaseStale` and their faults | `model.finish`, called through `releaseAttempt` after a refusal, where a fault is tried again |
| `Observe` | `observeTenantLifecycle` (lifecycle.ts:114-123) |
| `PauseRead`, `PauseApplied`, `PauseStale` and their faults | `model.pause` (model.ts:83-94) |
| `ResumeStart`, `ResumeRead`, `ResumeApplied`, `ResumeStale` and their faults | `model.resume` (model.ts:97-106) |
| `CloseStart`, `CloseRead`, `CloseApplied`, `CloseStale`, `CloseReread` and their faults | `model.close` (model.ts:121-135), retried by a new call of `closeTenantLifecycleAdmission` (lifecycle.ts:99-103) |
| `deleter = "deleting"` | `cleanupTenantData` deletes after the close resolves (`packages/dms/src/hooks/tenant-deleted.ts:20-26`) |

The sync commit is `82edc836` on AntelopeJS/dms `campaign/integration`.

## Bounds and what is left out

The CI configuration runs 2 invocations, 1 barrier owner, up to 2 closes, and 0 or 1 database fault. The full one runs 2 invocations with 2 owners and no fault, and 2 invocations with 1 owner and 2 faults. Three invocations with two owners did not finish within 3 minutes, so they are outside the bounds. Each owner pauses once, with one identity, which is what `pauseTenantLifecycleAdmission` asks for. A pass covers these bounds only.

The model leaves out:

- a writer that `work` does not await. `runTenantLifecycleOperation` asks every caller to await every effect, and the model trusts that: an attempt's effects end when its work settles. A detached write or a raw model write can overtake deletion, and only a review of the callers finds it.
- what the barrier's owner does while it holds the barrier. `dms-saas` validates its inventory there, and `formal-guarded-plan-change` is the check for that.
- the atomicity of `atomicMutation`. The model takes it from the database adapter, and the integration test "arbitrates simultaneous closure and admission on one revision" exercises it on MongoDB.
- a process that dies. For these rules, that is an actor that stalls forever, which the model already allows.
- a dropped `tenant_lifecycle` row. A new row would be open, and the docs forbid dropping it. `cleanupTenantData` leaves it in place.
- nested calls. The docstring of `runTenantLifecycleOperation` says each call takes its own admission, as `changeTenantMembers` says. Each model attempt is one top-level call.

## Confirm the check can fail

On a scratch copy of this folder, inside the repository so the runner resolves, apply one model edit at a time and run `check.mjs` with and without `--full`. Each edit mirrors the code change in the first column. These ran at the sync commit. The run stops at the first rule TLC reports, and a `BROKEN` line is the rule, since its trace length varies.

| Scratch change in the code, and the model edit | Rule | CI configuration | Full configuration |
| --- | --- | --- | --- |
| `close-skips-quiescence`: `close` drops `current.activeAttemptIds.length` (model.ts:128): `CloseReread` ignores `row.active` | `NoWriterDuringDeletion` | `BROKEN NoWriterDuringDeletion` | same |
| `close-without-closing`: `close` tests quiescence without writing `closed` (model.ts:124-128): `CloseRead` skips the write, `CloseReread` tests only `row.active` | `NoWriterDuringDeletion` | `BROKEN NoWriterDuringDeletion` | same |
| `admit-ignores-closed`: `admit` drops the closed throw (model.ts:67): `AdmitRead` drops that branch | `NoWriterDuringDeletion` | `BROKEN NoWriterDuringDeletion` | same |
| `admit-ignores-barrier`: `admit` drops the 409 (model.ts:68-72): `AdmitRead` drops that branch | `PauseBlocksAdmission` | `BROKEN PauseBlocksAdmission` | same |
| `admit-without-revision`: the admission write drops `expectedRevision` (model.ts:53): `AdmitApplied` drops `Applies`, `AdmitStale` is disabled | `PauseBlocksAdmission` | `BROKEN PauseBlocksAdmission` | `BROKEN PauseBlocksAdmission` or `BROKEN FailureRetains`, by run |
| `refusal-keeps-admission`: drop the release (lifecycle.ts:79-89): `WorkRefuses` goes straight to `refused` | `RefusalReleases` | `BROKEN RefusalReleases` | same |
| `any-throw-releases`: `isDeliberateRefusal` always answers true (lifecycle.ts:20-27): `WorkFails` removes the admission | `FailureRetains` | `BROKEN FailureRetains` | same |
| `finish-retires-every-attempt`: `finish` writes an empty list (model.ts:113-116): `Removed` writes `{}` | `FailureRetains` | `BROKEN FailureRetains` | same |
| `finish-without-revision`: the release write drops `expectedRevision` (model.ts:53): `RemoveLands` drops `Applies`, `RemoveConflicts` is disabled | `FailureRetains` | `BROKEN FailureRetains` | same |
| `resume-keeps-barrier`: `resume` drops `barrierId: null` (model.ts:104): `ResumeApplied` keeps `row.barrier` | `ResumeAdmits` | `BROKEN ResumeAdmits` | same |
| `admit-gives-up-on-conflict`: `admit` throws instead of looping (model.ts:65, 73-78): `AdmitStale` goes to `admitFailed` | `ResumeAdmits` | `BROKEN ResumeAdmits` | same |
| `pause-ignores-revision`: `pause` drops the revision test (model.ts:91): `PauseRead` drops `row.rev # expected[o]`, so a delayed pause lands after its resume | `ResumeAdmits` | `BROKEN ResumeAdmits` | same |
| `resume-keeps-barrier-and-admit-spins`: as `resume-keeps-barrier`, and `admit` loops on the barrier instead of refusing: `AdmitRead` stays at `admitRead` | `ResumeAdmits` | `BROKEN ResumeAdmits` | same |
| `release-gives-up`: a refused attempt's release stops at its first fault, as before dms#653 (`releaseAttempt`): the three `Release*` fault actions end at `refused` | `RefusalReleases` | `BROKEN RefusalReleases` | same |
| `success-release-gives-up`: a finished attempt's release stops at its first fault: the three `Finish*` fault actions end at `done` | `SuccessReleases` | `BROKEN SuccessReleases` | same |
| `success-skips-finish`: delete the release after a success (`runTenantLifecycleOperation`): `WorkSucceeds` goes straight to `done` | `SuccessReleases` | `BROKEN SuccessReleases` | same |

Every scratch run exited 1. The three rows added with the retry ran once in each configuration, with the trace printed as `BROKEN` ending at the fault action or at `WorkSucceeds`; the other rows ran twice at the sync commit.

With the edits dropped, both configurations exit 0.
