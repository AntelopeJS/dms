---
covers:
  - packages/dms/src/store/**
  - packages/dms/src/routes/store.ts
  - packages/dms/src/pages/modules/**
  - packages/dms/src/validation/store.schema.ts
  - packages/dms/src/dev/**
  - packages/dms/src/utils/package-manager/**
  - packages/dms/src/utils/package-manager.ts
  - packages/dms/frontend-vue/layers/dms-layout/app/custom-pages/modules*.vue
  - packages/dms/frontend-vue/layers/dms-layout/app/build/components/pages/modules/**
  - packages/dms/frontend-vue/layers/dms-core/app/types/module-store.ts
docs:
  - packages/dms/docs/02.building/10.distributable-module.md
---

# Modules store

The installed modules page (`/modules`) and the module store (`/modules/store`, API `/dms/store/*`). Outside development the store is read-only: it lists the catalog but installs nothing.

## Sub-features

- `installed-modules-open`: the playground's Demo Module and Plain Module are listed with their status; Open starts a module from its home page; the category filter keeps only the matching module.
- `modules-search-empty`: empty path: a store search and an installed search that match nothing show no module; Clear search lists the catalog again.
- `store-read-only-outside-dev`: error path, on a production backend: the store says it is read-only, Install is disabled, `POST /dms/store/install` answers 403 `error.store_disabled`, and the listing still shows the module as available.
- `store-open-in-dev`: the same store on a development backend: no read-only notice, Install is enabled, the listing says `enabled`, and `POST /dms/store/install` passes the development gate to answer 404 `error.store_module_unknown` for an id the catalog does not hold, so nothing is installed.
- `store-listing-owners-only`: Exposure: `GET /dms/store/listing` answers the platform owner and refuses a visitor with 403.

## How to get to it (user POV)

- Sidebar > Modules, then Browse the store.

## Driving it with dms-control

```bash
dms-control journey "$RUN" modules-store [journey-id...]
```

Evidence is under `$RUN/evidence/modules-store/<journey>/`.

## Gotchas

- The catalog comes from the npm registry, so the store journeys need the network.
- Installing, updating and uninstalling only run in development (`ajs project dev`). `store-open-in-dev` pins a development backend but installs nothing, since an install changes the run's `antelope.config.ts` and needs the registry. Report a real install, update or uninstall under Not verified when `packages/dms/src/store/operations.ts` changes, or drive one by hand on a run started with `up --dev-backend`.
