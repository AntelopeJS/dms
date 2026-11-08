------------------------- MODULE OnboardingBootstrap -------------------------
(***************************************************************************)
(* The first-admin bootstrap of @antelopejs/dms: POST                       *)
(* /api/onboarding/register, GET /api/onboarding/informations, and an      *)
(* OAuth sign-in that creates an account when the instance sets            *)
(* auth.oauth.allowAccountCreation. Each await on the database is one      *)
(* step: a find, an insertMany, or an updateMany on the one system_state   *)
(* row is one MongoDB round trip, atomic on its own.                       *)
(***************************************************************************)
EXTENDS FiniteSets, Naturals

CONSTANTS
  Registers,   \* concurrent POST /api/onboarding/register calls
  Polls,       \* concurrent GET /api/onboarding/informations calls
  OAuthSignup, \* TRUE: Init also tries a deployment with allowAccountCreation on
  DbErrors     \* TRUE: a database call of a register may throw

VARIABLES
  tokenRow,  \* the setup_token row: exists until a register spends it
  ownerRows, \* registers whose users row exists; createOwner writes owner: true
  onboarded, \* system_state.has_onboarded
  rpc,       \* where each register is
  answer,    \* the status each register answered
  ppc,       \* where each status poll is
  oauth      \* "off": no OAuth sign-up; "idle": one may come; "create": it found the
             \* platform onboarded or an owner; "refused": it found onboarding open; "done": its row exists

vars == <<tokenRow, ownerRows, onboarded, rpc, answer, ppc, oauth>>

RegisterSteps == {"idle", "claim", "insert", "tenant", "readState", "writeState", "done"}
PollSteps == {"idle", "readUsers", "open", "onboarded"}
Answers == {"none", "200", "400", "403", "412", "500"}

TypeOK ==
  /\ tokenRow \in BOOLEAN
  /\ ownerRows \subseteq Registers
  /\ onboarded \in BOOLEAN
  /\ rpc \in [Registers -> RegisterSteps]
  /\ answer \in [Registers -> Answers]
  /\ ppc \in [Polls -> PollSteps]
  /\ oauth \in {"off", "idle", "create", "refused", "done"}

(* What `userModel.table.slice(0, 1).run()` finds: no users row at all. *)
NoUsers == ownerRows = {} /\ oauth /= "done"

Init ==
  /\ tokenRow = TRUE                                  \* setup-token.ts: announceSetupToken at start
  /\ ownerRows = {}
  /\ onboarded = FALSE                               \* systemState.table.ts:12-18
  /\ rpc = [r \in Registers |-> "idle"]
  /\ answer = [r \in Registers |-> "none"]
  /\ ppc = [p \in Polls |-> "idle"]
  /\ oauth \in IF OAuthSignup THEN {"off", "idle"} ELSE {"off"}

(* ------------------------ POST /api/onboarding/register ---------------- *)

(* postRegister reads one users row and refuses when it finds one. *)
RegReadUsers(r) ==
  /\ rpc[r] = "idle"
  /\ IF NoUsers                                      \* onboarding.ts:53-55
     THEN /\ rpc' = [rpc EXCEPT ![r] = "claim"]
          /\ UNCHANGED answer
     ELSE /\ rpc' = [rpc EXCEPT ![r] = "done"]
          /\ answer' = [answer EXCEPT ![r] = "400"]  \* error.admin_already_set
  /\ UNCHANGED <<ownerRows, onboarded, ppc, oauth, tokenRow>>

(* postRegister spends the setup token: the one delete that removes the   *)
(* row wins (setupToken.model.ts claim). Every caller is modeled as       *)
(* holding the right token, which is the worst case; a caller whose       *)
(* delete removes nothing is refused with 403 and creates no user.        *)
RegClaim(r) ==
  /\ rpc[r] = "claim"
  /\ IF tokenRow                                     \* onboarding.ts:57-58
     THEN /\ tokenRow' = FALSE
          /\ rpc' = [rpc EXCEPT ![r] = "insert"]
          /\ UNCHANGED answer
     ELSE /\ rpc' = [rpc EXCEPT ![r] = "done"]
          /\ answer' = [answer EXCEPT ![r] = "403"]  \* error.invalid_setup_token
          /\ UNCHANGED tokenRow
  /\ UNCHANGED <<ownerRows, onboarded, ppc, oauth>>

(* createOwner inserts the admin with owner: true. users.email carries a   *)
(* plain @Index(), not a unique one (interface-dms users.table.ts:40-42),  *)
(* so no existing row refuses it.                                           *)
RegInsert(r) ==
  /\ rpc[r] = "insert"
  /\ ownerRows' = ownerRows \cup {r}                 \* onboarding.ts:79-89
  /\ rpc' = [rpc EXCEPT ![r] = "tenant"]
  /\ UNCHANGED <<onboarded, answer, ppc, oauth, tokenRow>>

(* applyTenantOwnership makes the admin the default tenant's owner. No    *)
(* request in this model reads tenant members, and mirrorPlatformOwner    *)
(* finds owner already true, so its awaits are one step here.             *)
RegTenant(r) ==
  /\ rpc[r] = "tenant"
  /\ rpc' = [rpc EXCEPT ![r] = "readState"]          \* onboarding.ts:94-97
  /\ UNCHANGED <<ownerRows, onboarded, answer, ppc, oauth, tokenRow>>

(* completeOnboarding reads system_state and refuses when it is onboarded. *)
RegReadState(r) ==
  /\ rpc[r] = "readState"
  /\ IF onboarded                                    \* onboarding.ts:102-105
     THEN /\ rpc' = [rpc EXCEPT ![r] = "done"]
          /\ answer' = [answer EXCEPT ![r] = "412"]  \* error.onboarding_already_completed
     ELSE /\ rpc' = [rpc EXCEPT ![r] = "writeState"]
          /\ UNCHANGED answer
  /\ UNCHANGED <<ownerRows, onboarded, ppc, oauth, tokenRow>>

(* updateConfig marks the platform onboarded, and the register answers    *)
(* the inserted ids.                                                       *)
RegWriteState(r) ==
  /\ rpc[r] = "writeState"
  /\ onboarded' = TRUE                               \* onboarding.ts:107-113
  /\ rpc' = [rpc EXCEPT ![r] = "done"]
  /\ answer' = [answer EXCEPT ![r] = "200"]          \* onboarding.ts:63
  /\ UNCHANGED <<ownerRows, ppc, oauth, tokenRow>>

(* A database call after the claim throws: the insert, a write of         *)
(* applyTenantOwnership, getConfig or updateConfig. The register answers  *)
(* 500 and keeps what it already wrote. An insertMany of one document     *)
(* writes it or nothing. restoreUnusedToken puts the token back when no   *)
(* user exists, which the model takes as one step: a claim between its    *)
(* read and its write would find no user either way.                      *)
RegFails(r) ==
  /\ DbErrors
  /\ rpc[r] \in {"insert", "tenant", "readState", "writeState"}
  /\ rpc' = [rpc EXCEPT ![r] = "done"]
  /\ answer' = [answer EXCEPT ![r] = "500"]
  /\ tokenRow' = (tokenRow \/ NoUsers)             \* onboarding.ts:64-73
  /\ UNCHANGED <<ownerRows, onboarded, ppc, oauth>>

(* --------------------- GET /api/onboarding/informations ---------------- *)

(* getInformations reads system_state and answers at once when onboarded. *)
(* A poll that answered is "open" or "onboarded", as the wizard reads it.  *)
PollReadState(p) ==
  /\ ppc[p] = "idle"
  /\ ppc' = [ppc EXCEPT ![p] = IF onboarded THEN "onboarded" ELSE "readUsers"] \* onboarding.ts:31-37
  /\ UNCHANGED <<ownerRows, onboarded, rpc, answer, oauth, tokenRow>>

(* It reads one users row, whoever owns it, and answers onboarded when it *)
(* finds one. It writes nothing: completeOnboarding is the one writer of   *)
(* has_onboarded.                                                           *)
PollReadUsers(p) ==
  /\ ppc[p] = "readUsers"
  /\ ppc' = [ppc EXCEPT ![p] = IF NoUsers THEN "open" ELSE "onboarded"]  \* onboarding.ts:39-41
  /\ UNCHANGED <<ownerRows, onboarded, rpc, answer, oauth, tokenRow>>

(* ---------------------------- OAuth sign-in ---------------------------- *)

(* An unknown provider identity signs in: oauthCallback calls             *)
(* resolveOAuthUser (callback.ts:84-90). Before it creates an account it   *)
(* reads has_onboarded, then counts owners when the flag is false, and     *)
(* refuses while neither shows an owner.                                    *)
OAuthReadState ==
  /\ oauth = "idle"
  /\ oauth' = IF onboarded \/ ownerRows /= {}      \* identity-resolution.ts:118-121
              THEN "create"
              ELSE "refused"                       \* identity-resolution.ts:130-134
  /\ UNCHANGED <<ownerRows, onboarded, rpc, answer, ppc, tokenRow>>

(* It creates the account with owner: false. *)
OAuthCreatesUser ==
  /\ oauth = "create"
  /\ oauth' = "done"                  \* identity-resolution.ts:136-145
  /\ UNCHANGED <<ownerRows, onboarded, rpc, answer, ppc, tokenRow>>

(* Every request has answered. *)
Settled ==
  /\ \A r \in Registers : rpc[r] = "done"
  /\ \A p \in Polls : ppc[p] \in {"open", "onboarded"}
  /\ oauth \notin {"idle", "create"}
  /\ UNCHANGED vars

Next ==
  \/ \E r \in Registers :
       \/ RegReadUsers(r) \/ RegClaim(r) \/ RegInsert(r) \/ RegTenant(r)
       \/ RegReadState(r) \/ RegWriteState(r) \/ RegFails(r)
  \/ \E p \in Polls : PollReadState(p) \/ PollReadUsers(p)
  \/ OAuthReadState \/ OAuthCreatesUser
  \/ Settled

Spec == Init /\ [][Next]_vars

(* -------------------------------- rules -------------------------------- *)

(* At most one user is a platform owner. *)
AtMostOneOwner == Cardinality(ownerRows) <= 1

(* Once the platform is onboarded, or a page load answered that it is, a  *)
(* platform owner exists.                                                   *)
OnboardedHasOwner ==
  (onboarded \/ \E p \in Polls : ppc[p] = "onboarded") => ownerRows /= {}

(* While no platform owner exists, a register can still create one: the   *)
(* platform is not onboarded and has no users row.                         *)
OwnerlessStaysOpen == ownerRows = {} => (~onboarded /\ NoUsers)

(* A register refused with a 4xx created no user. *)
RefusedRegisterCreatedNoUser ==
  \A r \in Registers : answer[r] \in {"400", "403", "412"} => r \notin ownerRows

=============================================================================
