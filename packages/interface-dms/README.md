<div align="center">

# @antelopejs/interface-dms

<a href="https://www.npmjs.com/package/@antelopejs/interface-dms"><img alt="npm" src="https://img.shields.io/npm/v/@antelopejs/interface-dms?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/interface-dms?style=for-the-badge&labelColor=000000&color=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000"></a>
<a href="https://dms.antelopejs.com/docs/interfaces"><img alt="Documentation" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000"></a>

The public contracts of the AntelopeJS DMS: pages and components, permissions and tenancy, authentication, notifications and HTML rendering.

</div>

## What it does

- Declares pages, categories, modules and page extensions (`/page`), and the blocks they carry: forms, tables, charts and layouts (`/base`).
- Registers permissions, guards routes, and scopes data to a tenant (`/permissions`, `/guards`, `/tenant-scoped-model`…).
- Authenticates requests and manages users, sessions and external identities (`/auth`).
- Declares notification categories and sends notifications (`/notifications`), and renders HTML templates server-side (`/html-render`).
- Lets a module compile against the contract rather than against the implementation, [`@antelopejs/dms`](https://www.npmjs.com/package/@antelopejs/dms).

## Install

Add the interface to the module that extends the DMS:

```bash
pnpm add @antelopejs/interface-dms
```

Depend on it with a wide range, such as `>=0.7.0 <1.0.0`, and never bundle or vendor it: the host and every module must resolve the same installed copy, since the package holds live registries. `@antelopejs/core` fails at startup with `Incompatible interface package resolution` when a module resolves another copy.

## Quick start

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

| Import | What it holds |
| --- | --- |
| `@antelopejs/interface-dms` | the core surface: pages, permissions, tenancy, hooks |
| `@antelopejs/interface-dms/<module>` | one module of it: `/page`, `/permissions`, `/hooks`, `/db`… |
| `@antelopejs/interface-dms/auth` | authentication: users, sessions, external identities |
| `@antelopejs/interface-dms/base` | the component library: forms, tables, charts, layouts |
| `@antelopejs/interface-dms/notifications` | notification categories, subjects and delivery |
| `@antelopejs/interface-dms/html-render` | server-side HTML templates |

## Compatibility

<!-- antelopejs-docs-compat:start -->

| Package                                     | Supported         | Tested with |
| ------------------------------------------- | ----------------- | ----------- |
| `@antelopejs/interface-api`                 | `>=0.0.15 <1.0.0` | `0.0.15`    |
| `@antelopejs/interface-api-util`            | `>=0.1.3 <1.0.0`  | `0.1.3`     |
| `@antelopejs/interface-core`                | `>=0.2.4 <1.0.0`  | `0.2.6`     |
| `@antelopejs/interface-data-api`            | `>=0.5.0 <1.0.0`  | `0.5.0`     |
| `@antelopejs/interface-database`            | `>=0.1.11 <1.0.0` | `0.1.11`    |
| `@antelopejs/interface-database-decorators` | `>=0.1.10 <1.0.0` | `0.1.10`    |
| `@antelopejs/interface-file-storage`        | `>=0.1.4 <1.0.0`  | `0.1.4`     |

<!-- antelopejs-docs-compat:end -->

A `@antelopejs/dms` release implements the `@antelopejs/interface-dms` range listed in the compatibility block of the [`dms` README](../dms/README.md#compatibility).

## Documentation

- [The DMS interface](./docs/index.md): the canonical consumer reference, shipped with this package and published at [docs/interfaces](https://dms.antelopejs.com/docs/interfaces)
- [Core](./docs/1.core/1.introduction.md), [Auth](./docs/2.auth/1.introduction.md), [Base](./docs/3.base/1.introduction.md), [Notifications](./docs/4.notifications/1.introduction.md), [HTML Render](./docs/5.html-render/1.introduction.md)
- [Pages and components](https://dms.antelopejs.com/docs/building/pages-and-components): the task-by-task guide

An importable file is not necessarily a supported API. Paths under `internal/`, symbols tagged `@internal`, and `internal` namespaces are implementation wiring, even when the wildcard export makes them reachable. Use the public declarations and contracts documented here.

## Contributing

This package lives in the [`AntelopeJS/dms`](https://github.com/AntelopeJS/dms) pnpm workspace, next to the runtime that implements it. Read [CONTRIBUTING.md](https://github.com/AntelopeJS/dms/blob/main/CONTRIBUTING.md), the [repository README](https://github.com/AntelopeJS/dms#contributing) and [AGENTS.md](https://github.com/AntelopeJS/dms/blob/main/AGENTS.md), which covers what is public and what is internal. Release this package (**Release DMS interface**) before a `@antelopejs/dms` version that needs it.

## License

[Apache-2.0](./LICENSE)
