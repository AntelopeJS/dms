---
name: verify-dms
description: "Drive the AntelopeJS DMS (@antelopejs/dms backend and its Vue dashboard) the way an administrator does, on an isolated playground with free ports, its own MongoDB database and a mail sink, and report a verdict with evidence. Use to prove a change to AntelopeJS/dms works before merge, or to verify a PR."
---

# Verify dms

Every deterministic step is a `dms-control` command. You choose which journeys to run and judge what they show; you never write a multi-step shell recipe. When a journey you need does not exist, add it to `journeys/<feature>.mjs`, describe it in its feature file, and run it.

`dms-control` is the bin of `@antelopejs/dms` (`packages/dms/bin/dms-control.mjs`). Run it from the repository root with Node 24. On Linux it tells each process it started from a later one given the same pid by the start time `/proc` records, so it needs the `/proc` of its own PID namespace: under `unshare --pid` without `--mount-proc` it refuses to start or stop any process. On a system with no `/proc` at all, such as macOS, it tells processes apart by pid alone, as it always did. `up` records its PID and time namespaces in `run.json`, and every other command on the run refuses, before it changes anything, when it runs in another one: run it where `up` ran.

```bash
C="node packages/dms/bin/dms-control.mjs"
$C                       # lists every command
```

## Launch

```bash
RUN=$($C up --prepare)   # installs, builds, starts; prints the run folder
```

`--prepare` first runs the `prepare` commands of `verify.config.ts` (the frozen install, the module build and the playground build); without it `up` uses the builds already there, and `doctor` fails on a stale one. `up` reads the playground from `verify.config.ts` and starts an isolated DMS:

- the checkout is laid out again under `$RUN/root`, every sibling linked, and the playground copied without `node_modules`, `.antelope` and `.dms-frontend`, so the run's build and `.antelope/` are its own;
- the API, the dashboard and the mail sink get free ports from the kernel, and `HOME` is `$RUN/home`;
- a `mongod` the run owns (from `PATH`, `DMS_CONTROL_MONGOD`, or the binary mongodb-memory-server-core caches), started as a single-node replica set so change streams work, serves `verify_<run>` databases; `--mongo-url` uses another server;
- the backend runs `ajs project start -e docs` on a port of its own, behind a forwarder that holds the API port, and the dashboard `ajs dms start -e docs -b <api>`; ready means `/api/onboarding/informations` and `/dms-preview` answer 200;
- fresh secrets, `DMS_CLIENT_BASE_URL` set to the dashboard and the `docs` mail pointed at the sink;
- the dashboard build (`ajs dms build`, most of `up`) comes from `$XDG_CACHE_HOME/dms-control/frontend/<key>` (default `~/.cache`) when an earlier run built the same inputs. `up` first sets up `.dms-frontend` as `ajs dms build` does (it copies each module's frontend, generates the registries and installs), then keys the build on what that workspace holds: its sources (the run's folder and web URL left out of the module registries and the CSS entry the setup generates), the `pnpm-lock.yaml` its install resolved, every `node_modules` above the workspace that a bare import can reach (its top-level packages, a package linked from outside pnpm's virtual store by its files and a package copied in with its own `node_modules`, and the `pnpm-lock.yaml`, `node_modules/.pnpm/lock.yaml` and the layout fields of `node_modules/.modules.yaml` of the install it belongs to; a `.modules.yaml` that is not the YAML pnpm 10 writes, a package copied into a linked package's `node_modules`, or a link inside a linked or copied package to a folder the key does not hash, is a miss that builds as `ajs dms build` does, stores nothing and says why), the playground copy's `.env` and `.env.local`, the dms-frontend that builds, Node, the environment, the `--env` pairs and inherited `VITE_*` and `NODE_ENV`, which `run.json` records as `bakedEnv` so `doctor` keys with them from any shell. A miss builds in that same workspace, so an edit made after the key was read never enters the build, and stores the build only when the workspace still reads as the key. A dms-frontend whose workspace step `up` cannot replace, or a build that refuses its prepared workspace, builds as `ajs dms build` does and stores nothing. Ports and secrets reach the dashboard at `ajs dms start`, so they are not in it. The cache keeps the five most recently used builds. `--no-build-cache` runs `ajs dms build` as it is, `run.json` records `frontendBuild` (`key`, `cached`, and `reason` when the cache was skipped or not filled), and `up` prints that reason on stderr.

`--base <ref>` (default `origin/main`) names the version the plan diffs against and the base-version journey starts. `--runs <dir>` (or `DMS_CONTROL_RUNS`) moves the runs out of the temporary folder. `--no-standby` (or `DMS_CONTROL_NO_STANDBY=1`) starts each fresh database's backend when it is needed instead of one ahead, for a host short of memory: about 160 MB less per run while journeys run, about 5 s more per journey.

## Serving a renderer checkout

`@antelopejs/dms-frontend` is the dashboard a run serves, and its repository (AntelopeJS/dms-frontend) has no playground or backend of its own. A skill living there drives the dms playground with its own checkout as the dashboard.

```bash
$C up --playground ~/code/dms/packages/dms/playground --renderer ~/code/dms-frontend
```

- `--renderer <dir>` is a checkout of `@antelopejs/dms-frontend` that is installed and built (`dist/index.js` exists). `up` refuses any other folder before it starts anything.
- After the playground copy is laid out, the run's `node_modules` is the playground's with one change: `@antelopejs/dms-frontend` is the checkout. `ajs dms build` and `ajs dms start` run from `<checkout>/dist/index.js`, and the checkout resolves its own dependencies from its own `node_modules`. The playground, its modules and its installed `dms-frontend` are not touched.
- The run records `renderer`. `headSha` and the HEAD that `doctor` and `verdict` compare are the renderer checkout's, since that is the code under test. `doctor` also fails a renderer `dist` older than its `src`, and `versions` prints the checkout's version.
- The base-version backend (`withBaseBackend`, used by the `auth/base-written-data-upgrade` journey) is the playground's repository at `--base`, which a renderer run does not verify, so it refuses to start with `--renderer`.

A skill in the renderer's repository names both in `verify.config.ts`, and `up` and `journey` need no flag:

```ts
const config: VerifyConfig = {
  playground: process.env.DMS_PLAYGROUND ?? `${process.env.HOME}/code/dms/packages/dms/playground`,
  renderer: ".",
  prepare: [["pnpm", "install", "--frozen-lockfile"], ["pnpm", "build"]],
};
```

- `playground` may be absolute. An external playground is built beforehand (`pnpm install` and the module and playground builds in its checkout); `prepare` runs in the skill's repository, the renderer's.
- `renderer` is relative to the skill's repository. `--playground` and `--renderer` on the command line win over the config.
- `doors <patch>` reads its patch in the skill's repository, so it needs no option.

## Doctor

```bash
$C doctor "$RUN"          # prints only failing checks; --verbose prints all
```

It checks that every recorded process is alive and holds its port, both servers answer, the API port forwards to the run's backend, the dashboard serves this run's API (`-b`), the module and playground builds are newer than their sources, the frontend build is of the current sources (a fresh copy of the playground keys as the build did; newer than `frontend-vue` when it has no key), the backend started after the last build of the module, the interface and the playground, the database is the run's, HEAD has not moved since `up`, and the admin session (once onboarded) is valid. Do not drive a run that fails doctor. While a build runs, one of those build folders can be missing: `doctor` then fails, and `reset` and each journey refuse to start until the build is done.

## Drive

```bash
$C plan                                  # the diff mapped to features; shared files; unmapped surfaces
$C plan --all                            # every feature, for a release
$C journey "$RUN" smoke
$C journey "$RUN" settings-members [journey-id...]
```

- `run` is the smoke feature and the features the diff touches. When the diff changes a shared file (the `shared` globs of `verify.config.ts`: package.json files, lockfiles, pnpm workspace files, the interface contract and the config), `run` is the smoke feature and then every feature, and `shared` lists the files that forced it. Before a release run `plan --all` and pass `--all` to `verdict` too, so the verdict requires every feature.
- Each feature file in [features/](features/README.md) lists its source globs (`covers:`), its docs pages (`docs:`) and its journeys; the journeys are in `journeys/<feature>.mjs`.
- A journey starts on an empty database of the run, served by a backend that has served nothing else, with the administrator onboarded, unless it says otherwise. It drives the dashboard by ARIA role and name through playwright-core, one browser context per account, and reads every mutation back through a second view: a reload, the API, another account's tab, the captured mail, or a backend restart.
- To look at the product yourself, use these commands, each a single step on the run's long-lived browser or API:

| Command | What it does |
|---|---|
| `$C onboard "$RUN"` | creates the run's administrator through `POST /api/onboarding/register`, then signs it in |
| `$C browser "$RUN" login` | signs the administrator in through the sign-in form |
| `$C browser "$RUN" goto --path <path>` | opens a dashboard path |
| `$C browser "$RUN" snapshot` | prints the page's ARIA tree |
| `$C browser "$RUN" click --role <role> --name <name>` | clicks the element with that role and accessible name (`--exact`, `--nth`, `--within-role`, `--within-name`) |
| `$C browser "$RUN" fill --role textbox --name <name> --value <text>` | types into a field |
| `$C browser "$RUN" press --key <key>` | presses a key, on a target when one is given |
| `$C browser "$RUN" screenshot` | prints the path of a screenshot (the other actions write one only when they fail) |
| `$C api "$RUN" <method> <path>` | an authenticated API call; `--as anon`, `--body '<json>'` |
| `$C mail "$RUN"` | the messages the sink captured |
| `$C reset "$RUN"` | moves the run onto an empty database and a backend that has served nothing |
| `$C timings "$RUN"` | prints how long each phase of the run took |

`--as <account>` and `--tab <name>` pick another account's browser context or another tab. Each command writes its evidence under `$RUN/evidence/`.

## Evidence

Everything goes under `$RUN/evidence/`:

- `<feature>/<journey>/NN-<step>/`: `action.json`, `url.txt` and `aria.yml` for a browser step; `request.json` and `response.json` for an API step; `mail.json` for a mail read; `checks.json` for every step that checks something;
- `screenshot.png` is written by a step that checks something (`ctx.verify`), once, of the tab the journey drove last and whatever the checks' outcome, and by a browser step that failed or that records the page on purpose (`tab.snapshot`, the `screenshot` action). A passing click, fill or navigation leaves no screenshot: its `aria.yml` is the evidence, and the next checking step shows the page. A checking step before any tab was driven has none;
- `network-changed.txt` in a `goto` or `reload` step whose page had not hydrated 15 s after it loaded while some of its requests failed with `net::ERR_NETWORK_CHANGED`: it lists those requests, and the step loaded the page once more. Every browser action waits until the page it leads to has hydrated, and every action but `goto` and `reload` also until the page it acts on has; signing in returns once the page it lands on has rendered its content;
- `<feature>/<journey>/result.json` and `<feature>/feature.json` (journeys merge, so a partial run keeps earlier results);
- `mail/NNN.eml` and `NNN.json` (recipients, subject, links, readable text) for every message the sink received;
- `browser/`, `api/`, `onboard/`, `auth/` for the interactive commands, and `doctor.json`;
- `timings.jsonl`: one JSON object per measured phase, appended by `up`, `journey`, `formal` and `browser` as they run: `{ "phase", "ms", "startedAt", "ok" }` plus `feature`, `journey`, `step`, `command`, `action` or `check` where they apply. `ok` is false when the phase threw, and for a `journey` entry when the journey failed. A `journey` that throws, from its browser launch on, still writes its entry. A `prepare` command that fails writes nothing: `up` has not created the run yet. `ok` says whether the phase completed, not whether a browser action or a check inside it passed. The phases are `prepare` (one per command of the config), `up` (the whole of it) with `layout`, `mongod`, `mail`, `project-build`, `frontend-build` (with `frontend-prepare` inside it, the workspace setup and install the build cache keys on; on a hit, `frontend-build` is that plus the restore), `backend-start` and `frontend-start` inside it, `journey` (one whole journey) with `browser-launch`, `fresh-database`, `onboard` and `journey-run` inside it, `backend-stop` (each time the run stops backends: those a fresh database or `reset` replaces, and a restart inside a journey), `backend-start` (each backend the run starts and waits for: the first inside `up`, a restart inside a journey, and a fresh database or `reset` with no standby to take), `standby-promote` (a fresh database or `reset` waiting for its standby to answer and checking the build; `ok` is false when the standby is not taken and a backend starts on the spot instead), `standby-start` (the launch of the next database's standby, which then boots in the background; not counted in `total`), `aria` (each browser step) and `screenshot` (each `screenshot.png` written: a checking step once a tab was driven, a failed browser step or sign-in, `tab.snapshot` and the `screenshot` action; a passing click, fill or navigation records none), both with `step` set to the folder under `evidence/`, `formal` (one per check) and `browser-command` (one interactive `browser` round trip).

`$C timings "$RUN"` reads `timings.jsonl` and prints one row per phase (each journey under its own name) with the count, the total in seconds, the median and the maximum in milliseconds, then `total`: the sum of `prepare`, `up`, the journeys and `formal`, the phases that contain the others. The verdict carries the same table in its `Timing` section, and its journeys table a `Time` column. A run from an earlier release has no `timings.jsonl`, and `timings` prints an empty table for it.

Read the evidence before you judge a PASS: a check passing proves only what it asserts.

## Cleanup

```bash
$C down "$RUN"
```

`down` stops every recorded process and its descendants, drops the run's `verify_<run>*` databases, and removes everything but `evidence/`, `logs/` and `run.json` (secrets and passwords removed). It prints the evidence folder.

## Verdict rules

1. **Run every feature whose `covers:` globs the diff touches, plus the smoke journey** (onboard → login → invite a member → reload). `plan` prints that list as `run`. A diff that changes a shared file runs every feature, and so does a release (`--all`); the verdict fails any journey of those features that did not run.
2. **Unmapped surface fails the verdict.** User-facing code is `packages/dms/src/**`, `packages/dms/frontend-vue/**` and `packages/interface-dms/src/**`, tests and tool configs excluded (`verify.config.ts`). A changed file there that no feature glob covers is an unmapped surface: the PR adds it to a feature with its journeys. `map` checks the whole tree, and CI runs it.
3. **Every registered journey of a feature in `run` must have run and passed.** A missing journey fails as "not run", so run whole features. Known findings stay as failing journeys (see the feature files' Gotchas): they fail a verdict only when `run` includes their feature, which a shared file or `--all` makes every feature.
4. **Docs.** Each touched feature lists its `docs:` pages. Judge every page against what the journeys showed. A page that no longer matches fails the verdict.
5. **Formal checks.** `verify.config.ts` lists each formal check with the files it covers and its own files. Run `$C formal "$RUN"` before the verdict: it runs the full configuration of every check whose covered files or own files the diff touches and records it under `evidence/formal/<name>/`. For each such check it also decides, without judgement, whether the diff changed what the covered code does:
   - `emit` compares the structure of the covered files' JavaScript on the base and on HEAD: node kinds, names and literal values, with types, comments, formatting, parentheses and export keywords left out. Each use of an imported binding stands for its origin (the resolved module and the imported name), so an import retargeted to another module or alias counts as changed; a function declaration of a covered module is its name alone, and any other binding of a covered module is keyed by module and name. A function declaration refers to the top-level variables and classes of its own file by file and name, so moving it next to a different variable of the same name counts as changed. Exports are keyed by the origin they export, so a re-export or an export alias retargeted counts as changed. Each file must keep its top-level statements and side-effect imports in order; function declarations, which are hoisted, may move between covered files with their imports. So a type-only edit, a reformat or moving a function declaration counts as unchanged, while reordering statements or moving any other statement counts as changed. `emit` judges behaviour, not the public surface: exports are the api-diff's job;
   - `probe` runs the check's probe on a checkout of each and compares its output (release-range runs the release workflow's `validate` step on fixture manifests; a crash prints the error's name).

   Then:
   - a covered check that did not run, or exits non-zero (a tool error, or a check that no longer matches its record), fails the verdict;
   - recorded findings fail the verdict only when the covered behaviour changed; when it did not, the verdict reports them as known findings;
   - when the covered behaviour changed, or the diff changed the check's own files, `formal` also runs the check on the base. A rule the base broke counts as fixed only when HEAD reports it passing; a rule the base broke that HEAD does not report at all fails the verdict. A fix that leaves no violated rule passes.

   `--all` runs the checks that do not cover the diff too, without gating.
6. **One-way doors.** The section comes right after the result line and is mandatory; a verdict without it is void. It holds `None` with a reason, or one row per door: kind, location, what cannot be undone, containment. `$C doors` prints the `One-way-door:` line for the diff from the path rules in `verify.config.ts`. Every file they flag needs a row, or a `falsePositives` entry saying why it is not a door.
7. **Result.** FAIL if any of rules 1 to 6 fail. PASS+NOTES when something is not verified or needs the owner's attention. PASS otherwise.

Write your judgement to `$RUN/evidence/judgement.json`:

```json
{
  "doors": {
    "none": "the diff changes only the verification skill",
    "rows": [],
    "falsePositives": [{ "kind": "contract", "location": "packages/dms/package.json", "reason": "only a devDependency changed" }]
  },
  "docs": [{ "page": "packages/dms/docs/03.auth-and-tenancy/01.authentication.md", "matches": true, "note": "" }],
  "notVerified": ["What no journey reached, and why"],
  "attention": ["What the owner should look at that the skill cannot judge"],
  "verifier": "the fresh verifier thread's URL; it did not write the change"
}
```

A door row is `{ "kind", "location", "irreversible", "containment" }`, where `kind` is a `doors` key of `verify.config.ts`. `verifier` is required.

Then render the verdict:

```bash
$C verdict "$RUN" --pr <n>      # writes evidence/verdict.md; exit 1 on FAIL
```

- `verdict` computes the result from `feature.json`, the plan, the formal results and the judgement, in the shape of the outer-loop sample verdict.
- A new push voids the verdict: verify again on the new head.
- Report the verdict and what the verifier saw in your own reply. Nothing is posted to GitHub.

Give a verdict only from a thread that did not write the change, and name it in `verifier`.

## Trust

The skill is not Trusted yet. It becomes Trusted when it passes a shadow run of 10 consecutive agent PRs, and its last maintain pass (`maintain-verification-skill`, run by the gardener) is newer than the last change to the repository or its `@antelopejs` dependencies and at most 30 days old. The verdict header says `not trusted yet` until then.

## Gotchas

- The `docs` environment is the one `dms-control` runs: logs at `warn`, mail to the run's sink. Ethereal and real SMTP are never reached.
- Until the playground declares its frontend (dms#441), the playground's own translations are missing from the run's dashboard, so some headings show their keys. Journeys target labels that are not playground keys.
- The base-version journey builds the base ref once per commit under `~/.cache/dms-control/base/<sha>`, a git worktree of this checkout; the first run takes a few minutes.
- The module store reads its catalog from the npm registry; `up` installs the playground's package modules from it too.
- Each journey gets a backend process that has served nothing else, on a fresh database: in-memory state (rate limits, the playground's tenant gate) starts empty. While a journey runs, the next journey's backend starts on the next database, so the swap between journeys takes a fraction of a second; the old backend is killed and its database dropped. A backend started before the last build (the module's or the interface's `dist`, the playground's) is never used: the next fresh database starts one from the new build, and `doctor` fails until then.
- `up` and the frontend build install from the npm registry. A package published minutes earlier can answer 404 until the registry propagates it; `up` then fails on its `frontend-build` or `project-build` log. Run `up` again a few minutes later.
- Writing a journey: a check (`tab.visible`, `tab.shows`, `tab.at`, `ctx.equal`…) only counts inside `ctx.verify`. Uppercase styling changes `innerText`, so match such text case-insensitively. `ctx.api` signs the account in again on a 401; pass `token` to observe a refused token. The raw Playwright page is `tab.page`, for popups, downloads and visually hidden inputs. `ctx.stopDatabase()` stops the run's mongod, for a database-down state, and kills the next database's standby so none that booted without a database is reused. `ctx.startDatabase()` starts it again at the same URL with the same data. It resolves once mongod listens, before the backend has reconnected, so wait for the recovered state with a check that polls. A journey that ends with mongod stopped has it started again. Both refuse a `--mongo-url` run.

## Component probes

`antelopejs-api-diff <base-ref> --probe <file.cjs>` captures one file, so the `interface-dms` component coverage in `.agents/probes/` is four standalone scripts. Pass the ones whose keys your change reaches, one api-diff run each.

| Probe | Keys it prints |
|---|---|
| `interface-components-builder.cjs` | `sync`, `serialized`, `filtered`, `shadowedCall`, `ownKeys`, `positional`, `permission`, `uploadConstraintReads`, `defaultTypesFresh`, `dataTypesAndHints` |
| `interface-components-routes.cjs` | `routes`, `factoryHelpers`, `metadata`, `lifecycle` |
| `interface-components-read-order.cjs` | `typeBoundaries`, `pageInfoPrecedence`, `extractedPageCalls`, `evaluationOrder` |
| `interface-components-owner-order.cjs` | `ownerAccessorOrder`, `publicWatchFilterOrder`, `publicPageScheduling` |

## Feature map

[features/README.md](features/README.md).
