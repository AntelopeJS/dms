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

`pnpm run checks` builds `packages/dms` and runs its backend invariant checks (`pnpm --dir packages/dms check:backend`), then the interface tests. The backend and Vue suites run in their own CI jobs, so run the one your change touches:

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

CI runs `pnpm run checks` in full on every pull request and reports what failed. The commit hook formats and lints the staged files. Locally, run only the fast check for what you touched:

- `pnpm run typecheck` after you change types or signatures.
- `pnpm exec oxlint <files>` and `pnpm exec oxfmt <files>` on the files you changed.
- One test file, not the suite. In a module that tests with `ajs module test`: `pnpm run build`, then `pnpm exec ajs module test . -f dist/<path>.test.js`.

Prove a change works with the verification skill in [`.agents/skills/verify-dms/SKILL.md`](.agents/skills/verify-dms/SKILL.md) before you call it done.

### Comments

Say it in code: a constraint in a type, a lint rule or a test, a public item's contract in TSDoc. Other comments are lint directives naming their rules, `@ts-expect-error <reason>`, `SAFETY: <reason>` above a type assertion, and license or tool directives. A reason states what the code does now.

### Tests

Each test names the wrong implementation it fails on, or is deleted. Drive behaviour through the public interface. An invariant over many files is a lint rule.

### Review

No tool checks these:

- A type guard checks the nested elements and values it claims.
- A no-upward import rule rejects same-tier peers; probe it with an import.
- A finding only an evasion or a patched internal can trigger goes under Attention and never blocks.

### Suppressions

`guardrails.suppressions.json` caps lint directives, `@ts-expect-error`, `SAFETY:` comments and rules a lint config turns off. Over a cap, fix the code or remove another suppression of that kind; only the operator raises a number. After removing suppressions, run `pnpm run suppressions:update` and commit the file.

<!-- antelopejs-guardrails:end -->
