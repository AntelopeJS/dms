------------------------------ MODULE InviteCreationFresh ------------------------------
(* createAdmittedInviteToken and what follows a fresh insert: the rival read, the settle, the withdrawal, currentInviteOf and followUndecided (invites.ts). *)
EXTENDS InviteCreationState

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

=============================================================================
