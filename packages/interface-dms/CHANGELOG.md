# Changelog

## v0.9.0

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.8.0...v0.9.0)

### Upgrade notes

- **Breaking:** `DefaultLayoutOptions.record` is a `PageRecordLoader` instead of `{ fetchUrl }`, and `PageRecordSource` is removed ([#426](https://github.com/AntelopeJS/dms/pull/426)). `record: { fetchUrl: "/api/sites/get?id={{params.id}}" }` becomes `record: ({ params }) => …` reading the row, in `PageLayoutRequest`'s context.
- **Breaking:** the default tenant is provisioned through `TENANT_BEING_PROVISIONED` ([#420](https://github.com/AntelopeJS/dms/pull/420)). `TenantProvisioningHookPayload.userId` is now `string | undefined`, and an emitter calling `ExecuteHooks(Hook.TENANT_BEING_PROVISIONED, …)` directly no longer gets the schema instance registered: use `ProvisionTenant`.
- **Behavior change:** in generated forms, the fallback language of a `@Localized` field is required ([#427](https://github.com/AntelopeJS/dms/pull/427)). `FormField.fallbackLocale` carries it, and the column's server validator refuses a localized value that fills another language but not that one.
- Table view columns take `visibleWhen` and `disabledWhen` conditions, carried to `FormField` ([#431](https://github.com/AntelopeJS/dms/pull/431)). The `new` and `edit` data routes enforce them: a hidden field is neither required nor written, an edit that hides a `visibleWhen` field clears its stored value, and a `disabledWhen` field keeps its stored value.
- Relations answer "Not found" for unanswered ids; the cascader reads by `?ids=`; lists need the `Foreign` join ([#421](https://github.com/AntelopeJS/dms/pull/421)). The dev manifest lists the origins it rewrites (`originRewrites`, [#434](https://github.com/AntelopeJS/dms/pull/434)).
- Requires `@antelopejs/interface-data-api` `>=0.4.0` (structured `400 { code, fields }`), `@antelopejs/interface-database-decorators` `>=0.1.10` and `@antelopejs/interface-database` `>=0.1.11`. Modules implementing interface-dms move to `>=0.9.0 <0.10.0`; `@antelopejs/dms` 0.11 implements it.

### 🚀 Enhancements

- **frontend:** List the origins the dev manifest rewrites ([#434](https://github.com/AntelopeJS/dms/pull/434))
- **store:** ⚠️  Changing modules from the store is reserved to development ([#418](https://github.com/AntelopeJS/dms/pull/418))
- **relation:** "Not found" for unanswered ids, cascader read by ?ids=, lists need the Foreign join ([#421](https://github.com/AntelopeJS/dms/pull/421))
- **tenants:** Provision the default tenant through TENANT_BEING_PROVISIONED ([#420](https://github.com/AntelopeJS/dms/pull/420))
- **page:** Read the page's record with its layout, in PageLayoutRequest's context ([#426](https://github.com/AntelopeJS/dms/pull/426))
- **page:** Leave a detail page whose record was deleted; 404 shown as not found ([#432](https://github.com/AntelopeJS/dms/pull/432))
- **dms-layout:** ⚠️  Remove the GitHub star button from the footer ([#428](https://github.com/AntelopeJS/dms/pull/428))
- **forms:** Require the fallback language of a localized field ([#427](https://github.com/AntelopeJS/dms/pull/427))
- **table-view:** VisibleWhen and disabledWhen column conditions ([#431](https://github.com/AntelopeJS/dms/pull/431))
- **errors:** Read the data API's { code, fields } field errors ([#433](https://github.com/AntelopeJS/dms/pull/433))

### 🔥 Performance

- **dms-ui:** Load each code snippet's grammar alone, without the editor ([#403](https://github.com/AntelopeJS/dms/pull/403))

### 🩹 Fixes

- **export:** Quote the CSV header line ([#419](https://github.com/AntelopeJS/dms/pull/419))
- **format:** Draw the narrow no-break space in Geist, and keep the locale's ([#422](https://github.com/AntelopeJS/dms/pull/422))
- **playground:** Hydration and invite-extension warnings of the playground pages ([#429](https://github.com/AntelopeJS/dms/pull/429))
- **tabs:** Take the pill tabs' corners from the theme radius ([#359](https://github.com/AntelopeJS/dms/pull/359))
- **modules:** Wait for the listing's background read on a return to the page ([#436](https://github.com/AntelopeJS/dms/pull/436))

### 💅 Refactors

- **i18n:** Translate outside setup through getAppTranslation only ([#423](https://github.com/AntelopeJS/dms/pull/423))
- **hydration:** Read the runtime's isDmsHydrating, drop isHydratingComponent ([#424](https://github.com/AntelopeJS/dms/pull/424))

### 📖 Documentation

- **changelog:** Upgrade notes of dms 0.10.0 ([#417](https://github.com/AntelopeJS/dms/pull/417))
- **deployment:** Require affinity on the realtime routes across instances ([#430](https://github.com/AntelopeJS/dms/pull/430))

### 📦 Build

- **deps:** Dms-frontend 0.9, interface-data-api 0.4, decorators 0.1.10 ([#437](https://github.com/AntelopeJS/dms/pull/437))

### 🏡 Chore

- **release:** @antelopejs/dms v0.10.0 ([6fa3d532](https://github.com/AntelopeJS/dms/commit/6fa3d532))

### ✅ Tests

- Run the backend tests without Ethereal ([#435](https://github.com/AntelopeJS/dms/pull/435))
- **hydration:** Give the live tests isDmsHydrating ([#438](https://github.com/AntelopeJS/dms/pull/438))

#### ⚠️ Breaking Changes

- **store:** ⚠️  Changing modules from the store is reserved to development ([#418](https://github.com/AntelopeJS/dms/pull/418))
- **dms-layout:** ⚠️  Remove the GitHub star button from the footer ([#428](https://github.com/AntelopeJS/dms/pull/428))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Glastis 
- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.8.0

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.7.4...v0.8.0)

### Upgrade notes

- `KpiCard`: `showPreviousValue` defaults to `true`, so a card whose data carries `previousValue` prints it beside the change; set `false` to keep a card compact ([#352](https://github.com/AntelopeJS/dms/pull/352)).
- A `RelationType` / `CascaderRelationType` with `multiple: true` filters with `include` / `exclude` instead of `is` / `is_not`: a saved view or a link filtering it with `is:` lists nothing until saved again or rewritten as `include:` ([#363](https://github.com/AntelopeJS/dms/pull/363)).
- See [Migrate from 0.7 to 0.8](https://github.com/AntelopeJS/dms/blob/main/packages/dms/docs/02.building/16.migration-0-7-to-0-8.md) for the removed compatibility paths.

### 🚀 Enhancements

- **config:** Refuse a production start on public secrets or without the dashboard origin ([#401](https://github.com/AntelopeJS/dms/pull/401))
- **auth:** Take the client address from the header the hosting platform writes (auth.clientIpHeader) ([#405](https://github.com/AntelopeJS/dms/pull/405))
- **frontend:** Proxy the storage's signed URLs through the frontend server ([#406](https://github.com/AntelopeJS/dms/pull/406))
- **tenancy:** ⚠️  Route every member and invite write through changeTenantMembers ([#407](https://github.com/AntelopeJS/dms/pull/407))
- **frontend:** ⚠️  Compute each frontend module from its config, report served versions ([#408](https://github.com/AntelopeJS/dms/pull/408))
- **dms-core:** One public hydration check, isHydratingComponent ([#376](https://github.com/AntelopeJS/dms/pull/376))
- **page:** Route params for header-button availability, breadcrumb parent, one PageLayoutRequest ([#387](https://github.com/AntelopeJS/dms/pull/387))
- Shared page toolbar for pages with a period or live data ([#351](https://github.com/AntelopeJS/dms/pull/351))
- **drawer:** Resizable drawers, 600px side default, and side panel row options for row drawers ([#375](https://github.com/AntelopeJS/dms/pull/375))
- **table-view:** Declare watches on the forms a table view generates ([#379](https://github.com/AntelopeJS/dms/pull/379))
- **interface-dms:** FrontendModulesChanged event for late frontend modules ([#382](https://github.com/AntelopeJS/dms/pull/382))
- **data-types:** Filter a tags column on the rows holding a tag ([#380](https://github.com/AntelopeJS/dms/pull/380))
- **table-view:** ⚠️  Adopt @antelopejs/interface-data-api 0.3 ([#389](https://github.com/AntelopeJS/dms/pull/389))
- **realtime:** Scope page messages to the tenant they are about ([#353](https://github.com/AntelopeJS/dms/pull/353))
- **automation:** Configurable texts, tone, tenant and templates for the DMS automation nodes ([#337](https://github.com/AntelopeJS/dms/pull/337))
- **kpi-card:** Show the comparison value and follow the selected comparison ([#352](https://github.com/AntelopeJS/dms/pull/352))
- **layout-banners:** Scope layout banners to the application's pages by default ([#348](https://github.com/AntelopeJS/dms/pull/348))
- **row-navigation:** Steps follow the table's full result, live tables and the kanban ([#375](https://github.com/AntelopeJS/dms/pull/375), [#398](https://github.com/AntelopeJS/dms/pull/398))
- **layout:** Settings from the account menu only, profile picture in the sidebar ([#374](https://github.com/AntelopeJS/dms/pull/374))
- **form:** Dependent relation options and field value rules ([#346](https://github.com/AntelopeJS/dms/pull/346))
- **table-view:** Require a table's list for the actions reached from its rows ([#371](https://github.com/AntelopeJS/dms/pull/371))
- **automation:** Dry-run the DMS actions in a builder test run ([#388](https://github.com/AntelopeJS/dms/pull/388))

### 🩹 Fixes

- **deps:** Require the tenant admission barrier and access evaluation contract ([#367](https://github.com/AntelopeJS/dms/pull/367))
- **frontend:** Run on @antelopejs/dms-frontend 0.7 ([#368](https://github.com/AntelopeJS/dms/pull/368))
- **startup:** Answer 503 with Retry-After until the DMS schemas are bound ([#369](https://github.com/AntelopeJS/dms/pull/369))
- **tenant-lifecycle:** Refuse admission under a barrier with 409, not 500 ([#409](https://github.com/AntelopeJS/dms/pull/409))
- **auth:** A session outlives the browser only when written persistent ([#377](https://github.com/AntelopeJS/dms/pull/377))
- **layout:** Store a signed-in user's footer language switch on their profile ([#383](https://github.com/AntelopeJS/dms/pull/383))
- **skills:** Make dms-dev.sh stop, status and restart work on Windows Git Bash ([#384](https://github.com/AntelopeJS/dms/pull/384))
- **layout:** Translated close / select labels and a readable phone header ([#386](https://github.com/AntelopeJS/dms/pull/386))
- **notifications:** Stop Mark read clicks from landing on Delete in the inbox ([#342](https://github.com/AntelopeJS/dms/pull/342))
- **grid:** Lay a row nested in a cell out on its own children ([#350](https://github.com/AntelopeJS/dms/pull/350))
- Onboarding SSR read, and row action, row token and action-target container fixes for block-built pages ([#332](https://github.com/AntelopeJS/dms/pull/332))
- **chart:** Chart and widget fixes for block-built dashboards ([#334](https://github.com/AntelopeJS/dms/pull/334))
- **save-bar:** Lift the toasts above a save bar on the bottom edge ([#372](https://github.com/AntelopeJS/dms/pull/372))
- **table-view:** Row containers, grouped display, cards, bulk row runs, wide tables and calendar period comparisons ([#344](https://github.com/AntelopeJS/dms/pull/344))
- **realtime:** Share one realtime connection between a browser's tabs ([#335](https://github.com/AntelopeJS/dms/pull/335))
- **form:** Generic form and i18n fixes (nested options, secret rotation, group labels, module-default note) ([#333](https://github.com/AntelopeJS/dms/pull/333))
- **data-types:** Keep formatters out of component setup and log dev errors ([#338](https://github.com/AntelopeJS/dms/pull/338))
- **data-types:** Read a null array as empty in include and exclude filters ([#341](https://github.com/AntelopeJS/dms/pull/341))
- **form:** Keep a refused submit's field error while its value is unchanged ([#360](https://github.com/AntelopeJS/dms/pull/360))
- **form:** Label a relation's ids from its select route, in the picker and the filter chips ([#378](https://github.com/AntelopeJS/dms/pull/378))
- **table:** Write a number field's unit wherever its value is drawn ([#381](https://github.com/AntelopeJS/dms/pull/381))
- **modules:** Modules page and module store polish (installed tiles, store view, working copies) ([#345](https://github.com/AntelopeJS/dms/pull/345))
- **format:** Read durations as written, let a number step drive the steppers, group every figure ([#391](https://github.com/AntelopeJS/dms/pull/391))
- **form:** Address suggestions, relation add entry, confirm Close and date picker close ([#392](https://github.com/AntelopeJS/dms/pull/392))
- **roles:** Preview a role as a non-owner member, and tell resolvers it is a preview ([#356](https://github.com/AntelopeJS/dms/pull/356))
- **form:** Forms and KeyValueList follow the container's width in drawers and modals ([#375](https://github.com/AntelopeJS/dms/pull/375), [#399](https://github.com/AntelopeJS/dms/pull/399))
- **table:** Count the archive without agreeing with a noun, let a table view name it ([#394](https://github.com/AntelopeJS/dms/pull/394))
- **form:** Show a read-only list as a table of values, a URL as its image ([#395](https://github.com/AntelopeJS/dms/pull/395))
- **dialog:** Closing any dialog gives the page its clicks at once ([#375](https://github.com/AntelopeJS/dms/pull/375), [#400](https://github.com/AntelopeJS/dms/pull/400))
- **data-types:** Multiple relation include; date greater than excludes the picked day; order filters skip empty values; typed chip editor ([#363](https://github.com/AntelopeJS/dms/pull/363))
- **table-view:** Combine views with tabs, date chips for relative filters, and keep the tab on reload ([#358](https://github.com/AntelopeJS/dms/pull/358))
- **form:** Narrow date fields and repeater rows, and relation labels in change notes ([#361](https://github.com/AntelopeJS/dms/pull/361))
- **frontend:** Refresh counts after a kanban move, no header sort on a hand-ordered table ([#362](https://github.com/AntelopeJS/dms/pull/362))
- **frontend:** Configured add label in every placement, bulk toast counts what the route changed ([#364](https://github.com/AntelopeJS/dms/pull/364))
- **table-view:** Warn at registration about a quick filter with no values to pick ([#370](https://github.com/AntelopeJS/dms/pull/370))
- **form:** Create, cancel and save behaviour of forms, section scroll, error summary ([#343](https://github.com/AntelopeJS/dms/pull/343))
- No layout shift from the live toggle, fetched banners, KPI and table skeletons, and live rows ([#354](https://github.com/AntelopeJS/dms/pull/354))
- **table-view:** Links open on the table's defaults, global nav badges, kept view search ([#365](https://github.com/AntelopeJS/dms/pull/365))
- **table-view:** Tab and view counters count what a click would list ([#373](https://github.com/AntelopeJS/dms/pull/373))
- **table-view:** Generic TableView fixes from block-built pages ([#336](https://github.com/AntelopeJS/dms/pull/336))
- **table-view:** Per-action access in forms, relative dates while hydrating, expanded rows ([#385](https://github.com/AntelopeJS/dms/pull/385))

### 💅 Refactors

- **startup:** Rely on the api startup gate instead of a DMS one ([#402](https://github.com/AntelopeJS/dms/pull/402))
- **table-view:** Keep a table view's row actions schema in its own module ([#393](https://github.com/AntelopeJS/dms/pull/393))
- **dms:** ⚠️  Remove the compatibility paths of #119 and #172, restore the migration guides ([#390](https://github.com/AntelopeJS/dms/pull/390), [#119](https://github.com/AntelopeJS/dms/issues/119), [#172](https://github.com/AntelopeJS/dms/issues/172))

### 📖 Documentation

- **file-storage:** Uploads stop at 100 MB at the Cloudflare edge on AntelopeJS Cloud ([#410](https://github.com/AntelopeJS/dms/pull/410))
- **migration:** Note the KPI compared-figure default and include on multiple relations ([#415](https://github.com/AntelopeJS/dms/pull/415))

### 🏡 Chore

- **release:** @antelopejs/dms v0.9.6 ([0ccc9b57](https://github.com/AntelopeJS/dms/commit/0ccc9b57))
- **release:** @antelopejs/dms v0.9.7 ([ababaeda](https://github.com/AntelopeJS/dms/commit/ababaeda))
- **release:** @antelopejs/dms v0.9.8 ([75daeb05](https://github.com/AntelopeJS/dms/commit/75daeb05))

### ✅ Tests

- Pin file-storage-local 0.1.11, mongodb 1.4.4 and api with interface-api 0.0.16 in the harness ([#411](https://github.com/AntelopeJS/dms/pull/411))
- **realtime:** Bind the verified tenant as the auth decorator does ([#414](https://github.com/AntelopeJS/dms/pull/414))

#### ⚠️ Breaking Changes

- **tenancy:** ⚠️  Route every member and invite write through changeTenantMembers ([#407](https://github.com/AntelopeJS/dms/pull/407))
- **frontend:** ⚠️  Compute each frontend module from its config, report served versions ([#408](https://github.com/AntelopeJS/dms/pull/408))
- **table-view:** ⚠️  Adopt @antelopejs/interface-data-api 0.3 ([#389](https://github.com/AntelopeJS/dms/pull/389))
- **dms:** ⚠️  Remove the compatibility paths of #119 and #172, restore the migration guides ([#390](https://github.com/AntelopeJS/dms/pull/390), [#119](https://github.com/AntelopeJS/dms/issues/119), [#172](https://github.com/AntelopeJS/dms/issues/172))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Maxime Westhoven ([@mwesto](http://github.com/mwesto))

## v0.7.4

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.7.3...v0.7.4)

### 🚀 Enhancements

- **tenant-lifecycle:** Pause producer admission and evaluate every tenant access gate ([#366](https://github.com/AntelopeJS/dms/pull/366))

### 🩹 Fixes

- **deps:** Require the shared preview presentation contract ([#340](https://github.com/AntelopeJS/dms/pull/340))
- **frontend:** Read the onboarding status and permissions through the data layer ([#357](https://github.com/AntelopeJS/dms/pull/357))

### 🏡 Chore

- **release:** @antelopejs/dms v0.9.5 ([a8e395eb](https://github.com/AntelopeJS/dms/commit/a8e395eb))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.7.3

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.7.2...v0.7.3)

### 🚀 Enhancements

- **preview:** Share simple options and document real outcomes ([#339](https://github.com/AntelopeJS/dms/pull/339))

### 🩹 Fixes

- **docs:** Use a sandbox-compatible temporary build database ([#326](https://github.com/AntelopeJS/dms/pull/326))
- Install DMS frontend with the root workspace ([#322](https://github.com/AntelopeJS/dms/pull/322))
- **modules:** Top-align card content and place readouts below descriptions ([#328](https://github.com/AntelopeJS/dms/pull/328))
- **modules:** Reuse registered names in the store ([#330](https://github.com/AntelopeJS/dms/pull/330))
- **playground:** Use the workspace CLI and compatible core interface ([#331](https://github.com/AntelopeJS/dms/pull/331))

### 📖 Documentation

- Create the DMS demo through the CLI in quickstart ([#327](https://github.com/AntelopeJS/dms/pull/327))

### 🏡 Chore

- **release:** @antelopejs/dms v0.9.3 ([1aaf5404](https://github.com/AntelopeJS/dms/commit/1aaf5404))
- **docs:** Capture temporary MongoDB startup diagnostics ([#325](https://github.com/AntelopeJS/dms/pull/325))
- **playground:** Refresh compatible dependencies ([#329](https://github.com/AntelopeJS/dms/pull/329))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.2

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.7.1...v0.7.2)

### 🚀 Enhancements

- **preview:** Live block preview page, block catalog and screenshots for the docs ([#280](https://github.com/AntelopeJS/dms/pull/280))

### 🔥 Performance

- **layout:** Bundle the Geist fonts and preload only the text face ([#311](https://github.com/AntelopeJS/dms/pull/311))
- **table:** Drag with SortableJS through useSortable instead of vuedraggable ([#312](https://github.com/AntelopeJS/dms/pull/312))
- **table-view:** Share a source read between the list and a counter asking the same ([#313](https://github.com/AntelopeJS/dms/pull/313))

### 🩹 Fixes

- **deps:** Move to @antelopejs/core 1.15.2, @antelopejs/interface-core 0.2.3 and @antelopejs/interface-dms 0.7.1 ([#303](https://github.com/AntelopeJS/dms/pull/303))
- **docs:** Regenerate the block catalog for dms 0.9.2 ([#315](https://github.com/AntelopeJS/dms/pull/315))
- **form:** Leave a failed record read's toast to the browser ([#304](https://github.com/AntelopeJS/dms/pull/304))
- **page:** Leave a page's layout out of the components its preload looks up ([#306](https://github.com/AntelopeJS/dms/pull/306))
- **settings:** Suggest the reader's time zone in a server-rendered region page ([#308](https://github.com/AntelopeJS/dms/pull/308))
- **frontend:** Set the async data scope before any module's plugin reads ([#305](https://github.com/AntelopeJS/dms/pull/305))
- **blocks:** Have refreshPageBlocks() wait for the charts and tables it refreshes ([#307](https://github.com/AntelopeJS/dms/pull/307))

### 📖 Documentation

- **dms:** Restructure docs with per-block pages, live previews and an AI section ([#277](https://github.com/AntelopeJS/dms/pull/277))
- Remove the DMS 0.9 upgrade page ([#316](https://github.com/AntelopeJS/dms/pull/316))
- **dms:** Document running the DMS inside AdonisJS ([#318](https://github.com/AntelopeJS/dms/pull/318))
- Make the DMS 0.9 upgrade notes accurate and complete ([#310](https://github.com/AntelopeJS/dms/pull/310))
- Streamline agent guidance ([#317](https://github.com/AntelopeJS/dms/pull/317))
- Colocate the DMS consumer reference with its interface ([#320](https://github.com/AntelopeJS/dms/pull/320))
- Make dense guide sections easier to scan ([#321](https://github.com/AntelopeJS/dms/pull/321))

### 📦 Build

- **dms:** Leave tests and tooling out of the published package ([#314](https://github.com/AntelopeJS/dms/pull/314))

### 🏡 Chore

- **release:** @antelopejs/dms v0.9.2 ([beb09f9d](https://github.com/AntelopeJS/dms/commit/beb09f9d))
- **release:** Propagate published dependency floors ([#323](https://github.com/AntelopeJS/dms/pull/323))

### ✅ Tests

- **live:** Hold the page's data refresh while paused, not a user's ([#309](https://github.com/AntelopeJS/dms/pull/309))

### 🤖 CI

- **docs:** Build and verify the hosted preview playground ([#319](https://github.com/AntelopeJS/dms/pull/319))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Alessandro Aloisio

## v0.7.1

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.7.0...v0.7.1)

### 🚀 Enhancements

- **dms:** Install, update, pause and remove modules from the Modules page ([#285](https://github.com/AntelopeJS/dms/pull/285))

### 🩹 Fixes

- **auth:** Write the user's activity before the request's own user writes ([#301](https://github.com/AntelopeJS/dms/pull/301))
- **deps:** Require @antelopejs/interface-core 0.2.2 and @antelopejs/core 1.15.1 ([#302](https://github.com/AntelopeJS/dms/pull/302))

### 📖 Documentation

- **period:** Document usePeriodScopePreset and test the top list badge through hydration ([#300](https://github.com/AntelopeJS/dms/pull/300))

### 🏡 Chore

- **release:** @antelopejs/dms v0.9.0 ([5873abe2](https://github.com/AntelopeJS/dms/commit/5873abe2))
- **release:** @antelopejs/dms v0.9.1 ([0220ff71](https://github.com/AntelopeJS/dms/commit/0220ff71))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.0

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.6.1...v0.7.0)

### 🚀 Enhancements

- ⚠️  Dms 0.9.0 and interface-dms 0.7.0, server rendering on renderer 0.6 ([#299](https://github.com/AntelopeJS/dms/pull/299))

### 🏡 Chore

- **release:** @antelopejs/dms v0.8.3 ([d3934db3](https://github.com/AntelopeJS/dms/commit/d3934db3))

#### ⚠️ Breaking Changes

- ⚠️  Dms 0.9.0 and interface-dms 0.7.0, server rendering on renderer 0.6 ([#299](https://github.com/AntelopeJS/dms/pull/299))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.6.1

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.6.0...v0.6.1)

### 🚀 Enhancements

- **blocks:** Fit the simple options to someone building a page without code ([#251](https://github.com/AntelopeJS/dms/pull/251))

### 🩹 Fixes

- **grid:** Collapse grid row cells whose block renders nothing ([#272](https://github.com/AntelopeJS/dms/pull/272))
- **links:** Open a row field holding a whole URL as written ([#273](https://github.com/AntelopeJS/dms/pull/273))

### 🏡 Chore

- **release:** @antelopejs/dms v0.8.0 ([c3f4a875](https://github.com/AntelopeJS/dms/commit/c3f4a875))
- **release:** @antelopejs/dms v0.8.1 ([a43baf77](https://github.com/AntelopeJS/dms/commit/a43baf77))
- **release:** @antelopejs/dms v0.8.2 ([9030f932](https://github.com/AntelopeJS/dms/commit/9030f932))

### 🤖 CI

- Speed up pipeline ([#271](https://github.com/AntelopeJS/dms/pull/271))

### ❤️ Contributors

- Glastis ([@Glastis](http://github.com/Glastis))
- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.6.0

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.5.13...v0.6.0)

### 🚀 Enhancements

- **emails:** Write every built-in email in the recipient's language ([#260](https://github.com/AntelopeJS/dms/pull/260))
- **playground:** Cover every DMS feature and index them ([#261](https://github.com/AntelopeJS/dms/pull/261))
- **footer:** Let a layer remove footer links and configure the copyright, star and language picker ([#268](https://github.com/AntelopeJS/dms/pull/268))
- **table-view:** ⚠️  List the table display explicitly in displays ([#269](https://github.com/AntelopeJS/dms/pull/269))

### 🩹 Fixes

- **charts:** Redraw charts resized during their animation ([#258](https://github.com/AntelopeJS/dms/pull/258))
- **emails:** Drop unreachable logos and align the two-factor email ([#259](https://github.com/AntelopeJS/dms/pull/259))
- **hooks:** Let event hook handlers return any value ([#266](https://github.com/AntelopeJS/dms/pull/266))
- **ui:** Match check list, instant save pill and list row truncation to their states ([#265](https://github.com/AntelopeJS/dms/pull/265))
- **blocks:** Guard realtime topics, activity feed fold and banner tone icons ([#262](https://github.com/AntelopeJS/dms/pull/262))
- **charts:** Fix chart rendering defaults and the card delta unit ([#264](https://github.com/AntelopeJS/dms/pull/264))
- **form:** Apply group order, send untouched action forms, name cascader picks ([#263](https://github.com/AntelopeJS/dms/pull/263))
- **layout:** Size nested stacks in a row, defer client-only header actions and accept a unitless grid gap ([#267](https://github.com/AntelopeJS/dms/pull/267))

### 💅 Refactors

- ⚠️  Resolve template tokens the same way in every option ([#257](https://github.com/AntelopeJS/dms/pull/257))

### 🏡 Chore

- **release:** @antelopejs/dms v0.7.21 ([e852d5c9](https://github.com/AntelopeJS/dms/commit/e852d5c9))

#### ⚠️ Breaking Changes

- **table-view:** ⚠️  List the table display explicitly in displays ([#269](https://github.com/AntelopeJS/dms/pull/269))
- ⚠️  Resolve template tokens the same way in every option ([#257](https://github.com/AntelopeJS/dms/pull/257))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.5.13

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.5.12...v0.5.13)

### 🚀 Enhancements

- **layout:** Let a header button's label read the page's query ([#247](https://github.com/AntelopeJS/dms/pull/247))
- **table-view:** Let a row's panel, drawer or modal show another row in place ([#252](https://github.com/AntelopeJS/dms/pull/252))
- **table-view:** Let a table view drop the built-in table display ([#255](https://github.com/AntelopeJS/dms/pull/255))

### 🩹 Fixes

- **table-view:** Reopen a record link to a closed row and keep chips from restoring it ([#249](https://github.com/AntelopeJS/dms/pull/249))
- **table-view:** Keep an empty list on screen while it is read again ([#250](https://github.com/AntelopeJS/dms/pull/250))
- **table-view:** Serve the row menu label to the browser ([#253](https://github.com/AntelopeJS/dms/pull/253))
- **table-view:** Keep the tab the user opens in the URL ([#254](https://github.com/AntelopeJS/dms/pull/254))

### 🏡 Chore

- **release:** @antelopejs/dms v0.7.17 ([b5929d77](https://github.com/AntelopeJS/dms/commit/b5929d77))
- **release:** @antelopejs/dms v0.7.18 ([7777b64c](https://github.com/AntelopeJS/dms/commit/7777b64c))
- **release:** @antelopejs/dms v0.7.19 ([265c5e12](https://github.com/AntelopeJS/dms/commit/265c5e12))
- **release:** @antelopejs/dms v0.7.20 ([84dd3ae7](https://github.com/AntelopeJS/dms/commit/84dd3ae7))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.5.12

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.5.11...v0.5.12)

### 🚀 Enhancements

- **actions:** Let a button download a file with the user's session ([#246](https://github.com/AntelopeJS/dms/pull/246))

### 🏡 Chore

- **release:** @antelopejs/dms v0.7.16 ([05bb8bba](https://github.com/AntelopeJS/dms/commit/05bb8bba))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.5.11

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.5.10...v0.5.11)

### 🚀 Enhancements

- **layout:** Hide header buttons by availability and order them with page actions ([#237](https://github.com/AntelopeJS/dms/pull/237))
- **period:** Roll calendar presets over at midnight, sync the route query and cap custom ranges ([#227](https://github.com/AntelopeJS/dms/pull/227))
- **table-view:** Follow the URL tab after mount ([#229](https://github.com/AntelopeJS/dms/pull/229))

### 🏡 Chore

- **release:** @antelopejs/dms v0.7.15 ([3c1d36b2](https://github.com/AntelopeJS/dms/commit/3c1d36b2))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.5.10

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.5.9...v0.5.10)

### 🚀 Enhancements

- **email:** Make the EmailLayout heading and separator optional and guard its logo ([#223](https://github.com/AntelopeJS/dms/pull/223))
- **form:** Make useControlError a public composable ([#224](https://github.com/AntelopeJS/dms/pull/224))
- **table-view:** Show visible query param filters as removable chips ([#228](https://github.com/AntelopeJS/dms/pull/228))
- **page:** Let a frontend module declare public endpoints ([#230](https://github.com/AntelopeJS/dms/pull/230))

### 🩹 Fixes

- **notifications:** Treat a reused idempotency key as already delivered ([#222](https://github.com/AntelopeJS/dms/pull/222))
- **table-view:** Notify an unresolved record link and follow a record change ([#226](https://github.com/AntelopeJS/dms/pull/226))

### 🏡 Chore

- **release:** @antelopejs/dms v0.7.14 ([50907541](https://github.com/AntelopeJS/dms/commit/50907541))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.5.9

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.5.8...v0.5.9)

### 🚀 Enhancements

- **interface:** Expose the resolved client address to modules ([#235](https://github.com/AntelopeJS/dms/pull/235))
- **form:** Keep out-of-range numbers, interpolate field error params and expose the required legend ([#231](https://github.com/AntelopeJS/dms/pull/231))
- **confirm:** Add useConfirmFrom and a case-insensitive typed confirmation ([#232](https://github.com/AntelopeJS/dms/pull/232))
- **page:** Let a page failing its validation redirect instead of answering not found ([#236](https://github.com/AntelopeJS/dms/pull/236))
- **links:** Let row links and link actions keep the page's context ([#238](https://github.com/AntelopeJS/dms/pull/238))

### 🏡 Chore

- **release:** @antelopejs/dms v0.7.13 ([c0a0eb50](https://github.com/AntelopeJS/dms/commit/c0a0eb50))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.5.8

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.5.7...v0.5.8)

### 🩹 Fixes

- **module:** Redirect a module's address on the server, and refresh chart cards live ([#239](https://github.com/AntelopeJS/dms/pull/239))

### 🏡 Chore

- **release:** @antelopejs/dms v0.7.12 ([2a855a10](https://github.com/AntelopeJS/dms/commit/2a855a10))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.5.7

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.5.6...v0.5.7)

### 🚀 Enhancements

- **dms:** Give custom components the live, form and record APIs stock blocks use ([#225](https://github.com/AntelopeJS/dms/pull/225))
- **dms:** Close the module gaps left by the API console ([#233](https://github.com/AntelopeJS/dms/pull/233))

### 🩹 Fixes

- **guard:** Space several children the way the page spaces its blocks ([#221](https://github.com/AntelopeJS/dms/pull/221))

### 🏡 Chore

- **release:** @antelopejs/dms v0.7.10 ([e4747dce](https://github.com/AntelopeJS/dms/commit/e4747dce))
- **release:** @antelopejs/dms v0.7.11 ([54748e78](https://github.com/AntelopeJS/dms/commit/54748e78))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.5.6

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.5.5...v0.5.6)

### 🚀 Enhancements

- **interface:** Expose the API base URL to modules with GetApiBaseUrl ([#215](https://github.com/AntelopeJS/dms/pull/215))
- **confirm:** Add a secondary action to ConfirmDialog ([#214](https://github.com/AntelopeJS/dms/pull/214))
- **period:** Add relative range label, comparison toggle, all-time preset and shared remembered period ([#209](https://github.com/AntelopeJS/dms/pull/209))
- **blocks:** Close the stock block gaps left by the dms-api migration ([#210](https://github.com/AntelopeJS/dms/pull/210))
- **blocks:** Treat a 404 as not found, and draw it the same in a Guard ([#216](https://github.com/AntelopeJS/dms/pull/216))
- **table-view:** Close the search and side panel gaps of a custom request log ([#212](https://github.com/AntelopeJS/dms/pull/212))
- **page:** Bring the live mode to parity with custom live controls ([#211](https://github.com/AntelopeJS/dms/pull/211))
- **table-view:** Pin rows, fall back to the default sort, name row actions after the row ([#218](https://github.com/AntelopeJS/dms/pull/218))
- **page:** Let header actions follow the page query ([#219](https://github.com/AntelopeJS/dms/pull/219))

### 🩹 Fixes

- **realtime:** Keep a page's topics when it remounts at the same path ([#213](https://github.com/AntelopeJS/dms/pull/213))
- **preferences:** Keep the server-read table state in a compact cookie and the rest in localStorage ([#217](https://github.com/AntelopeJS/dms/pull/217))

### 🏡 Chore

- **release:** @antelopejs/dms v0.7.9 ([33baee22](https://github.com/AntelopeJS/dms/commit/33baee22))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.5.5

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.5.4...v0.5.5)

### 🚀 Enhancements

- **dms:** Hand cards their row's custom actions and name a block's sibling ([#207](https://github.com/AntelopeJS/dms/pull/207))

### 🏡 Chore

- **release:** @antelopejs/dms v0.7.8 ([515bcaf](https://github.com/AntelopeJS/dms/commit/515bcaf))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.5.4

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.5.3...v0.5.4)

### 🚀 Enhancements

- **dms:** Group the jump navigation chips by navGroup ([#200](https://github.com/AntelopeJS/dms/pull/200))
- **table-view:** Tone duration and text cells from a row field ([#201](https://github.com/AntelopeJS/dms/pull/201))
- **period-selector:** Keep the period in the page URL ([#204](https://github.com/AntelopeJS/dms/pull/204))
- **table-view:** Open rows in a side panel action target ([#202](https://github.com/AntelopeJS/dms/pull/202))
- **page:** Add a Direct / Pause live mode over the page realtime ([#203](https://github.com/AntelopeJS/dms/pull/203))

### 🩹 Fixes

- **field-row:** Span both form columns when a row has no label ([#205](https://github.com/AntelopeJS/dms/pull/205))

### 🏡 Chore

- **release:** @antelopejs/dms v0.7.6 ([e17d7c9](https://github.com/AntelopeJS/dms/commit/e17d7c9))
- **release:** @antelopejs/dms v0.7.7 ([32db065](https://github.com/AntelopeJS/dms/commit/32db065))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.5.3

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.5.2...v0.5.3)

### 🚀 Enhancements

- **dms:** Small block, form and table view options for module layouts ([#198](https://github.com/AntelopeJS/dms/pull/198))

### 🩹 Fixes

- **table-view:** Search searchable fields that are not filterable ([#196](https://github.com/AntelopeJS/dms/pull/196))
- **dms:** Bind the export job proxies, word single-row delete confirms, translate aria-labels and tenant guards ([#197](https://github.com/AntelopeJS/dms/pull/197))

### 🏡 Chore

- **release:** @antelopejs/dms v0.7.5 ([3bad9b6](https://github.com/AntelopeJS/dms/commit/3bad9b6))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.5.2

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.5.1...v0.5.2)

### 🚀 Enhancements

- **table-view:** Reorder the cards of the cards display ([#194](https://github.com/AntelopeJS/dms/pull/194))

### 🩹 Fixes

- **dms-ui:** Declare @lezer/common, which the code highlighter imports ([#192](https://github.com/AntelopeJS/dms/pull/192))
- **table-view:** Open the toolbar search from its button again ([#193](https://github.com/AntelopeJS/dms/pull/193))

### 📦 Build

- **deps:** Require interface-dms 0.5.1 and dms-frontend 0.5.2 ([#191](https://github.com/AntelopeJS/dms/pull/191))

### 🏡 Chore

- **release:** @antelopejs/dms v0.7.2 ([18f8a17](https://github.com/AntelopeJS/dms/commit/18f8a17))
- **release:** @antelopejs/dms v0.7.3 ([f27b9c5](https://github.com/AntelopeJS/dms/commit/f27b9c5))
- **release:** @antelopejs/dms v0.7.4 ([b328fa3](https://github.com/AntelopeJS/dms/commit/b328fa3))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.5.1

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.5.0...v0.5.1)

### 🚀 Enhancements

- **table-view:** Resolve route tokens in TableView.fromSource fetchUrl ([#178](https://github.com/AntelopeJS/dms/pull/178))
- **blocks:** Accept composed texts in ActivityFeed, Meter, TopListCard and NavCardGrid ([#179](https://github.com/AntelopeJS/dms/pull/179))
- **key-value-list:** Add a copy button to key / value rows ([#180](https://github.com/AntelopeJS/dms/pull/180))
- **blocks:** Add a read-only CodeBlock block ([#182](https://github.com/AntelopeJS/dms/pull/182))
- **dms-ui:** Open a drawer action target from a chosen edge ([#188](https://github.com/AntelopeJS/dms/pull/188))
- **table-view:** Tone status pills and pills per row ([#181](https://github.com/AntelopeJS/dms/pull/181))
- **blocks:** Follow a period scope and realtime topics on list blocks, Meter and Tab badges ([#184](https://github.com/AntelopeJS/dms/pull/184))
- **banner:** Read a banner's content from a route ([#186](https://github.com/AntelopeJS/dms/pull/186))
- **table-view:** Reload rows on page refresh and on realtimeTopic events ([#185](https://github.com/AntelopeJS/dms/pull/185))

### 🩹 Fixes

- **ui:** Lay out DmsMasterDetail from its own width ([#183](https://github.com/AntelopeJS/dms/pull/183))
- **tenancy:** Register each tenant as an instance of the dms-tenant schema ([#190](https://github.com/AntelopeJS/dms/pull/190))
- **ui:** Table search label, mono cell ellipsis, flow canvas delete badge and late empty-state slots ([#187](https://github.com/AntelopeJS/dms/pull/187))
- **table-view:** Treat URL query filters as filters and reset the page when they change ([#189](https://github.com/AntelopeJS/dms/pull/189))

### 🏡 Chore

- **release:** @antelopejs/dms v0.7.1 ([23cf94c](https://github.com/AntelopeJS/dms/commit/23cf94c))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.5.0

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.4.2...v0.5.0)

### 🚀 Enhancements

- **layout:** Dock module side panels next to the page ([#168](https://github.com/AntelopeJS/dms/pull/168))
- **command-palette:** Add an assistant mode a frontend module can provide ([#169](https://github.com/AntelopeJS/dms/pull/169))

### 🩹 Fixes

- **dms:** ⚠️  Harden auth and account flows, require permission ancestors, open settings to members ([#172](https://github.com/AntelopeJS/dms/pull/172))

### 🏡 Chore

- **release:** @antelopejs/dms v0.6.2 ([c2f3269](https://github.com/AntelopeJS/dms/commit/c2f3269))
- **release:** @antelopejs/dms v0.7.0 ([f8cc120](https://github.com/AntelopeJS/dms/commit/f8cc120))

#### ⚠️ Breaking Changes

- **dms:** ⚠️  Harden auth and account flows, require permission ancestors, open settings to members ([#172](https://github.com/AntelopeJS/dms/pull/172))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Maxime Westhoven ([@mwesto](http://github.com/mwesto))

## v0.4.2

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.4.1...v0.4.2)

### 🚀 Enhancements

- **dms:** Compose block texts client-side with typed params and resolve layout banners per request ([#173](https://github.com/AntelopeJS/dms/pull/173))
- **dms:** Compose table cell sub-lines and add the two_line display and empty identities ([#175](https://github.com/AntelopeJS/dms/pull/175))

### 🏡 Chore

- **release:** @antelopejs/dms v0.6.1 ([3c2fb0a](https://github.com/AntelopeJS/dms/commit/3c2fb0a))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.4.1

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.4.0...v0.4.1)

### 🚀 Enhancements

- **dms:** Resolve route tokens in block data URLs and refresh page blocks after an action ([#170](https://github.com/AntelopeJS/dms/pull/170))

### 🏡 Chore

- **release:** @antelopejs/dms v0.6.0 ([bdce838](https://github.com/AntelopeJS/dms/commit/bdce838))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.4.0

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.3.6...v0.4.0)

### 🩹 Fixes

- **interface-dms:** ⚠️  Release the breaking changes of #119 as 0.4.0 ([#166](https://github.com/AntelopeJS/dms/pull/166), [#119](https://github.com/AntelopeJS/dms/issues/119))

#### ⚠️ Breaking Changes

- **interface-dms:** ⚠️  Release the breaking changes of #119 as 0.4.0 ([#166](https://github.com/AntelopeJS/dms/pull/166), [#119](https://github.com/AntelopeJS/dms/issues/119))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.6

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.3.5...v0.3.6)

> [!WARNING]
> 0.3.6 was unpublished from npm: it shipped the breaking changes of [#119](https://github.com/AntelopeJS/dms/pull/119) under a patch version: changelogen 0.5 only reads a breaking change from a `!` in the commit header, not from a `BREAKING CHANGE:` footer. Use 0.4.0.

### 🚀 Enhancements

- **dms:** Port the v2 design across the dashboard ([#119](https://github.com/AntelopeJS/dms/pull/119))

### 🩹 Fixes

- **layout:** Hold the in-flight modules listing fetch on the DMS app ([#121](https://github.com/AntelopeJS/dms/pull/121))
- **tab:** Space the blocks of a tab like the page spaces its own ([#98](https://github.com/AntelopeJS/dms/pull/98))
- **dev-reload:** End the reload streams when the module stops ([#125](https://github.com/AntelopeJS/dms/pull/125))

### 🏡 Chore

- **release:** @antelopejs/dms v0.5.4 ([a301255](https://github.com/AntelopeJS/dms/commit/a301255))
- **release:** @antelopejs/dms v0.5.5 ([2eb0e86](https://github.com/AntelopeJS/dms/commit/2eb0e86))
- **release:** @antelopejs/dms v0.5.6 ([76d9ee3](https://github.com/AntelopeJS/dms/commit/76d9ee3))

### ❤️ Contributors

- Maxime Westhoven ([@mwesto](http://github.com/mwesto))
- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Glastis ([@Glastis](http://github.com/Glastis))
- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.3.5

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.3.4...v0.3.5)

### 🩹 Fixes

- **invites:** Tell the inviter when the invitation e-mail was not sent ([#122](https://github.com/AntelopeJS/dms/pull/122))

### 🏡 Chore

- **release:** @antelopejs/dms v0.5.3 ([335141d](https://github.com/AntelopeJS/dms/commit/335141d))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.4

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.3.3...v0.3.4)

### 🩹 Fixes

- **table-view:** Validate file provenance against every TableView sharing a data controller ([#112](https://github.com/AntelopeJS/dms/pull/112))
- **dms-ui:** Stable SSR ids, forbidden upload headers and missing-file state in upload inputs ([#113](https://github.com/AntelopeJS/dms/pull/113))
- **attachments:** Enforce field constraints at presign and stop retrying missing stored files ([#114](https://github.com/AntelopeJS/dms/pull/114))
- **resource-form:** Accept native files submitted from ResourceForm blocks ([#115](https://github.com/AntelopeJS/dms/pull/115))
- **playground:** Promote, validate and clean profile files through SaveComponentFiles ([#116](https://github.com/AntelopeJS/dms/pull/116))
- **table-view:** Accept native files from page-mode TableView forms ([#117](https://github.com/AntelopeJS/dms/pull/117))

### 🏡 Chore

- **release:** @antelopejs/dms v0.5.2 ([2496b99](https://github.com/AntelopeJS/dms/commit/2496b99))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.3

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.3.2...v0.3.3)

### 🚀 Enhancements

- **hooks:** Run DATABASE_INITIALIZED handlers registered after startup ([#104](https://github.com/AntelopeJS/dms/pull/104))

### 🩹 Fixes

- **layout:** Keep the page prop off the page stack and write baseURL where it is read ([#100](https://github.com/AntelopeJS/dms/pull/100))
- **dms:** Hoist entries of a missing category in the site layout tree ([#101](https://github.com/AntelopeJS/dms/pull/101))
- **invite-extensions:** Tell a module reclaiming its key from a conflict ([#103](https://github.com/AntelopeJS/dms/pull/103))
- **shortcuts:** Register every module's shortcut registry, not only dms-ui's ([#107](https://github.com/AntelopeJS/dms/pull/107))
- **skills:** Scope dms-dev stop/restart to the project and support macOS ([#108](https://github.com/AntelopeJS/dms/pull/108))
- **realtime:** End SSE streams on stop and reconnect user streams on EOF ([#109](https://github.com/AntelopeJS/dms/pull/109))
- **page:** Prepare page-extension components as the extending module ([#110](https://github.com/AntelopeJS/dms/pull/110))

### 📖 Documentation

- Drop the Nuxt-era nuxt.config.ts references ([#99](https://github.com/AntelopeJS/dms/pull/99))
- **quickstart:** Follow the template README instead of copying its setup ([#105](https://github.com/AntelopeJS/dms/pull/105))

### 🏡 Chore

- **release:** @antelopejs/dms v0.5.1 ([93888bf](https://github.com/AntelopeJS/dms/commit/93888bf))
- **data-types:** Release replaced data type classes on reload and fix the compare-types comment ([#102](https://github.com/AntelopeJS/dms/pull/102))
- **playground:** Open module source ranges ([#106](https://github.com/AntelopeJS/dms/pull/106))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.2

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.3.1...v0.3.2)

### 🚀 Enhancements

- **members:** Let a module disable the invite action with a reason ([#96](https://github.com/AntelopeJS/dms/pull/96))

### 🏡 Chore

- **release:** @antelopejs/dms v0.5.0 ([23d56e7](https://github.com/AntelopeJS/dms/commit/23d56e7))
- **lint:** Check @antelopejs/interface-* ranges ([#95](https://github.com/AntelopeJS/dms/pull/95))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.1

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.3.0...v0.3.1)

### 🩹 Fixes

- **hooks:** Release hook handlers and mutation listeners with the module that registered them ([#89](https://github.com/AntelopeJS/dms/pull/89))

### ❤️ Contributors

- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.3.0

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.2.8...v0.3.0)

### 🩹 Fixes

- **realtime:** ⚠️  Let core own the table-view realtime across DMS reloads ([#73](https://github.com/AntelopeJS/dms/pull/73))

#### ⚠️ Breaking Changes

- **realtime:** ⚠️  Let core own the table-view realtime across DMS reloads ([#73](https://github.com/AntelopeJS/dms/pull/73))

### ❤️ Contributors

- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.2.8

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.2.7...v0.2.8)

### 🚀 Enhancements

- **frontend-vue:** Declare the @antelopejs/dms-frontend releases the layer supports ([#79](https://github.com/AntelopeJS/dms/pull/79))
- **layout:** Let a page fill the height of the panel ([#80](https://github.com/AntelopeJS/dms/pull/80))

### 📖 Documentation

- **saas-mode:** Select a published @antelopejs/dms-saas version ([#69](https://github.com/AntelopeJS/dms/pull/69))

### 🏡 Chore

- **release:** @antelopejs/dms v0.4.8 ([a63ee9c](https://github.com/AntelopeJS/dms/commit/a63ee9c))

### ❤️ Contributors

- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.2.7

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.2.6...v0.2.7)

### 🔥 Performance

- **db:** Mark cross-instance indexes and upgrade the MongoDB driver ([#85](https://github.com/AntelopeJS/dms/pull/85))

### 🩹 Fixes

- **dms-ui:** Let Escape close modals opened over a table or a tree ([#71](https://github.com/AntelopeJS/dms/pull/71))
- **db:** Normalize emails, guard email changes and stop storing refresh tokens in plaintext ([#78](https://github.com/AntelopeJS/dms/pull/78))

### 🏡 Chore

- **release:** @antelopejs/dms v0.4.7 ([dc41912](https://github.com/AntelopeJS/dms/commit/dc41912))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.6

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.2.5...v0.2.6)

### 🚀 Enhancements

- **interface-dms:** Export the password policy for modules ([#70](https://github.com/AntelopeJS/dms/pull/70))

### 🏡 Chore

- **release:** @antelopejs/dms v0.4.6 ([5c157dd](https://github.com/AntelopeJS/dms/commit/5c157dd))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.5

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.2.4...v0.2.5)

### 🚀 Enhancements

- **invites:** Edit extension fields of a pending invitation ([#58](https://github.com/AntelopeJS/dms/pull/58))
- **layout:** Add generic layout banners under the dashboard header ([#64](https://github.com/AntelopeJS/dms/pull/64))
- **quick-actions:** Let a quick action press a table button and inherit its permission ([#65](https://github.com/AntelopeJS/dms/pull/65))

### 🩹 Fixes

- **console:** Send render emails, keep breadcrumbs valid, honour hidden columns, add invite quick action ([#59](https://github.com/AntelopeJS/dms/pull/59))
- **notifications:** Keep the header bell from breaking pages of blocked workspaces ([#60](https://github.com/AntelopeJS/dms/pull/60))
- **dms:** Close the gaps found in the final verification ([#61](https://github.com/AntelopeJS/dms/pull/61))
- **invites:** Name the workspace and inviter in tenant invitations and keep the invitee's language ([#62](https://github.com/AntelopeJS/dms/pull/62))
- **dms:** Let dms-saas declare SaaS mode and draw nested donut charts ([#63](https://github.com/AntelopeJS/dms/pull/63))
- **chart:** Keep the loading skeleton of KPI and chart cards out of a paragraph ([#66](https://github.com/AntelopeJS/dms/pull/66))

### 🏡 Chore

- **release:** @antelopejs/dms v0.4.5 ([1b25337](https://github.com/AntelopeJS/dms/commit/1b25337))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.4

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.2.3...v0.2.4)

### 🩹 Fixes

- Generic DMS console bugs found in the staging audit ([#57](https://github.com/AntelopeJS/dms/pull/57))

### 🏡 Chore

- **release:** @antelopejs/dms v0.4.4 ([bc7c88d](https://github.com/AntelopeJS/dms/commit/bc7c88d))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.3

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.2.2...v0.2.3)

### 🚀 Enhancements

- **form:** Mark required fields and add a required legend ([#46](https://github.com/AntelopeJS/dms/pull/46))
- **settings:** Reach pending invites from the members page ([#47](https://github.com/AntelopeJS/dms/pull/47))
- **base:** Declare where a block's data comes from, and arrange the answer ([#15](https://github.com/AntelopeJS/dms/pull/15))

### 🩹 Fixes

- **playground:** Build the dms and the playground before starting ([ce1e7bd](https://github.com/AntelopeJS/dms/commit/ce1e7bd))
- **form:** Handle partial ranges and show range and multiple dates in the date picker ([b12efcf](https://github.com/AntelopeJS/dms/commit/b12efcf))
- **form:** Emit ISO strings for multiple dates in the calendar and date picker ([327ebc2](https://github.com/AntelopeJS/dms/commit/327ebc2))
- **layout:** Keep the current page in the breadcrumb when the URL has a query ([#53](https://github.com/AntelopeJS/dms/pull/53))
- **layout:** Keep the color-mode preference in a dms-color-mode cookie ([#56](https://github.com/AntelopeJS/dms/pull/56))

### 🏡 Chore

- **playground:** Add sibling pages whose slugs share a prefix ([#49](https://github.com/AntelopeJS/dms/pull/49))
- **release:** @antelopejs/dms v0.4.3 ([fc27d03](https://github.com/AntelopeJS/dms/commit/fc27d03))

### ❤️ Contributors

- Fabrice Cst <fabrice@altab.be>
- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))
- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.2

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.2.1...v0.2.2)

### 🩹 Fixes

- **roles:** Show permissions whose parent id is not registered ([#44](https://github.com/AntelopeJS/dms/pull/44))

### 🏡 Chore

- **release:** @antelopejs/dms v0.4.1 ([36f5bde](https://github.com/AntelopeJS/dms/commit/36f5bde))
- **release:** @antelopejs/dms v0.4.2 ([2e415ae](https://github.com/AntelopeJS/dms/commit/2e415ae))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.1

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.2.0...v0.2.1)

### 🩹 Fixes

- **table-view:** Derive form route keys from the page permission id ([#43](https://github.com/AntelopeJS/dms/pull/43))

### 🏡 Chore

- **release:** @antelopejs/dms v0.4.0 ([d80807f](https://github.com/AntelopeJS/dms/commit/d80807f))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.0

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.1.0...v0.2.0)

### 🚀 Enhancements

- **table-view:** Name page-mode form routes after the table view ([#29](https://github.com/AntelopeJS/dms/pull/29))

### 🩹 Fixes

- **frontend:** Match sidebar search design ([#21](https://github.com/AntelopeJS/dms/pull/21))
- **ui:** Let Grid drop columns instead of overflowing its container ([#26](https://github.com/AntelopeJS/dms/pull/26))
- **realtime:** Publish a menu burst once when its trailing timer runs late ([#34](https://github.com/AntelopeJS/dms/pull/34))
- **table-view:** Resolve route param filter defaults against the table's page ([#35](https://github.com/AntelopeJS/dms/pull/35))
- **table-view:** Resolve page-mode form redirects against the form route ([#37](https://github.com/AntelopeJS/dms/pull/37))

### 💅 Refactors

- **frontend:** Import the SDK through #dms/frontend-module ([#20](https://github.com/AntelopeJS/dms/pull/20))
- **table-view:** Serialize the resolved form page URLs ([#28](https://github.com/AntelopeJS/dms/pull/28))
- **build:** Merge tsconfig.build.json into tsconfig.json ([#39](https://github.com/AntelopeJS/dms/pull/39))
- **package:** ⚠️  Drop moduleResolution node support and pack-based checks ([#41](https://github.com/AntelopeJS/dms/pull/41))

### 🏡 Chore

- **release:** @antelopejs/dms v0.3.3 ([940cb4e](https://github.com/AntelopeJS/dms/commit/940cb4e))
- **dms:** Drop the pages export and require interface-dms 0.1.0 ([#18](https://github.com/AntelopeJS/dms/pull/18))
- **release:** @antelopejs/dms v0.3.4 ([9cf98e7](https://github.com/AntelopeJS/dms/commit/9cf98e7))
- Align community files with the organization defaults ([#19](https://github.com/AntelopeJS/dms/pull/19))
- **release:** @antelopejs/dms v0.3.5 ([2b8a641](https://github.com/AntelopeJS/dms/commit/2b8a641))
- Migrate dms frontend commands to ajs plugin ([#22](https://github.com/AntelopeJS/dms/pull/22))
- **release:** @antelopejs/dms v0.3.6 ([89afebe](https://github.com/AntelopeJS/dms/commit/89afebe))
- Make playground orb setup reliable ([#23](https://github.com/AntelopeJS/dms/pull/23))
- **playground:** Use dms frontend 0.2.1 ([#24](https://github.com/AntelopeJS/dms/pull/24))
- **release:** @antelopejs/dms v0.3.7 ([312c7a7](https://github.com/AntelopeJS/dms/commit/312c7a7))
- **agents:** Install Node 24 in setup script ([#27](https://github.com/AntelopeJS/dms/pull/27))
- **playground:** Derive api URLs from config variables ([#31](https://github.com/AntelopeJS/dms/pull/31))
- **release:** @antelopejs/dms v0.3.8 ([f699953](https://github.com/AntelopeJS/dms/commit/f699953))

### 🤖 CI

- Run the integration suite in CI ([#36](https://github.com/AntelopeJS/dms/pull/36))
- **release:** Release next from a dedicated branch and restore requireCommits ([#38](https://github.com/AntelopeJS/dms/pull/38))
- **release:** Reference the shared release workflows through v1 ([#40](https://github.com/AntelopeJS/dms/pull/40))

#### ⚠️ Breaking Changes

- **package:** ⚠️  Drop moduleResolution node support and pack-based checks ([#41](https://github.com/AntelopeJS/dms/pull/41))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.1.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.3.2...v0.1.0)

### 🚀 Enhancements

- ⚠️  Extend another module's page by its id ([#17](https://github.com/AntelopeJS/dms/pull/17))

#### ⚠️ Breaking Changes

- ⚠️  Extend another module's page by its id ([#17](https://github.com/AntelopeJS/dms/pull/17))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.0.4

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.3.1...v0.0.4)

### 🚀 Enhancements

- Let backend modules declare the endpoints /auth/establish may open a session from ([#16](https://github.com/AntelopeJS/dms/pull/16))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.0.3

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.2.1...v0.0.3)

## v0.0.2

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.0.1...v0.0.2)

### 📖 Documentation

- Use the DMS_API_BASE_URL and DMS_CLIENT_BASE_URL names ([#2](https://github.com/AntelopeJS/dms/pull/2))

### 🏡 Chore

- Regenerate lockfiles against the published DMS packages ([#1](https://github.com/AntelopeJS/dms/pull/1))
- **release:** Skip the npm auth pre-flight for trusted publishing ([#3](https://github.com/AntelopeJS/dms/pull/3))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

