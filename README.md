<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./packages/dms/frontend-vue/layers/dms-layout/public/images/antelope-logo/dark.svg">
  <img alt="AntelopeJS DMS" src="./packages/dms/frontend-vue/layers/dms-layout/public/images/antelope-logo/light.svg" data-illustration height="72">
</picture>

# AntelopeJS DMS

<a href="https://www.npmjs.com/package/@antelopejs/dms"><img alt="npm" src="https://img.shields.io/npm/v/@antelopejs/dms?style=for-the-badge&labelColor=000000&color=000000" data-illustration></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/dms?style=for-the-badge&labelColor=000000&color=000000" data-illustration></a>
<a href="https://discord.gg/g4pFt6eXqu"><img alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" data-illustration></a>
<a href="https://dms.antelopejs.com/docs"><img alt="Documentation" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" data-illustration></a>

**Plug in your PostgreSQL, MongoDB or RethinkDB database. Your coding agent writes the back office and an analytics dashboard as typed TypeScript in your repository.**

Open source under Apache-2.0. Self-hosted today.

[Live demo](https://dms-demo.antelopejs.com) · [Docs](https://dms.antelopejs.com/docs) · [Quick start](https://dms.antelopejs.com/docs/getting-started/quickstart) · [Discord](https://discord.gg/g4pFt6eXqu)

**[Click through the read-only live demo](https://dms-demo.antelopejs.com)**, no install needed.

If the DMS saves you a back office, a ⭐ helps other developers find it.

</div>

![Screen recording from the Meet AntelopeJS DMS film. A PostgreSQL connection string is pasted into the Connect a database form under the caption Name it. Pick the engine. Paste the connection string. Connect is pressed, four steps run under the caption Done. There's your ERP. Three databases, two PostgreSQL and one MongoDB, then appear in one list under the caption Three databases, one back office, and an Overview dashboard with revenue, open deals and orders from all three appears under the caption One dashboard. Everything in one place.](./docs/media/hero-connect.gif "illustration")

**Meet AntelopeJS DMS (4:44).** A company connects its ERP, its CRM and its shop, and gets one back office and one dashboard.

https://github.com/user-attachments/assets/1c0b9396-d468-48b4-b504-3e5b9e50eeb4

## Try it in one command

### Try it on a sample database

You need Node.js, Git and Docker with Compose v2.

```bash
npx @antelopejs/core project init dms-connect-demo --template dms-connect-demo
cd dms-connect-demo
docker compose up
```

[`template-dms-connect-demo`](https://github.com/AntelopeJS/template-dms-connect-demo) is a demo for trying the Connect flow. The stack starts the DMS, a MongoDB for the DMS's own data, and a PostgreSQL database filled with the online orders of a coffee brand (12 tables). The command chooses the sample database. To get the same data in MongoDB or RethinkDB, run `docker compose --profile mongodb up` or `docker compose --profile rethinkdb up` instead. On one Linux machine the dashboard was ready after about 2 minutes from a cold start and after about 1 minute with the images and packages cached.

The demo uses placeholder secrets, so keep its ports on your own machine.

The `dms` service prints a line that starts with `[DMS] No owner exists yet`. Open the onboarding address in that line, which carries the setup token, and create the administrator account. Then open the Builder, choose the **Database** tab, and connect the sample database. The [demo README](https://github.com/AntelopeJS/template-dms-connect-demo#connect-a-sample-database) lists each step with the connection string for each database.

### Start your project

Start from [`template-dms`](https://github.com/AntelopeJS/template-dms). It runs the same DMS, Builder, and assistant with no sample data.

```bash
npx @antelopejs/core project init my-project --template dms-starter
cd my-project
docker compose up
```

Open the onboarding address that the `dms` service prints after `No owner exists yet` and create the administrator account. In the Builder's **Database** tab, enter the connection URL of your own database and press **Connect**. The Builder reads the schema, proposes a page for each table, and writes the pages you keep as TypeScript into your project.

- Inside the `dms` container, `localhost` is the container itself. A database on your machine needs an address the container can reach.
- To add the DMS to an existing AntelopeJS project instead, follow [Add the DMS to an existing project](#add-the-dms-to-an-existing-project).

## What you get

### Your back office is TypeScript in your repository

Each table you keep gets a typed table definition and a page, written into your repository next to your code. You read it, change it, and review it like any other change to your product.

<img src="./docs/media/code.gif" data-illustration alt="Screen recording of dashboard/page.ts, a page class with a KpiCard, a ChartDonut and a TableView, drawn next to the dashboard it produces under the caption A page is a TypeScript class. The TableView line then grows into a full table with search, filters, a New project form and its GET, POST, PUT and DELETE routes, under the captions One block. A full CRUD screen. and You declared one thing." width="720">

### Read-only by default, roles for the rest

A generated page lists, shows, and exports rows. It gets no create, edit, or delete route until you switch on **Rows can be edited** for that table. Roles and permissions then decide who sees and edits what, down to each block.

<img src="./docs/media/roles-readonly.gif" data-illustration alt="Screen recording of the Support role's permission tree, with the dashboard's Revenue, Sales and Projects blocks and the Create, Edit and Delete actions switched one by one, under the caption Roles come from your pages, down to each action. The dashboard is then previewed as Support under the caption Preview as any role, and the same request returns 200 for Admin and 403 for Support under the caption Hidden on the page. Refused by the server." width="720">

### The Builder turns clicks into code

Edit pages, tables, and charts from the dashboard. Each edit becomes TypeScript, and the Builder writes files only when the whole project still compiles.

<img src="./docs/media/builder.gif" data-illustration alt="Screen recording of Ctrl B opening the Builder on a dashboard, where a TableView block is added from the block list under the caption Ctrl B. Edit it on the page. The block is saved, the whole project is typechecked, and the new TableView line appears in dashboard/page.ts under the caption Every save becomes TypeScript." width="720">

### And more

- **An analytics dashboard from your coding agent.** The DMS asks Claude Code or Codex, the agent you already use, to build the back office and a stats dashboard for your data. The DMS ships no AI model of its own.
- **Realtime updates on the data the DMS manages.** When someone saves a record, other people viewing the page see it without reloading.
- **Pages as TypeScript classes.** Forms, tables, charts, and layouts are blocks that the shared Vue renderer draws. Standard screens need no Vue.
- **Sign-in, members, and multi-tenancy.** A SaaS mode is included.
- **An AI dev assistant.** It changes your project for you in Safe mode or Code mode. To run it, you need Claude Code or Codex.
- **Agent skills in the packages.** They teach coding agents how to build DMS pages the way the DMS expects.
- **Embedding.** Run the DMS inside an AdonisJS 6 backend.
- **Installable modules.** Page builder, database and API consoles, automations, SaaS billing, translations, mailing, marketing analytics, and a media library.

**A tour of the whole DMS (3:47).** Pages and blocks, people and roles, modules, and the three ways to build.

https://github.com/user-attachments/assets/ba552792-f0d4-4fcf-8b0e-81029a5a2582

---

## Add the DMS to an existing project

For a new application, start from the demo application below. To add the DMS to an existing AntelopeJS project, add the module and the dashboard's frontend loader:

```bash
ajs project modules add @antelopejs/dms
pnpm add -D @antelopejs/dms-frontend
```

The DMS also needs an API module, a module implementing the database interface, and an authentication module: see [Installation](https://dms.antelopejs.com/docs/getting-started/installation).

## Run the demo application

Create a project from the `template-dms-demo` template, which loads the DMS, its companion modules and Helio, a demo back office for a solar installer. It needs the Node.js and pnpm releases the template pins, and a MongoDB on `localhost:27017`.

```bash
npx @antelopejs/core project init my-app --template dms-demo
cd my-app
pnpm dev            # backend on http://localhost:5010
```

When the backend answers, start the dashboard in a second terminal, from the same folder:

```bash
pnpm frontend:dev   # dashboard on http://localhost:3001
```

Open the address that the backend logs after `No owner exists yet`, and create the first administrator. The [Quickstart](https://dms.antelopejs.com/docs/getting-started/quickstart) walks through each step. A page is a class whose static fields are blocks:

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

The `@antelopejs/*` ranges `@antelopejs/dms` supports are in the compatibility block of the [`dms` README](packages/dms/README.md#compatibility). Each DMS release declares the renderer releases it runs on in `engines["@antelopejs/dms-frontend"]` of its frontend module, and the frontend's [compatibility table](https://dms.antelopejs.com/docs/frontend/introduction#compatibility) lists the renderer release line of each DMS release it covers. The DMS also runs embedded in an AdonisJS application: see [Run the DMS inside AdonisJS](https://dms.antelopejs.com/docs/getting-started/adonisjs).

## Packages

| Package | Directory | Role |
| --- | --- | --- |
| [`@antelopejs/dms`](https://www.npmjs.com/package/@antelopejs/dms) | [`packages/dms`](./packages/dms) | The runtime module: pages, components, auth and tenancy, files, notifications, realtime. |
| [`@antelopejs/interface-dms`](https://www.npmjs.com/package/@antelopejs/interface-dms) | [`packages/interface-dms`](./packages/interface-dms) | The public contracts a module imports to extend the dashboard. |

The dashboard's frontend loader and Vue renderer live in the [`AntelopeJS/dms-frontend`](https://github.com/AntelopeJS/dms-frontend) repository.

## Documentation

- [Getting started](https://dms.antelopejs.com/docs/getting-started/introduction): installation, quickstart, tutorial, architecture
- [Building](https://dms.antelopejs.com/docs/building/overview): configuration, pages and components, navigation, localization, deployment
- [Auth and tenancy](https://dms.antelopejs.com/docs/auth-and-tenancy/overview)
- [Components](https://dms.antelopejs.com/docs/components/overview): every block, with a live preview
- [Interfaces](https://dms.antelopejs.com/docs/interfaces): the `@antelopejs/interface-dms` reference
- [AI and Claude Code](https://dms.antelopejs.com/docs/ai-and-claude-code/overview): the skill suite and the AI assistant
- [Modules](https://dms.antelopejs.com/docs/modules) and [Frontend](https://dms.antelopejs.com/docs/frontend)

The runtime guides live in [`packages/dms/docs`](./packages/dms/docs). The canonical consumer contract reference lives in [`packages/interface-dms/docs`](./packages/interface-dms/docs/index.md), published at the existing `/docs/interfaces` URLs.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request, and [AGENTS.md](./AGENTS.md) for the repository layout and conventions.

One root install includes the runtime, interface, shipped Vue layer and playground, using a shared lockfile so the runtime and interface resolve the same dependencies. Use the root scripts below rather than recursive scripts, because the runtime already delegates checks to the interface and Vue layer.

```bash
pnpm install --frozen-lockfile
pnpm dev            # playground backend
pnpm frontend:dev   # dashboard, in a second terminal
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

### Recover an outdated playground installation

Use the Node.js release in `.nvmrc` and run these commands from the repository root. The playground's dependency ranges are in `packages/dms/playground/package.json`, and the lockfile installs compatible releases together. Run the CLI with `pnpm exec ajs`, not with a separately installed global `ajs`: an older global CLI can bring its own copy of `interface-core`.

If startup reports `Incompatible interface package resolution`, stop the backend and the frontend, then reinstall the local dependencies from the current lockfile:

```bash
pnpm install --frozen-lockfile --force
pnpm --dir packages/dms/playground exec ajs project modules install
pnpm dev
# In a second terminal, from the repository root:
pnpm frontend:dev
```

Do not lower the modules' interface requirements or delete the lockfile. The reinstall keeps the MongoDB database and the playground's file storage.

Two scripts keep the documentation data in step with the code (the [block preview page](https://dms.antelopejs.com/docs/ai-and-claude-code/block-preview-page) must be enabled for the screenshots):

```bash
pnpm --dir packages/dms docs:catalog       # docs-data/blocks.json from ListBlockTypes(); CI runs docs:catalog:check, which also fails unless each block type has exactly one page holding its `::block-playground` and `::block-options`
pnpm --dir packages/dms docs:screenshots   # docs/images/blocks/<example>.dark.png from docs-data/examples.json
```

### Capture documentation screenshots

`docs:screenshots` renders each hand-authored example in `packages/dms/docs-data/examples.json`
through a running DMS's `/dms-preview` page. It captures the dark theme only, cropped
to the blocks, into `packages/dms/docs/images/blocks/<id>.dark.png`. The docs use
these images when no live preview answers.

Enable the preview with `docsPreview: true` or `DMS_DOCS_PREVIEW=1`, as the playground does.
The default frontend URL is `http://localhost:3001`; `DMS_PREVIEW_URL` overrides it.

```bash
pnpm --dir packages/dms docs:screenshots [--base-url <url>] [--only <id,...>]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `--base-url` | DMS frontend URL | `DMS_PREVIEW_URL`, then `http://localhost:3001` |
| `--only` | Comma-separated example IDs | All examples |

### Check realtime connections across tabs

`realtime:tabs-check` signs in and opens several tabs in one browser profile. It counts
the long-lived streams to the dashboard's origin, then times a request from each tab.
HTTP/1.1 browsers allow at most six connections per host; streams that hold all of
them leave ordinary requests waiting.

```bash
pnpm --dir packages/dms realtime:tabs-check --email <email> --password <password> [--base-url <url>] [--tabs <n>] [--path </page>] [--channel <chrome|msedge>] [--max-streams <n>] [--timeout <ms>] [--legacy-streams <n>]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `--email` | Sign-in email | `DMS_CHECK_EMAIL`; required if unset |
| `--password` | Sign-in password | `DMS_CHECK_PASSWORD`; required if unset |
| `--base-url` | DMS frontend URL | `http://localhost:3001` |
| `--tabs` | Tabs in the shared profile | `8` |
| `--path` | Page to open in each tab | `/` |
| `--channel` | Browser channel | `chrome` |
| `--max-streams` | Maximum shared long-lived streams | `2`: realtime and the development reload stream |
| `--timeout` | Per-tab request deadline in milliseconds | `5000` |
| `--legacy-streams` | Extra connection streams per tab to demonstrate the check failing | `0` |

## License

[Apache-2.0](./LICENSE). The runtime package ships the DB-IP IP to Country Lite database under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): see [`packages/dms`](./packages/dms#third-party-data).
