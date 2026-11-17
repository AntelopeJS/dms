---------------------- MODULE DefaultTenantProvisioning ----------------------
(***************************************************************************)
(* The first-boot provisioning of the `default` tenant across replicas of  *)
(* @antelopejs/dms that start on one database: the insert race on the      *)
(* tenant's row, the `provisioningPending` marker and the lease on         *)
(* `provisioningRevision` that elects one holder to run ProvisionTenant.   *)
(* Each await on the database is one step: a read, the insert of the row, *)
(* and one `atomicMutation`, a compare-and-set on `provisioningRevision`   *)
(* that is atomic on its own.                                              *)
(*                                                                         *)
(* ensure.ts is packages/dms/src/utils/ensure-default-tenant.ts, index.ts  *)
(* is packages/dms/src/index.ts and provisioning.ts is                     *)
(* packages/interface-dms/src/tenant-provisioning.ts.                      *)
(*                                                                         *)
(* Rules picks the code: "main" is the code at the sync commit. The other  *)
(* values replay the rules before each fix, so each fixed bug stays a      *)
(* counterexample that history.mjs checks:                                 *)
(*   "pre613"  dms before 54d7ca6d (AntelopeJS/dms#613)                    *)
(*   "pre657"  dms before 3e029b06 (AntelopeJS/dms#657), with the handlers *)
(*             of its time                                                 *)
(*   "pre133"  dms at main, with Helio's provisioning hook before          *)
(*             template-dms-demo 59f5697806 (template-dms-demo#133)        *)
(***************************************************************************)
EXTENDS FiniteSets, Naturals, TLC

CONSTANTS
  Replicas,       \* processes of @antelopejs/dms that share the database
  StepCount,      \* the steps of the TENANT_BEING_PROVISIONED handlers, in order
  Rules,          \* "main", "pre613", "pre657" or "pre133"
  MaxKills,       \* processes killed at any step, each restarted later
  MaxStalls,      \* holders whose renewals stop landing for longer than staleAfterMs
  MaxRenews,      \* lease renewals that land or find the lease lost
  MaxInsertFaults, \* inserts of the row that throw, landed or not
  MaxStepFaults,  \* provisioning steps that throw
  None            \* null: no holder, no token, no claim

ASSUME Rules \in {"main", "pre613", "pre657", "pre133"}

(* Which code runs. Each fix kept what the earlier ones added. *)
Marker == Rules # "pre613"                (* 54d7ca6d: the row is inserted pending *)
Lease == Rules \in {"main", "pre133"}     (* 3e029b06: the lease and the read-back *)
StepsReject == Rules = "main"             (* 59f5697806: a failed or refused step rejects *)

Steps == 1..StepCount

VARIABLES
  row,     \* the `default` tenant's row
  done,    \* the effect of each provisioning step is in the database
  claim,   \* the process running each step, as the step's own claim sees it
  pc,      \* where each process is
  seen,    \* the revision a waiting process read before it claims
  token,   \* the revision a process holds, in memory (ensure.ts:93)
  next,    \* the next provisioning step of a process
  failed,  \* a step of this attempt failed or was refused, as ProvisionTenant reports it
  stalled, \* a holder whose renewals do not land
  overran, \* this attempt's holder stalled since it claimed
  kills, stalls, renews, insertFaults, stepFaults,
  lostInsertExit \* a start failed because another process inserted the row first

vars == <<row, done, claim, pc, seen, token, next, failed, stalled, overran,
          kills, stalls, renews, insertFaults, stepFaults, lostInsertExit>>

Phases == {
  "get", "insert", "readBack", "exited", "down",
  "poll", "claim", "read", "run", "step", "release", "clear", "settled"}
HolderPhases == {"run", "step", "release"}
Running == {"run", "step"}

TypeOK ==
  /\ row \in [exists: BOOLEAN, pending: BOOLEAN, holder: Replicas \cup {None}, rev: Nat]
  /\ done \in [Steps -> BOOLEAN]
  /\ claim \in [Steps -> Replicas \cup {None}]
  /\ pc \in [Replicas -> Phases]
  /\ seen \in [Replicas -> Nat]
  /\ token \in [Replicas -> Nat \cup {None}]
  /\ next \in [Replicas -> 1..(StepCount + 1)]
  /\ failed \in [Replicas -> BOOLEAN]
  /\ stalled \in [Replicas -> BOOLEAN]
  /\ overran \in [Replicas -> BOOLEAN]
  /\ kills \in 0..MaxKills
  /\ stalls \in 0..MaxStalls
  /\ renews \in 0..MaxRenews
  /\ insertFaults \in 0..MaxInsertFaults
  /\ stepFaults \in 0..MaxStepFaults
  /\ lostInsertExit \in BOOLEAN

(* Every process starts on an empty database. Revision 0 is the absent
   `provisioningRevision` a first claim expects (NO_REVISION, ensure.ts:20). *)
Init ==
  /\ row = [exists |-> FALSE, pending |-> FALSE, holder |-> None, rev |-> 0]
  /\ done = [s \in Steps |-> FALSE]
  /\ claim = [s \in Steps |-> None]
  /\ pc = [r \in Replicas |-> "get"]
  /\ seen = [r \in Replicas |-> 0]
  /\ token = [r \in Replicas |-> None]
  /\ next = [r \in Replicas |-> 1]
  /\ failed = [r \in Replicas |-> FALSE]
  /\ stalled = [r \in Replicas |-> FALSE]
  /\ overran = [r \in Replicas |-> FALSE]
  /\ kills = 0
  /\ stalls = 0
  /\ renews = 0
  /\ insertFaults = 0
  /\ stepFaults = 0
  /\ lostInsertExit = FALSE

Counters == <<kills, stalls, renews, insertFaults, stepFaults>>

Move(r, to) == pc' = [pc EXCEPT ![r] = to]

(* What start() leads to once ensureDefaultTenantExists resolved. Since
   54d7ca6d provisioning runs after Events.ModulesStarted (index.ts:260-268);
   before it, start() provisioned only a row it had just created. *)
AfterStart ==
  CASE Rules = "pre613" -> "settled"
    [] Lease -> "poll"
    [] OTHER -> "read"

(* No live process renews the row's revision: a waiter that reads it twice
   staleAfterMs apart sees the same token (ensure.ts:171-184, 199-200). Time
   is not modeled. The model assumes that a holder whose renewals land never
   looks stale, because renewEveryMs is well below staleAfterMs
   (packages/dms/src/config/internal/state.ts:282-286). *)
Stale ==
  ~\E h \in Replicas :
     /\ pc[h] \in HolderPhases
     /\ ~stalled[h]
     /\ token[h] = row.rev

(* ---- start(): ensureDefaultTenantExists (ensure.ts:40-57) ---------------- *)

StartOthersKeep == UNCHANGED <<done, claim, seen, token, next, failed, stalled, overran>>

Get(r) ==
  /\ pc[r] = "get"
  /\ Move(r, IF row.exists THEN AfterStart ELSE "insert")
  /\ UNCHANGED <<row, Counters, lostInsertExit>>
  /\ StartOthersKeep

NewRow == [exists |-> TRUE, pending |-> Marker, holder |-> None, rev |-> 0]

(* The process that inserts the row. Before 54d7ca6d it provisioned in
   start(), and only then (index.ts at 54d7ca6d^:262-266). *)
Inserted(r) ==
  IF Rules = "pre613"
    THEN /\ Move(r, "run")
         /\ next' = [next EXCEPT ![r] = 1]
         /\ failed' = [failed EXCEPT ![r] = FALSE]
    ELSE /\ Move(r, AfterStart)
         /\ UNCHANGED <<next, failed>>

(* A start that fails although the row is there: it lost the insert to
   another process and took that for an error. *)
ExitsBesideRow(r) ==
  lostInsertExit' = (lostInsertExit \/ (pc'[r] = "exited" /\ row.exists))

(* A thrown insert: since 3e029b06 the process reads the row back
   (ensure.ts:50-54); before it, start() rejected. *)
InsertThrew(r) == Move(r, IF Lease THEN "readBack" ELSE "exited")

Insert(r) ==
  /\ pc[r] = "insert"
  /\ IF row.exists
       THEN /\ InsertThrew(r)
            /\ ExitsBesideRow(r)
            /\ UNCHANGED <<row, next, failed>>
       ELSE /\ row' = NewRow
            /\ Inserted(r)
            /\ UNCHANGED lostInsertExit
  /\ UNCHANGED <<done, claim, seen, token, stalled, overran, Counters>>

InsertFaults(r) ==
  /\ pc[r] = "insert"
  /\ ~row.exists
  /\ insertFaults < MaxInsertFaults
  /\ insertFaults' = insertFaults + 1
  /\ \/ row' = NewRow
     \/ UNCHANGED row
  /\ InsertThrew(r)
  /\ UNCHANGED <<kills, stalls, renews, stepFaults, lostInsertExit>>
  /\ StartOthersKeep

(* ensure.ts:51: the row is there, so losing the insert is no error. *)
ReadBack(r) ==
  /\ pc[r] = "readBack"
  /\ Move(r, IF row.exists THEN AfterStart ELSE "exited")
  /\ ExitsBesideRow(r)
  /\ UNCHANGED <<row, Counters>>
  /\ StartOthersKeep

(* The platform restarts a process that exited or was killed. *)
Restart(r) ==
  /\ pc[r] \in {"exited", "down"}
  /\ Move(r, "get")
  /\ UNCHANGED <<row, Counters, lostInsertExit>>
  /\ StartOthersKeep

(* ---- provisionDefaultTenant and advanceLease (ensure.ts:192-210, 254-273) -- *)

WaitOthersKeep == UNCHANGED <<done, claim, token, next, failed, stalled, overran, Counters, lostInsertExit>>

(* ensure.ts:198: provisioned, nothing left to do. A read that would only
   wait again changes nothing, so it is not a step. *)
PollSettled(r) ==
  /\ pc[r] = "poll"
  /\ ~row.pending
  /\ Move(r, "settled")
  /\ UNCHANGED <<row, seen>>
  /\ WaitOthersKeep

(* ensure.ts:197-200: pending, and the lease is free or stale. *)
PollClaimable(r) ==
  /\ pc[r] = "poll"
  /\ row.pending
  /\ row.holder = None \/ Stale
  /\ seen' = [seen EXCEPT ![r] = row.rev]
  /\ Move(r, "claim")
  /\ UNCHANGED row
  /\ WaitOthersKeep

(* ensure.ts:201-204 through swapLease (ensure.ts:65-84). *)
Claim(r) ==
  /\ pc[r] = "claim"
  /\ IF row.rev = seen[r]
       THEN /\ row' = [row EXCEPT !.holder = r, !.rev = @ + 1]
            /\ token' = [token EXCEPT ![r] = row.rev + 1]
            /\ Move(r, "run")
            /\ next' = [next EXCEPT ![r] = 1]
            /\ failed' = [failed EXCEPT ![r] = FALSE]
            /\ overran' = [overran EXCEPT ![r] = stalled[r]]
       ELSE /\ Move(r, "poll")
            /\ UNCHANGED <<row, token, next, failed, overran>>
  /\ UNCHANGED <<done, claim, seen, stalled, Counters, lostInsertExit>>

(* Before 3e029b06: one read, then provisioning with no lease
   (ensure.ts at 3e029b06^, provisionDefaultTenant). *)
ReadPending(r) ==
  /\ pc[r] = "read"
  /\ IF row.pending
       THEN /\ Move(r, "run")
            /\ next' = [next EXCEPT ![r] = 1]
            /\ failed' = [failed EXCEPT ![r] = FALSE]
       ELSE /\ Move(r, "settled")
            /\ UNCHANGED <<next, failed>>
  /\ UNCHANGED <<row, done, claim, seen, token, stalled, overran, Counters, lostInsertExit>>

(* ---- ProvisionTenant: the handlers' steps (provisioning.ts:23-30) -------- *)

RunOthersKeep == UNCHANGED <<row, seen, token, stalled, overran, kills, stalls, renews, insertFaults, lostInsertExit>>

(* A failed or refused step: since 59f5697806 the handler runs every step and
   then rejects; before it, it logged the step and resolved. *)
Flag(r) == failed' = [failed EXCEPT ![r] = @ \/ StepsReject]

Step(r) == next[r]

(* A done step is skipped, a step another live process is running answers
   that it owns it, any other step starts under its own claim. *)
StepStart(r) ==
  /\ pc[r] = "run"
  /\ Step(r) <= StepCount
  /\ IF done[Step(r)]
       THEN /\ next' = [next EXCEPT ![r] = @ + 1]
            /\ UNCHANGED <<pc, claim, failed>>
       ELSE IF claim[Step(r)] # None
         THEN /\ next' = [next EXCEPT ![r] = @ + 1]
              /\ Flag(r)
              /\ UNCHANGED <<pc, claim>>
         ELSE /\ claim' = [claim EXCEPT ![Step(r)] = r]
              /\ Move(r, "step")
              /\ UNCHANGED <<next, failed>>
  /\ UNCHANGED <<done, stepFaults>>
  /\ RunOthersKeep

StepSucceeds(r) ==
  /\ pc[r] = "step"
  /\ done' = [done EXCEPT ![Step(r)] = TRUE]
  /\ claim' = [claim EXCEPT ![Step(r)] = None]
  /\ next' = [next EXCEPT ![r] = @ + 1]
  /\ Move(r, "run")
  /\ UNCHANGED <<failed, stepFaults>>
  /\ RunOthersKeep

StepFails(r) ==
  /\ pc[r] = "step"
  /\ stepFaults < MaxStepFaults
  /\ stepFaults' = stepFaults + 1
  /\ claim' = [claim EXCEPT ![Step(r)] = None]
  /\ next' = [next EXCEPT ![r] = @ + 1]
  /\ Flag(r)
  /\ Move(r, "run")
  /\ UNCHANGED done
  /\ RunOthersKeep

(* ProvisionTenant settled. With the lease, the holder stops renewing and
   gives the lease back (ensure.ts:145-157). Before 3e029b06 a resolved run
   cleared the marker. Before 54d7ca6d start() resolved after the run. The
   model leaves out its rollback of a rejected run: Helio's hook of that time
   resolved after a failed step (template-dms-demo#133), and the bug needs
   only a kill. *)
RunEnds(r) ==
  /\ pc[r] = "run"
  /\ Step(r) = StepCount + 1
  /\ Move(r, CASE Lease -> "release"
               [] Rules = "pre657" -> IF failed[r] THEN "settled" ELSE "clear"
               [] OTHER -> "settled")
  /\ UNCHANGED <<done, claim, next, failed, stepFaults>>
  /\ RunOthersKeep

(* ensure.ts:152-163: clearing the marker and freeing the lease are one
   compare-and-set on the holder's token. A process that lost the lease and
   whose run resolved polls again; one whose run failed is done. *)
Release(r) ==
  /\ pc[r] = "release"
  /\ IF token[r] # None /\ row.rev = token[r]
       THEN /\ row' = [row EXCEPT !.holder = None, !.pending = failed[r], !.rev = @ + 1]
            /\ Move(r, "settled")
       ELSE /\ Move(r, IF failed[r] THEN "settled" ELSE "poll")
            /\ UNCHANGED row
  /\ token' = [token EXCEPT ![r] = None]
  /\ UNCHANGED <<done, claim, seen, next, failed, stalled, overran, Counters, lostInsertExit>>

(* Before 3e029b06: `tenants.update(..., { provisioningPending: false })`. *)
Clear(r) ==
  /\ pc[r] = "clear"
  /\ row' = [row EXCEPT !.pending = FALSE]
  /\ Move(r, "settled")
  /\ UNCHANGED <<done, claim, seen, token, next, failed, stalled, overran, Counters, lostInsertExit>>

(* ---- the holder's renewal (ensure.ts:92-125) ----------------------------- *)

(* swapLease(token, {}) lands, or finds the revision moved and drops the
   token (ensure.ts:96-105). A renewal that throws changes nothing. *)
Renew(r) ==
  /\ pc[r] \in HolderPhases
  /\ ~stalled[r]
  /\ token[r] # None
  /\ renews < MaxRenews
  /\ renews' = renews + 1
  /\ IF row.rev = token[r]
       THEN /\ row' = [row EXCEPT !.rev = @ + 1]
            /\ token' = [token EXCEPT ![r] = row.rev + 1]
       ELSE /\ token' = [token EXCEPT ![r] = None]
            /\ UNCHANGED row
  /\ UNCHANGED <<done, claim, pc, seen, next, failed, stalled, overran, kills, stalls, insertFaults, stepFaults, lostInsertExit>>

(* ---- faults --------------------------------------------------------------- *)

(* The process dies at any step. Its memory is gone, its token stays in the
   row, and a step it was running loses its claim. *)
Kill(r) ==
  /\ pc[r] \notin {"down", "exited", "settled"}
  /\ kills < MaxKills
  /\ kills' = kills + 1
  /\ Move(r, "down")
  /\ token' = [token EXCEPT ![r] = None]
  /\ claim' = [s \in Steps |-> IF claim[s] = r THEN None ELSE claim[s]]
  /\ stalled' = [stalled EXCEPT ![r] = FALSE]
  /\ UNCHANGED <<row, done, seen, next, failed, overran, stalls, renews, insertFaults, stepFaults, lostInsertExit>>

(* The holder keeps running, but no renewal lands for longer than
   staleAfterMs: a blocked event loop, a slow database, or a module torn down
   while its run goes on (index.ts:294-297). *)
Stall(r) ==
  /\ Lease
  /\ pc[r] \in HolderPhases
  /\ ~stalled[r]
  /\ stalls < MaxStalls
  /\ stalls' = stalls + 1
  /\ stalled' = [stalled EXCEPT ![r] = TRUE]
  /\ overran' = [overran EXCEPT ![r] = TRUE]
  /\ UNCHANGED <<row, done, claim, pc, seen, token, next, failed, kills, renews, insertFaults, stepFaults, lostInsertExit>>

Unstall(r) ==
  /\ stalled[r]
  /\ stalled' = [stalled EXCEPT ![r] = FALSE]
  /\ UNCHANGED <<row, done, claim, pc, seen, token, next, failed, overran, Counters, lostInsertExit>>

(* ---- the next-state relation --------------------------------------------- *)

Progress(r) ==
  \/ Get(r) \/ Insert(r) \/ InsertFaults(r) \/ ReadBack(r) \/ Restart(r)
  \/ PollSettled(r) \/ PollClaimable(r) \/ Claim(r) \/ ReadPending(r)
  \/ StepStart(r) \/ StepSucceeds(r) \/ StepFails(r) \/ RunEnds(r)
  \/ Release(r) \/ Clear(r) \/ Renew(r) \/ Unstall(r)

Fault(r) == Kill(r) \/ Stall(r)

Busy == \E r \in Replicas : Progress(r) \/ Fault(r)

(* Nothing but a new fault can happen. *)
Quiescent == ~ENABLED <<\E r \in Replicas : Progress(r)>>_vars

Done == Quiescent /\ UNCHANGED vars

Next == Busy \/ Done

Spec == Init /\ [][Next]_vars

(* Replicas are interchangeable, so TLC checks one order of their names. *)
Symmetry == Permutations(Replicas)

(* ---- the rules ------------------------------------------------------------ *)

Complete == \A s \in Steps : done[s]

(* At most one process runs ProvisionTenant, unless the other one stalled
   past the stale window and lost the lease: the overlap AntelopeJS/dms#657
   accepts, which is why the handlers must stay idempotent. *)
Overtaken(r) == overran[r] /\ token[r] # row.rev

SingleHolder ==
  \A a, b \in Replicas :
    (a # b /\ pc[a] \in Running /\ pc[b] \in Running) => (Overtaken(a) \/ Overtaken(b))

(* The row reads provisioned only once every step's effect is in the
   database. A failed or refused step leaves it pending. *)
PendingUntilComplete == (row.exists /\ ~row.pending) => Complete

(* One row, inserted by one process. Losing the insert to another process
   fails no start, and once nothing more can happen every process started
   and settled. *)
NoDuplicateTenant ==
  /\ ~lostInsertExit
  /\ Quiescent => \A r \in Replicas : pc[r] = "settled"

(* Stated where nothing more can happen, since the shared runner checks
   invariants only: the tenant ends provisioned and complete. *)
EventuallyProvisioned ==
  Quiescent => (row.exists /\ ~row.pending /\ Complete)

(* ---- the temporal form, run by Live.cfg outside the shared runner -------- *)

FairSpec == Spec /\ \A r \in Replicas : WF_vars(Progress(r))

EventuallyQuiescent == <>Quiescent

EventuallyProvisionedLive == <>[](row.exists /\ ~row.pending /\ Complete)

==============================================================================
