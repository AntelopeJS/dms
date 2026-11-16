---
covers:
  - packages/dms/frontend-vue/layers/dms-ui/app/build/components/table/TableViews.vue
  - packages/dms/frontend-vue/layers/dms-ui/app/build/composables/table-view/tableViewBindings.ts
  - packages/dms/frontend-vue/layers/dms-ui/app/build/composables/table-view/tableViewCounts.ts
  - packages/dms/frontend-vue/layers/dms-ui/app/build/composables/table-view/tableViewViews.ts
  - packages/dms/frontend-vue/layers/dms-ui/app/build/composables/table-view/useTableViews.ts
  - packages/dms/frontend-vue/layers/dms-ui/app/build/composables/table-view/utils/tableCounts.ts
  - packages/dms/frontend-vue/layers/dms-ui/app/build/composables/table-view/utils/views.ts
  - packages/interface-dms/src/base/table-view/internal/option-views.ts
docs:
  - packages/dms/docs/04.components/08.tables/1.views.md
---

# Table view saved views

The views strip of a table view: named views (a module's own and the ones users save) drawn as tabs, a strip or a menu, and what the strip says once the user's filters, search or sort change the table the open view gave. The playground's *Views & grouped display* page (`/table-view/table-view-views`) draws its Job runs table under a strip of five views, among them *Failing* (`status is failing`, one run of 32).

## Sub-features

- `table-view-strip-follows-filter-changes`: open *Failing*, which counts 1 and lists one run. A narrower extra filter (`Procedure is empty`) keeps *Failing* open and marked "Changed since the view was opened", its counter follows the table (0), no "Custom filters" shows, and Reset restores the count (1) and drops the extra filter. Clearing the view's own `Status is Failing` filter, changing it to `Paused`, or pressing "Clear filters" leaves the view: no view is drawn open, the strip reads "Custom filters" with Reset and "Save current view", the table lists all 32 runs (or the paused ones), and *Failing* still counts 1, what opening it lists. Clicking *Failing*, or Reset, opens it again. It fails when the strip keeps naming the view after the table left it (it read "Awaiting signature 14" over 14 drafts before AntelopeJS/dms#924).
- `table-view-hidden-column-survives-reload`: on a first visit, which opens the default view *All runs*, hide *Output* from its header's options menu and reload: *All runs* is still open and *Output* still hidden. Then open *Failing*, hide *Status* and reload: *Failing* is still open and *Status* still hidden. It fails when the first visit does not keep the default view it opened, so every reload counts as a first visit and opens the view again over the columns the user hid (ANT-3381).

## How to get to it (user POV)

- Open a view of a table view, then change the filters above the table: the filter chips, "Add a filter", "Clear filters" and the search.

## Driving it with dms-control

```bash
dms-control journey "$RUN" table-view-saved-views [journey-id...]
```

Evidence is under `$RUN/evidence/table-view-saved-views/<journey>/`.

## Gotchas

- The page holds a second table (*Runs by status*, a menu of views): the strip's checks stay `within` the toolbar named "Views" of the first.
- The buttons of the open filter popover have no accessible names: the journey picks its comboboxes by position inside the dialog.
- A view's button name carries its counter ("Failing 1") and, while modified, "Changed since the view was opened".
