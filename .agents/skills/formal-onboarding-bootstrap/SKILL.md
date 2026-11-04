---
name: formal-onboarding-bootstrap
description: TLA+ model of the first-admin bootstrap of @antelopejs/dms (POST /api/onboarding/register, GET /api/onboarding/informations, an OAuth sign-up that creates an account), checked with TLC. Use when a change touches a file in its coverage record, or when a change to onboarding, platform ownership or OAuth account creation needs proof that it breaks no bootstrap rule.
---

# Formal check: first-admin bootstrap

A fresh platform has no users, `system_state.has_onboarded` false and a row in `setup_token`. The onboarding wizard sends `POST /api/onboarding/register` with that token, which spends the token with one database delete, creates the first admin as platform owner (`users.owner: true`, every permission) and marks the platform onboarded. Every page load of the dashboard asks `GET /api/onboarding/informations`, which also marks the platform onboarded once it sees a user. When the instance sets `auth.oauth.allowAccountCreation`, an OAuth sign-in can create an account too.

The model treats each database round trip as one step, and TLC checks every order of those steps across concurrent requests within the bounds below. The promise it checks is that concurrent onboarding never leaves two platform owners or none.

- `OnboardingBootstrap.tla` holds the variables, the actions and the rules. Each condition carries a `\* file.ts:NN` comment.
- `OnboardingBootstrapInviteOnly.tla` is the same model with OAuth sign-up off, the default (`allowAccountCreation` defaults to `false`).
- Each spec has two configurations. `<spec>.ci.cfg` is the CI configuration and `<spec>.cfg` the full one.
- `OnboardingBootstrap.map.mjs`, `chart-race.cfg` and `chart-poll.cfg` are for reading results with `/statechart`.

## Run it

From the repository root, with Node 24:

```sh
node .agents/skills/formal-onboarding-bootstrap/check.mjs          # CI configuration
node .agents/skills/formal-onboarding-bootstrap/check.mjs --full   # full configuration
```

Java 11 or later comes from `$JAVA`, else `java` on PATH, else the `eclipse-temurin:21-jre` Docker image. The first run downloads TLC 1.7.4 into `~/.cache/antelopejs-formal` (or `$XDG_CACHE_HOME/antelopejs-formal`) and checks its SHA-256. Each run checks the invite-only spec first, then the OAuth spec.

| Configuration | Registers, page loads | States (invite-only, OAuth) | Wall time |
| --- | --- | --- | --- |
| CI (`<spec>.ci.cfg`) | 2, 2 | 1,321, 4,643 | about 8 s |
| Full (`<spec>.cfg`) | 3, 3 | 40,386, 141,271 | about 9 s |

The times are three runs each in Docker Java 21 on 32 cores. The run that checks the rules that hold uses every core, and each finding runs on one worker. Most of the time is container and JVM start-up, about 1 s for each of the 8 TLC runs.

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
| `RefusedRegisterCreatedNoUser` | A register that answers 400, 403 or 412 created no user. | The admin sees an error for an account that exists, and the platform name and language from the wizard are lost. | finding F2 | finding F2 |
| `OnboardedHasOwner` | Once the platform is marked onboarded, a platform owner exists. | The wizard is gone and nobody administers the platform. | holds | finding F3 |
| `OwnerlessStaysOpen` | While no platform owner exists, the platform is not onboarded and has no user, so a register can still create the owner. | The first admin can never register. | holds | finding F4 |

`TypeOK` holds too. It also says that every register answers 200, 400, 403, 412 or 500. `check.mjs` records each finding's counterexample length for each configuration. Today both configurations have the same lengths: F2 9 states, F3 5, F4 2.

## Findings on main

Each finding was replayed against the real code at the sync commit with the integration harness of `packages/dms/TESTING.md`. The replays were scratch tests and are not committed. They ran before the setup token existed; F2 to F4 do not depend on it. The harness boots the module against an in-memory MongoDB, and each replay seeded a `system_state` row with `has_onboarded: false` on an empty database.

- **F1, two owners (`AtMostOneOwner`), fixed.** `postRegister` used to read one users row, refuse on a row, then insert the admin in separate round trips, and nothing made the insert fail for a second caller. Two concurrent `POST /api/onboarding/register` stored two owners on almost every attempt. Registering now spends the `setup_token` row first: the one `delete` that removes it (`SetupTokenModel.claim`) goes on, and any other caller answers `403 error.invalid_setup_token` without creating a user. `AtMostOneOwner` holds in every configuration, and the integration test `onboarding-setup-token.test.ts` races four registrations and finds one owner.
- **F2, refused after creating the owner (`RefusedRegisterCreatedNoUser`).** `getInformations` marks the platform onboarded when it sees any users row (lines 39-45). `postRegister` reads `system_state` only after `applyTenantOwnership`, and refuses with 412 when it is already onboarded (line 111). In TLC's counterexample, the register finds no user, claims the token, inserts the owner and makes them tenant owner. A page load finds onboarding open, finds a user and marks onboarding done. The register then finds onboarding done and answers 412. In the replay, a `Hook.MEMBER_BEING_ADDED` handler held the register inside `applyTenantOwnership`, and `GET /api/onboarding/informations` answered `{ has_onboarded: true }`. The register then answered `412 error.onboarding_already_completed`. Alice was the one owner, `platform_name` and `default_language` were unset, and a retry answered `400 error.admin_already_set`. Without the page load, the same register answered 200 and stored `Platform alice` and `fr`.
- **F3, onboarded with no owner (`OnboardedHasOwner`, OAuth sign-up on).** `createOAuthUser` inserts the account with `owner: false` (identity-resolution.ts:116-126), and nothing on the OAuth path reads `has_onboarded`. `getInformations` counts that account as the admin. In TLC's counterexample, a page load finds onboarding open, a visitor signs up with OAuth, and the page load finds a user and marks onboarding done. In the replay, `resolveOAuthUser` with `allowAccountCreation: true` (the call `oauthCallback` makes) created the account with `owner: false`. `GET /api/onboarding/informations` then answered and stored `has_onboarded: true` with one user and no owner.
- **F4, the wizard closes with no owner (`OwnerlessStaysOpen`, OAuth sign-up on).** `postRegister` refuses on any users row, owner or not. In TLC's counterexample, a visitor signs up with OAuth, and nothing else happens. In the replay, after that sign-up, the register answered `400 error.admin_already_set` and `getOwners()` returned none. It still answered 400 after onboarding was marked done.

## Read every result with /statechart

Read each TLC result with the pstack `/statechart` skill. Work on a copy of the two `.tla` files, the map and the configs in a scratch folder outside the repo, since it writes its output next to its input. Use `OnboardingBootstrap.map.mjs` as the view. `chart-race.cfg` charts two registers with no page load (46 states), and `chart-poll.cfg` one register, one page load and an OAuth sign-up (87 states). The `.ci.cfg` configurations are small enough for `/statechart` to check every rule, and it draws only their bug paths. The full OAuth configuration is too large for it to check every rule after the first break, so `check.mjs` is the authority there. The view hides `Settled`, the step that changes nothing once every request answered. A new bug shows as a new numbered path, and a fix shows which bug paths it removes.

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
| `RegReadUsers` | `postRegister` reads one users row and asserts `error.admin_already_set` (packages/dms/src/routes/onboarding.ts:59-61) |
| `RegClaim` | `claim` deletes the one `setup_token` row and goes on only when it removed it (onboarding.ts:63-64; packages/dms/src/db/models/setupToken.model.ts). `announceSetupToken` creates the row at start (packages/dms/src/db/setup-token.ts) |
| `RegInsert` | `createOwner` inserts the admin with `owner: true` (onboarding.ts:85-95); `users.email` has a plain `@Index()` (packages/interface-dms/src/auth/db/tables/users.table.ts:40-42) |
| `RegTenant` | `applyTenantOwnership` (onboarding.ts:100-103; packages/interface-dms/src/tenant-ownership.ts), `applyAdmittedTenantOwnership` and `mirrorPlatformOwner` (packages/interface-dms/src/internal/tenant-ownership.ts) |
| `RegReadState`, `RegWriteState` | `completeOnboarding` (onboarding.ts:107-120), the answer (line 69), `getConfig` and `updateConfig` (packages/dms/src/db/models/systemState.model.ts) |
| `RegFails` | any await of `postRegister` after the claim that throws, and the `error.user_creation_failed` assert (onboarding.ts:98); `restoreUnusedToken` (onboarding.ts:70-79) puts the token back when no user exists |
| `PollReadState`, `PollReadUsers`, `PollWrite` | `getInformations` (onboarding.ts:29-48) |
| `OAuthCreatesUser` | `oauthCallback` calls `resolveOAuthUser` (packages/dms/src/routes/auth/oauth/callback.ts:84-90), `decideOAuthResolution` allows creation (linking-policy.ts:115-119), `createOAuthUser` inserts `owner: false` (identity-resolution.ts:116-126), `allowAccountCreation` defaults to `false` (config.ts:16, 45-46) |
| no action | `signup` (packages/dms/src/routes/auth/signup.ts) creates a user only with a valid invitation, which needs an existing member, so it adds no user before onboarding |

The sync commit is `4c96f61d` on AntelopeJS/dms `main`.

## Bounds and what is left out

The CI configuration runs 2 registers and 2 page loads, and the full one 3 and 3. Both let any database call of a register fail after the users read. `OnboardingBootstrap.tla` lets `Init` try a deployment with OAuth sign-up off and one with a single sign-up possible. A pass covers these bounds only.

The model leaves out:

- the values of `platform_name` and `default_language`. A page load writes back the `system_state` it read, and the model assumes that copy changes only `has_onboarded`.
- tenant membership rows. `applyTenantOwnership` is one step because no modeled request reads them. A register that fails after its insert leaves an owner without a membership, and the model counts that user as an owner.
- SaaS mode, where `mirrorPlatformOwner` does nothing. The register still writes `owner: true`.
- a missing `system_state` row (`error.settings_not_found`), which the fixture prevents, and validation errors, which answer before any read.
- users created by other modules, deleted users, and ownership transfer after onboarding.
- the wizard and the dashboard themselves. A double submit or a page load is one more concurrent request.

## Confirm the check can fail

On a scratch copy of this folder, apply one model edit at a time and run `check.mjs` with and without `--full`. Each edit mirrors the code change in the first column. These ran with the setup token change.

| Scratch change in the code, and the model edit | CI configuration | Full configuration |
| --- | --- | --- |
| `claim` stops spending the token (the delete removes nothing): `RegClaim` keeps `tokenRow` | `BROKEN AtMostOneOwner: Initial -> RegReadUsers -> RegReadUsers -> RegClaim -> RegInsert -> RegClaim -> RegInsert` | `BROKEN AtMostOneOwner: Initial -> RegReadUsers -> RegClaim -> RegReadUsers -> RegClaim -> RegInsert -> RegInsert` |
| Drop the users read and its assert (onboarding.ts:59-61): `RegReadUsers` is disabled, `RegClaim` starts from `idle` | `CHANGED RefusedRegisterCreatedNoUser: 8 states` | same |
| `getInformations` marks onboarding done without users (drop `if (hasUsers)`, line 42): `PollReadUsers` always goes to `write` | `BROKEN OnboardedHasOwner: Initial -> RegReadUsers -> PollReadState -> PollReadUsers -> PollWrite` | same |
| A unique email index makes the losing insert answer 409: `RegFails` answers `"409"` | `BROKEN TypeOK: Initial -> RegReadUsers -> RegClaim -> RegFails` | same |
| Fix candidate: `getInformations` never writes (drop lines 42-45): `PollReadUsers` always goes to `done` | `HOLDS RefusedRegisterCreatedNoUser` (621 states) | same (12,636 states) |
| Fix candidate: OAuth account creation waits for `has_onboarded`: `OAuthCreatesUser` requires `onboarded` | invite-only unchanged; `HOLDS OnboardedHasOwner`, `HOLDS OwnerlessStaysOpen` (3,152 states) | same (99,447 states) |

Every scratch run exited 1. With the edits dropped, both configurations exit 0.
