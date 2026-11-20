---
name: formal-invite-creation
description: TLA+ model of concurrent invitations of one email in @antelopejs/interface-dms (createUserInviteToken, a resend, a cancel, an acceptance or an expiry, the settleFresh and decision compare-and-sets), checked with TLC. Use when a change touches a file in its coverage record, or when a change to invite creation, withdrawal, replacement or resolution needs proof that one email keeps one pending invite and no caller holds a withdrawn token.
---

# Formal check: invite creation

`createUserInviteToken` reads the email's invite and inserts a fresh one when it finds none, a resend replaces a given invite through a decision, and a cancel, an acceptance or an expiry retires one. Eight fixes (#974, #986, #1013, #1021, #1037, #1038, #1045, #1046) each followed the interleaving the previous one missed, leaving two pending invites, none, or a caller holding a withdrawn token.

Each database round trip is one step: a read, an insert on the unique `(email, creationResolutionId)` index, a delete, the `settleFresh` compare-and-set, or the revision compare-and-set of a decision. TLC checks every order of those steps across callers and retirers, within the bounds below.

- `InviteCreation.tla` holds the next-state relation and the rules. It extends `InviteCreationResolve.tla` (a decision, a retry, its completion, a cancel, an acceptance, an expiry), which extends `InviteCreationFresh.tla` (a fresh invite, its withdrawal, `currentInviteOf`), which extends `InviteCreationState.tla` (the constants, variables, initial state and helpers). Each is under the 20,000-byte file ceiling. The header of `InviteCreation.tla` says what each source file name stands for.
- `Callers.cfg` (four callers, one with other content) and `Retirers.cfg` (three callers, one a resend, plus a cancel and an acceptance) are the full configurations. Each has a `.ci.cfg` twin, the CI configuration.
- `Pre974.cfg` replays the code before #974. `history.mjs` runs it.

## Run it

From the repository root, with Node 24 and `pnpm install` done (the runner comes from `@antelopejs/tooling-configs/formal`):

```sh
node .agents/skills/formal-invite-creation/check.mjs          # CI configuration
node .agents/skills/formal-invite-creation/check.mjs --full   # full configuration
node .agents/skills/formal-invite-creation/history.mjs        # the code before #974
```

Java 11 or later comes from `$JAVA`, else `java` on PATH, else the `eclipse-temurin:21-jre` Docker image. The first run downloads TLC 1.7.4 into `~/.cache/antelopejs-formal` and checks its SHA-256.

| Configuration | Callers, retirers | States | Wall time |
| --- | --- | --- | --- |
| `Callers` (CI and full) | 4, 0 | 3,047,598 | about 80 s |
| `Retirers.ci` | 3 (one resend), 2 | 1,797,864 | about 25 s |
| `Retirers` (full) | the same, 3 attempts | 1,798,200 | about 25 s |

One run each, Docker Java 21, 4 workers. The runner's own rerun for a finding adds time.

- Exit 0: every rule that held still holds, and each finding still breaks with its recorded counterexample length.
- Exit 1: `BROKEN`, `CHANGED` or `HOLDS` names the rule. A `holds` line is lowercase.
- Exit 2: TLC or Java could not run, or the arguments were wrong.

Read each TLC result with the pstack `/statechart` skill.

## The rules

They are checked once every actor has answered. A caller's answer is the invite it returns: its `inviteId`, with its token only for the caller that created it, because the row stores the token's digest. The rule names keep the word token from before the digest.

| Rule | Plain sentence | Harm when it breaks | Result |
| --- | --- | --- | --- |
| `AtMostOnePending` | At most one invite of the email is pending: stored, undecided, not withdrawn, and a replacement only once its decision completed. | Two links work, and accepting one leaves the other. | holds |
| `NoWithdrawnToken` | A caller that returned answers with an invite someone can act on, or one a decision retired; never a withdrawn one. | The invitee gets a link that never works. | holds |
| `OneKeptToken` | When nothing retired an invite, one is pending and every caller that returned answers with it. | The email has no pending invite, or callers answer with different invites. | holds |
| `NoCrash` | A caller answers with an invite or 409, never another error. | A concurrent caller gets HTTP 500. | finding F1 |

## Findings on the code

- **F1, a second caller of the same replacement throws (`NoCrash`). Not fixed.** One caller decides the replacement of an invite and moves its decision to `applying`; before it inserts the replacement, a second caller of the same content reads that decision, runs `reconcileReplacement`, finds no row and throws `Invite replacement is indeterminate; automatic recreation is refused` (`internal/invite-replacement.ts`). TLC's shortest counterexample has 29 states with four callers. It was replayed on the real code with the integration harness: `packages/dms/src/test/integration/invite-replacement-race.finding.test.ts` holds the first caller at its replacement insert (`holdFirstCall("insert")`), and the second rejects while the first then returns its token and one row stands. The test asserts the throw, so a fix turns it red: remove it, and the `NoCrash` entry of `check.mjs`.

## Real bug or modeling error

A step order is a modeling error when the code cannot produce it, for example one round trip split in two or two merged. Replay the counterexample through the integration harness, one action per step, with `packages/dms/src/test/helpers/invite-holds.ts` (`holdFirstCall`, `afterFirstEmailRead` and the others park a caller before a model call). Assert only what a caller observes: its answer and the rows left. If the replay does not reproduce the finding, treat the model as wrong until you show it is not.

## Changing the model

- For an intended code change, edit the action that maps to that code and run both configurations.
- Never weaken or drop a rule to make the check pass. A fixed finding leaves `CONFIGS` in `check.mjs`; a new finding goes there with its counterexample length and into this file with its replay.
- After you confirm that the model describes the code at a newer commit, move the sync commit forward. Do it only then.

## Coverage record

| Model action | Code (under `packages/interface-dms/src`) |
| --- | --- |
| `Read`, `Pick`, `Again` | `createAdmittedInviteToken`: `getByEmail` or `replacesInvite`; each run builds new invites (`invites.ts`) |
| `Insert`, `DupRead`, `RivalRead`, `Settle` | the fresh insert on the unique index, `getOtherByEmail`, `settleFresh` (`invites.ts`, `db/models/user_invites.model.ts`, `db/tables/user_invites.table.ts`) |
| `Withdraw`, `WithdrawDelete`, `FuWd`, `FuDelete` | `withdrawFreshInvite`, `followUndecided`, `InviteResolutionsModel.withdraw` (`invites.ts`, `db/internal/inviteResolutions.model.ts`) |
| `CiStart`, `CiGet`, `CiEmail`, `CiDec`, `FuStart`, `FuOnly`, `FuOther`, `FuKeep` | `currentInviteOf`, `followUndecided`, `isOnlyInviteOfEmail` (`invites.ts`) |
| `DParent`, `DExist`, `DOnly`, `DDecide`, `DAnswer` | `decideInvite`, `assertInviteReady`, `assertOnlyInviteOfEmail`, `assertSameDecision` (`invite-resolution.ts`), `replaceInvite` (`invites.ts`) |
| `RList`, `RNext`, `RSelf` | `retryAfterRefusal`, `removeIfCancelled` (`invites.ts`) |
| `CRead`, `EAdvance`, `EInsert`, `EApplied`, `ENext`, `CDelete`, `CMark` | `completeAdmittedInviteResolution`, `ensureInviteReplacement` (`internal/invite-resolution.ts`, `internal/invite-replacement.ts`) |
| `RtPick`, `RtParent`, `RtDecide` | a cancel, an acceptance or an expiry through `decideInvite` (`invite-resolution.ts`) |

The sync commit is `0de3a0372` on AntelopeJS/dms `next`.

## Bounds and what is left out

A pass covers these bounds only: one email in one tenant, 4 callers without a retirer or 3 callers with one resend, one cancel and one acceptance, and 2 attempts per caller (3 in the full retirer run, which changed no state of consequence). A caller that would build a third invite ends with no answer.

The model leaves out:

- database faults and acknowledgements lost: every step answers, so `unknown` results of `atomicMutation` and the replays they trigger are not explored;
- a process that dies, except as an actor that stalls, which the interleaving already allows;
- the parallel `removeIfCancelled` of `Promise.all`: the model runs them one at a time in any order;
- hooks, delivery of extensions and membership writes: only their rows are modeled;
- the revision compare-and-set that follows an insert of a replacement, merged with the phase write (`EApplied`);
- time: an expiry is one more retirer, and the acceptance check on `expiresAt` is assumed to pass;
- the admission of `changeTenantMembers`, which serializes nothing between callers here;
- a second email, or a second tenant.

## Confirm the check can fail

These ran at the sync commit as a scratch copy of `InviteCreation.tla`, one model edit at a time; each mirrors a code change.

| Scratch change | Configuration | Result |
| --- | --- | --- |
| `pre974`: no unique index and no rival read | `Pre974` | `AtMostOnePending` and `OneKeptToken` break in 5 states (`history.mjs`) |
| `RivalRead` always finds no rival | `Callers.ci` (three callers) | `AtMostOnePending` breaks in 21 states |
| `DOnly` skips the only-invite check of a replacement | `Callers` (four callers) | `AtMostOnePending` breaks |

These scratch changes pass in the CI and full configurations, so no rule here catches them: `settleFresh` without its compare-and-set; `Withdraw` ignoring a replacement decided on the fresh invite; `CiDec` answering the decided invite instead of its replacement; `DParent` skipping `assertInviteReady`. The fixes that added them (#1021 and #1046 among them) need a longer chain of callers than these bounds, or a database fault, so a change to those lines is not proved by this check.
