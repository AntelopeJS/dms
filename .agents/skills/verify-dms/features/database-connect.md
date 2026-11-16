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
- `database-connect-corrects-a-url`: on a backend run with `ajs project dev -w`, the journey connects a database on a URL tagged `appName=first-<id>`, then corrects the URL in `.env` to `appName=corrected-<id>` as `SetDatabaseConnectionUrl` writes it, and sends `builder_map_resources`, which loads the configuration, so that its load lands after the write and before the restart. After the restart `database_connections` lists the connection without an error and the run's MongoDB log records a client named by the corrected URL. It fails when a builder call that loaded the configuration leaves the old URL in `process.env`, which the restart then keeps (AntelopeJS/dms#1050).

## How to get to it (user POV)

- Open the Builder, choose the **Database** tab, then **Connect a database**, fill in a name and a URL and press **Connect**. A coding agent sends the same batch with `builder_configure_project` after `database_project`.

## Driving it with dms-control

```bash
dms-control journey "$RUN" database-connect [journey-id...]
```

Evidence is under `$RUN/evidence/database-connect/<journey>/`.

## Gotchas

- `SetDatabaseConnectionUrl` is an interface function that only another module calls (the dms-assistant connect popup): no MCP tool or route reaches it. The corrected-URL journey writes `.env` itself, so the refusal of a variable that the starting environment shadows (AntelopeJS/dms#1049) has no journey yet.
- A URL that fails to connect stops the project at start (`Failed to construct module`), so the journeys connect on URLs the server accepts and tell them apart by `appName`, which the MongoDB log records for each client.
- The builder call must land after the `.env` write and before the restart, which starts within milliseconds of the write: the journey sends the call first and writes `.env` 100 ms later.
- The form writes the variables and the batch in one `ConfigureProject` call; the MCP tool writes no variables, so the journey writes `.env` first and waits out the restart that write triggers.
- The batch stays in the run's copy of the playground: every later production backend of the run refuses to start ("The configuration does not load the modules the build was created with"). Both journeys set `last: true`, so the Playwright suite runs it after every other journey; with `dms-control journey`, run it last, or `down` the run after it.
