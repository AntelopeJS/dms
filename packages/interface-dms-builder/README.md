<div align="center">

# `@antelopejs/interface-dms-builder`

<a href="https://www.npmjs.com/package/@antelopejs/interface-dms-builder"><img alt="npm" src="https://img.shields.io/npm/v/@antelopejs/interface-dms-builder?style=for-the-badge&labelColor=000000&color=000000" data-illustration></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/npm/l/@antelopejs/interface-dms-builder?style=for-the-badge&labelColor=000000&color=000000" data-illustration></a>
<a href="https://discord.gg/g4pFt6eXqu"><img alt="Discord" src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" data-illustration></a>
<a href="https://dms.antelopejs.com/docs/modules/assistant/builder/extending"><img alt="Documentation" src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" data-illustration></a>

The AntelopeJS interface that edits the pages, blocks, resources and queries of a DMS project from code.

</div>

## What it does

- Creates and edits pages, categories and their block trees with operations such as `CreatePage`, `AddBlock`, `ConfigureBlock`, `MoveBlock` and `SetPageBlocks`.
- Generates resources, each a `Table`, a `DataController` and a model, and edits their fields.
- Compiles query templates into a model method and a page route, so a card gets a number without hand-written code.
- Reports every block type and DataType the builder can write, with a schema for its options (`GetCatalog`).
- Returns every mutation as an `OpResult`. It holds the files changed on success, and a typed error otherwise.

Every operation is an `InterfaceFunction` that [`@antelopejs/dms`](https://www.npmjs.com/package/@antelopejs/dms) implements in development. The DMS parses the project, applies the edit as an AST rewrite, and writes only if the project still typechecks.

## Install

Add the interface to the module that calls the builder.

```bash
pnpm add @antelopejs/interface-dms-builder
```

## Quick start

The following code creates a page and puts a KPI card on it.

```ts
import { AddBlock, CreatePage } from "@antelopejs/interface-dms-builder";

const page = await CreatePage({
  name: "revenue",
  displayName: "Revenue",
  category: "pages",
  icon: "i-ph-chart-line",
});
if (!page.ok) {
  throw new Error(`could not create the page: ${page.error.code}`);
}

const block = await AddBlock({
  page: page.data.ref,
  name: "total",
  type: "KpiCard",
  config: { title: "Total revenue", icon: "i-ph-currency-eur" },
});
if (!block.ok) {
  throw new Error(`could not add the block: ${block.error.code}`);
}
```

## Compatibility

The interface declares this peer dependency:

<!-- antelopejs-docs-compat:start -->

| Package                      | Supported        | Tested with |
| ---------------------------- | ---------------- | ----------- |
| `@antelopejs/interface-core` | `>=0.2.4 <1.0.0` | `0.4.0`     |

<!-- antelopejs-docs-compat:end -->

The `@antelopejs/dms` module implements this interface, and so does the `@antelopejs/dms-builder` module. The `@antelopejs/interface-dms-builder` entry in the `dependencies` of `@antelopejs/dms` gives the interface range each `@antelopejs/dms` release implements. The implementation is not a peer dependency of the interface package. It runs in development only, unless the [`builder.enabled`](https://dms.antelopejs.com/docs/building/configuration) option of `@antelopejs/dms` turns it on.

## Documentation

- [Extending the builder](https://dms.antelopejs.com/docs/modules/assistant/builder/extending) covers the interface and the HTTP API.
- [Interface reference](./docs/1.introduction.md) is the canonical contract. It ships with this package and is published at [/docs/modules/builder/reference](https://dms.antelopejs.com/docs/modules/builder/reference).
- [A chart without code](./docs/10.a-chart-without-code.md) follows one chart from the choice of a measure to the reopened page.

## Contributing

This package lives in the [`AntelopeJS/dms`](https://github.com/AntelopeJS/dms) pnpm workspace, next to the module that implements it. Read [CONTRIBUTING.md](https://github.com/AntelopeJS/dms/blob/main/CONTRIBUTING.md) and the [repository README](https://github.com/AntelopeJS/dms#contributing) for the development commands. Release this package before the module that implements it.

## License

[Apache-2.0](./LICENSE)
