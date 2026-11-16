------------------------------ MODULE InviteCreationResolve ------------------------------
(* replaceInvite and decideInvite, retryAfterRefusal, the completion of a decision with its replacement, and a cancel, an acceptance or an expiry. *)
EXTENDS InviteCreationFresh

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

=============================================================================
