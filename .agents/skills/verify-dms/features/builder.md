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
- `builder-period-bound-series-and-comparison-card-answer-over-http`: `builder_create_resource` seeds dated orders, `builder_add_query` saves a series bound by `$param` `from` and `to` and a card with `compare`, the page declares each bound as `string | true | undefined` and parses it with `new Date(String(x))`, and after the playground compiles and the backend restarts the owner's GETs answer the orders of the period and of the one before it.
- `builder-survives-the-reload-its-write-triggers`: on a backend run with `ajs project dev -w`, `builder_create_page` writes a page, the reload that write triggers registers it (`list_pages`, which reads the runtime's registry and not the builder, serves it), and `builder_delete_page` after that reload still reaches the builder and deletes it, which a second reload unregisters. It fails when dms leaves `@antelopejs/interface-dms-builder` out of `antelopeJs.implements`: core then stubs the interface again on every reload and the second write answers `has no provider`.

## How to get to it (user POV)

- Ask a coding agent that has the `dms` MCP server to list the project's pages, or to add a block to one. Another module reaches the same operations through `@antelopejs/interface-dms-builder`.

## Driving it with dms-control

```bash
dms-control journey "$RUN" builder [journey-id...]
```

The journeys call the builder's MCP tools through the stdio bridge, as the MCP server's journeys do. Evidence is under `$RUN/evidence/builder/<journey>/`.

## Gotchas

- Two journeys write, in the run's copy of the playground. The period journey adds the `order` resource and two queries to the first page the builder lists, then runs `tsc` there and restarts the backend. Run it once per run, because the resource name is then taken. The reload journey creates a page and deletes it, so the copy's sources are back when it passes; when it fails before the delete, the page it wrote stays in the copy for the journeys after it. Its rebuild makes the serving backend and the next journey's standby older than the playground build: `doctor` fails the build freshness check until the next journey or `reset`, and that journey starts a backend of its own. A repeated deletion, other resource, query and theme edits are not driven.
- The journey adds its queries to an existing page. A category the builder creates is not found by a page creation in a run, because the run links `@antelopejs/interface-dms` from outside `node_modules` and the source scan then does not recognise `pagesCategory`.
- `ajs project dev -w` starts watching only after the backend answers, and a write it has not seen yet does not reload. When the reload journey's page is not registered 30 s after its write, the journey saves the page file again once and waits for that reload; its check names the second save. A reload is all the second write needs, so the check of `implements` holds either way.
- The builder is on in the run because the playground's `docs` environment sets `builder.enabled`. The development-mode default is not driven.
