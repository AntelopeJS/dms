---
covers:
  - packages/dms/src/implementations/dms/page/**
  - packages/dms/src/utils/query-text.ts
  - packages/dms/src/implementations/dms/page.ts
  - packages/dms/src/implementations/dms-base/**
  - packages/dms/src/implementations/dms/attachments.ts
  - packages/dms/src/implementations/dms/uploads.ts
  - packages/dms/src/implementations/dms/realtime.ts
  - packages/dms/src/implementations/dms/route-params.ts
  - packages/dms/src/implementations/dms/connection-access.ts
  - packages/dms/src/attachments/**
  - packages/dms/src/realtime/**
  - packages/dms/src/routes/realtime.ts
  - packages/dms/src/routes/files.ts
  - packages/dms/src/routes/index.ts
  - packages/dms/src/page-extensions/**
  - packages/dms/src/automation/**
  - packages/dms/src/db/models/attachments.model.ts
  - packages/dms/src/db/tables/attachments.table.ts
  - packages/dms/src/db/guard-row.ts
  - packages/dms/src/db/row-id.ts
  - packages/dms/src/db/index.ts
  - packages/dms/src/validation/file.schema.ts
  - packages/dms/src/utils/export-jobs*.ts
  - packages/dms/src/utils/upload-*.ts
  - packages/dms/src/utils/jwt-claims.ts
  - packages/dms/src/utils/run-in-batches/**
  - packages/dms/src/utils/run-in-batches.ts
  - packages/dms/src/utils/page-access.ts
  - packages/dms/src/utils/own-value.ts
  - packages/dms/src/utils/query-text.ts
  - packages/dms/src/utils/row-action-rule-evaluator.ts
  - packages/dms/src/crons/sweep-stale-exports.ts
  - packages/dms/frontend-vue/layers/dms-ui/**
  - packages/dms/frontend-vue/layers/dms-layout/app/pages/**
  - packages/dms/frontend-vue/layers/dms-core/app/composables/live/**
  - packages/dms/frontend-vue/layers/dms-core/app/composables/realtime/**
  - packages/dms/frontend-vue/layers/dms-core/app/composables/page/**
  - packages/dms/frontend-vue/layers/dms-core/app/composables/period/**
  - packages/dms/frontend-vue/layers/dms-layout/app/emails/EmailExportReady.vue
  - packages/interface-dms/src/base/**
  - packages/interface-dms/src/connection-access.ts
  - packages/interface-dms/src/page/**
  - packages/interface-dms/src/db/**
  - packages/interface-dms/src/data-controllers/index.ts
  - packages/interface-dms/src/uploads.ts
  - packages/interface-dms/src/realtime.ts
  - packages/interface-dms/src/page.ts
  - packages/interface-dms/src/tenant-scoped-model.ts
  - packages/interface-dms/src/attachments.ts
  - packages/interface-dms/src/component-slots.ts
  - packages/interface-dms/src/component.ts
  - packages/interface-dms/src/guards.ts
  - packages/interface-dms/src/component-options/**
  - packages/interface-dms/src/tones.ts
  - packages/interface-dms/src/watch-actions.ts
  - packages/interface-dms/src/export-status.ts
docs:
  - packages/dms/docs/02.building/03.pages-and-components.md
  - packages/dms/docs/04.components/08.tables/0.index.md
  - packages/dms/docs/04.components/07.forms/0.index.md
  - packages/dms/docs/06.frontend-composables/03.realtime-and-notifications.md
---

# Module pages

What a module's pages are made of: table views with their forms, row actions and search, record pages, realtime updates and uploads. The playground's Users table (`/table-view/table-view-users`, data API `/api/user`) stands for every table view.

## Sub-features

- `table-create-record`: New entry, Create, then the table lists the user after a reload and a backend restart, and `/api/user/list` holds it (persistence).
- `form-required-fields`: error path: Create on an empty form lists the fields that need attention and stores nothing.
- `table-search-empty`: empty path: a search that matches nothing hides every row; clearing it lists them again.
- `table-edit-record`: row menu > Edit renames a user; the table and the API show the new name.
- `table-delete-record`: row menu > Delete asks "Delete this item?" first (the dry run a user sees), then the row is gone after a reload and from the API.
- `realtime-row-reaches-other-tab`: a user created in one tab appears in another tab on the same table without a reload. It is the end-to-end side of `formal-realtime-tabs`.
- `fetched-confirm-dialog-draws-no-posting-form`: error path, on a development backend: an agent writes two dialogs as mockup fixtures (`mockup_write_spec`) and a table whose toolbar buttons read them through `confirm.from` (`builder_add_block`). A dialog whose `component` is a secret input rotating to an owner-only route opens with its texts and plain field and without that component. A dialog whose field is that secret input does not open. The owner's clicks send nothing to the route. It writes a resource and a table into the first page of the run's playground copy, under names unique to the run.
- `matrix-cell-edit-persists`: the playground's Matrix allocation page (`/matrix/matrix-allocation`, route `/api/playground/matrix/allocation/correction/*`): a click opens a number cell of the stock correction grid, the value typed with the keyboard is saved as Enter leaves the cell, shown after a reload, and read back from the route (persistence).
- `agenda-booking-persists`: the playground's Room bookings page (`/agenda/agenda-bookings`, route `/api/playground/agenda/bookings/*`): opened with `?plan=next`, the FullAgenda reads its proposal route and opens a "New booking" dialog prefilled at the first free hour in a free room; Create saves it, the `plan` key leaves the URL, and after a reload the route answers one booking more, with its room (persistence), and no dialog opens again.
- `record-not-found`: error path: the edit page of a missing record says "This entry does not exist, or no longer does" and shows no form.

## How to get to it (user POV)

- Sidebar > Table View > Users, its New entry button, the search button and each row's Actions menu.
- Sidebar > Matrix > Reception allocation, a cell of its stock correction grid.
- Sidebar > Agenda > Room bookings, its "First free hour" toolbar link.

## Driving it with dms-control

```bash
dms-control journey "$RUN" module-pages [journey-id...]
```

Evidence is under `$RUN/evidence/module-pages/<journey>/`.

## Gotchas

- Until the playground declares its frontend (dms#441), its own translations are missing from the `docs` build, so headings such as `demo.forms.user.new_title` show their keys. Journeys target field labels and table cells, which are not translated keys.
- Charts, uploads, exports and automation are covered by this feature's globs but have no journey yet. Report them under Not verified when their code changes.
