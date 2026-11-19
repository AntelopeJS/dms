# The e2e kit

`@antelopejs/dms/e2e` is a Playwright setup for a DMS repository. The global setup of its config prepares the playground and starts one run for the whole invocation: a copy of the playground on free ports, its own MongoDB, a mail sink and the built dashboard. It stops the run after the last test. A spec is ordinary Playwright: it imports `test` and `expect` from the kit, and its fixtures give it a fresh database, an administrator and the run's dashboard as `baseURL`. `registerJourneys()` turns the journeys of `e2e/journeys/` into tests on the same fixtures. Nothing in the kit runs `dms-control`.

## Configure a suite

`e2e/playwright.config.ts`:

```ts
import { e2eConfig } from "@antelopejs/dms/e2e";

export default e2eConfig();
```

`e2e/zz-journeys.spec.ts`:

```ts
import { registerJourneys } from "@antelopejs/dms/e2e";

await registerJourneys();
```

`e2e/journeys.config.ts` declares the suite's run and its journeys:

```ts
import type { JourneysConfig } from "@antelopejs/dms/e2e";

export default {
  playground: "packages/dms/playground",
  prepare: [
    ["pnpm", "install", "--frozen-lockfile", "--prefer-offline", "--ignore-scripts"],
    ["pnpm", "--dir", "packages/dms", "build"],
    ["pnpm", "--dir", "packages/dms/playground", "build"],
  ],
  smoke: "smoke",
} satisfies JourneysConfig;
```

- `playground`: the playground folder, relative to the repository root, or absolute for a playground in another checkout.
- `renderer`: the built `@antelopejs/dms-frontend` checkout the run serves, for the repository that is the renderer. Without it, the playground's installed one.
- `prepare`: the install and build commands the global setup runs before the run starts.
- `smoke`: the feature whose journeys run first.

Each `*.mjs` file of `e2e/journeys/` is a feature, named after the file, and exports its `journeys`. The helpers they import live in subfolders or outside `e2e/journeys/`.

`e2eConfig` takes two options:

- `skill`: for a repository without `e2e/journeys.config.ts`, the verify skill folder whose `verify.config.ts` and `features/` the kit reads instead, relative to the repository root. A repository with one `.agents/skills/verify-*` folder leaves it out. A `skill` wins over `e2e/journeys.config.ts`, so a migrated suite drops it.
- `frontend: "dev"`: the run serves the dashboard with `ajs dms dev`, and the suite runs only the journeys that set `frontend: "dev"`. A suite without it serves a build and leaves those journeys out. Its test output and report folders end in `-dev`.

`registerJourneys()` reads both from the config that loaded it.

The tests of a suite run one at a time against its run, the files in alphabetical order. `registerJourneys()` registers the journeys of the config's `smoke` feature first, then the other features in alphabetical order, then every journey marked `last`, so `--grep @smoke` runs the `smoke` journey before the other journeys. Name the journeys file so that it sorts after the specs (`zz-journeys.spec.ts`): a journey marked `last` changes the playground for the backends that follow, and a spec that sorts after it cannot start its backend. `--shard=i/N` splits a suite across machines, each with a run of its own.

## Write a spec

`e2e/members.spec.ts`:

```ts
import { expect, test } from "@antelopejs/dms/e2e";

test("the administrator opens the members page", async ({ adminPage }) => {
  await adminPage.goto("/settings/workspace/members");
  await expect(adminPage.getByRole("heading", { name: "Members", exact: true })).toBeVisible();
});
```

The fixtures:

- `run`: the run of the global setup, shared by a worker: its `webUrl`, `apiUrl`, `accounts` and `evidence` folder.
- `baseURL`: the run's dashboard, so `page.goto("/settings")` opens it.
- `dms`: the test's journey context. Before the test, it prepares the run as a journey's run does: a fresh database with a backend of its own, and an onboarded administrator. The test drives the run through it: `dms.tab(account)`, `dms.api(label, request)`, `dms.mail(accept)`, `dms.email(name)`, `dms.unique(prefix)` and `dms.verify(label, checks)`. After the test, it closes the tabs, judges the `verify` steps, and replays them into the report. A failing step attaches its screenshot and ARIA snapshot, and a failed test attaches the backend's log. The evidence goes to `<run>/evidence/<feature>/<test>/`. A test whose preparation fails does not run.
- `adminPage`: a tab of `dms` that the administrator signed in on.
- `dmsOptions`: how `dms` prepares the test, with the fields of a journey: `test.use({ dmsOptions: { database: "shared", onboard: false, backend: "dev", standby: false, knownFailures: { … } } })`.

Playwright's own `page` opens the run's dashboard on the database the previous test left. A test that needs a fresh database uses `dms` or `adminPage`.

## Journey fields for the suite

- `tag`: Playwright tags, such as `@smoke`.
- `knownFailures`: the name of each check that fails today, mapped to the finding that makes it fail. A listed check that fails does not fail the journey. A listed check that passes does.
- `last: true`: runs the journey after all others, for a journey that changes the run's playground for later backends.
- `frontend: "dev"`: the journey needs the development dashboard, for UI that only `import.meta.env.DEV` renders. `dms-control journey` refuses it on a run started without `--dev-frontend`.
- `database`, `onboard`, `backend` and `standby`: how the run is prepared for the journey, as `dmsOptions` does for a spec.

## Start a run from node:test

`@antelopejs/dms/e2e/run` starts the same run as the global setup, for a test runner without Playwright. It loads no `@playwright/test`. `startRun` takes the options of `e2eConfig` plus `prepare`, which runs the config's `prepare` commands unless `DMS_E2E_PREBUILT=1`. It returns the ready `run` and `stop`, which stops every process the run started. `onboard(run, {})` creates and signs in the administrator, and `apiRequest(run, { method, path, body, as })` calls the backend as `admin`, another account of `run.accounts`, or `anon`. Each request and its answer go to the run's `evidence/` folder.

`test/cli.test.mjs`:

```js
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { apiRequest, onboard, startRun } from "@antelopejs/dms/e2e/run";

/** @type {Awaited<ReturnType<typeof startRun>>} */
let started;
before(async () => {
  started = await startRun();
  await onboard(started.run, {});
});
after(() => started?.stop());

test("the administrator reads the onboarding state", async () => {
  const answer = await apiRequest(started.run, {
    method: "GET",
    path: "/api/onboarding/informations",
    as: "admin",
  });
  assert.deepEqual(answer.body, { has_onboarded: true });
});
```

`run.apiUrl` and `run.webUrl` are the backend's and the dashboard's addresses, for a CLI or an HTTP client of the test's own.

## Environment

- `DMS_E2E_PREBUILT=1`: the global setup and `startRun` skip the config's `prepare` commands (install and build), for a checkout an earlier run prepared.
- `DMS_E2E_RUN=<run folder>`: the tests drive that run, such as one `dms-control up` started, and the suite stops nothing. A run whose dashboard is not served the way the suite asks is refused.
- `DMS_CONTROL_RUNS`: the folder the run folders go to.
- `DMS_CONTROL_NO_STANDBY=1`: each fresh database's backend starts when the test needs it, rather than one ahead.

## Port recipe

1. Pin `@antelopejs/dms` to the exact preview that `next` publishes (dist-tag `next`). A range such as `>=0.20.2 <0.21.0` does not match a prerelease. Add `@playwright/test` `~1.65.0` as a devDependency, on the line of the `playwright-core` that `@antelopejs/dms` resolves.
2. Add the three files above, an `e2e/tsconfig.json` (`allowJs`, `noEmit`, `nodenext`), and the script `"e2e": "playwright test -c e2e"`.
3. Move the skill's `journeys/` folder to `e2e/journeys/`, with the helpers it imports in subfolders or beside it in `e2e/`.
4. Give each journey that needs the development dashboard `frontend: "dev"`, and add `e2e/playwright.dev.config.ts` with `e2eConfig({ frontend: "dev" })`. Run it with `playwright test -c e2e/playwright.dev.config.ts`.
5. A journey that fails today because of a product finding gets `knownFailures`, never a skip. A journey that changes the run's playground for later backends gets `last: true`.
6. Tag `@smoke` on about 5 fast journeys, the `smoke` journey first, none that needs `backend: "watch"`, `withBaseBackend`, `standby: false` or `frontend: "dev"`.
7. Copy the `e2e` and `e2e-report` jobs of AntelopeJS/dms's `ci.yml` and the `e2e` line of its `ubuntu` gate. Nothing runs on a draft or the none tier. A pull request runs `--grep @smoke`. The merge queue, a manual run, a pull request labelled `ci:full` and the nightly schedule run the whole suite with `--shard=i/N --add-reporter=blob`, which keeps the config's reporters, with N chosen so that one shard stays under about 30 minutes, and `e2e-report` merges the shards' blob reports. A dev config runs in the same job, after the build config.

## Move off verify.config.ts

A suite that still reads `.agents/skills/verify-*/verify.config.ts`: copy its `playground`, `renderer`, `prepare` and `smoke` into `e2e/journeys.config.ts`, move its journeys to `e2e/journeys/` and a playground that lives in the skill folder to `e2e/`, and drop `skill` from `e2eConfig`.
