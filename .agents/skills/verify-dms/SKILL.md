---
name: verify-dms
description: How to check a change in the dms workspace (@antelopejs/dms, @antelopejs/interface-dms, @antelopejs/interface-dms-builder, the Vue layer, the e2e suite) before you push it, scoped to what you touched. The command for each kind of change, the tools, the services, the worker cap, and what CI and the merge queue run instead of you. Use after you edit code, tests, configs, workflows or docs here, before you commit or push.
---

# Verify a dms change

CI runs every suite on every pull request it selects, and the merge queue runs all of them on the merged result. You run only the check of what you changed, at most 4 test workers, from the repository root unless a row says otherwise.

## Setup

Once per checkout: Node from `.nvmrc`, pnpm from `packageManager` through corepack, then `pnpm install --frozen-lockfile`. The TLA+ formal checks also need Java 21 (temurin); without it, leave them to CI.

## What to run for your change

| You changed | Run |
| --- | --- |
| Any `.ts`, `.mjs` or `.js` file | `pnpm exec oxlint <files>` and `pnpm exec oxfmt --check <files>` |
| A `.vue` file or a file under `packages/dms/frontend-vue` | `cd packages/dms/frontend-vue && pnpm exec eslint <files>` (ESLint and Prettier own the Vue layer, not oxlint) |
| A type, a signature or an export of `packages/interface-dms` | `pnpm --dir packages/interface-dms typecheck` |
| A type, a signature or an export of `packages/dms` | `pnpm --dir packages/dms typecheck` |
| Behaviour under `packages/interface-dms/src` | `pnpm --dir packages/interface-dms build`, then `node --test --test-concurrency=4 packages/interface-dms/tests/<file>.test.mjs` |
| Backend behaviour under `packages/dms/src` (a unit test) | `pnpm --dir packages/dms build`, then `cd packages/dms && pnpm exec ajs module test . --timeout 30000 -f dist/test/unit/<path>.test.js` |
| An HTTP route or anything an integration test covers | The build above, then `cd packages/dms && pnpm exec ajs module test . --timeout 30000 -f dist/test/integration/setup.test.js -f dist/test/integration/<path>.test.js` (`setup.test.js` holds the readiness hook) |
| A Vue component, composable or page | `cd packages/dms/frontend-vue && pnpm exec vitest run tests/<file>.test.ts --maxWorkers=4` |
| A file a `formal-*` skill's coverage record lists | `node .agents/skills/<formal-skill>/check.mjs`; the TLA+ ones need Java 21 |
| `checks/*.mjs` (the CI selector and gate) | `node --test --test-concurrency=4 checks/<file>.test.mjs` |
| `.github/workflows/*.yml` | `pnpm run sync:check`. Sync writes `ci.yml`'s caller, `verdict`, runners, pins and concurrency: change `@antelopejs/tooling-configs` for those, never by hand |
| Docs under `packages/*/docs` or the docs catalog | `pnpm --dir packages/dms docs:catalog:check` |
| A lint directive, `@ts-expect-error` or `SAFETY:` comment | `pnpm run suppressions`; after removing one, `pnpm run suppressions:update` and commit `guardrails.suppressions.json` |

Never run a package's `test`, `test:unit`, `test:integration` or `test:builder` script, or the root `test`, `checks` or `e2e` script: each runs a whole suite. When a change touches several packages, run one row per package.

Leave `DMS_PREBUILT` unset locally: with it set, the tests run the stale `dist`.

## Services

None to start. The backend harness (`packages/dms/src/test/antelope.test.ts`) boots its own in-memory MongoDB replica set on ports the OS picks and downloads the MongoDB binary on its first run. The vitest and `node --test` files need nothing.

## Left to CI

Do not run these locally. Read their result on your pull request (`ci.yml`, plan from `checks/affected-packages.mjs`):

- `ci / checks`: the shared ci-node.yml (`pnpm run checks`, lint, typecheck, knip, size, docs, the `extra-commands` checks of the caller).
- `backend`: the unit and integration suites and the builder shards, Windows on the nightly tier.
- `frontend-test` and `frontend-verify`: the whole vitest suite in two shards, and `ajs dms verify-source` (the client, SSR and e-mail builds and vue-tsc).
- `e2e` and `e2e-report`: the Playwright suite of `e2e/`, `@smoke` on pull requests, nine shards in the merge queue. To reproduce one failing spec: `pnpm e2e e2e/<spec>.spec.ts --workers=1`.
- `formal` and `formal-generated`: every formal check the plan selects, their full configurations on the nightly run.
- `docs-playground` and `dependents`: the playground image in the queue and nightly, and the dependent DMS modules' typecheck nightly.
- `verdict` and `ubuntu`: the aggregators that fail when any job above failed.

When one fails, run the row of the table that reproduces it, fix it, and push.

## Done

Your change is checked when every row its diff touches passed. Name each command and its result in your reply or pull request, and the checks you left to CI. A row you could not run (no Java for a TLA+ check) says why.
