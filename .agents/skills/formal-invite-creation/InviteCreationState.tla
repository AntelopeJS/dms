------------------------------ MODULE InviteCreationState ------------------------------
(* The constants, variables, initial state and shared helpers of InviteCreation.tla: the rows of user_invites, the decisions of invite_resolutions, and the steps every path ends with. *)

EXTENDS FiniteSets, Naturals, TLC

CONSTANTS
  Callers,   \* processes that call createUserInviteToken
  Resends,   \* the callers that resend: they replace the invite they were given
  Different, \* the callers whose invitation has other content than the rest
  Cancels,   \* retirers that cancel the invite they pick
  Accepts,   \* retirers that accept it
  Expires,   \* retirers that expire it
  MaxAttempts, \* how many times a caller builds a new invitation while it yields to nobody
  Rules,     \* "main" or "pre974"
  NoId,      \* no invite, no decision, no answer yet
  Conflict,  \* the answer HTTP 409
  Crash      \* the answer of a call that threw another error

ASSUME Rules \in {"main", "pre974"}

Retirers == Cancels \cup Accepts \cup Expires
Actors == Callers \cup Retirers
Reason(a) == IF a \in Cancels THEN "cancelled" ELSE IF a \in Accepts THEN "accepted" ELSE "expired"
Kinds == {"fresh", "repl"}
Attempts == 1..MaxAttempts
Ids == Callers \X Kinds \X Attempts   \* every invite a caller may build, one fresh and one replacement per attempt
Reasons == {"cancelled", "accepted", "expired", "replaced", "resent"}
Outcomes == {"none", "kept", "withdrawn"}
Phases == {"pending", "applying", "applied"}

ContentOf(i) == IF i[1] \in Different THEN "B" ELSE "A"
SameContent(i, j) == i # NoId /\ j # NoId /\ ContentOf(i) = ContentOf(j)

VARIABLES
  rows,    \* user_invites: whether stored, creationResolutionId, freshOutcome
  dec,     \* invite_resolutions, keyed by the invite decided
  pc,      \* where each actor is
  att,     \* the attempt of a caller: each run of createAdmittedInviteToken builds new invites (invites.ts:270)
  ex,      \* the invite a caller replaces, or the one a retirer picked
  cur,     \* the invite currentInviteOf looks at
  rv,      \* the rival a fresh invite found
  snap,    \* what currentInviteOf read of an invite: its creationResolutionId and freshOutcome
  ctx,     \* what runs once currentInviteOf answers
  after,   \* where completeAdmittedInviteResolution returns to
  tgt,     \* the decision it completes
  seen,    \* the phase and revision of that decision, as the actor read them
  queue,   \* the invites retryAfterRefusal still checks
  removed, \* retryAfterRefusal completed a cancellation it found
  res      \* the answer of a caller: a token, Conflict, Crash or NoId

vars == <<att, rows, dec, pc, ex, cur, rv, snap, ctx, after, tgt, seen, queue, removed, res>>

FreshOf(a) == <<a, "fresh", att[a]>>
ReplOf(a) == <<a, "repl", att[a]>>

NoRow == [in |-> FALSE, parent |-> NoId, outcome |-> "none"]
NoDec == [on |-> FALSE, reason |-> "none", repl |-> NoId, done |-> FALSE,
          wd |-> FALSE, phase |-> "pending", rev |-> 0]

Stored == {i \in Ids : rows[i].in}

TypeOK ==
  /\ att \in [Actors -> Attempts]
  /\ rows \in [Ids -> [in: BOOLEAN, parent: Ids \cup {NoId}, outcome: Outcomes]]
  /\ dec \in [Ids -> [on: BOOLEAN, reason: Reasons \cup {"none"}, repl: Ids \cup {NoId},
                      done: BOOLEAN, wd: BOOLEAN, phase: Phases, rev: Nat]]
  /\ res \in [Actors -> Ids \cup {Conflict, Crash, NoId}]

Init ==
  /\ rows = [i \in Ids |-> NoRow]
  /\ dec = [i \in Ids |-> NoDec]
  /\ att = [a \in Actors |-> 1]
  /\ pc = [a \in Actors |-> IF a \in Retirers THEN "rtPick" ELSE IF a \in Resends THEN "pick" ELSE "read"]
  /\ ex = [a \in Actors |-> NoId]
  /\ cur = [a \in Actors |-> NoId]
  /\ rv = [a \in Actors |-> NoId]
  /\ snap = [a \in Actors |-> [parent |-> NoId, outcome |-> "none"]]
  /\ ctx = [a \in Actors |-> "none"]
  /\ after = [a \in Actors |-> "done"]
  /\ tgt = [a \in Actors |-> NoId]
  /\ seen = [a \in Actors |-> [phase |-> "pending", rev |-> 0]]
  /\ queue = [a \in Actors |-> {}]
  /\ removed = [a \in Actors |-> FALSE]
  /\ res = [a \in Actors |-> NoId]

Move(a, to) == pc' = [pc EXCEPT ![a] = to]
Set(f, a, v) == f' = [f EXCEPT ![a] = v]

(* The decision is stored once: the first insert stands (decisions.ts:34-60). *)
Decided(i, reason, repl, done, wd) ==
  IF dec[i].on THEN dec[i]
  ELSE [on |-> TRUE, reason |-> reason, repl |-> repl, done |-> done, wd |-> wd,
        phase |-> "pending", rev |-> 0]

(* An actor ends with an answer. *)
Finish(a, answer) ==
  /\ Move(a, "done")
  /\ Set(res, a, answer)

(* ---- yieldToWinner and yieldOrCreateAgain (invites.ts:392-415) ----------- *)

(* invites.ts:392-404: the winner's token when it carries the content of the
   lost invite, else HTTP 409. *)
YieldTo(a, winner, lost) ==
  Finish(a, IF SameContent(winner, lost) THEN winner ELSE Conflict)

(* invites.ts:379-390: nothing left of the email runs the creation again. *)
YieldOrCreateAgain(a, current, lost) ==
  IF current = NoId
    THEN /\ Move(a, "again")
         /\ UNCHANGED res
    ELSE YieldTo(a, current, lost)

(* What currentInviteOf answered (`current`), by what called it. *)
Answered(a, current) ==
  /\ UNCHANGED ctx
  /\ IF ctx[a] = "kept" /\ current = FreshOf(a)
       THEN Finish(a, FreshOf(a))
       ELSE YieldOrCreateAgain(a, current, FreshOf(a))

=============================================================================
