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
directory in the interface package needs an entry there -- `pnpm --dir
packages/interface-dms check:exports` is the gate.

### The interface package is a singleton

`@antelopejs/interface-dms` is not a types-only package: the page, category and
extension registries, the permission tree, the hook registry, the data-type and
block registries and the component slot resolvers all live in it, and its
interface proxies are identified per loaded instance. Every module in a
deployment has to resolve **the same installed copy**, or it registers into
empty registries and nothing fires -- silently. `@antelopejs/core` checks this
before constructing modules and fails with `Incompatible interface package
resolution`, so the failure surfaces at startup. Keep its dependency ranges wide
enough to deduplicate, and never vendor it into a module.

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

## Code Conventions

### Critical Rules

| Rule | Description |
|------|-------------|
| English only | All code must be in English: variable names, function names, comments |
| PNPM only | Always use pnpm, never npm or yarn |
| NO NARRATING COMMENTS | Code must be self-documenting through clear naming. Never restate what the code does. TSDoc is required on public APIs, and short rationale comments are allowed where a choice is non-obvious — why this order, why this guard, why not the obvious alternative. If the comment would survive a rewrite of the lines below it, keep it; if it only paraphrases them, delete it |
| NO switch/case | Use objects, maps, or arrays instead |
| NO inline types | Define proper interfaces/types, never use anonymous types like `{a: string, b: number}` |
| Functions ≤ 40 lines | Split into subfunctions if longer |
| NO magic values | Extract to named constants |
| Generic over specific | Avoid case-by-case logic |
| 2 spaces | Use spaces, not tabs |
| Index re-exports | In index files, prefer `export * from './module'` over named re-exports |

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

Two tsconfigs, on purpose. `tsconfig.json` uses `bundler` resolution, which is what
oxlint's type-aware rules require — TypeScript 7 removed `moduleResolution: node`, and
tsgolint rejects a config that still uses it. It never emits, so `bundler` costs nothing
and, unlike `node16`, does not demand a file extension on every relative import.
`tsconfig.build.json` sets the module system back to CommonJS for emit only, so
`await import()` keeps compiling to `require()` and the runtime's directory-based
interface loading keeps working. Edit the first for type settings; the build one only
exists to pin the emit. Both packages follow the same pair.

`moduleResolution: node` does not read an `exports` map, which is why
`@antelopejs/interface-dms` also carries a `typesVersions` mapping and
`./dist/*` type aliases: a consumer compiling that way resolves our types
through `dist/...` and writes that form into the declarations it emits.

`pnpm lint` caps oxlint at today's exact count in each package -- **1** in
`packages/dms`, **8** in `packages/interface-dms`. It is a debt ceiling meant to
come down as the backlogs are resolved, not a budget to spend: raising it needs
the same justification as any other change.

Requires **Node ≥ 22.18** — oxlint reads a TypeScript config, which needs type stripping.

### Code Structure

- Prefer generic approaches over ad hoc processing
- Limit functions to 30-40 lines max
- Split into subfunctions for readability
- Reduce indentation with early returns
- Keep files concise and focused
- No code duplication (DRY)
- Separate logic from definitions

### Flow Management

Never use `switch/case` or `if param === 'XXX'` chains. Instead:

```typescript
// BAD
function getStatus(code: string) {
  switch (code) {
    case 'A': return 'Active';
    case 'I': return 'Inactive';
    default: return 'Unknown';
  }
}

// GOOD
const STATUS_MAP: Record<string, string> = {
  A: 'Active',
  I: 'Inactive',
};

function getStatus(code: string) {
  return STATUS_MAP[code] ?? 'Unknown';
}
```

Use array iterations with early returns:

```typescript
// BAD
function findUser(users: User[], id: string) {
  let result = null;
  for (const user of users) {
    if (user.id === id) {
      result = user;
      break;
    }
  }
  return result;
}

// GOOD
function findUser(users: User[], id: string) {
  return users.find(user => user.id === id) ?? null;
}
```

### Naming

- Names indicate role/content, not type
- Booleans: `isActive`, `shouldRefresh`, `mustValidate`
- Adapt clarity to scope (longer names for broader scope)

### Design Principles

- **DRY**: Don't Repeat Yourself
- **KISS**: Keep It Simple, Stupid
- **SOLID**: Single responsibility, Open/closed, Liskov substitution, Interface segregation, Dependency inversion
