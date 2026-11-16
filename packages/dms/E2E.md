# The e2e kit

`@antelopejs/dms/e2e` runs the journeys of a repository's verify skill as a Playwright suite. Each journey runs through the same runner as `dms-control journey`, in Playwright's browser. The global setup of a config prepares the skill, starts one `dms-control up` run for the whole invocation, and stops it after the last test.

## Configure a suite

`e2e/playwright.config.ts`:

```ts
import { e2eConfig } from "@antelopejs/dms/e2e";

export default e2eConfig();
```

`e2e/journeys.spec.ts`:

```ts
import { registerJourneys } from "@antelopejs/dms/e2e";

await registerJourneys();
```

`e2eConfig` takes two options:

- `skill`: the verify skill folder, relative to the repository root. A repository with one `.agents/skills/verify-*` folder leaves it out. A repository with several names the one its suite runs, such as `e2eConfig({ skill: ".agents/skills/verify-dms-assistant" })`.
- `frontend: "dev"`: the run serves the dashboard with `ajs dms dev` (`up --dev-frontend`), and the suite runs only the journeys that set `frontend: "dev"`. A suite without it serves a build and leaves those journeys out. Its test output and report folders end in `-dev`.

`registerJourneys()` reads both from the config that loaded it.

## Journey fields for the suite

- `tag`: Playwright tags, such as `@smoke`.
- `knownFailures`: the name of each check that fails today, mapped to the finding that makes it fail. A listed check that fails does not fail the journey. A listed check that passes does.
- `last: true`: runs the journey after all others, for a journey that changes the run's playground for later backends.
- `frontend: "dev"`: the journey needs the development dashboard, for UI that only `import.meta.env.DEV` renders. `dms-control journey` refuses it on a run started without `--dev-frontend`.

## Port recipe

1. Pin `@antelopejs/dms` to the exact preview that `next` publishes (dist-tag `next`). A range such as `>=0.20.2 <0.21.0` does not match a prerelease. Add `@playwright/test` `~1.65.0` as a devDependency, on the line of the `playwright-core` that `@antelopejs/dms` resolves.
2. Add the two files above, an `e2e/tsconfig.json` (`allowJs`, `noEmit`, `nodenext`), and the script `"e2e": "playwright test -c e2e"`. A repository with several verify skills passes `skill` to `e2eConfig`.
3. Move the skill's `journeys/` folder and the helpers it imports to `e2e/`, and set `journeys: "e2e/journeys"` in `verify.config.ts`. `dms-control map` must exit 0.
4. Give each journey that needs the development dashboard `frontend: "dev"`, and add `e2e/playwright.dev.config.ts` with `e2eConfig({ frontend: "dev" })` (and the same `skill`). Run it with `playwright test -c e2e/playwright.dev.config.ts`.
5. A journey that fails today because of a product finding gets `knownFailures`, never a skip. A journey that changes the run's playground for later backends gets `last: true`.
6. Tag `@smoke` on about 5 fast journeys, the `smoke` journey first, none that needs `backend: "watch"`, `withBaseBackend`, `standby: false` or `frontend: "dev"`.
7. Copy the `e2e` and `e2e-report` jobs of AntelopeJS/dms's `ci.yml` and the `e2e` line of its `ubuntu` gate: nothing on a draft or the fast tier, `--grep @smoke` on the full tier, `--shard=i/N --reporter=blob` on the nightly tier, with N chosen so that one shard stays under about 30 minutes. A dev config runs in the same job, after the build config.
