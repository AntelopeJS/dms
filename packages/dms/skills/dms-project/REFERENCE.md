# dms-project — reference

Deep material for [SKILL.md](SKILL.md): the DMS's optional infrastructure and config details, and
the map of what a project registers.

## Infrastructure modules & config details

The DMS's `data-api` interface is standalone (self-hosts — no module to load), and `redis` is an
*optional* dependency: add `@antelopejs/redis` only when you need it (the project template runs
without it). Add a file-storage module (e.g. `@antelopejs/file-storage-local`) and an email module
(e.g. `@antelopejs/nodemailer`) when you use File/Image fields, invites, or email validation — the
project template loads both. Table decorators come from the `@antelopejs/interface-database-decorators`
**library** — no module entry. The database module must implement `@antelopejs/interface-database` 0.4:
`@antelopejs/mongodb` ≥ 1.8.0, `@antelopejs/postgres` ≥ 0.4.0 or `@antelopejs/rethinkdb` ≥ 1.10.0. A query
runs only through `.run()`.
Put secrets/per-deploy values in `envOverrides` (a framework feature); per-environment deltas in
`environments` (`ajs project dev -e STAGING`).

## What you register (delegates to the other skills)

| Task | Skill / doc |
| --- | --- |
| Pages, TableViews, the component builders | **antelopejs:dms-pages** (`docs/02.building/03.pages-and-components.md`, `docs/04.components/`) |
| Auth on pages/routes, permissions, tenants | **dms-auth** (`docs/03.auth-and-tenancy/`) |
| Hooks, notifications, realtime, replayable jobs, automation nodes, HTML render, export jobs | `docs/02.building/06.backend-services.md` |
| Custom Vue in your `frontend-vue/` module | `docs/02.building/08.frontend-layer.md`, `docs/05.extending-the-dashboard/`, `docs/06.frontend-composables/` |
