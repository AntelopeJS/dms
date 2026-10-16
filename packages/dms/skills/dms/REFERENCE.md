# dms — reference

Deep material for [SKILL.md](SKILL.md): the map of the DMS's own documentation and the commands to
look up exact interface surfaces.

## The DMS's own documentation

List a section to see its files:

| Doc | Covers |
| --- | --- |
| `docs/01.getting-started/` | Intro, installation, quickstart, tutorial, **architecture**, the built-in dashboard |
| `docs/02.building/` | Project setup (**the common case**), every config key, pages & components, navigation, actions, backend services, localization, frontend layer & `ajs dms` CLI, distributable modules, deployment, troubleshooting, settings pages |
| `docs/03.auth-and-tenancy/` | Auth flows (JWT, 2FA, invites), decorators & RBAC, multi-tenant data, SaaS mode |
| `docs/04.components/` | One page per block, grouped: `02.block-fundamentals.md` (nesting, data, composed texts, permissions), `03.layout-and-containers/`, `04.charts-and-widgets/` (+ `6.charts/`, one page per chart type), `05.display-blocks/`, `06.lists-and-settings/`, `07.forms/`, `08.tables/`, `09.custom-component.md`, then DataTypes, DataController, derived controller, file storage |
| `docs/05.extending-the-dashboard/` | Dashboard chrome, theming, custom DataTypes (frontend side), table-view displays, component events, period filtering |
| `docs/06.frontend-composables/` | Composables a custom frontend module's Vue calls: auth'd requests, realtime, page context, UI toolkit |
| `docs/07.interfaces/` | The contract reference for `@antelopejs/interface-dms`, one folder per domain: `core`, `auth`, `base`, `notifications`, `html-render` |
| `docs/08.ai-and-claude-code/` | The skill suite, installing it in Claude Code, dms-ai, best practices, design fidelity, the `/dms-preview` page, shipping a module skill |

## Exact interface surfaces: don't memorize, look them up

Everything the DMS exposes to a consumer ships in **one** package, `@antelopejs/interface-dms`,
split into subpaths: `/page`, `/component`, `/permissions`, `/guards`, `/db`, `/hooks`, `/realtime`,
`/quick-actions`, `/layout-banners`, `/auth` (+ `/auth/db`), `/base` (+ `/base/form`, `/base/table-view`,
`/base/data-types`, `/base/block-types`, `/base/types`, …), `/notifications`, `/html-render`.
Nothing is imported through the runtime package `@antelopejs/dms`. Other modules follow the same
shape: one `interface-<name>` package per module.

Three ways to read a contract:

1. **The resolver** — `npx -y github:AntelopeJS/agent-skills interface` (`/antelopejs:interface`
   when the **antelopejs** plugin is installed), which fetches a published interface package from
   npm (honouring `.npmrc`) or reads a local checkout:

   ```bash
   npx -y github:AntelopeJS/agent-skills interface show @antelopejs/interface-dms
   npx -y github:AntelopeJS/agent-skills interface show <scope>/interface-<name>
   ```

2. **The prose reference** — `docs/07.interfaces/`, one folder per domain, with the whole subpath
   map in its `index.md`.

3. **The sources** — in this workspace, `packages/interface-dms/src/<subpath>`; in an installed
   package, `dist/<subpath>/*.d.ts`. The block catalog (`ListBlockTypes()`) lists every block with
   its options schema.
