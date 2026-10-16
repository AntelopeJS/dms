<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./packages/dms/frontend-vue/layers/dms-layout/public/images/antelope-logo/dark.svg">
  <img alt="Antelope DMS" src="./packages/dms/frontend-vue/layers/dms-layout/public/images/antelope-logo/light.svg" height="72">
</picture>

# AntelopeJS DMS

<a href="https://www.npmjs.com/package/@antelopejs/dms"><img alt="npm" src="https://img.shields.io/npm/v/@antelopejs/dms?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/dms?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000"></a>
<a href="https://dms.antelopejs.com/docs"><img alt="Documentation" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000"></a>

**Admin dashboards for AntelopeJS, declared in TypeScript on the backend.**

[Documentation](https://dms.antelopejs.com/docs) · [Modules](https://dms.antelopejs.com/docs/modules) · [Frontend](https://dms.antelopejs.com/docs/frontend)

</div>

![A DMS dashboard: a period selector, KPI cards, a sales chart and ranked products](./packages/dms/docs/images/template-dashboard.png)

## What it does

- Declares pages as TypeScript classes: forms, tables, charts and layouts are blocks the shared Vue renderer draws, with no Vue to write for standard screens.
- Handles sign-in, members, roles and permissions down to each block, multi-tenancy and a SaaS mode.
- Manages data through data controllers and table views, with file uploads, notifications and realtime updates.
- Grows with installable modules: an AI assistant, a page builder, database and API consoles, automations, SaaS billing, translations, mailing, marketing analytics and a media library.
- Ships Claude Code skills (`dms`, `dms-best-practices`, `dms-pages`…) so coding agents build pages the way the DMS expects.

## Install

For a new application, start from the template in the quick start below. To add the DMS to an existing AntelopeJS project, add the module and the dashboard's frontend loader:

```bash
ajs project modules add @antelopejs/dms
pnpm add -D @antelopejs/dms-frontend
```

The DMS also needs an API module, a module implementing the database interface, and an authentication module: see [Installation](https://dms.antelopejs.com/docs/getting-started/installation).

## Quick start

Clone [template-dms-demo](https://github.com/AntelopeJS/template-dms-demo), which loads the DMS, its companions and a seeded demo application. It needs Node.js 22, pnpm and a MongoDB on `localhost:27017`.

```bash
git clone https://github.com/AntelopeJS/template-dms-demo.git my-app
cd my-app
pnpm install
pnpm --dir frontend-vue install
cat > .env <<EOF
DMS_API_BASE_URL=http://localhost:5010
DMS_SESSION_SECRET=$(openssl rand -hex 32)
EOF
pnpm exec ajs project modules install
pnpm dev            # backend on http://localhost:5010
pnpm frontend:dev   # dashboard on http://localhost:3001, in a second terminal
```

Open `http://localhost:3001` and create the first administrator. A page is a class whose static fields are blocks:

```ts
import { PageController, RegisterPage, pagesCategory } from "@antelopejs/interface-dms/page";
import { KpiCard } from "@antelopejs/interface-dms/base/kpi-card";

@RegisterPage()
export class SalesPage extends PageController("sales", {
  displayName: "Sales",
  icon: "i-ph-chart-line",
  category: pagesCategory,
}) {
  static revenue = KpiCard({ title: "Revenue", fetchUrl: "/api/sales/revenue" });
}
```

## Compatibility

| `@antelopejs/dms` | `@antelopejs/interface-dms` | `@antelopejs/dms-frontend` (renderer) |
| --- | --- | --- |
| 0.9 | 0.7 | `>=0.6.1 <0.7.0` |
| 0.8 | 0.6 | `>=0.5.2 <0.6.0` |

**Embedded / AdonisJS 6**: tested with `@antelopejs/core` 1.15.2, `@antelopejs/dms` 0.9.2 and `@antelopejs/dms-frontend` 0.6.1 in an AdonisJS 6 application (see [Run the DMS inside AdonisJS](https://dms.antelopejs.com/docs/getting-started/adonisjs)).

`@antelopejs/dms` 0.9.2 needs `@antelopejs/core` `>=1.15.2 <2` (its peer dependency). Every renderer release is listed in the frontend's [compatibility table](https://dms.antelopejs.com/docs/frontend/introduction#compatibility).

## Packages

| Package | Directory | Role |
| --- | --- | --- |
| [`@antelopejs/dms`](https://www.npmjs.com/package/@antelopejs/dms) | [`packages/dms`](./packages/dms) | The runtime module: pages, components, auth and tenancy, files, notifications, realtime. |
| [`@antelopejs/interface-dms`](https://www.npmjs.com/package/@antelopejs/interface-dms) | [`packages/interface-dms`](./packages/interface-dms) | The public contracts a module imports to extend the dashboard. |

The dashboard's frontend loader and Vue renderer live in [AntelopeJS/dms-frontend](https://github.com/AntelopeJS/dms-frontend).

## Documentation

- [Getting started](https://dms.antelopejs.com/docs/getting-started/introduction): installation, quickstart, tutorial, architecture
- [Building](https://dms.antelopejs.com/docs/building/overview): configuration, pages and components, navigation, localization, deployment
- [Auth and tenancy](https://dms.antelopejs.com/docs/auth-and-tenancy/overview)
- [Components](https://dms.antelopejs.com/docs/components/overview): every block, with a live preview
- [Interfaces](https://dms.antelopejs.com/docs/interfaces): the `@antelopejs/interface-dms` reference
- [AI and Claude Code](https://dms.antelopejs.com/docs/ai-and-claude-code/overview): the skill suite and the AI assistant
- [Modules](https://dms.antelopejs.com/docs/modules) and [Frontend](https://dms.antelopejs.com/docs/frontend)

The guide's sources live in [`packages/dms/docs`](./packages/dms/docs).

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request, and [AGENTS.md](./AGENTS.md) for the repository layout and conventions.

```bash
pnpm install
pnpm --dir packages/dms dev            # playground backend
pnpm --dir packages/dms frontend:dev   # dashboard, in a second terminal
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

Two scripts keep the documentation data in step with the code (the [block preview page](https://dms.antelopejs.com/docs/ai-and-claude-code/block-preview-page) must be enabled for the screenshots):

```bash
pnpm --dir packages/dms docs:catalog       # docs-data/blocks.json from ListBlockTypes(); CI runs docs:catalog:check
pnpm --dir packages/dms docs:screenshots   # docs/images/blocks/<example>.<theme>.png from docs-data/examples.json
```

## License

[Apache-2.0](./LICENSE). The runtime package ships the DB-IP IP to Country Lite database under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): see [`packages/dms`](./packages/dms#third-party-data).
