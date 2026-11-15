---
covers:
  - packages/dms/src/implementations/dms-builder/engine/project-scaffold.ts
  - packages/dms/src/implementations/dms-builder/engine/database-connection.ts
docs:
  - packages/interface-dms-builder/docs/11.external-databases.md
  - packages/dms/docs/01.getting-started/03.quickstart.md
---

# Database connect

Connecting an external database through the Builder, as its *Connect a database* form does: one `ConfigureProject` batch adds the driver, scaffolds the `builder-db-<name>-tables` module and wires the catalog connection, and the restart that follows installs the module and loads the connection.

## Sub-features

- `database-connect-restarts-under-watch`: on a backend run with `ajs project dev -w`, the journey seeds an `orders` collection, writes the connection's variables into `.env`, then sends the form's batch through `builder_configure_project`. The restart the batch triggers installs the tables module (the backend log has no `Install failed for builder-db-<name>-tables`), `database_connections` lists the connection, and `builder_analyse_database` reads `orders` with no manual restart. It fails when the module's `installCommand` installs the enclosing pnpm workspace instead of the module, as the playground sits in one.

## How to get to it (user POV)

- Open the Builder, choose the **Database** tab, then **Connect a database**, fill in a name and a URL and press **Connect**. A coding agent sends the same batch with `builder_configure_project` after `database_project`.

## Driving it with dms-control

```bash
dms-control journey "$RUN" database-connect [journey-id...]
```

Evidence is under `$RUN/evidence/database-connect/<journey>/`.

## Gotchas

- The form writes the variables and the batch in one `ConfigureProject` call; the MCP tool writes no variables, so the journey writes `.env` first and waits out the restart that write triggers.
- The batch stays in the run's copy of the playground: every later production backend of the run refuses to start ("The configuration does not load the modules the build was created with"). The journey sets `last: true`, so the Playwright suite runs it after every other journey; with `dms-control journey`, run it last, or `down` the run after it.
