# dms

## Repository layout

A pnpm workspace with two published packages. The root holds only the tooling
and the CI workflows.

| Path                     | What it is                                                      |
| ------------------------ | --------------------------------------------------------------- |
| `packages/dms`           | `@antelopejs/dms`, the runtime module: sources, Vue layer, playground, skills, docs |
| `packages/interface-dms` | `@antelopejs/interface-dms`, the public contracts every module imports |

The interface package owns its sources and builds to its own `dist`. The runtime
imports the contracts through `@antelopejs/interface-dms/...`, never through a
relative path, and nothing in the interface package imports the runtime. Node
does not fall back to a directory index inside an `exports` map, so a new
directory with an index in the interface package needs an entry there --
`pnpm --dir packages/interface-dms check:exports` is the gate. The `internal/`
folders have no index and are reached file by file through `./*`.

Every built file is importable through the `./*` export, as everywhere in
AntelopeJS, so a module may import any of them by its path. Moving or renaming
a public file under `packages/interface-dms/src` is therefore a breaking
change, like removing an export: keep paths stable, and list such a move in the
release notes. Moving an internal one is not.

What a module must not rely on is internal. An export is public when a module
or the playground imports it, the docs or the skills show it, or a public
signature names it; plumbing that only the runtime or the interface itself
calls is internal, and is classified in the commit that adds it.

- Internals live in an `internal/` folder next to the public code of their
  domain -- `page/internal/`, `base/table-view/internal/`, `src/internal/` for
  the root files -- so the import path says so, and each one also carries
  `/** @internal */`, which is what a module's editor shows.
- A public file keeps only public declarations, and a public file or barrel
  never re-exports anything from `internal/`. A barrel that needs an internal
  file's side effect (a block registration, a slot claim) imports it bare.
- A type a public signature names is public by definition, wherever it was
  declared.
- The interface proxies (`InterfaceFunction`, `RegisteringProxy`) are the
  exception: `ImplementInterface` attaches them by walking the exports of the
  subpath the runtime hands it, so they stay declared at that subpath, inside
  its `internal` namespace or tagged `@internal` at the top level. That
  namespace holds proxies only. A module-private proxy is never bound, and a
  call to it waits forever: `pnpm --dir packages/interface-dms check:proxies`
  is the gate.
- An internal symbol a module already reaches stays importable from its old
  path and name, tagged, until a breaking release removes it.

The interface publishes its TSDoc in its declarations, so the tag shows in a
module's editor, but it is not stripped: the runtime compiles against those
same declarations and implements or calls much of what is internal, and
`stripInternal` would break both its build and the published barrels.

### The interface package is a singleton

`@antelopejs/interface-dms` is not a types-only package: the page, category and
extension registries, the permission tree, the hook registry, the data-type and
block registries and the component slot resolvers all live in it, and its
interface proxies are identified per loaded instance. Every module in a
deployment has to resolve **the same installed copy**, or it registers into
empty registries and nothing fires -- silently. `@antelopejs/core` checks this
before constructing modules and fails with `Incompatible interface package
resolution`, so the failure surfaces at startup. Keep its dependency ranges wide
enough to deduplicate, and never vendor it into a module. The DMS module is the
one exception: it implements the interface, so `packages/dms` caps it below the
next minor (see the dependency range in `packages/dms/package.json`), and a breaking interface minor never reaches a
DMS that does not implement it. `release.yml` refuses any other shape.

Across that boundary the runtime receives a per-context *view* of the values the
interface hands it, not the values themselves. Reference equality does not
survive the round trip -- compare registrations on a field (see
`stampPageRegistration`), never with `===`, resolve a view back to the
registered object through `RegistrationIdentity` before using it as a key, and
compare structures on plain data (`isDeepStrictEqual` refuses two views holding
equal values) -- and a call made into the interface
after the module context is gone throws `ERR_MODULE_CONTEXT_INVALIDATED`, so
anything deferred (a timer, a queued task) has to be cancelled on shutdown or
tolerate that error.

Run the package scripts from their own directory (`pnpm --dir packages/dms ...`);
the root scripts delegate to them. The lint, format and TypeScript configs live
at the root; each package extends them and adds only what is its own -- its
ignore patterns, its restricted-import guards, its warning ceiling, and the
path-valued options (`rootDir`, `outDir`, `paths`) that cannot be shared.

### Import specifiers

Inside a package, import by relative path. Across packages, import by public
specifier: the runtime reaches the contracts through
`@antelopejs/interface-dms/<subpath>`, never through a relative path into the
other package, and never through the interface root barrel from a module that a
consumer can enter some other way.

Runtime behaviour belongs to the module, not the contract: anything that writes
to the database, touches the filesystem or sends mail stays in `packages/dms`
and reaches consumers as an `InterfaceFunction` the module implements. That is
what keeps the interface package free of the module's npm dependencies.

## Code conventions

- Write code, identifiers, and comments in English.
- Use pnpm for package management and repository scripts.
- Follow the repository's lint and formatting configuration.
- Prefer the smallest change that solves the task; generalize for an existing need.
- Keep functions focused. Extract helpers when they clarify a responsibility, not just to meet a line count.
- Use objects, maps, or arrays instead of `switch/case`.
- Use named interfaces or types instead of anonymous object types.
- Give non-obvious values named constants.
- Prefer early returns to deeply nested branches, and reuse existing logic rather than duplicating it.
- Name identifiers for their role; use boolean names such as `isActive` or `shouldRefresh`.
- In index files, prefer `export * from './module'` over named re-exports.

### Tooling

| Command | What it does |
|---------|--------------|
| `pnpm lint` | oxlint and oxfmt (config from `@antelopejs/tooling-configs`), ESLint and Prettier for the Vue frontend. Each package carries its own config and its own warning ceiling |
| `pnpm lint:fix` | the same, applying safe fixes |
| `pnpm format` | oxfmt over the module, Prettier over the Vue frontend |
| `pnpm knip` | unused dependencies — the CI gate, expected to pass |
| `pnpm knip:all` | also unused files and exports. **Expected to report findings**: controllers, pages and crons are reached through decorators rather than imports, and test helpers through the runner, so each one needs a human to confirm before removal |

oxlint fails on `correctness` and on the import guards. anti-slop, the complexity
ceilings and `import/no-cycle` report as warnings on purpose: each has a backlog behind
it that is being worked through in its own pass, and they become errors once clear. Do
not add code that adds to those backlogs.

One tsconfig per project, used by the editors, oxlint's type-aware pass and the build
alike. It pairs `module: commonjs` with `moduleResolution: bundler`, which needs
TypeScript 6 or later. `bundler` is what oxlint's type-aware rules require — TypeScript 7
removed `moduleResolution: node`, and tsgolint rejects a config that still uses it — and,
unlike `nodenext`, it does not demand a file extension on every relative import.
`commonjs` keeps `await import()` compiling to `require()`, so the runtime's
directory-based interface loading keeps working; `nodenext` would emit a real
`import()` there, which cannot load a directory. Both packages extend the root
`tsconfig.json`; the playground carries its own.

Consumers must compile with `moduleResolution: bundler`, `node16` or `nodenext`:
the packages publish their subpaths through `exports` only, which
`moduleResolution: node` does not read.

`pnpm lint` caps oxlint at today's exact count in each package -- **1** in
`packages/dms`, **8** in `packages/interface-dms`. It is a debt ceiling meant to
come down as the backlogs are resolved, not a budget to spend: raising it needs
the same justification as any other change.

Requires **Node ≥ 22.18** — oxlint reads a TypeScript config, which needs type stripping.

<!-- antelopejs-guardrails:start -->
<!-- Managed by @antelopejs/tooling-configs. `antelopejs-sync` rewrites everything between these markers; write repository-specific guidance outside them. -->

## Guardrails

Finish every change with `pnpm run checks`. It runs typecheck, lint, format, knip, tests, size, ratchet, and sync, and prints only what failed. The change is done when it prints no failure.

The tools enforce most rules, listed in the table at the end. The sections below hold the rules no tool checks.

### Comments

Say it in code. A constraint belongs in a type, a lint rule, or a test. A public item's contract belongs in TSDoc (`/** */`) on that item. The only other comments are lint directives that name their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, `/*!` license headers, and bundler or formatter directives.

### Tests

Hold every test you write or keep to this checklist:

- Name the wrong implementation this test fails on. A test with no answer is deleted, not kept.
- No test reads the file it tests. Drive the behaviour through the public interface.
- An invariant over many files is a lint rule, not a test.

### Debt

`guardrails.ratchet.json` records the lint findings and oversize files this repository already had. Its numbers only go down. After you remove debt, run `pnpm run ratchet:update` and commit the lowered file. A rule listed there is off for `oxlint`. The ratchet counts it instead, and the pre-commit hook rejects it on every line you add.

### What enforces what

| Rule                                                                           | Enforced by                               |
| ------------------------------------------------------------------------------ | ----------------------------------------- |
| Formatting                                                                     | oxfmt                                     |
| Lint findings are errors; no rule warns                                        | oxlint preset                             |
| Comments are TSDoc, directives, or `SAFETY:` only                              | `antelopejs/no-comments`                  |
| Every test asserts                                                             | `antelopejs/require-assertion`            |
| Tests read no files outside fixtures, helpers, locales                         | `antelopejs/no-fs-read-in-tests`          |
| No assertion that restates a constant                                          | `antelopejs/no-constant-value-assertion`  |
| No test whose only check is "is a function"                                    | `antelopejs/no-typeof-function-only-test` |
| Params ≤ 5, function ≤ 120 lines, file ≤ 500 lines, depth ≤ 4, complexity ≤ 20 | `eslint/max-*`, `eslint/complexity`       |
| Files ≤ 20,000 bytes, tests included                                           | `antelopejs-check-size` (pre-commit)      |
| Existing debt only shrinks                                                     | `antelopejs-ratchet`                      |
| Types check                                                                    | `tsc` (pre-push)                          |
| No dead files, exports, or dependencies                                        | knip                                      |
| Managed files match the pack                                                   | `antelopejs-sync --check`                 |
| A test names the wrong implementation it catches                               | review; no tool                           |

<!-- antelopejs-guardrails:end -->
