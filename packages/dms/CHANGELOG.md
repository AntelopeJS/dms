# Changelog

## v0.9.7

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.9.6...v0.9.7)

### 🩹 Fixes

- **frontend:** Run on @antelopejs/dms-frontend 0.7 ([#368](https://github.com/AntelopeJS/dms/pull/368))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.9.6

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.9.5...v0.9.6)

### 🚀 Enhancements

- **tenant-lifecycle:** Pause producer admission and evaluate every tenant access gate ([#366](https://github.com/AntelopeJS/dms/pull/366))

### 🩹 Fixes

- **frontend:** Read the onboarding status and permissions through the data layer ([#357](https://github.com/AntelopeJS/dms/pull/357))
- **deps:** Require the tenant admission barrier and access evaluation contract ([#367](https://github.com/AntelopeJS/dms/pull/367))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.7.4 ([9577327b](https://github.com/AntelopeJS/dms/commit/9577327b))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.9.5

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.9.3...v0.9.5)

### 🚀 Enhancements

- **preview:** Share simple options and document real outcomes ([#339](https://github.com/AntelopeJS/dms/pull/339))

### 🩹 Fixes

- **docs:** Use a sandbox-compatible temporary build database ([#326](https://github.com/AntelopeJS/dms/pull/326))
- Install DMS frontend with the root workspace ([#322](https://github.com/AntelopeJS/dms/pull/322))
- **modules:** Top-align card content and place readouts below descriptions ([#328](https://github.com/AntelopeJS/dms/pull/328))
- **modules:** Reuse registered names in the store ([#330](https://github.com/AntelopeJS/dms/pull/330))
- **playground:** Use the workspace CLI and compatible core interface ([#331](https://github.com/AntelopeJS/dms/pull/331))
- **deps:** Require the shared preview presentation contract ([#340](https://github.com/AntelopeJS/dms/pull/340))

### 📖 Documentation

- Create the DMS demo through the CLI in quickstart ([#327](https://github.com/AntelopeJS/dms/pull/327))

### 🏡 Chore

- **docs:** Capture temporary MongoDB startup diagnostics ([#325](https://github.com/AntelopeJS/dms/pull/325))
- **playground:** Refresh compatible dependencies ([#329](https://github.com/AntelopeJS/dms/pull/329))
- **release:** @antelopejs/interface-dms v0.7.3 ([bfaa1905](https://github.com/AntelopeJS/dms/commit/bfaa1905))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.9.3

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.9.2...v0.9.3)

### 🚀 Enhancements

- **preview:** Live block preview page, block catalog and screenshots for the docs ([#280](https://github.com/AntelopeJS/dms/pull/280))

### 🔥 Performance

- **layout:** Bundle the Geist fonts and preload only the text face ([#311](https://github.com/AntelopeJS/dms/pull/311))
- **table:** Drag with SortableJS through useSortable instead of vuedraggable ([#312](https://github.com/AntelopeJS/dms/pull/312))
- **table-view:** Share a source read between the list and a counter asking the same ([#313](https://github.com/AntelopeJS/dms/pull/313))

### 🩹 Fixes

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

- **release:** Propagate published dependency floors ([#323](https://github.com/AntelopeJS/dms/pull/323))
- **release:** @antelopejs/interface-dms v0.7.2 ([ce0bcde6](https://github.com/AntelopeJS/dms/commit/ce0bcde6))

### ✅ Tests

- **live:** Hold the page's data refresh while paused, not a user's ([#309](https://github.com/AntelopeJS/dms/pull/309))

### 🤖 CI

- **docs:** Build and verify the hosted preview playground ([#319](https://github.com/AntelopeJS/dms/pull/319))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.9.2

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.9.1...v0.9.2)

### 🩹 Fixes

- **auth:** Write the user's activity before the request's own user writes ([#301](https://github.com/AntelopeJS/dms/pull/301))
- **deps:** Require @antelopejs/interface-core 0.2.2 and @antelopejs/core 1.15.1 ([#302](https://github.com/AntelopeJS/dms/pull/302))
- **deps:** Move to @antelopejs/core 1.15.2, @antelopejs/interface-core 0.2.3 and @antelopejs/interface-dms 0.7.1 ([#303](https://github.com/AntelopeJS/dms/pull/303))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.7.1 ([08bfb0d0](https://github.com/AntelopeJS/dms/commit/08bfb0d0))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.9.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.9.0...v0.9.1)

### 🚀 Enhancements

- **dms:** Install, update, pause and remove modules from the Modules page ([#285](https://github.com/AntelopeJS/dms/pull/285))

### 📖 Documentation

- **period:** Document usePeriodScopePreset and test the top list badge through hydration ([#300](https://github.com/AntelopeJS/dms/pull/300))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.9.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.8.3...v0.9.0)

### 🚀 Enhancements

- ⚠️  Dms 0.9.0 and interface-dms 0.7.0, server rendering on renderer 0.6 ([#299](https://github.com/AntelopeJS/dms/pull/299))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.7.0 ([81a00fa9](https://github.com/AntelopeJS/dms/commit/81a00fa9))

#### ⚠️ Breaking Changes

- ⚠️  Dms 0.9.0 and interface-dms 0.7.0, server rendering on renderer 0.6 ([#299](https://github.com/AntelopeJS/dms/pull/299))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.8.3

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.8.2...v0.8.3)

### 🚀 Enhancements

- **blocks:** Fit the simple options to someone building a page without code ([#251](https://github.com/AntelopeJS/dms/pull/251))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.6.1 ([ad8a713c](https://github.com/AntelopeJS/dms/commit/ad8a713c))

### ❤️ Contributors

- Glastis ([@Glastis](http://github.com/Glastis))

## v0.8.2

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.8.1...v0.8.2)

### 🩹 Fixes

- **links:** Open a row field holding a whole URL as written ([#273](https://github.com/AntelopeJS/dms/pull/273))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.8.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.8.0...v0.8.1)

### 🩹 Fixes

- **grid:** Collapse grid row cells whose block renders nothing ([#272](https://github.com/AntelopeJS/dms/pull/272))

### 🤖 CI

- Speed up pipeline ([#271](https://github.com/AntelopeJS/dms/pull/271))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.8.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.21...v0.8.0)

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

- **release:** @antelopejs/interface-dms v0.6.0 ([35911faa](https://github.com/AntelopeJS/dms/commit/35911faa))

#### ⚠️ Breaking Changes

- **table-view:** ⚠️  List the table display explicitly in displays ([#269](https://github.com/AntelopeJS/dms/pull/269))
- ⚠️  Resolve template tokens the same way in every option ([#257](https://github.com/AntelopeJS/dms/pull/257))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.21

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.20...v0.7.21)

### 🚀 Enhancements

- **table-view:** Let a row's panel, drawer or modal show another row in place ([#252](https://github.com/AntelopeJS/dms/pull/252))
- **table-view:** Let a table view drop the built-in table display ([#255](https://github.com/AntelopeJS/dms/pull/255))

### 🩹 Fixes

- **table-view:** Keep an empty list on screen while it is read again ([#250](https://github.com/AntelopeJS/dms/pull/250))
- **table-view:** Serve the row menu label to the browser ([#253](https://github.com/AntelopeJS/dms/pull/253))
- **table-view:** Keep the tab the user opens in the URL ([#254](https://github.com/AntelopeJS/dms/pull/254))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.5.13 ([6b58111b](https://github.com/AntelopeJS/dms/commit/6b58111b))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.20

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.19...v0.7.20)

### 🩹 Fixes

- **table-view:** Reopen a record link to a closed row and keep chips from restoring it ([#249](https://github.com/AntelopeJS/dms/pull/249))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.19

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.18...v0.7.19)

## v0.7.18

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.17...v0.7.18)

### 🚀 Enhancements

- **layout:** Let a header button's label read the page's query ([#247](https://github.com/AntelopeJS/dms/pull/247))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.17

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.16...v0.7.17)

### 🚀 Enhancements

- **actions:** Let a button download a file with the user's session ([#246](https://github.com/AntelopeJS/dms/pull/246))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.5.12 ([029d1f2d](https://github.com/AntelopeJS/dms/commit/029d1f2d))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.16

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.15...v0.7.16)

### 🚀 Enhancements

- **layout:** Hide header buttons by availability and order them with page actions ([#237](https://github.com/AntelopeJS/dms/pull/237))
- **period:** Roll calendar presets over at midnight, sync the route query and cap custom ranges ([#227](https://github.com/AntelopeJS/dms/pull/227))
- **table-view:** Follow the URL tab after mount ([#229](https://github.com/AntelopeJS/dms/pull/229))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.5.11 ([8cb631b4](https://github.com/AntelopeJS/dms/commit/8cb631b4))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.15

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.14...v0.7.15)

### 🚀 Enhancements

- **email:** Make the EmailLayout heading and separator optional and guard its logo ([#223](https://github.com/AntelopeJS/dms/pull/223))
- **form:** Make useControlError a public composable ([#224](https://github.com/AntelopeJS/dms/pull/224))
- **table-view:** Show visible query param filters as removable chips ([#228](https://github.com/AntelopeJS/dms/pull/228))
- **page:** Let a frontend module declare public endpoints ([#230](https://github.com/AntelopeJS/dms/pull/230))

### 🩹 Fixes

- **notifications:** Treat a reused idempotency key as already delivered ([#222](https://github.com/AntelopeJS/dms/pull/222))
- **table-view:** Notify an unresolved record link and follow a record change ([#226](https://github.com/AntelopeJS/dms/pull/226))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.5.10 ([9cc18ca4](https://github.com/AntelopeJS/dms/commit/9cc18ca4))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.14

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.13...v0.7.14)

### 🚀 Enhancements

- **interface:** Expose the resolved client address to modules ([#235](https://github.com/AntelopeJS/dms/pull/235))
- **form:** Keep out-of-range numbers, interpolate field error params and expose the required legend ([#231](https://github.com/AntelopeJS/dms/pull/231))
- **confirm:** Add useConfirmFrom and a case-insensitive typed confirmation ([#232](https://github.com/AntelopeJS/dms/pull/232))
- **page:** Let a page failing its validation redirect instead of answering not found ([#236](https://github.com/AntelopeJS/dms/pull/236))
- **links:** Let row links and link actions keep the page's context ([#238](https://github.com/AntelopeJS/dms/pull/238))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.5.9 ([ef80c3fc](https://github.com/AntelopeJS/dms/commit/ef80c3fc))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.13

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.12...v0.7.13)

### 🩹 Fixes

- **module:** Redirect a module's address on the server, and refresh chart cards live ([#239](https://github.com/AntelopeJS/dms/pull/239))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.5.8 ([77931b26](https://github.com/AntelopeJS/dms/commit/77931b26))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.12

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.11...v0.7.12)

### 🚀 Enhancements

- **dms:** Give custom components the live, form and record APIs stock blocks use ([#225](https://github.com/AntelopeJS/dms/pull/225))
- **dms:** Close the module gaps left by the API console ([#233](https://github.com/AntelopeJS/dms/pull/233))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.5.7 ([18ea2af5](https://github.com/AntelopeJS/dms/commit/18ea2af5))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.11

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.10...v0.7.11)

### 🩹 Fixes

- **guard:** Space several children the way the page spaces its blocks ([#221](https://github.com/AntelopeJS/dms/pull/221))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.10

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.9...v0.7.10)

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

- **release:** @antelopejs/interface-dms v0.5.6 ([71a65f72](https://github.com/AntelopeJS/dms/commit/71a65f72))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.9

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.8...v0.7.9)

### 🚀 Enhancements

- **dms:** Hand cards their row's custom actions and name a block's sibling ([#207](https://github.com/AntelopeJS/dms/pull/207))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.5.5 ([55bf788](https://github.com/AntelopeJS/dms/commit/55bf788))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.8

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.7...v0.7.8)

### 🚀 Enhancements

- **table-view:** Tone duration and text cells from a row field ([#201](https://github.com/AntelopeJS/dms/pull/201))
- **period-selector:** Keep the period in the page URL ([#204](https://github.com/AntelopeJS/dms/pull/204))
- **table-view:** Open rows in a side panel action target ([#202](https://github.com/AntelopeJS/dms/pull/202))
- **page:** Add a Direct / Pause live mode over the page realtime ([#203](https://github.com/AntelopeJS/dms/pull/203))

### 🩹 Fixes

- **field-row:** Span both form columns when a row has no label ([#205](https://github.com/AntelopeJS/dms/pull/205))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.5.4 ([78deb34](https://github.com/AntelopeJS/dms/commit/78deb34))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.7

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.6...v0.7.7)

### 🚀 Enhancements

- **dms:** Group the jump navigation chips by navGroup ([#200](https://github.com/AntelopeJS/dms/pull/200))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.6

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.5...v0.7.6)

### 🚀 Enhancements

- **dms:** Small block, form and table view options for module layouts ([#198](https://github.com/AntelopeJS/dms/pull/198))

### 🩹 Fixes

- **table-view:** Search searchable fields that are not filterable ([#196](https://github.com/AntelopeJS/dms/pull/196))
- **dms:** Bind the export job proxies, word single-row delete confirms, translate aria-labels and tenant guards ([#197](https://github.com/AntelopeJS/dms/pull/197))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.5.3 ([e20de2c](https://github.com/AntelopeJS/dms/commit/e20de2c))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.5

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.4...v0.7.5)

### 🚀 Enhancements

- **table-view:** Reorder the cards of the cards display ([#194](https://github.com/AntelopeJS/dms/pull/194))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.5.2 ([83da6c1](https://github.com/AntelopeJS/dms/commit/83da6c1))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.4

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.3...v0.7.4)

### 🩹 Fixes

- **table-view:** Open the toolbar search from its button again ([#193](https://github.com/AntelopeJS/dms/pull/193))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.3

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.2...v0.7.3)

### 🩹 Fixes

- **dms-ui:** Declare @lezer/common, which the code highlighter imports ([#192](https://github.com/AntelopeJS/dms/pull/192))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.2

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.1...v0.7.2)

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

### 📦 Build

- **deps:** Require interface-dms 0.5.1 and dms-frontend 0.5.2 ([#191](https://github.com/AntelopeJS/dms/pull/191))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.5.1 ([11b0201](https://github.com/AntelopeJS/dms/commit/11b0201))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.7.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.7.0...v0.7.1)

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.5.0 ([edc6f6d](https://github.com/AntelopeJS/dms/commit/edc6f6d))

## v0.7.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.6.2...v0.7.0)

### 🚀 Enhancements

- **layout:** Dock module side panels next to the page ([#168](https://github.com/AntelopeJS/dms/pull/168))
- **command-palette:** Add an assistant mode a frontend module can provide ([#169](https://github.com/AntelopeJS/dms/pull/169))

### 🩹 Fixes

- **dms:** ⚠️  Harden auth and account flows, require permission ancestors, open settings to members ([#172](https://github.com/AntelopeJS/dms/pull/172))

#### ⚠️ Breaking Changes

- **dms:** ⚠️  Harden auth and account flows, require permission ancestors, open settings to members ([#172](https://github.com/AntelopeJS/dms/pull/172))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Maxime Westhoven <maxime@altab.be>

## v0.6.2

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.6.1...v0.6.2)

### 🚀 Enhancements

- **dms:** Compose block texts client-side with typed params and resolve layout banners per request ([#173](https://github.com/AntelopeJS/dms/pull/173))
- **dms:** Compose table cell sub-lines and add the two_line display and empty identities ([#175](https://github.com/AntelopeJS/dms/pull/175))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.4.2 ([7b08bc2](https://github.com/AntelopeJS/dms/commit/7b08bc2))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.6.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.6.0...v0.6.1)

### 🚀 Enhancements

- **dms:** Resolve route tokens in block data URLs and refresh page blocks after an action ([#170](https://github.com/AntelopeJS/dms/pull/170))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.4.1 ([224d341](https://github.com/AntelopeJS/dms/commit/224d341))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.6.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.5.6...v0.6.0)

### 🚀 Enhancements

- **dms:** Port the v2 design across the dashboard ([#119](https://github.com/AntelopeJS/dms/pull/119))

### 🩹 Fixes

- **interface-dms:** ⚠️  Release the breaking changes of #119 as 0.4.0 ([#166](https://github.com/AntelopeJS/dms/pull/166), [#119](https://github.com/AntelopeJS/dms/issues/119))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.3.6 ([73dd6c0](https://github.com/AntelopeJS/dms/commit/73dd6c0))
- **release:** @antelopejs/interface-dms v0.4.0 ([8f7b8ce](https://github.com/AntelopeJS/dms/commit/8f7b8ce))

#### ⚠️ Breaking Changes

- **interface-dms:** ⚠️  Release the breaking changes of #119 as 0.4.0 ([#166](https://github.com/AntelopeJS/dms/pull/166), [#119](https://github.com/AntelopeJS/dms/issues/119))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Maxime Westhoven <maxime@altab.be>

## v0.5.6

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.5.5...v0.5.6)

### 🩹 Fixes

- **tab:** Space the blocks of a tab like the page spaces its own ([#98](https://github.com/AntelopeJS/dms/pull/98))
- **dev-reload:** End the reload streams when the module stops ([#125](https://github.com/AntelopeJS/dms/pull/125))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Glastis ([@Glastis](http://github.com/Glastis))

## v0.5.5

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.5.4...v0.5.5)

### 🩹 Fixes

- **layout:** Hold the in-flight modules listing fetch on the DMS app ([#121](https://github.com/AntelopeJS/dms/pull/121))

### ❤️ Contributors

- Alessandro Aloisio

## v0.5.4

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.5.3...v0.5.4)

### 🩹 Fixes

- **invites:** Tell the inviter when the invitation e-mail was not sent ([#122](https://github.com/AntelopeJS/dms/pull/122))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.3.5 ([dcc9afe](https://github.com/AntelopeJS/dms/commit/dcc9afe))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.5.3

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.5.2...v0.5.3)

### 🩹 Fixes

- **table-view:** Validate file provenance against every TableView sharing a data controller ([#112](https://github.com/AntelopeJS/dms/pull/112))
- **dms-ui:** Stable SSR ids, forbidden upload headers and missing-file state in upload inputs ([#113](https://github.com/AntelopeJS/dms/pull/113))
- **attachments:** Enforce field constraints at presign and stop retrying missing stored files ([#114](https://github.com/AntelopeJS/dms/pull/114))
- **resource-form:** Accept native files submitted from ResourceForm blocks ([#115](https://github.com/AntelopeJS/dms/pull/115))
- **playground:** Promote, validate and clean profile files through SaveComponentFiles ([#116](https://github.com/AntelopeJS/dms/pull/116))
- **table-view:** Accept native files from page-mode TableView forms ([#117](https://github.com/AntelopeJS/dms/pull/117))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.3.4 ([9f115b0](https://github.com/AntelopeJS/dms/commit/9f115b0))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.5.2

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.5.1...v0.5.2)

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

- **data-types:** Release replaced data type classes on reload and fix the compare-types comment ([#102](https://github.com/AntelopeJS/dms/pull/102))
- **playground:** Open module source ranges ([#106](https://github.com/AntelopeJS/dms/pull/106))
- **release:** @antelopejs/interface-dms v0.3.3 ([353c425](https://github.com/AntelopeJS/dms/commit/353c425))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.5.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.5.0...v0.5.1)

### 🚀 Enhancements

- **members:** Let a module disable the invite action with a reason ([#96](https://github.com/AntelopeJS/dms/pull/96))

### 🏡 Chore

- **lint:** Check @antelopejs/interface-* ranges ([#95](https://github.com/AntelopeJS/dms/pull/95))
- **release:** @antelopejs/interface-dms v0.3.2 ([d186a97](https://github.com/AntelopeJS/dms/commit/d186a97))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.5.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.4.8...v0.5.0)

### 🚀 Enhancements

- **frontend-vue:** Declare the @antelopejs/dms-frontend releases the layer supports ([#79](https://github.com/AntelopeJS/dms/pull/79))
- **layout:** Let a page fill the height of the panel ([#80](https://github.com/AntelopeJS/dms/pull/80))

### 🩹 Fixes

- **realtime:** ⚠️  Let core own the table-view realtime across DMS reloads ([#73](https://github.com/AntelopeJS/dms/pull/73))
- **hooks:** Release hook handlers and mutation listeners with the module that registered them ([#89](https://github.com/AntelopeJS/dms/pull/89))

### 📖 Documentation

- **saas-mode:** Select a published @antelopejs/dms-saas version ([#69](https://github.com/AntelopeJS/dms/pull/69))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.2.8 ([5da7b85](https://github.com/AntelopeJS/dms/commit/5da7b85))
- **release:** @antelopejs/interface-dms v0.3.0 ([dbbdbf6](https://github.com/AntelopeJS/dms/commit/dbbdbf6))
- **release:** @antelopejs/interface-dms v0.3.1 ([79f3448](https://github.com/AntelopeJS/dms/commit/79f3448))

#### ⚠️ Breaking Changes

- **realtime:** ⚠️  Let core own the table-view realtime across DMS reloads ([#73](https://github.com/AntelopeJS/dms/pull/73))

### ❤️ Contributors

- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.4.8

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.4.7...v0.4.8)

### 🔥 Performance

- **db:** Mark cross-instance indexes and upgrade the MongoDB driver ([#85](https://github.com/AntelopeJS/dms/pull/85))

### 🩹 Fixes

- **db:** Normalize emails, guard email changes and stop storing refresh tokens in plaintext ([#78](https://github.com/AntelopeJS/dms/pull/78))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.2.7 ([5807a35](https://github.com/AntelopeJS/dms/commit/5807a35))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.4.7

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.4.6...v0.4.7)

### 🚀 Enhancements

- **interface-dms:** Export the password policy for modules ([#70](https://github.com/AntelopeJS/dms/pull/70))

### 🩹 Fixes

- **dms-ui:** Let Escape close modals opened over a table or a tree ([#71](https://github.com/AntelopeJS/dms/pull/71))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.2.6 ([67d4e23](https://github.com/AntelopeJS/dms/commit/67d4e23))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.4.6

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.4.5...v0.4.6)

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

- **release:** @antelopejs/interface-dms v0.2.5 ([81ad4f1](https://github.com/AntelopeJS/dms/commit/81ad4f1))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.4.5

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.4.4...v0.4.5)

### 🩹 Fixes

- Generic DMS console bugs found in the staging audit ([#57](https://github.com/AntelopeJS/dms/pull/57))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.2.4 ([3ef80e6](https://github.com/AntelopeJS/dms/commit/3ef80e6))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.4.4

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.4.3...v0.4.4)

### 🚀 Enhancements

- **base:** Declare where a block's data comes from, and arrange the answer ([#15](https://github.com/AntelopeJS/dms/pull/15))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.2.3 ([726ddbb](https://github.com/AntelopeJS/dms/commit/726ddbb))

### ❤️ Contributors

- Fabrice Cst <fabrice@altab.be>

## v0.4.3

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.4.2...v0.4.3)

### 🚀 Enhancements

- **form:** Mark required fields and add a required legend ([#46](https://github.com/AntelopeJS/dms/pull/46))
- **settings:** Reach pending invites from the members page ([#47](https://github.com/AntelopeJS/dms/pull/47))

### 🩹 Fixes

- **playground:** Build the dms and the playground before starting ([ce1e7bd](https://github.com/AntelopeJS/dms/commit/ce1e7bd))
- **form:** Handle partial ranges and show range and multiple dates in the date picker ([b12efcf](https://github.com/AntelopeJS/dms/commit/b12efcf))
- **form:** Emit ISO strings for multiple dates in the calendar and date picker ([327ebc2](https://github.com/AntelopeJS/dms/commit/327ebc2))
- **layout:** Keep the current page in the breadcrumb when the URL has a query ([#53](https://github.com/AntelopeJS/dms/pull/53))
- **layout:** Keep the color-mode preference in a dms-color-mode cookie ([#56](https://github.com/AntelopeJS/dms/pull/56))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.2.2 ([2be2aba](https://github.com/AntelopeJS/dms/commit/2be2aba))
- **playground:** Add sibling pages whose slugs share a prefix ([#49](https://github.com/AntelopeJS/dms/pull/49))

### ❤️ Contributors

- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))
- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.4.2

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.4.1...v0.4.2)

### 🩹 Fixes

- **roles:** Show permissions whose parent id is not registered ([#44](https://github.com/AntelopeJS/dms/pull/44))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.4.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.4.0...v0.4.1)

### 🩹 Fixes

- **table-view:** Derive form route keys from the page permission id ([#43](https://github.com/AntelopeJS/dms/pull/43))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.2.1 ([eb3b712](https://github.com/AntelopeJS/dms/commit/eb3b712))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.4.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.3.8...v0.4.0)

### 💅 Refactors

- **build:** Merge tsconfig.build.json into tsconfig.json ([#39](https://github.com/AntelopeJS/dms/pull/39))
- **package:** ⚠️  Drop moduleResolution node support and pack-based checks ([#41](https://github.com/AntelopeJS/dms/pull/41))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.2.0 ([98ad6f4](https://github.com/AntelopeJS/dms/commit/98ad6f4))

### 🤖 CI

- **release:** Release next from a dedicated branch and restore requireCommits ([#38](https://github.com/AntelopeJS/dms/pull/38))
- **release:** Reference the shared release workflows through v1 ([#40](https://github.com/AntelopeJS/dms/pull/40))

#### ⚠️ Breaking Changes

- **package:** ⚠️  Drop moduleResolution node support and pack-based checks ([#41](https://github.com/AntelopeJS/dms/pull/41))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.8

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.3.7...v0.3.8)

### 🚀 Enhancements

- **table-view:** Name page-mode form routes after the table view ([#29](https://github.com/AntelopeJS/dms/pull/29))

### 🩹 Fixes

- **realtime:** Publish a menu burst once when its trailing timer runs late ([#34](https://github.com/AntelopeJS/dms/pull/34))
- **table-view:** Resolve route param filter defaults against the table's page ([#35](https://github.com/AntelopeJS/dms/pull/35))
- **table-view:** Resolve page-mode form redirects against the form route ([#37](https://github.com/AntelopeJS/dms/pull/37))

### 💅 Refactors

- **table-view:** Serialize the resolved form page URLs ([#28](https://github.com/AntelopeJS/dms/pull/28))

### 🏡 Chore

- **agents:** Install Node 24 in setup script ([#27](https://github.com/AntelopeJS/dms/pull/27))
- **playground:** Derive api URLs from config variables ([#31](https://github.com/AntelopeJS/dms/pull/31))

### 🤖 CI

- Run the integration suite in CI ([#36](https://github.com/AntelopeJS/dms/pull/36))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.7

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.3.6...v0.3.7)

### 🩹 Fixes

- **ui:** Let Grid drop columns instead of overflowing its container ([#26](https://github.com/AntelopeJS/dms/pull/26))

### 🏡 Chore

- Make playground orb setup reliable ([#23](https://github.com/AntelopeJS/dms/pull/23))
- **playground:** Use dms frontend 0.2.1 ([#24](https://github.com/AntelopeJS/dms/pull/24))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.6

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.3.5...v0.3.6)

### 🩹 Fixes

- **frontend:** Match sidebar search design ([#21](https://github.com/AntelopeJS/dms/pull/21))

### 🏡 Chore

- Migrate dms frontend commands to ajs plugin ([#22](https://github.com/AntelopeJS/dms/pull/22))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.5

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.3.4...v0.3.5)

### 💅 Refactors

- **frontend:** Import the SDK through #dms/frontend-module ([#20](https://github.com/AntelopeJS/dms/pull/20))

### 🏡 Chore

- Align community files with the organization defaults ([#19](https://github.com/AntelopeJS/dms/pull/19))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.4

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.3.3...v0.3.4)

### 🏡 Chore

- **dms:** Drop the pages export and require interface-dms 0.1.0 ([#18](https://github.com/AntelopeJS/dms/pull/18))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.3

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.1.0...v0.3.3)

## v0.3.2

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.0.4...v0.3.2)

## v0.3.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.3.0...v0.3.1)

### 🏡 Chore

- Require @antelopejs/core 1.7 ([#14](https://github.com/AntelopeJS/dms/pull/14))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.3.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.2.2...v0.3.0)

### 🩹 Fixes

- **deps:** ⚠️  Stop shipping AntelopeJS core as a runtime dependency ([#13](https://github.com/AntelopeJS/dms/pull/13))

#### ⚠️ Breaking Changes

- **deps:** ⚠️  Stop shipping AntelopeJS core as a runtime dependency ([#13](https://github.com/AntelopeJS/dms/pull/13))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.2

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.0.3...v0.2.2)

## v0.2.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.2.0...v0.2.1)

### 🩹 Fixes

- **dev-reload:** Always notify the client after a reload ([#10](https://github.com/AntelopeJS/dms/pull/10))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.1.0...v0.2.0)

### 🩹 Fixes

- **dms:** ⚠️  Self-declare the runtime package and gate the frontend endpoints on the configured secret ([#8](https://github.com/AntelopeJS/dms/pull/8))

### 🤖 CI

- **release:** Accept the self-declared runtime name in implements ([#9](https://github.com/AntelopeJS/dms/pull/9))

#### ⚠️ Breaking Changes

- **dms:** ⚠️  Self-declare the runtime package and gate the frontend endpoints on the configured secret ([#8](https://github.com/AntelopeJS/dms/pull/8))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.1.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.0.2...v0.1.0)

### 🩹 Fixes

- **release:** ⚠️  Publish with pnpm and depend on the interface by range ([#7](https://github.com/AntelopeJS/dms/pull/7))

### 📖 Documentation

- Describe the single interface package and the Vue frontend module contract ([#6](https://github.com/AntelopeJS/dms/pull/6))

#### ⚠️ Breaking Changes

- **release:** ⚠️  Publish with pnpm and depend on the interface by range ([#7](https://github.com/AntelopeJS/dms/pull/7))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.0.2

[compare changes](https://github.com/AntelopeJS/dms/compare/interface-v0.0.2...v0.0.2)

### 🩹 Fixes

- **dms:** Isolate the package contract check from the workspace NODE_PATH ([#5](https://github.com/AntelopeJS/dms/pull/5))

### 🏡 Chore

- **release:** Build the interface package before releasing the runtime ([#4](https://github.com/AntelopeJS/dms/pull/4))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

