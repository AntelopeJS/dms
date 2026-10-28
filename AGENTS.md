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

Finish every change with `pnpm run checks`. It runs typecheck, lint, format, knip, tests, size, and sync, and prints only what failed. The change is done when it prints no failure.

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

A behaviour-preserving cleanup PR shows `antelopejs-api-diff <base-ref>` passing. Published declarations and built runtime exports stay unchanged; pass `--allow-added <glob>` (repeatable, e.g. `'**/internal/**'`) to let added entries under that glob pass when their module is `@internal`, and copy its "Added (allowed)" list. A comment-only PR shows `antelopejs-comment-proof <base-ref>` passing instead of a verifier. Both compare committed HEAD.

Copy counts from the proof's base and HEAD table. Never type counts by hand. Keep the command and the committed head beside the copied output. Directive lines are not individual suppressed rules.

Pass `--probe <file.cjs>` to api-diff when changing receivers, positional calls, or modules that no published entry reaches. The same captured script runs against both worktree roots, supplied as `argv[2]`, and prints JSON observations. Matching metadata alone does not prove those behaviours.

An entry-only rule exempts only its own module. Add a second module entry rather than exempting another importer. A no-upward rule must reject peers in the same tier as well as higher tiers. Probe the rank decision with an import, not just a reading of the configuration.

### What enforces what

| Rule                                                                           | Enforced by                                         |
| ------------------------------------------------------------------------------ | --------------------------------------------------- |
| Formatting                                                                     | oxfmt                                               |
| Lint findings are errors; no rule warns                                        | oxlint preset                                       |
| Comments are TSDoc, directives, or `SAFETY:` only                              | `antelopejs/no-comments`                            |
| Every test asserts                                                             | `antelopejs/require-assertion`                      |
| Tests read no files outside fixtures, helpers, locales                         | `antelopejs/no-fs-read-in-tests`                    |
| No assertion that restates a constant                                          | `antelopejs/no-constant-value-assertion`            |
| No test whose only check is "is a function"                                    | `antelopejs/no-typeof-function-only-test`           |
| Params ≤ 5, function ≤ 120 lines, file ≤ 500 lines, depth ≤ 4, complexity ≤ 20 | `eslint/max-*`, `eslint/complexity`                 |
| Cleanup preserves declarations and built runtime export metadata               | `antelopejs-api-diff <base-ref>`                    |
| Comment-only changes preserve JavaScript emit                                  | `antelopejs-comment-proof <base-ref>`               |
| PR-body counts come from tracked code files                                    | api-diff and comment-proof tables                   |
| Receiver, positional and unpublished-module behaviour                          | `antelopejs-api-diff <base-ref> --probe <file.cjs>` |
| Type suppressions and directive reasons are justified                          | review; no tool                                     |
| No-upward rules reject same-tier peers                                         | review and import probes                            |
| Files ≤ 20,000 bytes, tests included                                           | `antelopejs-check-size` (pre-commit)                |
| Types check                                                                    | `tsc` (pre-push)                                    |
| No dead files, exports, or dependencies                                        | knip                                                |
| Managed files match the pack                                                   | `antelopejs-sync --check`                           |
| Entry-only rules exempt no tracked outsider                                    | `antelopejs-sync --check`                           |
| A test names the wrong implementation it catches                               | review; no tool                                     |

<!-- antelopejs-guardrails:end -->
