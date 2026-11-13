---
covers:
  - packages/dms/src/builder.ts
  - packages/dms/src/implementations/dms-builder/**
  - packages/interface-dms-builder/src/**
docs:
  - packages/interface-dms-builder/docs/1.introduction.md
  - packages/interface-dms-builder/docs/4.page-operations.md
  - packages/interface-dms-builder/docs/8.results-and-errors.md
---

# Builder

The builder engine of `@antelopejs/dms`, which implements `@antelopejs/interface-dms-builder`: it lists and edits the pages, blocks, resources, queries and theme of the project's sources. A developer reaches it through the MCP tools of the MCP server, which call the interface. The playground's `docs` environment turns it on, as `ajs project dev` does.

## Sub-features

- `builder-lists-and-reads-pages`: `builder_list_pages` lists the playground's pages with their ref, id and file, and `builder_page_structure` reads one page's block tree with a version hash.
- `builder-delete-waits-for-a-repeat`: Destructive: `builder_delete_page` answers what it would do and deletes nothing on the first call, and the page is still listed.
- `builder-refuses-an-unknown-page`: error path: `builder_page_structure` on a page that does not exist answers a failure the agent can read.

## How to get to it (user POV)

- Ask a coding agent that has the `dms` MCP server to list the project's pages, or to add a block to one. Another module reaches the same operations through `@antelopejs/interface-dms-builder`.

## Driving it with dms-control

```bash
dms-control journey "$RUN" builder [journey-id...]
```

The journeys call the builder's MCP tools through the stdio bridge, as the MCP server's journeys do. Evidence is under `$RUN/evidence/builder/<journey>/`.

## Gotchas

- The journeys edit nothing: the run's playground is a copy, but a write would also reload the sources the backend serves. A repeated deletion, resource, query and theme edits are not driven.
- The builder is on in the run because the playground's `docs` environment sets `builder.enabled`. The development-mode default is not driven.
