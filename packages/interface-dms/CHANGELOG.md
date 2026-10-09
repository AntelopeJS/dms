# Changelog

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

