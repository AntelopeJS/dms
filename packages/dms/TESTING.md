# Backend testing

Backend tests run through AntelopeJS's own test runner (`ajs module test`), which
boots the DMS module with real dependency modules (mongodb, auth-jwt, data-api,
api, file-storage-local, nodemailer) against an **in-memory MongoDB replica set**
(`mongodb-memory-server-core`). Tests are written with Mocha + Chai.

The harness, helpers, and a first slice of tests were brought forward from the
old `test/components-coverage` branch and updated for the current `main`.

## Layout

```
src/test/
  antelope.test.ts        # harness: boots modules, in-memory mongo, setup/cleanup
  helpers/
    db.ts                 # resetDatabase() — clears app collections between tests
    http.ts               # axios client against the test API server
    auth.ts               # registerUser / loginUser helpers
    fixtures.ts           # seed invites / users / system-state via in-process models
  unit/                   # pure-logic tests (no HTTP, no cross-process state)
  integration/            # HTTP tests against the booted API
    setup.test.ts         # root before() hook: waits for the runtime to be ready
```

## Running

Every command below runs from `packages/dms`.

```bash
pnpm test               # build + run every test under src/test
pnpm test:unit          # build + run only src/test/unit/**
pnpm test:integration   # build + run only src/test/integration/**
```

`test:unit` / `test:integration` narrow the runner's recursive discovery to a
subdirectory by setting `DMS_TEST_DIR` (read by `antelope.test.ts`'s
`test.folder`); both still boot the full harness. The readiness gate lives in
`integration/setup.test.ts` because only the HTTP tests race startup — unit
tests are pure logic and don't touch the runtime. `[unit]` / `[integration]`
tags in the `describe` titles are for readability.

Each of these scripts builds the module, and the harness builds it once more
when it loads it. With `DMS_PREBUILT=1` set, both skip that and use the `dist`
already there (as does `pnpm typecheck` for the interface build): CI builds once
per job and sets it. Leave it unset locally, or the tests run stale code.

First run downloads the MongoDB binary (`MONGO_BINARY_VERSION` in
`antelope.test.ts`); later runs are fast.

## Never re-register a schema the module owns

A test that needs a model just calls `GetModel(...)`: `start()` has already
registered `CORE_SCHEMA_NAME` and `TENANT_SCHEMA_NAME`, and the harness boots
the module before mocha runs. Calling `RegisterSchema` on either of them again
constructs a second `Schema`, and every `Schema` re-provisions: the adapter
replays `createCollection` / `collMod` / `createIndex` over collections the
first pass is still building. MongoDB rejects the overlap ("an index build is
currently running for collection ..."), the adapter keeps the failure until
teardown, and its `destroy()` throws it — the whole run then exits non-zero
with every test green.

`RegisterSchema` is for a schema the test itself defines (the table-view
suites declare their own), never for one the DMS provisions.

## What's covered today

- **Unit:** data types, validation, forms, upload tokens, page/component
  registration, permissions, and attachment-related behavior.
- **Attachment integration:** real HTTP, MongoDB, and local storage. Coverage
  includes immutable page/component provenance, live tenant and component access,
  upload action permissions, private and public visibility, staging promotion,
  failed-save retention, barriered concurrent saves, staged-key retries, canonical
  metadata validation, physical cleanup, and preserved legacy references.
- **Frontend:** run `pnpm --dir frontend-vue test`. Component tests cover native file
  rendering and preview URL behavior.

The attachment integration host registers its controllers before API startup and
uses HTTP or raw MongoDB fixtures. It does not depend on test-side model registries.
The api listens on a port the OS assigns, so a process already holding a fixed
port cannot capture the suite. The `api-endpoint` test host consumes
`${@api.API_LOCAL_BASE_URL}` and publishes it as `TEST_API_BASE_URL`; the HTTP
helpers read it on every request.

### Storage-provider development

The harness uses the published API and MongoDB providers. To test changes in the
local storage provider, set the optional `DMS_TEST_STORAGE_PATH` variable:

```bash
DMS_TEST_STORAGE_PATH=/path/to/file-storage-local \
DMS_TEST_DIR=dist/test/integration/files \
pnpm dlx @antelopejs/core@1.13.2 module test .
```

Build the DMS first with `pnpm build`. Omit `DMS_TEST_STORAGE_PATH` to use the
published local provider, and omit `DMS_TEST_DIR` to run the full suite. Registry
credentials must be available through normal package-manager configuration;
never put credentials in source or test output. Inspect the runner output for
failed assertions rather than relying only on its exit status.

The storage interface and provider must support `UploadRequest.visibility` and
trusted provider-owned `internal.promoteFile` replay. Until those versions are
released, pin matching interface artifacts in both temporary DMS and provider
manifests throughout the test run: the runner reinstalls dependencies and can
otherwise restore an older interface. No local API or MongoDB checkout is needed.

## Seed over HTTP, not through test-side models

Under `ajs module test`, the mocha-loaded test code and the runtime-loaded
module code can resolve **different copies of `@antelopejs/interface-database`**.
A row seeded in-process with `GetModel(...)` reaches the shared in-memory mongo,
but a route's `Schema`/`CROSS_INSTANCE` view may not return it -- a signup route
once reported `error.invalid_token` for an invite that was in the database. The
auth suites that depended on that seeding were always skipped and have been
removed; login, refresh, sessions and signup are covered over HTTP by
`login-throttle`, `session-revocation`, `two-factor-*`, `password-reset` and
`auth-key-rotation`.

Drive state through the real endpoints (bootstrap the first owner with
`POST /onboarding/register`, then create and consume invites over HTTP).
`resetDatabase` cleans the shared mongo through a raw client, which works
regardless.

The runner calls `manager.startAll()` without awaiting it, so tests could begin
before schemas and the API are ready; `integration/setup.test.ts` adds a
readiness gate that closes that race.
