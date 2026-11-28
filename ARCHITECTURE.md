# Architecture

What the dms workspace is made of, where each piece lives, the flows a change usually crosses, and the invariants the checks hold. Reference only. The user-facing explanation is `packages/dms/docs/01.getting-started/05.architecture.md`; the conventions are in [AGENTS.md](AGENTS.md).

## Runtime pieces

A pnpm workspace (`pnpm-workspace.yaml`) with three published packages and two private ones.

| Piece                              | What it is                                                                                                                                                     | Where                                                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `@antelopejs/interface-dms`        | The public contracts every module imports: pages, blocks, hooks, permissions, tenancy, the core and tenant tables                                              | `packages/interface-dms/src/`, subpaths through its `./*` export                                                            |
| `@antelopejs/interface-dms-builder` | The builder contract, a standalone interface                                                                                                                  | `packages/interface-dms-builder/src/`                                                                                      |
| `@antelopejs/dms`                  | The runtime module. It implements both interfaces, registers the built-in pages and routes, serves the frontend manifest and the MCP server                     | `packages/dms/src/index.ts`, `antelopeJs.implements` in `packages/dms/package.json`                                         |
| Vue layer                          | `@antelopejs/dms-frontend-vue`, five ranked layers served by the `@antelopejs/dms-frontend` loader (`ajs dms dev|build|start`)                                | `packages/dms/frontend-vue/dms.frontend.ts` (browser), `dms.server.ts` (proxies and auth routes), `layers/`                |
| Frontend registration              | `frontendModule()` names the layer and its options; the backend calls it through `AddFrontendModule`, the loader through `dmsFrontend` in `package.json`        | `packages/dms/src/frontend-module.ts`                                                                                      |
| Playground                         | The dev and e2e project: a host `antelope.config.ts` mounting dms, with its own module and Vue layer                                                            | `packages/dms/playground/`                                                                                                 |
| e2e kit                            | The published Playwright kit behind `@antelopejs/dms/e2e`, which dms and its consumers run their journeys on                                                   | `packages/dms/e2e/`, `packages/dms/E2E.md`                                                                                 |
| Schemas                            | The core schema `dms-core` and the tenant schema `dms-tenant`; a workspace is one instance of the tenant schema                                                 | `packages/interface-dms/src/constants.ts`, `packages/interface-dms/src/tenant-provisioning.ts`                              |

Lifecycle (`packages/dms/src/index.ts`): `construct(config)` applies the config, registers the frontend bootstrap and the hook handlers, implements every interface subpath (`implementInterfaces`), starts the builder (`src/builder.ts`), registers the Vue layer and the MCP server. `start()` allows the client origin, configures realtime, registers both schemas, provisions the default tenant, settles `Hook.DATABASE_INITIALIZED`, then starts the crons, the automation nodes and the module-update watcher. `stop()` undoes it in reverse. Pages and routes register as import side effects (`import "./pages"`, `import "./routes"`).

## Directory map

`.dependency-cruiser.cjs` and the area files under `.dependency-cruiser/` rank the folders. A folder imports only folders of a lower tier, through their `index.ts` or the listed faces; an unranked backend folder fails `pnpm run deps`.

Root:

- `packages/`: the packages below.
- `checks/`: the CI planner, the gate, the test runner and the oxlint plugin (`affected-packages.mjs`, `ci-gate.mjs`, `run-tests.mjs`, `oxlint-plugin.mjs`). Not runtime code.
- `e2e/`: this repository's Playwright suite (`playwright.config.ts`, `zz-journeys.spec.ts`, `journeys/*.mjs`, `INVENTORY.md`).
- `.agents/`: the skills (`verify-dms`, the `formal-*` checks, `technical-writing`, `unslop`), `.agents/formal/`, `.agents/setup`, `cleanup-mistakes.md`. `.claude/skills/*` link to them.
- `docs/`: `captures.ts` and `media/` only. The prose lives in `packages/*/docs`.

`packages/dms/src/`, top tier first (`.dependency-cruiser/backend.cjs`):

| Folder             | What lives there                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `mcp/`             | The MCP server and its tools                                                                                 |
| `routes/`          | HTTP controllers: auth, oauth, onboarding, files, realtime, store, block preview, system state               |
| `dev/`             | The module-update watcher                                                                                    |
| `page-extensions/` | The pending-extension report                                                                                 |
| `mockup/`          | The mockup engine and `sketch`                                                                               |
| `pages/`           | The built-in pages: settings, modules, account, members, permissions, the public auth and onboarding pages    |
| `implementations/` | One folder per interface subpath: `dms/`, `dms-auth/`, `dms-base/`, `dms-builder/`, `dms-html-render/`, `dms-notifications/` |
| `store/`           | The module store, the frontend manifest and bootstrap (`store/frontend.ts`)                                  |
| `attachments/`, `realtime/`, `automation/`, `crons/`, `hooks/` | Attachments, the SSE and Redis brokers, automation nodes, crons, hook handlers    |
| `db/`              | The tables and models dms owns (`db/tables/*.table.ts`)                                                      |
| `validation/`, `utils/` | Zod schemas and shared helpers                                                                          |
| `config/`          | The runtime config and the startup config                                                                    |
| `types/`           | Shared types                                                                                                 |
| `test/`            | The harness `antelope.test.ts`, helpers, `unit/`, `integration/`, `formal/` and the test-host sources         |
| root files         | `index.ts` (lifecycle), `builder.ts`, `frontend-module.ts`                                                   |

Also under `packages/dms/`: `frontend-vue/` (below), `playground/`, `e2e/`, `scripts/` (build, check and docs scripts), `checks/` (`.d.mts` for the `./checks/*` exports; the code is in `frontend-vue/scripts`), `test-hosts/*/package.json` (manifests pointing at `dist/test/<host>`), `data/` (`mockup-spec.schema.json` is generated), `docs-data/` (`blocks.json` is generated), `docs/`, `skills/` (the shipped `dms`, `dms-auth`, `dms-module`, `dms-project`), `antelope-lock/`.

`packages/dms/frontend-vue/layers/`, ranked `dms-core` (0) < `dms-ui` (1) < `dms-layout` (2) < `dms-auth` (3) < `dms-onboarding` (4) (`.dependency-cruiser/frontend.cjs`). Each layer has `app/{components,composables,entries,build,plugins,...}`. `dms-layout` holds the catch-all page `app/pages/[...slug].vue` and `server/html-render.ts`; `dms-ui` holds the blocks and `RecursiveComponent.vue`. Root files: `dms.frontend.ts`, `dms.server.ts`, `dms.email.ts`, `dms.frontend.build.ts`, `build/backend-boundary.ts` (the pack's Vite plugin), `scripts/` (invariant checks, the eslint-globals generator), `tests/` (vitest). `eslint-globals.generated.*` are generated.

`packages/interface-dms/src/`: `page.ts` and `page/` (`RegisterPage`, `AddFrontendModule`, the registry), `base/` (block factories, `block-registry/`, `data-types/`, `table-view/`), `auth/`, `db/`, `hooks.ts`, `permissions.ts`, the tenant files, `notifications/`, `html-render/`, `internal/`.

## Flows

### Page render

1. A `@RegisterPage` class (`packages/interface-dms/src/page/controllers.ts`) registers into the page registry (`page/registry.ts`).
2. `GET /dms/sitelayout` gives each page's `layoutUrl` (`page/internal/metadata-info.ts`); the frontend's `usePageLayout` (`layers/dms-layout/app/composables/page/usePageLayout.ts`) loads it.
3. `[...slug].vue` maps each `componentName` through `resolveDmsComponent` (`layers/dms-ui/app/composables/resolveDmsComponent.ts`) and `RecursiveComponent.vue` renders the tree.
4. A block fetches its data under `/dms/pages/...`; `dms.server.ts` proxies `/api/**`, `/dms/**` and `/file-storage/**` to the backend, where the page controller (`packages/dms/src/implementations/dms/page/controller.ts`) reads the tenant-scoped model.

### Frontend bootstrap

`ajs dms dev|build|start` evaluates `antelope.config.ts`, calls each module's `dmsFrontend`, reads the manifest from `GET /dms/frontend` (`buildFrontendManifest`, `packages/dms/src/store/internal/frontend/frontend-modules.ts`), runs each module's `dms.frontend.ts` `setup(sdk)` and posts `POST /dms/frontend/ready`. Without `frontend.bootstrapSecret`, `construct()` warns that these endpoints are open.

### Types for lint and typecheck

`pnpm --dir packages/dms/playground types:prepare` runs `ajs dms prepare-types` into `packages/dms/playground/.frontend-vue-types`; the root `lint` runs it before oxlint. `frontend-vue`'s `typecheck:tests` writes `packages/dms/.frontend-vue-types` and runs `vue-tsc`. Both folders are ignored by git.

### Tenant provisioning

Signup or the default tenant (`packages/dms/src/utils/ensure-default-tenant.ts`) calls `ProvisionTenant` (`packages/interface-dms/src/tenant-provisioning.ts`), which creates the tenant-schema instance and runs the `Hook.TENANT_BEING_PROVISIONED` handlers. The TLA+ model is `.agents/skills/formal-default-tenant-provisioning/`.

## Tests

| Tier          | Where                                                            | Run                                                                                                                                                       |
| ------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend unit  | `packages/dms/src/test/unit`                                     | `pnpm --dir packages/dms test:unit` (`check:backend`, the `scripts/*.test.mjs`, then `ajs module test` without `builder/`)                                 |
| Builder       | `packages/dms/src/test/unit/builder`                             | `pnpm --dir packages/dms test:builder`, sharded in CI by `scripts/test-weights.json`                                                                        |
| Integration   | `packages/dms/src/test/integration`, harness `src/test/antelope.test.ts` | `pnpm --dir packages/dms test:integration`; one file: include `integration/setup.test.js` next to it (`packages/dms/TESTING.md`)                  |
| Interface     | `packages/interface-dms/tests`                                   | `pnpm --dir packages/interface-dms test` (`node --test`), plus `check:exports` and `check:proxies`                                                         |
| Frontend      | `packages/dms/frontend-vue/tests`                                | `pnpm --dir packages/dms/frontend-vue test` (vitest), `typecheck`, `typecheck:tests`                                                                       |
| Playground    | `packages/dms/playground`                                        | `pnpm --dir packages/dms/playground test`                                                                                                                 |
| e2e           | `e2e/journeys/*.mjs`                                             | `pnpm e2e`                                                                                                                                                |
| Root          | `checks/run-tests.mjs`                                           | `pnpm test` picks the steps by the affected packages; `pnpm run checks` is `antelopejs-checks`, after `checks:prepare` builds both interfaces              |

`.github/workflows/ci.yml` calls the shared `ci-node.yml` and adds `select` (the planner), `backend`, `frontend-test` (two shards), `frontend-verify`, `dependents`, `docs-playground`, `e2e`, `formal`, `formal-generated`, the `ubuntu` gate, `renovate-sync`, `module-locks` and `verdict`. `formal.yml`, `formal-generated.yml`, `docs-playground.yml`, `module-locks.yml` and `release.yml` run on their own triggers. Locally, scope to what you changed as [verify-dms](.agents/skills/verify-dms/SKILL.md) says: never a package's `test*` script, `DMS_PREBUILT` unset.

## Invariants

1. Build both interfaces before `packages/dms` reads their declarations; the `build` script and `checks:prepare` do. `DMS_PREBUILT=1` skips the rebuild and runs a stale `dist`.
2. A folder `.dependency-cruiser/backend.cjs` does not rank fails `pnpm run deps` (`backend-unranked-folder`); other folders import it through `index.ts` or a listed face, and only downward. The Vue layers import only lower-ranked layers.
3. `frontend-vue` never resolves a file under `packages/dms/src`: `build/backend-boundary.ts` fails the build and the dev server, and a depcruise rule fails `deps`.
4. Inside `packages/dms` nothing imports the package root (`../index`, `@antelopejs/dms`); inside `packages/interface-dms` nothing imports its root or the `base` barrel (`eslint/no-restricted-imports` in `oxlint.config.ts`). Both create evaluation cycles for a consumer entering through a subpath.
5. Every module resolves one installed copy of `@antelopejs/interface-dms`, or it registers into empty registries. Interface values arrive as per-context views: compare on a field, never by reference, and cancel timers on shutdown (`ERR_MODULE_CONTEXT_INVALIDATED`). AGENTS.md, The interface package.
6. Anything that writes to the database, touches the filesystem or sends mail stays in `packages/dms`, exposed as an `InterfaceFunction`. Moving or renaming a public file under `packages/interface-dms/src` is a breaking change; internals live in `internal/` and carry `/** @internal */`.
7. Generated files are regenerated, never edited: `packages/dms/docs-data/blocks.json` (`docs:catalog`), `packages/dms/data/mockup-spec.schema.json` (`mockup:schema`), `frontend-vue/eslint-globals.generated.*` (`eslint-globals`), `guardrails.suppressions.json` (`suppressions:update`), both `antelope-lock/` folders (the nightly workflow and `module-locks-committed`). CI diffs the first two.
8. Tests seed over HTTP, not through test-side models, and never re-register a schema the module owns (`packages/dms/TESTING.md`): mocha and the runtime can resolve different copies of `interface-database`.
9. `jsonwebtoken.decode` is banned; claims come from `verifiedSessionClaims()` or the route guard. A stored `*` grant is read only by `GrantsEveryPermission` (`oxlint.config.ts`).
10. Run a package script from its own directory (`pnpm --dir packages/dms <script>`) and the CLI through `pnpm exec ajs`, never a global one.
