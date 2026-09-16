# dms — reference

Deep material for [SKILL.md](SKILL.md): the map of the DMS's own documentation and the commands
to look up exact interface surfaces.

## The DMS's own documentation

List a section to see its files:

| Doc | Covers |
| --- | --- |
| `docs/01.getting-started/` | Intro, installation, quickstart, tutorial, **architecture**, the built-in dashboard |
| `docs/02.building/` | Project setup (**the common case**), every config key, pages & components, navigation, actions, backend services (hooks, notifications, realtime, replayable jobs, HTML/email rendering, export jobs), localization, frontend layer & `ajs-dms` CLI, distributable modules, deployment, troubleshooting |
| `docs/03.auth-and-tenancy/` | Auth flows (JWT, 2FA, invites), decorators & RBAC, multi-tenant data, SaaS mode |
| `docs/04.components/` | Component catalog: charts/widgets, layout, forms, tables, tree, DataTypes, DataController, file storage |
| `docs/05.extending-the-dashboard/` | Dashboard chrome, theming, custom DataTypes (frontend side), table-view displays, component events, period filtering |
| `docs/06.frontend-composables/` | Composables a custom layer's Vue calls: auth'd requests, realtime, page context, UI toolkit |

## Exact interface surfaces: don't memorize, look them up

Three ways to read a contract, depending on how it ships:

1. **Host-package interfaces** — subpaths of this package (`interfaces/<group>`). Use the
   **antelopejs** plugin's resolver (fetches from npm, honouring `.npmrc`, or a local checkout):

   ```bash
   node "<antelopejs-plugin>/scripts/resolve-interface.mjs" show dms:base             # the surface
   node "<antelopejs-plugin>/scripts/resolve-interface.mjs" contract dms:base form    # a part's .d.ts
   ```

2. **Standalone interface packages** — a module's contract published as its own
   `interface-*` package. Resolve it by package name (or bare name):

   ```bash
   node "<antelopejs-plugin>/scripts/resolve-interface.mjs" show <scope>/interface-<name>
   ```

3. **The sources shipped with this skill** — this package carries its interface sources;
   read the interface package's `src/` directly.
