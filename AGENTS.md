# dms

## Layout

A pnpm workspace with two published packages. The root holds the tool configs, the CI workflows and nothing else.

| Path                          | What it is                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `packages/dms`                | `@antelopejs/dms`, the runtime module: sources, playground, skills, docs       |
| `packages/dms/frontend-vue`   | The Vue layer. ESLint and Prettier own it, not oxlint and oxfmt               |
| `packages/interface-dms`      | `@antelopejs/interface-dms`, the public contracts every module imports         |

Run a package script from its own directory: `pnpm --dir packages/dms <script>`.

## Tests

`pnpm run checks` runs only the interface tests. The backend and Vue suites run in their own CI jobs, so run the one your change touches:

- `pnpm --dir packages/dms test:unit` and `test:integration`. They boot the module against an in-memory MongoDB. See `packages/dms/TESTING.md`.
- `pnpm --dir packages/dms/frontend-vue test` and `typecheck`.

`pnpm --dir packages/dms knip:all` also reports unused files and exports. Expect findings: controllers, pages and crons are reached through decorators, and test helpers through the runner. Confirm each one before you remove it.

## The interface package

### Public and internal

Every built file is importable through the `./*` export. Moving or renaming a public file under `packages/interface-dms/src` is a breaking change. List it in the release notes.

An export is public when a module or the playground imports it, the docs or the skills show it, or a public signature names it. Everything else is internal:

- Put internals in an `internal/` folder next to the public code of their domain (`page/internal/`, `src/internal/`), and tag each one `/** @internal */`.
- A public file or barrel never re-exports from `internal/`. A barrel that needs an internal file's side effect imports it bare.
- Interface proxies (`InterfaceFunction`, `RegisteringProxy`) stay declared at their subpath, because `ImplementInterface` binds only the proxies that subpath exports.
- An internal symbol that a module already imports stays at its old path and name, tagged, until a breaking release.

Do not turn on `stripInternal`. The runtime compiles against the same declarations and implements much of what is internal.

### One copy per deployment

The interface package holds the registries (pages, hooks, permissions, blocks, data types, slots). Every module must resolve the same installed copy, or it registers into empty registries. Keep its dependency ranges wide enough to deduplicate, and never vendor it. `packages/dms` is the exception: it implements the interface, so it caps the range below the next minor.

The runtime receives a per-context view of interface values, not the values:

- Reference equality does not survive. Compare registrations on a field (see `stampPageRegistration`), and resolve a view through `RegistrationIdentity` before you use it as a key.
- `isDeepStrictEqual` refuses two views. Compare plain data.
- A call into the interface after the module context is gone throws `ERR_MODULE_CONTEXT_INVALIDATED`. Cancel timers and queued work on shutdown.

### Where code goes

- Inside a package, import by relative path. Across packages, import by public specifier (`@antelopejs/interface-dms/<subpath>`).
- Anything that writes to the database, touches the filesystem or sends mail stays in `packages/dms`. Expose it to modules as an `InterfaceFunction` the runtime implements. This keeps the interface free of the runtime's npm dependencies.
- In index files, use `export * from "./module"`.

## TypeScript

Each package extends the root `tsconfig.json`. It pairs `module: commonjs` with `moduleResolution: bundler`, which needs TypeScript 6 or later. Keep both:

- `bundler` is what oxlint's type-aware rules accept, and it needs no file extension on relative imports.
- `commonjs` compiles `await import()` to `require()`, which the runtime's directory-based interface loading needs.

Consumers must compile with `moduleResolution` set to `bundler`, `node16` or `nodenext`, because the packages publish their subpaths through `exports` only.

The docs tsconfig in `packages/interface-dms/docs` maps `@antelopejs/interface-dms/*` onto `src`, so the docs check needs no build.

## Orb

`.agents/setup` belongs to the guardrail pack. The playground's MongoDB install, build and module install live in `.agents/playground`, which the `dms-backend` service runs before it starts.

<!-- antelopejs-guardrails:start -->
<!-- Managed by @antelopejs/tooling-configs. `antelopejs-sync` rewrites everything between these markers; write repository-specific guidance outside them. -->

## Guardrails

Finish every change with `pnpm run checks`. It runs typecheck, lint, format, knip, tests, size, ratchet, suppressions, and sync, and prints only what failed. The change is done when it prints no failure.

Prove a change works with the verification skill in [`.agents/skills/verify-dms/SKILL.md`](.agents/skills/verify-dms/SKILL.md) before you call it done.

The tools enforce most rules, listed in the table at the end. The sections below hold the rules no tool checks.

### Comments

Say it in code. A constraint belongs in a type, a lint rule, or a test. A public item's contract belongs in TSDoc (`/** */`) on that item. The only other comments are lint directives that name their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, `/*!` license headers, and bundler or formatter directives.

Before suppressing a type rule, try inference or a type derived from its owner with `Parameters`, `ReturnType`, or indexed access. A private alias can still appear in a published declaration. Keep a suppression only after checking the published contract and the unchecked boundary it protects.

Check each directive reason against the current line and its callers. Returning a value is not the same as awaiting and discarding it. A reason must describe what the code does now.

### Tests

Hold every test you write or keep to this checklist:

- Name the wrong implementation this test fails on. A test with no answer is deleted, not kept.
- No test reads the file it tests. Drive the behaviour through the public interface.
- An invariant over many files is a lint rule, not a test.

### Cleanup proof

A behaviour-preserving cleanup PR shows `antelopejs-api-diff <base-ref>` passing. Published declarations, built runtime exports and the names and signatures a DMS frontend module auto-imports stay unchanged; pass `--allow-added <glob>` (repeatable, e.g. `'**/internal/**'`) to let added entries under that glob pass when their module is `@internal`, and copy its "Added (allowed)" list. Every export under a directory that `dms.frontend.build.ts` auto-imports is published, `@internal` or not; a helper that must stay private goes under `app/build/`. A comment-only PR shows `antelopejs-comment-proof <base-ref>` passing instead of a verifier. Both compare committed HEAD.

Copy the proof's whole output into the PR body, down to its closing `<!-- antelopejs-proof ... -->` line, which stamps the command, base, committed head and a digest. Never type counts by hand. List the lint findings a PR leaves in place by pasting the block `antelopejs-body-check --findings` prints and replacing each `<why>`. `antelopejs-body-check <body.md>` fails an edited or stale proof block, proof output outside one, and a findings line that is not a live diagnostic at HEAD; counts in prose are not checked, so leave them out. The table counts a lint directive once per rule it names, inline directives included.

Pass `--probe <file.cjs>` to api-diff when changing receivers, positional calls, or modules that no published entry reaches. The same captured script runs against both worktree roots, supplied as `argv[2]`, and prints JSON observations. Matching metadata alone does not prove those behaviours.

An entry-only rule exempts only its own module. Add a second module entry rather than exempting another importer. A no-upward rule must reject peers in the same tier as well as higher tiers. Probe the rank decision with an import, not just a reading of the configuration.

Moving a method body into a function keeps how it is called: the same receiver, argument count, read order and laziness.

Verify a boundary against the imports a developer or agent would plausibly write: static and dynamic imports, re-exports, Vue `src`, CSS `@import`, and worker or child-process entries in normally named files. A construction only an evasion would write, an edit to resolution configuration (`package.json` `browser`, `exports`, `main` or `imports`, bundler aliases, tsconfig `paths`), and a difference observable only by patching private fields or internal methods go under Attention and never block. Public API and ordinary subclass behaviour stay part of the contract.

### Suppression budget

`guardrails.suppressions.json` caps the suppressions in authored code: lint directives per rule they name (`*` for none), `@ts-expect-error`, `@ts-ignore` and `SAFETY:` comments, and under `config` each rule a lint config (`oxlint.config.*`, `.oxlintrc.json`, `eslint.config.*`) switches off or to a warning, keyed by rule and `files` glob anchored at the config's directory, so widening or moving a scope is a new ceiling of 0, while narrowing one takes over the room it gives up. Switching a rule off in a config is a suppression too: fix the code its rule reports instead. A suppression over its ceiling fails: fix the code, or remove another suppression of the same kind. A rule that keeps needing suppressions should be changed in the preset. Never raise or remove a number in that file: the check fails a ceiling higher than on the pull request base, and only the operator approves a raise. A directive disabling `anti-slop/require-safety-comment-for-type-assertion` is burn-down debt: remove the assertion, or, where it holds, replace the directive with `SAFETY: <why it holds>`, which takes over its room without a raise. After you remove suppressions, run `pnpm run suppressions:update` and commit the lowered file.

### Debt

`guardrails.ratchet.json` records the lint findings and oversize files this repository already had. Its numbers only go down. After you remove debt, or after a pack upgrade, run `pnpm run ratchet:update` and commit the file: it lowers the numbers and adds only the rules the new pack release enabled, at today's count. Never edit the numbers by hand; CI fails one added or raised against the base. A rule listed there is off for `oxlint`. The ratchet counts it instead, and the pre-commit hook rejects it on every line you add.

### What enforces what

| Rule                                                                           | Enforced by                                         |
| ------------------------------------------------------------------------------ | --------------------------------------------------- |
| Formatting                                                                     | oxfmt                                               |
| Lint findings are errors; no rule warns                                        | oxlint preset                                       |
| Comments are TSDoc, directives, or `SAFETY:` only                              | `antelopejs/no-comments`                            |
| Every test asserts                                                             | `antelopejs/require-assertion`                      |
| Tests read no files outside fixtures, helpers, locales                         | `antelopejs/no-fs-read-in-tests`                    |
| Tests import the code under test from local source, not their own package name | `antelopejs/no-self-import-in-tests`                |
| No assertion that restates a constant                                          | `antelopejs/no-constant-value-assertion`            |
| No test whose only check is "is a function"                                    | `antelopejs/no-typeof-function-only-test`           |
| String-keyed object tables are read through own keys only                      | `antelopejs/no-inherited-key-lookup`                |
| A type guard checks each member it narrows to; keys with `Object.hasOwn`       | `antelopejs/no-presence-only-type-guard`            |
| A type guard checks the nested elements and values it claims                   | review; no tool                                     |
| Params ≤ 5, function ≤ 120 lines, file ≤ 500 lines, depth ≤ 4, complexity ≤ 20 | `eslint/max-*`, `eslint/complexity`                 |
| Cleanup preserves declarations, runtime exports and DMS auto-imports           | `antelopejs-api-diff <base-ref>`                    |
| Comment-only changes preserve JavaScript emit                                  | `antelopejs-comment-proof <base-ref>`               |
| PR-body proof tables are copied unedited from the current head                 | `antelopejs-body-check <body.md>`                   |
| PR-body findings-left lines are live diagnostics at HEAD                       | `antelopejs-body-check <body.md>`                   |
| Receiver, positional and unpublished-module behaviour                          | `antelopejs-api-diff <base-ref> --probe <file.cjs>` |
| Directive and `SAFETY:` reasons are true of the code                           | review; no tool                                     |
| Evasion-only and patched-internal findings go under Attention                  | review; no tool                                     |
| No-upward rules reject same-tier peers                                         | review and import probes                            |
| No `@ts-ignore`                                                                | `typescript/ban-ts-comment`                         |
| No once-used type parameter standing in for `unknown`                          | `typescript/no-unnecessary-type-parameters`         |
| No `any` passed, assigned or returned where a type is declared                 | `typescript/no-unsafe-{argument,assignment,return}` |
| Files ≤ 20,000 bytes, tests included                                           | `antelopejs-check-size` (pre-commit)                |
| Suppressions stay within `guardrails.suppressions.json`                        | `antelopejs-suppressions` (pre-commit, checks)      |
| No lint config switches off a rule to stay under the budget                    | `antelopejs-suppressions` (pre-commit, checks)      |
| No added directive disables the `SAFETY:`, comment or test rules               | `antelopejs-suppressions` (pre-commit, checks)      |
| An added suppression gives a specific reason                                   | `antelopejs-suppressions` (pre-commit, checks)      |
| A directive in a file a change touches suppresses something and gives a reason | `antelopejs-suppressions` (pre-commit, checks)      |
| A block disable is closed in its file                                          | `antelopejs-suppressions` (pre-commit, checks)      |
| Types check                                                                    | `tsc` (pre-push)                                    |
| No dead files, exports, or dependencies                                        | knip                                                |
| Managed files match the pack                                                   | `antelopejs-sync --check`                           |
| A CI gate reads `needs.<id>` only of jobs in its `needs`                       | `antelopejs-sync --check`                           |
| Entry-only rules exempt no tracked outsider                                    | `antelopejs-sync --check`                           |
| A DMS layer's `build/backend-boundary.ts` is the pack's plugin                 | `antelopejs-sync --check`                           |
| A test names the wrong implementation it catches                               | review; no tool                                     |
| Existing debt only shrinks                                                     | `antelopejs-ratchet`                                |

<!-- antelopejs-guardrails:end -->
