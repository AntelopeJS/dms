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
