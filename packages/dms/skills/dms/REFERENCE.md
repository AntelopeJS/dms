# dms — reference

Deep material for [SKILL.md](SKILL.md): the map of the DMS's own documentation and the commands
to look up exact interface surfaces.

## The DMS's own documentation

List a section to see its files:

| Doc | Covers |
| --- | --- |
| `docs/01.getting-started/` | Intro, installation, quickstart, tutorial, **architecture**, the built-in dashboard |
| `docs/02.building/` | Project setup (**the common case**), every config key, pages & components, navigation, actions, backend services (hooks, notifications, realtime, replayable jobs, HTML/email rendering, export jobs), localization, frontend layer & `ajs dms` CLI, distributable modules, deployment, troubleshooting |
| `docs/03.auth-and-tenancy/` | Auth flows (JWT, 2FA, invites), decorators & RBAC, multi-tenant data, SaaS mode |
| `docs/04.components/` | Component catalog: charts/widgets, layout, forms, tables, tree, DataTypes, DataController, file storage |
| `docs/05.extending-the-dashboard/` | Dashboard chrome, theming, custom DataTypes (frontend side), table-view displays, component events, period filtering |
| `docs/06.frontend-composables/` | Composables a custom frontend module's Vue calls: auth'd requests, realtime, page context, UI toolkit |
| `docs/07.interfaces/` | The contract reference for `@antelopejs/interface-dms`, one folder per domain: `core`, `auth`, `base`, `notifications`, `html-render` |

## Exact interface surfaces: don't memorize, look them up

Everything the DMS exposes to a consumer ships in **one** package, `@antelopejs/interface-dms`,
split into subpaths: `/page`, `/component`, `/permissions`, `/guards`, `/db`, `/hooks`, `/realtime`,
`/quick-actions`, `/auth` (+ `/auth/db`), `/base` (+ `/base/form`, `/base/table-view`,
`/base/data-types`, `/base/types`, …), `/notifications`, `/html-render`. There is no separate
`dms-auth` or `dms-base` interface, and nothing is imported through the runtime package
`@antelopejs/dms`. Other modules follow the same shape: one `interface-<name>` package per module.

Three ways to read a contract:

1. **The resolver** — the **antelopejs** plugin's script, which fetches a published interface
   package from npm (honouring `.npmrc`) or reads a local checkout:

   ```bash
   node "<antelopejs-plugin>/scripts/resolve-interface.mjs" show @antelopejs/interface-dms
   node "<antelopejs-plugin>/scripts/resolve-interface.mjs" show <scope>/interface-<name>
   ```

2. **The prose reference** — `docs/07.interfaces/`, one folder per domain, with the whole subpath
   map in its `index.md`.

3. **The sources shipped with this skill** — this workspace carries the interface package; read
   `packages/interface-dms/src/<subpath>` (or the published package's `dist/<subpath>/*.d.ts`)
   directly for the exact signatures.
