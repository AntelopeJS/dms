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
EXTENDS InviteCreationResolve

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
   pending invite, and every caller that returned answers with it. *)
OneKeptToken ==
  (AllDone /\ Returned # {} /\ \A i \in Ids : ~dec[i].on \/ dec[i].wd) =>
    /\ Cardinality(PendingSet) = 1
    /\ \A a \in Returned : Pending(res[a])

(* A caller answers with a token or 409. *)
NoCrash == AllDone => \A a \in Callers : res[a] # Crash

=============================================================================
