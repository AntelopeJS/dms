--------------------------- MODULE TenantLifecycle ---------------------------
(***************************************************************************)
(* The tenant lifecycle row of @antelopejs/interface-dms: one row per      *)
(* tenant that admits producers, holds a temporary barrier and closes      *)
(* admission for good before deletion. Each await on the database is one   *)
(* step. A read is `state()`, and a write is one `atomicMutation`, a       *)
(* compare-and-set on `revision` that is atomic on its own.                *)
(*                                                                         *)
(* model.ts is packages/interface-dms/src/db/internal/                     *)
(* tenantLifecycle.model.ts, lifecycle.ts is packages/interface-dms/src/   *)
(* tenant-lifecycle.ts and deleted.ts is packages/dms/src/hooks/           *)
(* tenant-deleted.ts.                                                      *)
(***************************************************************************)
EXTENDS FiniteSets, Naturals

CONSTANTS
  Attempts,  \* invocations of runTenantLifecycleOperation, each with its own attemptId
  Owners,    \* barrier owners, each with one barrierId used for one pause
  MaxCloses, \* calls of closeTenantLifecycleAdmission, a rejected one may be retried
  MaxFaults, \* database calls that throw, or answer "unknown"
  NoBarrier  \* barrierId null

(* RELEASE_ATTEMPTS of lifecycle.ts:7. Every release tries `finish` this often. *)
ReleaseAttempts == 3

ASSUME MaxFaults < ReleaseAttempts

VARIABLES
  row,     \* the tenant_lifecycle row
  snap,    \* what a caller's pending compare-and-set sends, from its last read
  attempt, \* where each invocation is
  pausing, \* where each owner's observe and pause are
  resuming, \* where each owner's resume is, which can overtake its own pause
  expected, \* the revision each owner observed
  deleter, \* where the deletion is
  closes,  \* closes used: Init starts at MaxCloses for a tenant nobody deletes
  faults,  \* database faults so far
  pausedAdmit, \* an admission was written while the row held a barrier
  owed     \* the attempt asked for admission after every owner's resume returned

vars == <<row, snap, attempt, pausing, resuming, expected, deleter, closes,
          faults, pausedAdmit, owed>>

Revisions == 0..((2 * Cardinality(Attempts)) + (2 * Cardinality(Owners)) + 1)
Barriers == Owners \cup {NoBarrier}
Rows == [rev: Revisions, closed: BOOLEAN, barrier: Barriers, active: SUBSET Attempts]
Snaps == [rev: Revisions, active: SUBSET Attempts]
Callers == Attempts \cup Owners \cup {"deleter"}
NoSnap == [rev |-> 0, active |-> {}]

AttemptSteps == {
  "idle", "admitRead", "admitCas", "work", "finishRead", "finishCas",
  "releaseRead", "releaseCas", "done", "refused", "failed",
  "uncertain", "admitFailed", "refusedPaused", "refusedClosed"}
PauseSteps == {"idle", "observed", "pauseRead", "pauseCas", "held", "lost", "pauseFailed"}
ResumeSteps == {"idle", "resumeRead", "resumeCas", "resumed", "resumeRefused", "resumeFailed"}
DeleterSteps == {"idle", "closeRead", "closeCas", "closeReread", "blocked", "deleting"}

TypeOK ==
  /\ row \in Rows
  /\ snap \in [Callers -> Snaps]
  /\ attempt \in [Attempts -> AttemptSteps]
  /\ pausing \in [Owners -> PauseSteps]
  /\ resuming \in [Owners -> ResumeSteps]
  /\ expected \in [Owners -> Revisions]
  /\ deleter \in DeleterSteps
  /\ closes \in 0..MaxCloses
  /\ faults \in 0..MaxFaults
  /\ pausedAdmit \in BOOLEAN
  /\ owed \in [Attempts -> BOOLEAN]

(* state() initializes the row once (model.ts:22-43). A loser of that insert
   reads the winner's row and writes nothing, so the model starts with it. *)
Init ==
  /\ row = [rev |-> 0, closed |-> FALSE, barrier |-> NoBarrier, active |-> {}]
  /\ snap = [c \in Callers |-> NoSnap]
  /\ attempt = [a \in Attempts |-> "idle"]
  /\ pausing = [o \in Owners |-> "idle"]
  /\ resuming = [o \in Owners |-> "idle"]
  /\ expected = [o \in Owners |-> 0]
  /\ deleter = "idle"
  /\ closes \in {0, MaxCloses}
  /\ faults = 0
  /\ pausedAdmit = FALSE
  /\ owed = [a \in Attempts |-> FALSE]

CanFault == faults < MaxFaults
Fault == faults' = faults + 1

(* transition() sends expectedRevision and a fresh nextRevision (model.ts:49-57). *)
Applies(c) == row.rev = snap[c].rev
Patch(r, field, value) == [r EXCEPT !.rev = @ + 1, ![field] = value]
Remember(c) == snap' = [snap EXCEPT ![c] = [rev |-> row.rev, active |-> row.active]]
Forget(c) == snap' = [snap EXCEPT ![c] = NoSnap]

AllResumed ==
  /\ \A o \in Owners : resuming[o] \in {"resumed", "resumeRefused"}
  /\ \E o \in Owners : resuming[o] = "resumed"

(* ---- runTenantLifecycleOperation (lifecycle.ts:68-93) and model.admit ---- *)

MoveAttempt(a, to) == attempt' = [attempt EXCEPT ![a] = to]

AttemptOthersKeep == UNCHANGED <<pausing, resuming, expected, deleter, closes>>

Start(a) ==
  /\ attempt[a] = "idle"
  /\ MoveAttempt(a, "admitRead")
  /\ owed' = [owed EXCEPT ![a] = AllResumed]
  /\ UNCHANGED <<row, snap, faults, pausedAdmit>>
  /\ AttemptOthersKeep

(* The closed throw (model.ts:67), then the barrier's 409 (model.ts:68-72). *)
AdmitRead(a) ==
  /\ attempt[a] = "admitRead"
  /\ IF row.closed
       THEN MoveAttempt(a, "refusedClosed") /\ UNCHANGED snap
       ELSE IF row.barrier # NoBarrier
         THEN MoveAttempt(a, "refusedPaused") /\ UNCHANGED snap
         ELSE MoveAttempt(a, "admitCas") /\ Remember(a)
  /\ UNCHANGED <<row, faults, pausedAdmit, owed>>
  /\ AttemptOthersKeep

AdmitReadFaults(a) ==
  /\ attempt[a] = "admitRead"
  /\ CanFault /\ Fault
  /\ MoveAttempt(a, "admitFailed")
  /\ UNCHANGED <<row, snap, pausedAdmit, owed>>
  /\ AttemptOthersKeep

Admitted(a) ==
  /\ row' = Patch(row, "active", snap[a].active \cup {a})
  /\ pausedAdmit' = (pausedAdmit \/ row.barrier # NoBarrier)

(* model.ts:73-78, then lifecycle.ts:77 calls work. *)
AdmitApplied(a) ==
  /\ attempt[a] = "admitCas"
  /\ Applies(a)
  /\ Admitted(a)
  /\ MoveAttempt(a, "work")
  /\ Forget(a)
  /\ UNCHANGED <<faults, owed>>
  /\ AttemptOthersKeep

(* The while (true) of model.ts:65 reads again. *)
AdmitStale(a) ==
  /\ attempt[a] = "admitCas"
  /\ ~Applies(a)
  /\ MoveAttempt(a, "admitRead")
  /\ Forget(a)
  /\ UNCHANGED <<row, faults, pausedAdmit, owed>>
  /\ AttemptOthersKeep

(* "unknown" throws (model.ts:58-59) before work runs, whether the write landed or not. *)
AdmitUnknownLanded(a) ==
  /\ attempt[a] = "admitCas"
  /\ Applies(a)
  /\ CanFault /\ Fault
  /\ Admitted(a)
  /\ MoveAttempt(a, "uncertain")
  /\ Forget(a)
  /\ UNCHANGED <<owed>>
  /\ AttemptOthersKeep

AdmitUnknownLost(a) ==
  /\ attempt[a] = "admitCas"
  /\ CanFault /\ Fault
  /\ MoveAttempt(a, "admitFailed")
  /\ Forget(a)
  /\ UNCHANGED <<row, pausedAdmit, owed>>
  /\ AttemptOthersKeep

(* lifecycle.ts:77 resolves, and lifecycle.ts:90-91 finishes. *)
WorkSucceeds(a) ==
  /\ attempt[a] = "work"
  /\ MoveAttempt(a, "finishRead")
  /\ UNCHANGED <<row, snap, faults, pausedAdmit, owed>>
  /\ AttemptOthersKeep

(* lifecycle.ts:79-89: a 4xx, by isDeliberateRefusal (lifecycle.ts:20-27). *)
WorkRefuses(a) ==
  /\ attempt[a] = "work"
  /\ MoveAttempt(a, "releaseRead")
  /\ UNCHANGED <<row, snap, faults, pausedAdmit, owed>>
  /\ AttemptOthersKeep

(* lifecycle.ts:78-92: any other throw keeps the admission. *)
WorkFails(a) ==
  /\ attempt[a] = "work"
  /\ MoveAttempt(a, "failed")
  /\ UNCHANGED <<row, snap, faults, pausedAdmit, owed>>
  /\ AttemptOthersKeep

(* model.finish (model.ts:109-118). Each caller runs it from its own steps. *)
ReadRow(a, cas, end) ==
  /\ IF a \in row.active
       THEN MoveAttempt(a, cas) /\ Remember(a)
       ELSE MoveAttempt(a, end) /\ UNCHANGED snap
  /\ UNCHANGED <<row, faults, pausedAdmit, owed>>
  /\ AttemptOthersKeep

Removed(a) == row' = Patch(row, "active", snap[a].active \ {a})

RemoveLands(a, end) ==
  /\ Applies(a)
  /\ Removed(a)
  /\ MoveAttempt(a, end)
  /\ Forget(a)
  /\ UNCHANGED <<faults, pausedAdmit, owed>>
  /\ AttemptOthersKeep

RemoveConflicts(a, read) ==
  /\ ~Applies(a)
  /\ MoveAttempt(a, read)
  /\ Forget(a)
  /\ UNCHANGED <<row, faults, pausedAdmit, owed>>
  /\ AttemptOthersKeep

ThrowOnRead(a, end) ==
  /\ CanFault /\ Fault
  /\ MoveAttempt(a, end)
  /\ UNCHANGED <<row, snap, pausedAdmit, owed>>
  /\ AttemptOthersKeep

UnknownLands(a, end) ==
  /\ Applies(a)
  /\ CanFault /\ Fault
  /\ Removed(a)
  /\ MoveAttempt(a, end)
  /\ Forget(a)
  /\ UNCHANGED <<pausedAdmit, owed>>
  /\ AttemptOthersKeep

UnknownIsLost(a, end) ==
  /\ CanFault /\ Fault
  /\ MoveAttempt(a, end)
  /\ Forget(a)
  /\ UNCHANGED <<row, pausedAdmit, owed>>
  /\ AttemptOthersKeep

FinishRead(a) == attempt[a] = "finishRead" /\ ReadRow(a, "finishCas", "done")
FinishApplied(a) == attempt[a] = "finishCas" /\ RemoveLands(a, "done")
FinishStale(a) == attempt[a] = "finishCas" /\ RemoveConflicts(a, "finishRead")
(* releaseAttempt (lifecycle.ts:35-52) tries `finish` RELEASE_ATTEMPTS times
   and finish is idempotent, so a throw or an unknown answer reads the row
   again. The attempts run out only after RELEASE_ATTEMPTS faults, which the
   assumption above rules out. *)
FinishReadFaults(a) == attempt[a] = "finishRead" /\ ThrowOnRead(a, "finishRead")
FinishUnknownLanded(a) == attempt[a] = "finishCas" /\ UnknownLands(a, "finishRead")
FinishUnknownLost(a) == attempt[a] = "finishCas" /\ UnknownIsLost(a, "finishRead")

ReleaseRead(a) == attempt[a] = "releaseRead" /\ ReadRow(a, "releaseCas", "refused")
ReleaseApplied(a) == attempt[a] = "releaseCas" /\ RemoveLands(a, "refused")
ReleaseStale(a) == attempt[a] = "releaseCas" /\ RemoveConflicts(a, "releaseRead")

ReleaseReadFaults(a) == attempt[a] = "releaseRead" /\ ThrowOnRead(a, "releaseRead")
ReleaseUnknownLanded(a) == attempt[a] = "releaseCas" /\ UnknownLands(a, "releaseRead")
ReleaseUnknownLost(a) == attempt[a] = "releaseCas" /\ UnknownIsLost(a, "releaseRead")

(* ---- observeTenantLifecycle, model.pause and model.resume ---------------- *)

OwnerOthersKeep == UNCHANGED <<attempt, deleter, closes, pausedAdmit, owed>>

Observe(o) ==
  /\ pausing[o] = "idle"
  /\ pausing' = [pausing EXCEPT ![o] = "observed"]
  /\ expected' = [expected EXCEPT ![o] = row.rev]
  /\ UNCHANGED <<row, snap, resuming, faults>>
  /\ OwnerOthersKeep

(* model.ts:90-92: false on a closed row, any barrier or a moved revision. *)
PauseRead(o) ==
  /\ pausing[o] = "observed"
  /\ IF row.closed \/ row.barrier # NoBarrier \/ row.rev # expected[o]
       THEN pausing' = [pausing EXCEPT ![o] = "lost"] /\ UNCHANGED snap
       ELSE pausing' = [pausing EXCEPT ![o] = "pauseCas"] /\ Remember(o)
  /\ expected' = [expected EXCEPT ![o] = 0]
  /\ UNCHANGED <<row, resuming, faults>>
  /\ OwnerOthersKeep

PauseReadFaults(o) ==
  /\ pausing[o] = "observed"
  /\ CanFault /\ Fault
  /\ pausing' = [pausing EXCEPT ![o] = "pauseFailed"]
  /\ expected' = [expected EXCEPT ![o] = 0]
  /\ UNCHANGED <<row, snap, resuming>>
  /\ OwnerOthersKeep

PauseApplied(o) ==
  /\ pausing[o] = "pauseCas"
  /\ Applies(o)
  /\ row' = Patch(row, "barrier", o)
  /\ pausing' = [pausing EXCEPT ![o] = "held"]
  /\ Forget(o)
  /\ UNCHANGED <<resuming, expected, faults>>
  /\ OwnerOthersKeep

(* One compare-and-set only (model.ts:82, 93): a stale pause answers false. *)
PauseStale(o) ==
  /\ pausing[o] = "pauseCas"
  /\ ~Applies(o)
  /\ pausing' = [pausing EXCEPT ![o] = "lost"]
  /\ Forget(o)
  /\ UNCHANGED <<row, resuming, expected, faults>>
  /\ OwnerOthersKeep

PauseUnknownLanded(o) ==
  /\ pausing[o] = "pauseCas"
  /\ Applies(o)
  /\ CanFault /\ Fault
  /\ row' = Patch(row, "barrier", o)
  /\ pausing' = [pausing EXCEPT ![o] = "pauseFailed"]
  /\ Forget(o)
  /\ UNCHANGED <<resuming, expected>>
  /\ OwnerOthersKeep

PauseUnknownLost(o) ==
  /\ pausing[o] = "pauseCas"
  /\ CanFault /\ Fault
  /\ pausing' = [pausing EXCEPT ![o] = "pauseFailed"]
  /\ Forget(o)
  /\ UNCHANGED <<row, resuming, expected>>
  /\ OwnerOthersKeep

(* An owner can abort before its acquisition lands: dms-saas
   releasePlanInventory calls resume whatever its pause has done so far. *)
ResumeStart(o) ==
  /\ pausing[o] # "idle"
  /\ resuming[o] = "idle"
  /\ resuming' = [resuming EXCEPT ![o] = "resumeRead"]
  /\ UNCHANGED <<row, snap, pausing, expected, faults>>
  /\ OwnerOthersKeep

(* model.ts:102-103: false on a closed row or another owner's barrier. *)
ResumeRead(o) ==
  /\ resuming[o] = "resumeRead"
  /\ IF row.closed \/ row.barrier \notin {NoBarrier, o}
       THEN resuming' = [resuming EXCEPT ![o] = "resumeRefused"] /\ UNCHANGED snap
       ELSE resuming' = [resuming EXCEPT ![o] = "resumeCas"] /\ Remember(o)
  /\ UNCHANGED <<row, pausing, expected, faults>>
  /\ OwnerOthersKeep

ResumeReadFaults(o) ==
  /\ resuming[o] = "resumeRead"
  /\ CanFault /\ Fault
  /\ resuming' = [resuming EXCEPT ![o] = "resumeFailed"]
  /\ UNCHANGED <<row, snap, pausing, expected>>
  /\ OwnerOthersKeep

(* model.ts:104. With no barrier held it still moves the revision, which
   revokes a delayed pause (model.ts:96). *)
ResumeApplied(o) ==
  /\ resuming[o] = "resumeCas"
  /\ Applies(o)
  /\ row' = Patch(row, "barrier", NoBarrier)
  /\ resuming' = [resuming EXCEPT ![o] = "resumed"]
  /\ Forget(o)
  /\ UNCHANGED <<pausing, expected, faults>>
  /\ OwnerOthersKeep

ResumeStale(o) ==
  /\ resuming[o] = "resumeCas"
  /\ ~Applies(o)
  /\ resuming' = [resuming EXCEPT ![o] = "resumeRead"]
  /\ Forget(o)
  /\ UNCHANGED <<row, pausing, expected, faults>>
  /\ OwnerOthersKeep

ResumeUnknownLanded(o) ==
  /\ resuming[o] = "resumeCas"
  /\ Applies(o)
  /\ CanFault /\ Fault
  /\ row' = Patch(row, "barrier", NoBarrier)
  /\ resuming' = [resuming EXCEPT ![o] = "resumeFailed"]
  /\ Forget(o)
  /\ UNCHANGED <<pausing, expected>>
  /\ OwnerOthersKeep

ResumeUnknownLost(o) ==
  /\ resuming[o] = "resumeCas"
  /\ CanFault /\ Fault
  /\ resuming' = [resuming EXCEPT ![o] = "resumeFailed"]
  /\ Forget(o)
  /\ UNCHANGED <<row, pausing, expected>>
  /\ OwnerOthersKeep

(* ---- closeTenantLifecycleAdmission, then the deletion (deleted.ts:20-26) -- *)

DeleterOthersKeep == UNCHANGED <<attempt, pausing, resuming, expected, pausedAdmit, owed>>

CloseStart ==
  /\ deleter \in {"idle", "blocked"}
  /\ closes < MaxCloses
  /\ deleter' = "closeRead"
  /\ closes' = closes + 1
  /\ UNCHANGED <<row, snap, faults>>
  /\ DeleterOthersKeep

(* model.ts:123-124: an already closed row skips the write. *)
CloseRead ==
  /\ deleter = "closeRead"
  /\ IF row.closed
       THEN deleter' = "closeReread" /\ UNCHANGED snap
       ELSE deleter' = "closeCas" /\ Remember("deleter")
  /\ UNCHANGED <<row, closes, faults>>
  /\ DeleterOthersKeep

CloseApplied ==
  /\ deleter = "closeCas"
  /\ Applies("deleter")
  /\ row' = Patch(row, "closed", TRUE)
  /\ deleter' = "closeReread"
  /\ Forget("deleter")
  /\ UNCHANGED <<closes, faults>>
  /\ DeleterOthersKeep

(* The `continue` of model.ts:125. *)
CloseStale ==
  /\ deleter = "closeCas"
  /\ ~Applies("deleter")
  /\ deleter' = "closeRead"
  /\ Forget("deleter")
  /\ UNCHANGED <<row, closes, faults>>
  /\ DeleterOthersKeep

(* model.ts:127-133: quiescence is tested on a fresh read after closing. A
   resolved close lets cleanupTenantData delete (deleted.ts:21-25), a rejected
   one preserves the data. *)
CloseReread ==
  /\ deleter = "closeReread"
  /\ deleter' = IF row.closed /\ row.active = {} THEN "deleting" ELSE "blocked"
  /\ UNCHANGED <<row, snap, closes, faults>>
  /\ DeleterOthersKeep

CloseReadFaults ==
  /\ deleter \in {"closeRead", "closeReread"}
  /\ CanFault /\ Fault
  /\ deleter' = "blocked"
  /\ UNCHANGED <<row, snap, closes>>
  /\ DeleterOthersKeep

CloseUnknownLanded ==
  /\ deleter = "closeCas"
  /\ Applies("deleter")
  /\ CanFault /\ Fault
  /\ row' = Patch(row, "closed", TRUE)
  /\ deleter' = "blocked"
  /\ Forget("deleter")
  /\ UNCHANGED <<closes>>
  /\ DeleterOthersKeep

CloseUnknownLost ==
  /\ deleter = "closeCas"
  /\ CanFault /\ Fault
  /\ deleter' = "blocked"
  /\ Forget("deleter")
  /\ UNCHANGED <<row, closes>>
  /\ DeleterOthersKeep

(* ---- the next-state relation --------------------------------------------- *)

AttemptStep(a) ==
  \/ Start(a) \/ AdmitRead(a) \/ AdmitReadFaults(a) \/ AdmitApplied(a)
  \/ AdmitStale(a) \/ AdmitUnknownLanded(a) \/ AdmitUnknownLost(a)
  \/ WorkSucceeds(a) \/ WorkRefuses(a) \/ WorkFails(a)
  \/ FinishRead(a) \/ FinishApplied(a) \/ FinishStale(a)
  \/ FinishReadFaults(a) \/ FinishUnknownLanded(a) \/ FinishUnknownLost(a)
  \/ ReleaseRead(a) \/ ReleaseApplied(a) \/ ReleaseStale(a)
  \/ ReleaseReadFaults(a) \/ ReleaseUnknownLanded(a) \/ ReleaseUnknownLost(a)

OwnerStep(o) ==
  \/ Observe(o) \/ PauseRead(o) \/ PauseReadFaults(o) \/ PauseApplied(o)
  \/ PauseStale(o) \/ PauseUnknownLanded(o) \/ PauseUnknownLost(o)
  \/ ResumeStart(o) \/ ResumeRead(o) \/ ResumeReadFaults(o) \/ ResumeApplied(o)
  \/ ResumeStale(o) \/ ResumeUnknownLanded(o) \/ ResumeUnknownLost(o)

DeleterStep ==
  \/ CloseStart \/ CloseRead \/ CloseApplied \/ CloseStale \/ CloseReread
  \/ CloseReadFaults \/ CloseUnknownLanded \/ CloseUnknownLost

Busy ==
  \/ \E a \in Attempts : AttemptStep(a)
  \/ \E o \in Owners : OwnerStep(o)
  \/ DeleterStep

(* Once nothing more can happen. Every variable above only moves forward, so
   the model has no cycle and every fair behaviour ends in such a state. *)
Quiescent == ~ENABLED <<Busy>>_vars

Done == Quiescent /\ UNCHANGED vars

Next == Busy \/ Done

Spec == Init /\ [][Next]_vars

(* ---- the rules ------------------------------------------------------------ *)

(* Deletion runs only when no attempt is admitted, in flight or uncertain. *)
NoWriterDuringDeletion ==
  deleter = "deleting" =>
    /\ row.active = {}
    /\ \A a \in Attempts : attempt[a] \notin {"work", "failed", "uncertain"}

(* No admission is ever written while the row holds a barrier. *)
PauseBlocksAdmission == ~pausedAdmit

(* An attempt that answered with its refusal holds no admission. *)
RefusalReleases ==
  \A a \in Attempts : attempt[a] = "refused" => a \notin row.active

(* An attempt that finished holds no admission. *)
SuccessReleases ==
  \A a \in Attempts : attempt[a] = "done" => a \notin row.active

(* A failed attempt keeps its admission, whatever any other attempt does. *)
FailureRetains ==
  \A a \in Attempts : attempt[a] = "failed" => a \in row.active

(* Stated in the state where nothing more can happen, since the shared runner
   checks invariants only: an attempt that asked after every owner's resume
   returned was admitted, unless the deletion closed the row. *)
ResumeAdmits ==
  Quiescent =>
    \A a \in Attempts :
      owed[a] => attempt[a] \in {"done", "refused", "failed", "refusedClosed"}

(* ---- the temporal form, run by Live.cfg outside the shared runner ---------- *)

FairSpec ==
  /\ Spec
  /\ \A a \in Attempts : WF_vars(AttemptStep(a))
  /\ \A o \in Owners : WF_vars(OwnerStep(o))
  /\ WF_vars(DeleterStep)

AdmittedOrClosed(a) == attempt[a] \in {"work", "finishRead", "finishCas", "releaseRead",
                                        "releaseCas", "done", "refused", "failed",
                                        "refusedClosed"}

EventuallyQuiescent == <>Quiescent

ResumeAdmitsLive == \A a \in Attempts : owed[a] ~> AdmittedOrClosed(a)

==============================================================================
