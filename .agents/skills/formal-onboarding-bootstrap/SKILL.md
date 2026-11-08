---
name: formal-onboarding-bootstrap
description: TLA+ model of the first-admin bootstrap of @antelopejs/dms (POST /api/onboarding/register, GET /api/onboarding/informations, an OAuth sign-up that creates an account), checked with TLC. Use when a change touches a file in its coverage record, or when a change to onboarding, platform ownership or OAuth account creation needs proof that it breaks no bootstrap rule.
---

# Formal check: first-admin bootstrap

A fresh platform has no users, `system_state.has_onboarded` false and a row in `setup_token`. The onboarding wizard sends `POST /api/onboarding/register` with that token, which spends the token with one database delete, creates the first admin as platform owner (`users.owner: true`, every permission) and marks the platform onboarded. Every page load of the dashboard asks `GET /api/onboarding/informations`, which answers that the platform is onboarded once it sees a user, and writes nothing. When the instance sets `auth.oauth.allowAccountCreation`, an OAuth sign-in can create an account too, but only once the platform has its owner.

The model treats each database round trip as one step, and TLC checks every order of those steps across concurrent requests within the bounds below. The promise it checks is that concurrent onboarding never leaves two platform owners or none.

- `OnboardingBootstrap.tla` holds the variables, the actions and the rules. Each condition carries a `\* file.ts:NN` comment.
- `OnboardingBootstrapInviteOnly.tla` is the same model with OAuth sign-up off, the default (`allowAccountCreation` defaults to `false`).
- Each spec has two configurations. `<spec>.ci.cfg` is the CI configuration and `<spec>.cfg` the full one.
- `OnboardingBootstrap.map.mjs`, `chart-race.cfg` and `chart-poll.cfg` are for reading results with `/statechart`.

## Run it

From the repository root, with Node 24 and `pnpm install` done (the runner comes from `@antelopejs/tooling-configs/formal`):

```sh
node .agents/skills/formal-onboarding-bootstrap/check.mjs          # CI configuration
node .agents/skills/formal-onboarding-bootstrap/check.mjs --full   # full configuration
```

Java 11 or later comes from `$JAVA`, else `java` on PATH, else the `eclipse-temurin:21-jre` Docker image. The first run downloads TLC 1.7.4 into `~/.cache/antelopejs-formal` (or `$XDG_CACHE_HOME/antelopejs-formal`) and checks its SHA-256. Each run checks the invite-only spec first, then the OAuth spec.

| Configuration | Registers, page loads | States (invite-only, OAuth) | Wall time |
| --- | --- | --- | --- |
| CI (`<spec>.ci.cfg`) | 2, 2 | 971, 4,513 | about 8 s |
| Full (`<spec>.cfg`) | 3, 3 | 26,511, 127,533 | about 9 s |

The times are three runs each in Docker Java 21 on 32 cores, measured before the dms#533 fix shrank the state space. The run that checks the rules that hold uses every core, and each finding runs on one worker. Most of the time is container and JVM start-up, about 1 s for each of the 8 TLC runs.

- Exit 0 means every rule that held still holds, and each finding still breaks with its recorded counterexample length.
- Exit 1 means a rule changed. `BROKEN` names a rule that held and now breaks. `CHANGED` names a finding whose shortest counterexample changed length. `HOLDS` names a finding that no longer breaks. The script keeps TLC's output in a temporary folder and prints its path. The run stops at the first spec that changed, so a change in the invite-only spec skips the OAuth one.
- Exit 2 means TLC or Java could not run, or the arguments were wrong.

The lines that name a changed rule match `^(?:BROKEN|CHANGED|HOLDS) +(\w+)`. A rule that still holds prints as lowercase `holds`.

## When to run it

Run `--full` when a change touches a file in the coverage record below, or this folder. A changed rule (exit 1) makes the Verdict FAIL. The recorded findings fail it only when the diff changes what the covered code does, which `dms-control formal` decides by comparing the covered files' JavaScript statements on the base and on HEAD (`verify-dms` verdict rule 5). The CI configuration catches every scratch break in the last section, so it is the one to run on every push.

## The rules

| Rule | Plain sentence | Harm when it breaks | On main, invite-only | On main, OAuth sign-up on |
| --- | --- | --- | --- | --- |
| `AtMostOneOwner` | At most one user is a platform owner. | A second person holds every permission. | holds | holds |
| `RefusedRegisterCreatedNoUser` | A register that answers 400, 403 or 412 created no user. | The admin sees an error for an account that exists, and the platform name and language from the wizard are lost. | holds (F2 fixed) | holds (F2 fixed) |
| `OnboardedHasOwner` | Once the platform is marked onboarded, or a page load answers that it is, a platform owner exists. | The wizard is gone and nobody administers the platform. | holds | holds (F3 fixed) |
| `OwnerlessStaysOpen` | While no platform owner exists, the platform is not onboarded and has no user, so a register can still create the owner. | The first admin can never register. | holds | holds (F4 fixed) |

`TypeOK` holds too. It also says that every register answers 200, 400, 403, 412 or 500. `check.mjs` records each finding's counterexample length for each configuration. Today no rule breaks in either configuration.

## Findings on main

Each finding was replayed against the real code at the sync commit with the integration harness of `packages/dms/TESTING.md`. The replays were scratch tests and are not committed. They ran before the setup token existed; F2 to F4 do not depend on it. The harness boots the module against an in-memory MongoDB, and each replay seeded a `system_state` row with `has_onboarded: false` on an empty database.

- **F1, two owners (`AtMostOneOwner`), fixed.** `postRegister` used to read one users row, refuse on a row, then insert the admin in separate round trips, and nothing made the insert fail for a second caller. Two concurrent `POST /api/onboarding/register` stored two owners on almost every attempt. Registering now spends the `setup_token` row first: the one `delete` that removes it (`SetupTokenModel.claim`) goes on, and any other caller answers `403 error.invalid_setup_token` without creating a user. `AtMostOneOwner` holds in every configuration, and the integration test `onboarding-setup-token.test.ts` races four registrations and finds one owner.
- **F2, refused after creating the owner (`RefusedRegisterCreatedNoUser`), fixed (dms#533).** `getInformations` used to mark the platform onboarded when it saw any users row, and `postRegister` reads `system_state` only after `applyTenantOwnership`, refusing with 412 when it is already onboarded. In TLC's counterexample, the register found no user, claimed the token, inserted the owner and made them tenant owner. A page load found onboarding open, found a user and marked onboarding done. The register then found onboarding done and answered 412, with `platform_name` and `default_language` unset and a retry answering `400 error.admin_already_set`. `getInformations` now answers from the users row without writing, so `completeOnboarding` is the one writer of `has_onboarded`. The integration test `onboarding-page-load.test.ts` holds the register in a `Hook.MEMBER_BEING_ADDED` handler, sends `GET /api/onboarding/informations`, which answers `{ has_onboarded: true }`, and finds the register answering 200 with the platform name and language stored.
- **F3, onboarded with no owner (`OnboardedHasOwner`, OAuth sign-up on), fixed.** `createOAuthUser` inserted the account with `owner: false`, and nothing on the OAuth path read `has_onboarded`, so `getInformations` counted that account as the admin. In TLC's counterexample, a page load found onboarding open, a visitor signed up with OAuth, and the page load found a user and marked onboarding done. Since dms#533 the page load answers without writing, and `OnboardedHasOwner` also covers that answer. `createOAuthUser` now refuses with `403 error.oauth.platform_not_onboarded` unless `has_onboarded` is true or an owner row exists (identity-resolution.ts:118-134). The model reads both in one step: neither goes back once set. The rule holds in every configuration, and the integration test `onboarding-oauth-sign-up.test.ts` replays the sign-up before and after the register.
- **F4, the wizard closes with no owner (`OwnerlessStaysOpen`, OAuth sign-up on), fixed.** `postRegister` refuses on any users row, owner or not, so an OAuth account created before onboarding made it answer `400 error.admin_already_set` with no owner. The same refusal keeps that account from existing: in the replay, the sign-up answered 403, the register answered 200, and `getOwners()` returned the admin alone.

## Read every result with /statechart

Read each TLC result with the pstack `/statechart` skill. Work on a copy of the two `.tla` files, the map and the configs in a scratch folder outside the repo, since it writes its output next to its input. Use `OnboardingBootstrap.map.mjs` as the view. `chart-race.cfg` charts two registers with no page load (46 states), and `chart-poll.cfg` one register, one page load and an OAuth sign-up. The `.ci.cfg` configurations are small enough for `/statechart` to check every rule, and it draws only their bug paths. The full OAuth configuration is too large for it to check every rule after the first break, so `check.mjs` is the authority there. The view hides `Settled`, the step that changes nothing once every request answered. A new bug shows as a new numbered path, and a fix shows which bug paths it removes.

## Real bug or modeling error

Node runs other requests at every `await`, so any order of round trips across concurrent HTTP requests can happen. A step order is a modeling error when the code cannot produce it, for example one round trip split in two, or two writes the model merged that the code makes separately. Replay the counterexample through the integration harness, one action per step, with the coverage record below:

- Race two requests with `Promise.all` of two `createClient()` calls and repeat it. Before the setup token this stored two owners on almost every attempt, and now it stores one.
- Hold a register at a point between two steps with a hook, such as `Hook.MEMBER_BEING_ADDED` inside `applyTenantOwnership`, then send the other request.
- Call `resolveOAuthUser` for `OAuthCreatesUser`, since a real provider is not available in tests.

Assert only what a user observes: HTTP answers, `UserModel.getOwners()`, and `has_onboarded`. If the replay does not reproduce the finding, treat the model as wrong until you show it is not.

## Changing the model

- For an intended code change, edit the action that maps to that code, keep the `\* file.ts:NN` comment on each condition and update its line, then run both configurations.
- Never weaken or drop a rule to make the check pass. A fixed finding leaves `SPECS` in `check.mjs`, for both configurations, once a replay confirms the fix. A new finding goes into `SPECS` with its counterexample length for each configuration, and into this file with its replay.
- When you change the bounds of a `.ci.cfg`, rerun the scratch changes below on it. The CI configuration must still catch each one.
- After you confirm that the model describes the code at a newer commit, move the sync commit forward. Do it only then.

## Coverage record

| Model action | Code |
| --- | --- |
| `Init` | the `system_state` fixture with `has_onboarded: false` (packages/dms/src/db/tables/systemState.table.ts:12-18) |
| `RegReadUsers` | `postRegister` reads one users row and asserts `error.admin_already_set` (packages/dms/src/routes/onboarding.ts:53-55) |
| `RegClaim` | `claim` deletes the one `setup_token` row and goes on only when it removed it (onboarding.ts:57-58; packages/dms/src/db/models/setupToken.model.ts). `announceSetupToken` creates the row at start (packages/dms/src/db/setup-token.ts) |
| `RegInsert` | `createOwner` inserts the admin with `owner: true` (onboarding.ts:79-89); `users.email` has a plain `@Index()` (packages/interface-dms/src/auth/db/tables/users.table.ts:40-42) |
| `RegTenant` | `applyTenantOwnership` (onboarding.ts:94-97; packages/interface-dms/src/tenant-ownership.ts), `applyAdmittedTenantOwnership` and `mirrorPlatformOwner` (packages/interface-dms/src/internal/tenant-ownership.ts) |
| `RegReadState`, `RegWriteState` | `completeOnboarding` (onboarding.ts:101-114), the answer (line 63), `getConfig` and `updateConfig` (packages/dms/src/db/models/systemState.model.ts) |
| `RegFails` | any await of `postRegister` after the claim that throws, and the `error.user_creation_failed` assert (onboarding.ts:92); `restoreUnusedToken` (onboarding.ts:64-73) puts the token back when no user exists |
| `PollReadState`, `PollReadUsers` | `getInformations` (onboarding.ts:29-42) |
| `OAuthReadState` | `oauthCallback` calls `resolveOAuthUser` (packages/dms/src/routes/auth/oauth/callback.ts:84-90); `decideOAuthResolution` allows creation (linking-policy.ts:115-119), `allowAccountCreation` defaults to `false` (config.ts:16, 45-46); `createOAuthUser` reads `has_onboarded`, counts owners when it is false, and refuses without an owner (identity-resolution.ts:118-134) |
| `OAuthCreatesUser` | `createOAuthUser` inserts `owner: false` (identity-resolution.ts:136-145) |
| no action | `signup` (packages/dms/src/routes/auth/signup.ts) creates a user only with a valid invitation, which needs an existing member, so it adds no user before onboarding |

The sync commit is the one that fixed dms#533 on AntelopeJS/dms `main`.

## Bounds and what is left out

The CI configuration runs 2 registers and 2 page loads, and the full one 3 and 3. Both let any database call of a register fail after the users read. `OnboardingBootstrap.tla` lets `Init` try a deployment with OAuth sign-up off and one with a single sign-up possible. A pass covers these bounds only.

The model leaves out:

- the values of `platform_name` and `default_language`. Only `completeOnboarding` writes `system_state`, so no modeled request overwrites them.
- tenant membership rows. `applyTenantOwnership` is one step because no modeled request reads them. A register that fails after its insert leaves an owner without a membership, and the model counts that user as an owner.
- SaaS mode, where `mirrorPlatformOwner` does nothing. The register still writes `owner: true`.
- a missing `system_state` row (`error.settings_not_found`), which the fixture prevents, and validation errors, which answer before any read.
- users created by other modules, deleted users, and ownership transfer after onboarding.
- the wizard and the dashboard themselves. A double submit or a page load is one more concurrent request.

## Confirm the check can fail

On a scratch copy of this folder, apply one model edit at a time and run `check.mjs` with and without `--full`. Each edit mirrors the code change in the first column. These ran with the dms#533 fix.

| Scratch change in the code, and the model edit | CI configuration | Full configuration |
| --- | --- | --- |
| `claim` stops spending the token (the delete removes nothing): `RegClaim` keeps `tokenRow` | `BROKEN AtMostOneOwner` | same |
| `getInformations` answers onboarded without users (answer `true` at line 41): `PollReadUsers` always goes to `onboarded` | `BROKEN OnboardedHasOwner` | same |
| A unique email index makes the losing insert answer 409: `RegFails` answers `"409"` | `BROKEN TypeOK` | same |
| Drop the owner gate on OAuth creation (identity-resolution.ts:130-134): `OAuthReadState` always goes to `create` | invite-only unchanged; `BROKEN OwnerlessStaysOpen` | same |

A `BROKEN` line also prints a counterexample, which comes from the run that checks every core and can differ from run to run, so the table records only the rule. Every scratch run exited 1. With the edits dropped, both configurations exit 0. Dropping the register's users read (onboarding.ts:53-55) changes no rule: the spent setup token refuses every later register, and an OAuth account cannot exist before the owner, so the read only turns a 403 into a 400.
