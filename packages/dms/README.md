# @antelopejs/dms

<div align="center">
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="https://antelopejs.com"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

The AntelopeJS dashboard management system (DMS). It provides an Inertia/Vue admin dashboard,
authentication and tenancy, declarative pages and components, data management, file uploads,
notifications, and realtime updates.

Its public contracts live in a separate package, [`@antelopejs/interface-dms`](../interface-dms):
modules import the interfaces from there and never from the runtime.

## Installation

```bash
ajs project modules add @antelopejs/dms
```

The dashboard also requires an API module, a module implementing the Database interface, and an
authentication module. The frontend is served separately by the `ajs dms` CLI from
[`@antelopejs/dms-frontend`](https://github.com/AntelopeJS/dms-frontend).

## Getting started

Start with the [installation guide](./docs/01.getting-started/02.installation.md) and
[quickstart](./docs/01.getting-started/03.quickstart.md). The quickstart uses the maintained
[`template-dms-demo`](https://github.com/AntelopeJS/template-dms-demo), which includes a complete
backend and frontend setup.

Module settings belong in the `config` block for `@antelopejs/dms` in
`antelope.config.ts`. See the [configuration reference](./docs/02.building/02.configuration.md) for
the verified options and defaults. In production, set strong values for `auth.jwtSecret`,
`htmlRender.serviceSecret`, and `frontend.bootstrapSecret`; use Redis for realtime operation across
multiple backend instances.

## Development

Run from the repository root, which is a pnpm workspace holding this package and
`packages/interface-dms`:

```bash
pnpm install
pnpm build
pnpm test
```

## Block preview for documentation

Set `docsPreview: true` in the module config, or `DMS_DOCS_PREVIEW=1` in the environment, to serve
`/dms-preview`: a public, hidden page that renders a tree of registered blocks, for a documentation
site to embed in an iframe. It is off by default; the playground turns it on.

- `?state=<base64url(JSON)>` carries `{ tree, theme?, locale?, padding? }`, where `tree` is a node or
  a list of nodes `{ type, options?, children? }` (`type` is a block registry type such as `KpiCard`).
- The parent page posts `{ channel: "dms-preview", type: "render", tree, theme?, locale? }` or
  `{ channel: "dms-preview", type: "theme", theme }`; the page answers `ready`, `resize` (with
  `height`) and `error` (with `message`) on the same channel.
- Only registered block types render. URL options must be paths of the site, data is only read
  (`GET`), and a block built on a controller class renders only from a route
  (`TableView.fromSource`); anything else shows an inline notice.

Inside the dashboard, `<DmsBlockPreview :tree="node" />` renders the same tree, reading the allowed
block types from `GET /api/block-preview/types` (signed-in members).

Two scripts keep the documentation data in step with the code:

```bash
pnpm --dir packages/dms docs:catalog        # docs-data/blocks.json from ListBlockTypes(); CI runs docs:catalog:check
pnpm --dir packages/dms docs:screenshots    # docs/images/blocks/<example>.<theme>.png from docs-data/examples.json
```

`docs:screenshots` drives a running DMS with the preview enabled (the playground, on
`http://localhost:3001` unless `--base-url` or `DMS_PREVIEW_URL` says otherwise); `--only` and
`--theme` narrow it.

## Third-party data

The package ships the DB-IP IP to Country Lite database (`data/`) to tell which
country a sign-in came from. It is licensed under the
[Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/):
IP Geolocation by [DB-IP](https://db-ip.com). `pnpm country-database` downloads
the current edition; packing the package for a release runs it.
