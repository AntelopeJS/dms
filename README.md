<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./packages/dms/frontend-vue/layers/dms-layout/public/images/antelope-logo/dark.svg">
  <img alt="AntelopeJS DMS" src="./packages/dms/frontend-vue/layers/dms-layout/public/images/antelope-logo/light.svg" height="72">
</picture>

# AntelopeJS DMS

**Plug in your PostgreSQL database. Your coding agent writes the back office and an analytics dashboard as typed TypeScript in your repository.**

Open source under Apache-2.0. Self-hosted today.

[Docs](https://dms.antelopejs.com/docs) · [Quick start](https://dms.antelopejs.com/docs/getting-started/quickstart) · [Discord](https://discord.gg/sjK28QHrA7)

</div>

![Screen recording of the AntelopeJS DMS Builder. A postgres:// connection string is entered and filled into the Connect form, the Builder reads 11 tables, and a Music Overview dashboard with four count cards appears, captioned with the first-pass time, 10:50.](./docs/media/hero-connect.gif)

[Watch the full Meet AntelopeJS DMS video (75 seconds)](./docs/media/meet.mp4)

## Try it in one command

### Try it on a sample database

You need Docker with Compose v2 and git.

```bash
git clone https://github.com/AntelopeJS/template-dms-light.git
cd template-dms-light
docker compose up
```

The stack starts the DMS, a MongoDB for the DMS's own data, and a PostgreSQL database filled with the Chinook sample (a music store with 11 tables). On one Linux machine the dashboard was ready after about 2 minutes from a cold start and after about 1 minute with the images and packages cached.

Open [http://localhost:3001](http://localhost:3001), create the administrator account, open the Builder, choose the **Database** tab, and connect the sample database. The [template README](https://github.com/AntelopeJS/template-dms-light#connect-the-sample-database) lists each step with the connection URL.

### Use it on your own database

Start the same stack. In the Builder's **Database** tab, enter the connection URL of your own database instead of the sample one and press **Connect**. The Builder reads the schema, proposes a page for each table, and writes the pages you keep as TypeScript into your clone.

- Connect with an account that has `SELECT` and nothing else. The generated pages are read-only, but the connection can write whatever its account can write.
- Inside the `dms` container, `localhost` is the container itself. A database on your machine needs an address the container can reach.
- To add the DMS to an existing AntelopeJS project instead, follow [Add the DMS to an existing project](#add-the-dms-to-an-existing-project).

## What you get

### Your back office is TypeScript in your repository

Each table you keep gets a typed table definition and a page, written into your repository next to your code. You read it, change it, and review it like any other change to your product.

<img src="./docs/media/code.gif" alt="Screen recording of the generated Invoice page, public-invoice/page.ts, open in a code editor. A "Read-only by default" badge appears and the TableView line is highlighted." width="720">

### Read-only by default, roles for the rest

A generated page lists, shows, and exports rows. It gets no create, edit, or delete route until you switch on **Rows can be edited** for that table. Roles and permissions then decide who sees and edits what, down to each block.

<img src="./docs/media/roles-readonly.gif" alt="Screen recording of the generated Invoice page with its "Read-only by default" badge, then the Builder API tab with the four Read options on and the four Write options off, then the role permission tree where pages are ticked for a role." width="720">

### The Builder turns clicks into code

Edit pages, tables, and charts from the dashboard. Each edit becomes TypeScript, and the Builder writes files only when the whole project still compiles.

<img src="./docs/media/builder.gif" alt="Screen recording of the Builder editing the Music Overview page. A KPI card is retitled "Artists in the catalog", given a description, and saved, under the caption "Builder edits save as TypeScript"." width="720">

### And more

- **An analytics dashboard from your coding agent.** The DMS asks Claude Code or Codex, the agent you already use, to build the back office and a stats dashboard for your data. The DMS ships no AI model of its own.
- **Pages as TypeScript classes.** Forms, tables, charts, and layouts are blocks that the shared Vue renderer draws. Standard screens need no Vue.
- **Sign-in, members, and multi-tenancy.** A SaaS mode is included.
- **An AI dev assistant.** It changes your project for you in Safe mode or Code mode.
- **Agent skills in the packages.** They teach coding agents how to build DMS pages the way the DMS expects.
- **Embedding.** Run the DMS inside an AdonisJS 6 backend.
- **Installable modules.** Page builder, database and API consoles, automations, SaaS billing, translations, mailing, marketing analytics, and a media library.

## Limits

- **Databases.** The Builder connects PostgreSQL. Its database list also offers MongoDB and RethinkDB, but with `@antelopejs/dms-builder` 0.7.0 and `@antelopejs/core` 1.18.1 both connections stop the project from restarting until you remove them from `antelope.config.ts`. MySQL is not supported.
- **Read-only covers the generated pages.** The connection itself can write whatever the database account can write, so connect with an account that has `SELECT` only. The table pages still show **New entry**, **Edit**, and **Delete**. Those actions answer "Not Found" because the routes do not exist.
- **No automatic refresh.** Pages show the data as of the last load. When your external database changes, reload the page.
- **Dashboards need a coding agent.** Generated dashboards need Claude Code or Codex. Without one, you still get the table pages.
- **Check what the agent builds.** On the 11-table Chinook sample, the assistant's first pass took about 11 minutes. One of its two dashboards answered "Error 500" until a follow-up message fixed the data shape of its charts. Open each page it creates.
- **The DMS keeps its own data in MongoDB.** Accounts, roles, and settings live there. The sample stack starts one for you.
- **The sample stack is for development.** The Builder and the assistant run only in development mode, and the template uses placeholder secrets. Do not expose its ports.

## How AntelopeJS makes money

Everything is Apache-2.0, including the DMS, the Builder, the AI features, and roles. Nothing is gated and there is no per-seat price. You can self-host for free.

[AntelopeJS Cloud](https://cloud.antelopejs.com) is managed hosting. It is the only paid part, and it is waitlist-only today.

---

## Add the DMS to an existing project

For a new application, start from the demo application below. To add the DMS to an existing AntelopeJS project, add the module and the dashboard's frontend loader:

```bash
ajs project modules add @antelopejs/dms
pnpm add -D @antelopejs/dms-frontend
```

The DMS also needs an API module, a module implementing the database interface, and an authentication module: see [Installation](https://dms.antelopejs.com/docs/getting-started/installation).

## Run the demo application

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
- [Components](https://dms.antelopejs.com/docs/components/overview): every block, with a rendered preview
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

Use Node 24 (see `.nvmrc`) and run these commands from the repository root. The
playground requires AntelopeJS core 1.16.0 or later and `interface-core` 0.2.4;
the lockfile installs compatible versions together. Use `pnpm exec ajs` for
CLI commands rather than a separately installed global `ajs`.

If startup reports `Incompatible interface package resolution` with a shared
`interface-core` 0.1.1, stop the backend and frontend, then reinstall the local
dependencies from the current lockfile:

```bash
pnpm install --frozen-lockfile --force
pnpm exec ajs --version                    # 1.16.0 with the current lockfile
pnpm --dir packages/dms/playground exec ajs project modules install
pnpm dev
# In a second terminal, from the repository root:
pnpm frontend:dev
```

Do not downgrade the modules' interface requirements to 0.1.1 or delete the
lockfile. The older CLI can supply its own outdated interface singleton even
when the cached modules already have 0.2.4. Reinstalling dependencies preserves
the MongoDB database and playground file storage.

Two scripts keep the documentation data in step with the code (the [block preview page](https://dms.antelopejs.com/docs/ai-and-claude-code/block-preview-page) must be enabled for the screenshots):

```bash
pnpm --dir packages/dms docs:catalog       # docs-data/blocks.json from ListBlockTypes(); CI runs docs:catalog:check
pnpm --dir packages/dms docs:screenshots   # docs/images/blocks/<example>.<theme>.png from docs-data/examples.json
```

### Capture documentation screenshots

`docs:screenshots` renders each hand-authored example in `packages/dms/docs-data/examples.json`
through a running DMS's `/dms-preview` page. It captures light and dark themes, cropped
to the blocks, into `packages/dms/docs/images/blocks/<id>.<theme>.png`. The docs use
these images when no live preview answers.

Enable the preview with `docsPreview: true` or `DMS_DOCS_PREVIEW=1`, as the playground does.
The default frontend URL is `http://localhost:3001`; `DMS_PREVIEW_URL` overrides it.

```bash
pnpm --dir packages/dms docs:screenshots [--base-url <url>] [--only <id,...>] [--theme <light|dark>]
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `--base-url` | DMS frontend URL | `DMS_PREVIEW_URL`, then `http://localhost:3001` |
| `--only` | Comma-separated example IDs | All examples |
| `--theme` | Capture only `light` or `dark` | Both themes |

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
