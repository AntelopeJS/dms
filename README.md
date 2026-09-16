# DMS

<div align="center">
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="https://antelopejs.com"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

The AntelopeJS dashboard management system. This repository is a pnpm workspace
holding two published packages:

| Package                                                | What it is                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| [`@antelopejs/dms`](./packages/dms)                     | the runtime module: pages, components, auth and tenancy, files, notifications, realtime |
| [`@antelopejs/interface-dms`](./packages/interface-dms) | the public contracts a module imports to extend the dashboard    |

Start with the [DMS readme](./packages/dms/README.md) and the
[documentation](./packages/dms/docs/01.getting-started/02.installation.md).

## Development

```bash
pnpm install
pnpm build
pnpm test
```

Each package also runs on its own: `pnpm --dir packages/dms <script>`.
