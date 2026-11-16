------------------------------ MODULE InviteCreation ------------------------------
(***************************************************************************)
(* Concurrent invitations of one email in one tenant: callers of           *)
(* createUserInviteToken (a new invitation, or a resend that replaces a    *)
(* given invite) and retirers (a cancel, an acceptance or an expiry of the *)
(* invite they pick), as they interleave on the database. Each database    *)
(* round trip is one step: a read, one insert, one delete, one            *)
(* compare-and-set (settleFresh and the revision of a decision).           *)
(*                                                                         *)
(* invites.ts is packages/interface-dms/src/invites.ts, resolution.ts is   *)
(* invite-resolution.ts, complete.ts is internal/invite-resolution.ts,     *)
(* replacement.ts is internal/invite-replacement.ts, decisions.ts is       *)
(* db/internal/inviteResolutions.model.ts and table.ts is                  *)
(* db/models/user_invites.model.ts, all under that folder.                 *)
(*                                                                         *)
(* Rules picks the code: "main" is the code at the sync commit. "pre974"   *)
(* replays the code before AntelopeJS/dms#974, the first of eight fixes:   *)
(* no unique index on (email, creationResolutionId), so a fresh invite is  *)
(* inserted without a check and returned as it is.                         *)
(***************************************************************************)
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

(* ---- createAdmittedInviteToken (invites.ts:262-308) --------------------- *)

(* invites.ts:270: a new run builds new invites. The model builds MaxAttempts
   of them, and a caller that would build one more ends with no answer. *)
Again(a) ==
  /\ pc[a] = "again"
  /\ IF att[a] < MaxAttempts
       THEN /\ att' = [att EXCEPT ![a] = att[a] + 1]
            /\ Move(a, IF a \in Resends THEN "dParent" ELSE "read")
            /\ UNCHANGED res
       ELSE /\ Finish(a, NoId)
            /\ UNCHANGED att
  /\ UNCHANGED <<rows, dec, ex, cur, rv, snap, ctx, after, tgt, seen, queue, removed>>

(* invites.ts:273: getByEmail answers any stored invite of the email. *)
Read(a) ==
  /\ pc[a] = "read"
  /\ \/ /\ Stored = {}
        /\ Move(a, "insert")
        /\ UNCHANGED ex
     \/ \E i \in Stored :
          /\ Set(ex, a, i)
          /\ Move(a, "dParent")
  /\ UNCHANGED <<att, rows, dec, cur, rv, snap, ctx, after, tgt, seen, queue, removed, res>>

(* A resend is given the invite to replace (replacesInvite). *)
Pick(a) ==
  /\ pc[a] = "pick"
  /\ \/ /\ Stored = {}
        /\ Finish(a, Conflict)
        /\ UNCHANGED ex
     \/ \E i \in Stored :
          /\ Set(ex, a, i)
          /\ Move(a, "dParent")
          /\ UNCHANGED res
  /\ UNCHANGED <<att, rows, dec, cur, rv, snap, ctx, after, tgt, seen, queue, removed>>

(* invites.ts:282-298, 306: the insert of a fresh invite. Since #974 the
   unique index on email and creationResolutionId lets one fresh invite stand;
   before it, the insert never failed and the invite was returned at once. *)
HasFresh == \E i \in Stored : rows[i].parent = NoId

Insert(a) ==
  /\ pc[a] = "insert"
  /\ IF Rules = "pre974"
       THEN /\ rows' = [rows EXCEPT ![FreshOf(a)] = [in |-> TRUE, parent |-> NoId, outcome |-> "none"]]
            /\ Finish(a, FreshOf(a))
            /\ UNCHANGED <<att, cur, ctx>>
       ELSE IF HasFresh
              THEN /\ Move(a, "dupRead")
                   /\ UNCHANGED <<att, rows, cur, ctx, res>>
              ELSE /\ rows' = [rows EXCEPT ![FreshOf(a)] = [in |-> TRUE, parent |-> NoId, outcome |-> "none"]]
                   /\ Move(a, "rivalRead")
                   /\ UNCHANGED <<att, cur, ctx, res>>
  /\ UNCHANGED <<att, dec, ex, rv, snap, after, tgt, seen, queue, removed>>

(* invites.ts:284-289: the insert lost, so the caller reads the winner back. *)
DupRead(a) ==
  /\ pc[a] = "dupRead"
  /\ \/ /\ Stored = {}
        /\ YieldOrCreateAgain(a, NoId, FreshOf(a))
        /\ UNCHANGED <<att, cur, ctx>>
     \/ \E i \in Stored :
          /\ Set(cur, a, i)
          /\ Set(ctx, a, "dup")
          /\ Move(a, "ciGet")
          /\ UNCHANGED res
  /\ UNCHANGED <<att, rows, dec, ex, rv, snap, after, tgt, seen, queue, removed>>

(* invites.ts:291: getOtherByEmail. None: the invite is returned (INVITE_CREATED). *)
RivalRead(a) ==
  /\ pc[a] = "rivalRead"
  /\ \/ /\ Stored \ {FreshOf(a)} = {}
        /\ Finish(a, FreshOf(a))
        /\ UNCHANGED rv
     \/ \E i \in Stored \ {FreshOf(a)} :
          /\ Set(rv, a, i)
          /\ Move(a, "settle")
          /\ UNCHANGED res
  /\ UNCHANGED <<att, rows, dec, ex, cur, snap, ctx, after, tgt, seen, queue, removed>>

(* invites.ts:292-304, table.ts:101-118: settleFresh writes "withdrawn" unless
   the invite settled already, and answers the outcome that stands. Kept: the
   caller checks the invite is still the email's current one. Else it withdraws. *)
SettleAnswer(i, want) ==
  IF ~rows[i].in THEN "gone"
  ELSE IF rows[i].outcome = "none" THEN want
  ELSE rows[i].outcome

Settle(a) ==
  /\ pc[a] = "settle"
  /\ LET f == FreshOf(a)
         answer == SettleAnswer(f, "withdrawn")
     IN /\ rows' = IF rows[f].in /\ rows[f].outcome = "none"
                     THEN [rows EXCEPT ![f].outcome = "withdrawn"]
                     ELSE rows
        /\ IF answer = "kept"
             THEN /\ Set(cur, a, f)
                  /\ Set(ctx, a, "kept")
                  /\ Move(a, "ciGet")
             ELSE /\ Move(a, "wd")
                  /\ UNCHANGED <<att, cur, ctx>>
  /\ UNCHANGED <<att, dec, ex, rv, snap, after, tgt, seen, queue, removed, res>>

(* invites.ts:340-358, decisions.ts:76-110: the fresh invite's decision is
   claimed, as a cancellation already completed with no replacement. A
   replacement decided on it first is kept: its decider completes it. *)
Withdraw(a) ==
  /\ pc[a] = "wd"
  /\ LET f == FreshOf(a)
         claimed == ~dec[f].on
         d == Decided(f, "cancelled", NoId, TRUE, TRUE)
     IN /\ dec' = [dec EXCEPT ![f] = d]
        /\ IF d.repl # NoId
             THEN /\ YieldTo(a, d.repl, f)
                  /\ UNCHANGED ctx
             ELSE /\ Move(a, IF claimed THEN "wdDelete" ELSE "ciStart")
                  /\ Set(ctx, a, "withdraw")
                  /\ UNCHANGED res
  /\ UNCHANGED <<att, rows, ex, cur, rv, snap, after, tgt, seen, queue, removed>>

WithdrawDelete(a) ==
  /\ pc[a] = "wdDelete"
  /\ rows' = [rows EXCEPT ![FreshOf(a)].in = FALSE]
  /\ Move(a, "ciStart")
  /\ UNCHANGED <<att, dec, ex, cur, rv, snap, ctx, after, tgt, seen, queue, removed, res>>

(* ---- currentInviteOf and followUndecided (invites.ts:360-390, 417-446) --- *)

(* invites.ts:366-369: the rival, else the email's invite, are read in turn. *)
CiStart(a) ==
  /\ pc[a] = "ciStart"
  /\ Set(cur, a, rv[a])
  /\ Move(a, "ciGet")
  /\ UNCHANGED <<att, rows, dec, ex, rv, snap, ctx, after, tgt, seen, queue, removed, res>>

CiGet(a) ==
  /\ pc[a] = "ciGet"
  /\ IF rows[cur[a]].in
       THEN /\ Set(snap, a, [parent |-> rows[cur[a]].parent, outcome |-> rows[cur[a]].outcome])
            /\ Move(a, "ciDec")
       ELSE /\ Move(a, "ciEmail")
            /\ UNCHANGED snap
  /\ UNCHANGED <<att, rows, dec, ex, cur, rv, ctx, after, tgt, seen, queue, removed, res>>

CiEmail(a) ==
  /\ pc[a] = "ciEmail"
  /\ \/ /\ Stored = {}
        /\ Answered(a, NoId)
        /\ UNCHANGED <<att, cur, snap>>
     \/ \E i \in Stored :
          /\ Set(cur, a, i)
          /\ Set(snap, a, [parent |-> rows[i].parent, outcome |-> rows[i].outcome])
          /\ Move(a, "ciDec")
          /\ UNCHANGED res
  /\ UNCHANGED <<att, rows, dec, ex, rv, ctx, after, tgt, seen, queue, removed>>

(* invites.ts:370-377: what the invite's decision says. *)
CiDec(a) ==
  /\ pc[a] = "ciDec"
  /\ LET i == cur[a]
         d == dec[i]
     IN IF ~d.on
          THEN /\ Move(a, "fuStart")
               /\ UNCHANGED <<att, ctx, tgt, after, res>>
          ELSE IF d.reason = "accepted"
            THEN /\ Answered(a, i)
                 /\ UNCHANGED <<att, tgt, after>>
            ELSE IF d.repl # NoId
              THEN /\ Answered(a, d.repl)
                   /\ UNCHANGED <<att, tgt, after>>
              ELSE /\ Set(tgt, a, i)
                   /\ Set(after, a, "ciGet")
                   /\ Move(a, "cRead")
                   /\ UNCHANGED <<att, ctx, res>>
  /\ UNCHANGED <<att, rows, dec, ex, cur, rv, snap, seen, queue, removed>>

(* invites.ts:403-415: a replacement, or an invite settled kept, is the answer. *)
FuStart(a) ==
  /\ pc[a] = "fuStart"
  /\ IF snap[a].parent # NoId \/ snap[a].outcome = "kept"
       THEN /\ Answered(a, cur[a])
       ELSE /\ Move(a, IF snap[a].outcome = "withdrawn" THEN "fuWd" ELSE "fuOnly")
            /\ UNCHANGED <<att, res, ctx>>
  /\ UNCHANGED <<att, rows, dec, ex, cur, rv, snap, after, tgt, seen, queue, removed>>

(* table.ts:80-93: isOnlyInviteOfEmail reads the email's invites. *)
FuOnly(a) ==
  /\ pc[a] = "fuOnly"
  /\ IF Stored = {cur[a]}
       THEN Move(a, "fuKeep")
       ELSE Move(a, "fuOther")
  /\ UNCHANGED <<att, rows, dec, ex, cur, rv, snap, ctx, after, tgt, seen, queue, removed, res>>

FuOther(a) ==
  /\ pc[a] = "fuOther"
  /\ \/ /\ Stored \ {cur[a]} = {}
        /\ Move(a, "ciGet")
        /\ UNCHANGED cur
     \/ \E i \in Stored \ {cur[a]} :
          /\ Set(cur, a, i)
          /\ Move(a, "ciGet")
  /\ UNCHANGED <<att, rows, dec, ex, rv, snap, ctx, after, tgt, seen, queue, removed, res>>

(* invites.ts:430-434: the only invite of its email is settled kept. *)
FuKeep(a) ==
  /\ pc[a] = "fuKeep"
  /\ LET i == cur[a]
         answer == SettleAnswer(i, "kept")
     IN /\ rows' = IF rows[i].in /\ rows[i].outcome = "none"
                     THEN [rows EXCEPT ![i].outcome = "kept"]
                     ELSE rows
        /\ IF answer = "kept"
             THEN Answered(a, i)
             ELSE /\ Move(a, "fuWd")
                  /\ UNCHANGED <<att, res, ctx>>
  /\ UNCHANGED <<att, dec, ex, cur, rv, snap, after, tgt, seen, queue, removed>>

(* invites.ts:436-445: the withdrawal of a fresh invite that is not kept. *)
FuWd(a) ==
  /\ pc[a] = "fuWd"
  /\ LET i == cur[a]
         d == Decided(i, "cancelled", NoId, TRUE, TRUE)
     IN /\ dec' = [dec EXCEPT ![i] = d]
        /\ IF d.repl # NoId
             THEN Answered(a, d.repl)
             ELSE /\ Move(a, "fuDelete")
                  /\ UNCHANGED <<att, res, ctx>>
  /\ UNCHANGED <<att, rows, ex, cur, rv, snap, after, tgt, seen, queue, removed>>

FuDelete(a) ==
  /\ pc[a] = "fuDelete"
  /\ rows' = [rows EXCEPT ![cur[a]].in = FALSE]
  /\ Move(a, "ciGet")
  /\ UNCHANGED <<att, dec, ex, cur, rv, snap, ctx, after, tgt, seen, queue, removed, res>>

(* ---- replaceInvite and decideInvite (invites.ts:310-338, resolution.ts) --- *)

ReasonOf(a) == IF a \in Resends THEN "resent" ELSE "replaced"

(* A refusal of decideInvite is HTTP 409; replaceInvite then runs
   retryAfterRefusal (invites.ts:333-337). *)
Refused(a) == /\ Move(a, "rList")

(* resolution.ts:41-51: a replacement is actionable once its parent completed. *)
DParent(a) ==
  /\ pc[a] = "dParent"
  /\ LET p == rows[ex[a]].parent
     IN IF p = NoId \/ dec[p].done
          THEN Move(a, "dExist")
          ELSE Refused(a)
  /\ UNCHANGED <<att, rows, dec, ex, cur, rv, snap, ctx, after, tgt, seen, queue, removed, res>>

DExist(a) ==
  /\ pc[a] = "dExist"
  /\ Move(a, IF dec[ex[a]].on THEN "dDecide" ELSE "dOnly")
  /\ UNCHANGED <<att, rows, dec, ex, cur, rv, snap, ctx, after, tgt, seen, queue, removed, res>>

(* resolution.ts:71-85: a replacement is refused unless its invite is the only
   invite of its email. *)
DOnly(a) ==
  /\ pc[a] = "dOnly"
  /\ IF Stored = {ex[a]} THEN Move(a, "dDecide") ELSE Refused(a)
  /\ UNCHANGED <<att, rows, dec, ex, cur, rv, snap, ctx, after, tgt, seen, queue, removed, res>>

(* resolution.ts:109-110: the decision is stored once and read back; the one
   that stands must carry this reason and a replacement of the same content. *)
DDecide(a) ==
  /\ pc[a] = "dDecide"
  /\ LET i == ex[a]
         d == Decided(i, ReasonOf(a), ReplOf(a), FALSE, FALSE)
     IN /\ dec' = [dec EXCEPT ![i] = d]
        /\ IF d.reason = ReasonOf(a) /\ SameContent(d.repl, ReplOf(a))
             THEN /\ Set(tgt, a, i)
                  /\ Set(after, a, "dAnswer")
                  /\ Move(a, "cRead")
             ELSE /\ Refused(a)
                  /\ UNCHANGED <<att, tgt, after>>
  /\ UNCHANGED <<att, rows, ex, cur, rv, snap, ctx, seen, queue, removed, res>>

DAnswer(a) ==
  /\ pc[a] = "dAnswer"
  /\ Finish(a, dec[tgt[a]].repl)
  /\ UNCHANGED <<att, rows, dec, ex, cur, rv, snap, ctx, after, tgt, seen, queue, removed>>

(* ---- retryAfterRefusal and removeIfCancelled (invites.ts:342-372) -------- *)

RList(a) ==
  /\ pc[a] = "rList"
  /\ Set(queue, a, Stored)
  /\ Set(removed, a, FALSE)
  /\ Move(a, "rNext")
  /\ UNCHANGED <<att, rows, dec, ex, cur, rv, snap, ctx, after, tgt, seen, res>>

(* removeIfCancelled: a cancellation completed with no replacement is
   completed again, which deletes the invite it retired. *)
Retired(d) == d.on /\ d.reason = "cancelled" /\ d.repl = NoId /\ d.done

RNext(a) ==
  /\ pc[a] = "rNext"
  /\ \/ /\ queue[a] = {}
        /\ Move(a, "rSelf")
        /\ UNCHANGED <<att, queue, tgt, after, removed>>
     \/ \E i \in queue[a] :
          /\ Set(queue, a, queue[a] \ {i})
          /\ IF Retired(dec[i])
               THEN /\ Set(tgt, a, i)
                    /\ Set(after, a, "rNext")
                    /\ Set(removed, a, TRUE)
                    /\ Move(a, "cRead")
               ELSE /\ UNCHANGED <<att, tgt, after, removed>>
                    /\ Move(a, "rNext")
  /\ UNCHANGED <<att, rows, dec, ex, cur, rv, snap, ctx, seen, res>>

(* invites.ts:371-373: unless it was handed the invite, the caller also checks
   the one it read. Then the retry is chosen. *)
RSelf(a) ==
  /\ pc[a] = "rSelf"
  /\ IF a \notin Resends /\ Retired(dec[ex[a]])
       THEN /\ Set(tgt, a, ex[a])
            /\ Set(after, a, "again")
            /\ Move(a, "cRead")
            /\ UNCHANGED res
       ELSE IF removed[a]
              THEN /\ Move(a, "dParent")
                   /\ UNCHANGED <<att, tgt, after, res>>
              ELSE /\ Finish(a, Conflict)
                   /\ UNCHANGED <<att, tgt, after>>
  /\ UNCHANGED <<att, rows, dec, ex, cur, rv, snap, ctx, seen, queue, removed>>

(* ---- completeAdmittedInviteResolution and ensureInviteReplacement ------- *)

(* complete.ts:38-60: a completed decision deletes its invite; any other
   inserts its replacement and then deletes the invite and completes. *)
CRead(a) ==
  /\ pc[a] = "cRead"
  /\ LET d == dec[tgt[a]]
     IN /\ Set(seen, a, [phase |-> d.phase, rev |-> d.rev])
        /\ Move(a, IF d.done THEN "cDelete" ELSE IF d.repl = NoId THEN "cDelete" ELSE "eAdvance")
  /\ UNCHANGED <<att, rows, dec, ex, cur, rv, snap, ctx, after, tgt, queue, removed, res>>

(* replacement.ts:63-79: the loop advances the phase the actor read. *)
EAdvance(a) ==
  /\ pc[a] = "eAdvance"
  /\ LET t == tgt[a]
         d == dec[t]
         s == seen[a]
     IN CASE s.phase = "applied" ->
              /\ Move(a, "cDelete")
              /\ UNCHANGED <<att, dec, res>>
         [] s.phase = "pending" ->
              (* replacement.ts:23-27: the transition to applying is a compare-and-set on the revision *)
              /\ IF d.rev = s.rev
                   THEN /\ dec' = [dec EXCEPT ![t].phase = "applying", ![t].rev = d.rev + 1]
                        /\ Move(a, "eInsert")
                   ELSE /\ Move(a, "eNext")
                        /\ UNCHANGED dec
              /\ UNCHANGED res
         [] OTHER ->
              (* replacement.ts:46-60: the phase is applying, so the row must be there *)
              /\ IF rows[d.repl].in
                   THEN /\ IF d.rev = s.rev
                             THEN dec' = [dec EXCEPT ![t].phase = "applied", ![t].rev = d.rev + 1]
                             ELSE dec' = dec
                        /\ Move(a, "eNext")
                        /\ UNCHANGED res
                   ELSE /\ Finish(a, Crash)
                        /\ UNCHANGED dec
  /\ UNCHANGED <<att, rows, ex, cur, rv, snap, ctx, after, tgt, seen, queue, removed>>

(* replacement.ts:28-37: the replacement is inserted; a stored one with the
   same token is no conflict. The row carries the decision's id. *)
EInsert(a) ==
  /\ pc[a] = "eInsert"
  /\ LET t == tgt[a]
         r == dec[t].repl
     IN rows' = IF rows[r].in THEN rows
                ELSE [rows EXCEPT ![r] = [in |-> TRUE, parent |-> t, outcome |-> "none"]]
  /\ Move(a, "eApplied")
  /\ UNCHANGED <<att, dec, ex, cur, rv, snap, ctx, after, tgt, seen, queue, removed, res>>

(* replacement.ts:39-43: the decision is read again and advanced to applied. *)
EApplied(a) ==
  /\ pc[a] = "eApplied"
  /\ dec' = [dec EXCEPT ![tgt[a]].phase = "applied", ![tgt[a]].rev = dec[tgt[a]].rev + 1]
  /\ Move(a, "eNext")
  /\ UNCHANGED <<att, rows, ex, cur, rv, snap, ctx, after, tgt, seen, queue, removed, res>>

(* replacement.ts:70-72: the loop reads the decision again. *)
ENext(a) ==
  /\ pc[a] = "eNext"
  /\ LET d == dec[tgt[a]]
     IN Set(seen, a, [phase |-> d.phase, rev |-> d.rev])
  /\ Move(a, "eAdvance")
  /\ UNCHANGED <<att, rows, dec, ex, cur, rv, snap, ctx, after, tgt, queue, removed, res>>

CDelete(a) ==
  /\ pc[a] = "cDelete"
  /\ rows' = [rows EXCEPT ![tgt[a]].in = FALSE]
  /\ Move(a, IF dec[tgt[a]].done THEN after[a] ELSE "cMark")
  /\ UNCHANGED <<att, dec, ex, cur, rv, snap, ctx, after, tgt, seen, queue, removed, res>>

CMark(a) ==
  /\ pc[a] = "cMark"
  /\ dec' = [dec EXCEPT ![tgt[a]].done = TRUE]
  /\ Move(a, after[a])
  /\ UNCHANGED <<att, rows, ex, cur, rv, snap, ctx, after, tgt, seen, queue, removed, res>>

(* ---- a cancel, an acceptance or an expiry (resolution.ts:87-125) --------- *)

RtPick(a) ==
  /\ pc[a] = "rtPick"
  /\ \/ /\ Stored = {}
        /\ Finish(a, NoId)
        /\ UNCHANGED ex
     \/ \E i \in Stored :
          /\ Set(ex, a, i)
          /\ Move(a, "rtParent")
          /\ UNCHANGED res
  /\ UNCHANGED <<att, rows, dec, cur, rv, snap, ctx, after, tgt, seen, queue, removed>>

RtParent(a) ==
  /\ pc[a] = "rtParent"
  /\ LET p == rows[ex[a]].parent
     IN IF p = NoId \/ dec[p].done
          THEN /\ Move(a, "rtDecide")
               /\ UNCHANGED res
          ELSE Finish(a, Conflict)
  /\ UNCHANGED <<att, rows, dec, ex, cur, rv, snap, ctx, after, tgt, seen, queue, removed>>

RtDecide(a) ==
  /\ pc[a] = "rtDecide"
  /\ LET i == ex[a]
         d == Decided(i, Reason(a), NoId, FALSE, FALSE)
     IN /\ dec' = [dec EXCEPT ![i] = d]
        /\ IF d.reason = Reason(a) /\ d.repl = NoId
             THEN /\ Set(tgt, a, i)
                  /\ Set(after, a, "done")
                  /\ Move(a, "cRead")
                  /\ UNCHANGED res
             ELSE /\ Finish(a, Conflict)
                  /\ UNCHANGED <<att, tgt, after>>
  /\ UNCHANGED <<att, rows, ex, cur, rv, snap, ctx, seen, queue, removed>>

(* ---- the rules ----------------------------------------------------------- *)

AllDone == \A a \in Actors : pc[a] = "done"

Step(a) ==
  \/ Again(a) \/ Read(a) \/ Pick(a) \/ Insert(a) \/ DupRead(a) \/ RivalRead(a) \/ Settle(a)
  \/ Withdraw(a) \/ WithdrawDelete(a)
  \/ CiStart(a) \/ CiGet(a) \/ CiEmail(a) \/ CiDec(a)
  \/ FuStart(a) \/ FuOnly(a) \/ FuOther(a) \/ FuKeep(a) \/ FuWd(a) \/ FuDelete(a)
  \/ DParent(a) \/ DExist(a) \/ DOnly(a) \/ DDecide(a) \/ DAnswer(a)
  \/ RList(a) \/ RNext(a) \/ RSelf(a)
  \/ CRead(a) \/ EAdvance(a) \/ EInsert(a) \/ EApplied(a) \/ ENext(a) \/ CDelete(a) \/ CMark(a)
  \/ RtPick(a) \/ RtParent(a) \/ RtDecide(a)

Next == \/ \E a \in Actors : Step(a)
        \/ (AllDone /\ UNCHANGED vars)

Spec == Init /\ [][Next]_vars

(* ---- what must hold once every actor has answered ------------------------ *)

(* An invite the invitee can act on: stored, undecided, not withdrawn, and a
   replacement only once the decision that created it completed. *)
Pending(i) ==
  /\ rows[i].in
  /\ ~dec[i].on
  /\ rows[i].outcome # "withdrawn"
  /\ (rows[i].parent = NoId \/ dec[rows[i].parent].done)

PendingSet == {i \in Ids : Pending(i)}
Returned == {a \in Callers : res[a] \in Ids}

(* One invite per email is pending, never two. *)
AtMostOnePending == AllDone => Cardinality(PendingSet) <= 1

(* A caller that returned holds an invite someone can still act on, or one a
   cancel, an acceptance, an expiry, a replacement or a resend retired; never
   one withdrawn. *)
NoWithdrawnToken ==
  AllDone => \A a \in Returned : Pending(res[a]) \/ (dec[res[a]].on /\ ~dec[res[a]].wd)

(* When nothing retired an invite, a caller that returned leaves exactly one
   pending invite, and every caller that returned holds its token. *)
OneKeptToken ==
  (AllDone /\ Returned # {} /\ \A i \in Ids : ~dec[i].on \/ dec[i].wd) =>
    /\ Cardinality(PendingSet) = 1
    /\ \A a \in Returned : Pending(res[a])

(* A caller answers with a token or 409. *)
NoCrash == AllDone => \A a \in Callers : res[a] # Crash

=============================================================================
