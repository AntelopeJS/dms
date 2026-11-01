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
  ownerRows, \* registers whose users row exists; createOwner writes owner: true
  onboarded, \* system_state.has_onboarded
  rpc,       \* where each register is
  answer,    \* the status each register answered
  ppc,       \* where each status poll is
  oauth      \* "off": no OAuth sign-up; "idle": one may come; "done": its row exists

vars == <<ownerRows, onboarded, rpc, answer, ppc, oauth>>

RegisterSteps == {"idle", "insert", "tenant", "readState", "writeState", "done"}
PollSteps == {"idle", "readUsers", "write", "done"}
Answers == {"none", "200", "400", "412", "500"}

TypeOK ==
  /\ ownerRows \subseteq Registers
  /\ onboarded \in BOOLEAN
  /\ rpc \in [Registers -> RegisterSteps]
  /\ answer \in [Registers -> Answers]
  /\ ppc \in [Polls -> PollSteps]
  /\ oauth \in {"off", "idle", "done"}

(* What `userModel.table.slice(0, 1).run()` finds: no users row at all. *)
NoUsers == ownerRows = {} /\ oauth /= "done"

Init ==
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
  /\ IF NoUsers                                      \* onboarding.ts:56-58
     THEN /\ rpc' = [rpc EXCEPT ![r] = "insert"]
          /\ UNCHANGED answer
     ELSE /\ rpc' = [rpc EXCEPT ![r] = "done"]
          /\ answer' = [answer EXCEPT ![r] = "400"]  \* error.admin_already_set
  /\ UNCHANGED <<ownerRows, onboarded, ppc, oauth>>

(* createOwner inserts the admin with owner: true. users.email carries a   *)
(* plain @Index(), not a unique one (interface-dms users.table.ts:40-42),  *)
(* so no existing row refuses it.                                           *)
RegInsert(r) ==
  /\ rpc[r] = "insert"
  /\ ownerRows' = ownerRows \cup {r}                 \* onboarding.ts:70-80
  /\ rpc' = [rpc EXCEPT ![r] = "tenant"]
  /\ UNCHANGED <<onboarded, answer, ppc, oauth>>

(* applyTenantOwnership makes the admin the default tenant's owner. No    *)
(* request in this model reads tenant members, and mirrorPlatformOwner    *)
(* finds owner already true, so its awaits are one step here.             *)
RegTenant(r) ==
  /\ rpc[r] = "tenant"
  /\ rpc' = [rpc EXCEPT ![r] = "readState"]          \* onboarding.ts:85-88
  /\ UNCHANGED <<ownerRows, onboarded, answer, ppc, oauth>>

(* completeOnboarding reads system_state and refuses when it is onboarded. *)
RegReadState(r) ==
  /\ rpc[r] = "readState"
  /\ IF onboarded                                    \* onboarding.ts:93-96
     THEN /\ rpc' = [rpc EXCEPT ![r] = "done"]
          /\ answer' = [answer EXCEPT ![r] = "412"]  \* error.onboarding_already_completed
     ELSE /\ rpc' = [rpc EXCEPT ![r] = "writeState"]
          /\ UNCHANGED answer
  /\ UNCHANGED <<ownerRows, onboarded, ppc, oauth>>

(* updateConfig marks the platform onboarded, and the register answers    *)
(* the inserted ids.                                                       *)
RegWriteState(r) ==
  /\ rpc[r] = "writeState"
  /\ onboarded' = TRUE                               \* onboarding.ts:98-104
  /\ rpc' = [rpc EXCEPT ![r] = "done"]
  /\ answer' = [answer EXCEPT ![r] = "200"]          \* onboarding.ts:63
  /\ UNCHANGED <<ownerRows, ppc, oauth>>

(* A database call after the users read throws: the insert, a write of    *)
(* applyTenantOwnership, getConfig or updateConfig. The register answers  *)
(* 500 and keeps what it already wrote. An insertMany of one document     *)
(* writes it or nothing.                                                   *)
RegFails(r) ==
  /\ DbErrors
  /\ rpc[r] \in {"insert", "tenant", "readState", "writeState"}
  /\ rpc' = [rpc EXCEPT ![r] = "done"]
  /\ answer' = [answer EXCEPT ![r] = "500"]
  /\ UNCHANGED <<ownerRows, onboarded, ppc, oauth>>

(* --------------------- GET /api/onboarding/informations ---------------- *)

(* getInformations reads system_state and answers at once when onboarded. *)
PollReadState(p) ==
  /\ ppc[p] = "idle"
  /\ ppc' = [ppc EXCEPT ![p] = IF onboarded THEN "done" ELSE "readUsers"] \* onboarding.ts:28-34
  /\ UNCHANGED <<ownerRows, onboarded, rpc, answer, oauth>>

(* It reads one users row, whoever owns it, and goes on to write when it  *)
(* finds one.                                                              *)
PollReadUsers(p) ==
  /\ ppc[p] = "readUsers"
  /\ ppc' = [ppc EXCEPT ![p] = IF NoUsers THEN "done" ELSE "write"]       \* onboarding.ts:36-39
  /\ UNCHANGED <<ownerRows, onboarded, rpc, answer, oauth>>

(* updateConfig writes back the settings read at line 28 with             *)
(* has_onboarded: true. That read found has_onboarded false, so it held   *)
(* no platform_name: only has_onboarded changes.                          *)
PollWrite(p) ==
  /\ ppc[p] = "write"
  /\ onboarded' = TRUE                               \* onboarding.ts:41
  /\ ppc' = [ppc EXCEPT ![p] = "done"]
  /\ UNCHANGED <<ownerRows, rpc, answer, oauth>>

(* ---------------------------- OAuth sign-in ---------------------------- *)

(* An unknown provider identity signs in: oauthCallback calls             *)
(* resolveOAuthUser (callback.ts:84-90), which creates its account with   *)
(* owner: false. Nothing on that path reads has_onboarded.                *)
OAuthCreatesUser ==
  /\ oauth = "idle"
  /\ oauth' = "done"                  \* linking-policy.ts:115-119, identity-resolution.ts:116-126
  /\ UNCHANGED <<ownerRows, onboarded, rpc, answer, ppc>>

(* Every request has answered. *)
Settled ==
  /\ \A r \in Registers : rpc[r] = "done"
  /\ \A p \in Polls : ppc[p] = "done"
  /\ oauth /= "idle"
  /\ UNCHANGED vars

Next ==
  \/ \E r \in Registers :
       \/ RegReadUsers(r) \/ RegInsert(r) \/ RegTenant(r)
       \/ RegReadState(r) \/ RegWriteState(r) \/ RegFails(r)
  \/ \E p \in Polls : PollReadState(p) \/ PollReadUsers(p) \/ PollWrite(p)
  \/ OAuthCreatesUser
  \/ Settled

Spec == Init /\ [][Next]_vars

(* -------------------------------- rules -------------------------------- *)

(* At most one user is a platform owner. *)
AtMostOneOwner == Cardinality(ownerRows) <= 1

(* Once the platform is onboarded, a platform owner exists. *)
OnboardedHasOwner == onboarded => ownerRows /= {}

(* While no platform owner exists, a register can still create one: the   *)
(* platform is not onboarded and has no users row.                         *)
OwnerlessStaysOpen == ownerRows = {} => (~onboarded /\ NoUsers)

(* A register refused with a 4xx created no user. *)
RefusedRegisterCreatedNoUser ==
  \A r \in Registers : answer[r] \in {"400", "412"} => r \notin ownerRows

=============================================================================
