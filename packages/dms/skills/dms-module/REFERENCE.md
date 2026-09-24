# dms-module — reference

Deep material for [SKILL.md](SKILL.md): the directory layout, the full `package.json` manifest,
defining the module's own interface, and the scaffolding checklist.

## Directory layout

One layout that works, not a requirement — mirror the module you copied rather than mixing shapes.
The **package name is free** (nothing in the framework or DMS keys on it); the official
first-party modules follow `dms-<name>` purely for discoverability.

```
<your-module>/                      # a workspace when the module owns an interface
  packages/
    <your-module>/
      src/
        index.ts                    # entry: construct/start/stop/destroy lifecycle
        db/                         # schema, models, tables (if it owns data)
        pages/                      # @RegisterPage classes + category.ts (see dms-pages)
        routes/                     # HTTP controllers feeding the components
        implementations/<name>/index.ts  # implementation of the module's own interface
      frontend-vue/                 # Vue module: dms.frontend.ts, app/, i18n/locales/
      package.json / tsconfig.json
    interface-<name>/               # the module's OWN interface, its own published package
      src/index.ts                  # (rare — many modules ship none)
      package.json / tsconfig.json
```

## The full `package.json` manifest

```jsonc
{
  "main": "dist/index.js", "types": "dist/index.d.ts",
  "antelopeJs": {
    "baseUrl": "dist",
    "implements": ["<your-interface-package>"]   // the interface THIS module provides (omit/[] if none)
  },
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./package.json": "./package.json"
  }
}
```

The runtime package exports its entry and nothing else. A consumer-facing API never becomes a
subpath of the runtime package — it goes in the companion interface package, which is what
`implements` names and what consumers depend on.

## Defining the module's own interface

Interface authoring (`InterfaceFunction`, `RegisteringProxy`, implementation shape) is pure
AntelopeJS — see the **antelopejs** plugin's author/consume skills. The DMS-specific parts:

- **Define** in a companion package, `packages/interface-<name>/src/`, **implement** at
  `src/implementations/<name>/index.ts` in the module, **wire** with `ImplementInterface` in
  `construct` (the lifecycle entry in [SKILL.md](SKILL.md)). Keep `/** @internal */` on the
  `internal` namespace — the convention marking the registration surface as non-consumer API.
- **Expose** each directory index as an explicit `exports` entry; consumers resolve it with
  `moduleResolution: bundler`, `node16` or `nodenext`. Consumers add the interface package to
  `dependencies` and `import { … } from "@antelopejs/interface-<name>"`.
- Anything consumer-facing lives in the interface package; never re-export internal modules —
  if a helper needs internal infrastructure, use the hook-setter indirection pattern the
  existing modules use rather than exposing the internals. Runtime behaviour stays in the
  module and reaches consumers as an `InterfaceFunction` the module implements, so the
  contract never drags the module's npm dependencies along.

## Scaffolding checklist

1. **Confirm the path and module id** — the short `id` in `RegisterModule` and pages'
   `module:` field (e.g. a `dms-cookbook` module would register id `cookbook`). Module pages are **owner-only** (see
   [SKILL.md](SKILL.md)): confirm an owner/admin area is wanted; end-user screens belong in a project.
2. **Pick the closest reference shape**: pages + routes, no data or own interface → `dms-lang`
   (`implements: []`); own data + interface published as `@antelopejs/interface-dms-database` → `dms-database`;
   own interface published as a standalone `interface-*` package → `dms-automation`.
3. **Scaffold the layout above**: `src/index.ts`, `src/pages/`, `src/routes/` (if it serves data),
   `packages/interface-<name>/` + `src/implementations/<name>/` (only if it exposes one),
   `frontend-vue/` (components registered from the root `dms.frontend.ts`), and the manifest
   (`antelopeJs` block, plus the interface package's `exports`).
4. **Wire the basics**: `RegisterModule({ id, title, icon, … })`, one `@RegisterPage()` page,
   the `AddFrontendModule` call. Add the `$dms_<name>.*` keys to **every** locale file under
   `frontend-vue/i18n/locales/`.
5. **Load and verify**: add the module to a consumer project's `antelope.config.ts` (the
   backend's `playground` is the reference consumer) as a `package`/`git`/local-path module,
   then **full-restart via dms-dev** — don't rely on hot reload. Keep the repo conventions
   (**dms**: pnpm only, `_id` rows, no `switch`/`case`, TSDoc-only comments).
