# Changelog

## v0.24.2

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.24.1...v0.24.2)

### 🩹 Fixes

- **deps:** Require dms-frontend 0.11.11, which builds the bundles one after another ([#1271](https://github.com/AntelopeJS/dms/pull/1271))

### ❤️ Contributors

- Antony Rizzitelli

## v0.24.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.24.0...v0.24.1)

### 🩹 Fixes

- **interface-dms:** Compare live-hold fixture path separator-safely ([#1267](https://github.com/AntelopeJS/dms/pull/1267))
- **frontend-vue:** Type api error presenter functions as properties ([#1268](https://github.com/AntelopeJS/dms/pull/1268))
- **test:** Wait for the welcome notification in the inbox test ([#1269](https://github.com/AntelopeJS/dms/pull/1269))

### ❤️ Contributors

- Antony Rizzitelli

## v0.24.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.23.0...v0.24.0)

### 🚀 Enhancements

- **table-view:** Require liveHold.whileOnScreen and drop the boolean shorthand ([#1257](https://github.com/AntelopeJS/dms/pull/1257))
- **interface-dms:** Read the * wildcard only through GrantsEveryPermission, and lint every other read ([#1261](https://github.com/AntelopeJS/dms/pull/1261))

### 🩹 Fixes

- **dms:** Read a token's claims only once its signature checks out ([#1258](https://github.com/AntelopeJS/dms/pull/1258))

### 💅 Refactors

- **dms:** Lint the last pending Vue layer files with the anti-slop preset ([#1242](https://github.com/AntelopeJS/dms/pull/1242))
- **dms:** Narrow the non-null assertions of dms src and the playground ([#1243](https://github.com/AntelopeJS/dms/pull/1243))
- **dms:** Narrow the non-null assertions of the Vue layer source ([#1244](https://github.com/AntelopeJS/dms/pull/1244))
- **dms:** Read the Vue tests' expected values through defined() instead of non-null assertions ([#1245](https://github.com/AntelopeJS/dms/pull/1245))
- **dms:** Fix the Vue layer findings of @nuxt/eslint's default rules ([#1249](https://github.com/AntelopeJS/dms/pull/1249))

### 📖 Documentation

- **dms:** Put the backend's and interfaces' TSDoc where tooling-configs 0.10 reads it ([#1246](https://github.com/AntelopeJS/dms/pull/1246))
- **dms:** Put the Vue layer's TSDoc where tooling-configs 0.10 reads it ([#1247](https://github.com/AntelopeJS/dms/pull/1247))

### 📦 Build

- **dms:** Move to tooling-configs 0.10.1 and lint the Vue layer with antelopeNuxtConfig ([#1250](https://github.com/AntelopeJS/dms/pull/1250))

### ✅ Tests

- **dms:** Put the Vue tests' TSDoc where tooling-configs 0.10 reads it ([#1248](https://github.com/AntelopeJS/dms/pull/1248))

#### ⚠️ Breaking Changes

- **table-view:** Require liveHold.whileOnScreen and drop the boolean shorthand ([#1257](https://github.com/AntelopeJS/dms/pull/1257))

### ❤️ Contributors

- Antony Rizzitelli

## v0.23.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.22.1...v0.23.0)

### 🚀 Enhancements

- **interface-dms:** Run the DataType contract and dms on zod 4 ([#1236](https://github.com/AntelopeJS/dms/pull/1236))

### 🏡 Chore

- **deps:** Update dependency @antelopejs/nodemailer to v0.0.14 ([#1239](https://github.com/AntelopeJS/dms/pull/1239))

#### ⚠️ Breaking Changes

- **interface-dms:** Run the DataType contract and dms on zod 4 ([#1236](https://github.com/AntelopeJS/dms/pull/1236))

### ❤️ Contributors

- Antony Rizzitelli

## v0.22.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.22.0...v0.22.1)

### 🩹 Fixes

- **dms:** Move to @antelopejs/mongodb 1.8.13, which loads its interfaces through require() ([#1233](https://github.com/AntelopeJS/dms/pull/1233))

### 🤖 CI

- Re-sync the AntelopeJS pack for the release app ([#1232](https://github.com/AntelopeJS/dms/pull/1232))
- Adopt the shared module lock refresh and checks ([#1234](https://github.com/AntelopeJS/dms/pull/1234))
- Stop forwarding the retired RELEASE_GITHUB_TOKEN ([#1235](https://github.com/AntelopeJS/dms/pull/1235))

### ❤️ Contributors

- Antony Rizzitelli

## v0.22.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.21.3...v0.22.0)

### 🚀 Enhancements

- **dms:** Make the e2e kit a standalone Playwright setup ([#1162](https://github.com/AntelopeJS/dms/pull/1162))
- **dms:** Export run-state, backend and mail helpers from e2e/run ([#1164](https://github.com/AntelopeJS/dms/pull/1164))
- **dms:** Read the e2e kit's journeys from e2e/journeys.config.ts ([#1166](https://github.com/AntelopeJS/dms/pull/1166))
- **dms:** Add a config option to e2eConfig and startRun ([#1170](https://github.com/AntelopeJS/dms/pull/1170))
- **dms:** List the DMS modules a mockup needs in its spec ([#1198](https://github.com/AntelopeJS/dms/pull/1198))
- **dms:** Group the tables of a large database in the analysis answer ([#1200](https://github.com/AntelopeJS/dms/pull/1200))
- **dms:** Add a ratio query template and compare for scalar queries ([#1201](https://github.com/AntelopeJS/dms/pull/1201))
- **dms:** Let several people edit a mockup with live refresh and per-block locks ([#1207](https://github.com/AntelopeJS/dms/pull/1207))
- **dms:** Tone a status pill by its select item when tones has no entry ([#1222](https://github.com/AntelopeJS/dms/pull/1222))
- **dms:** Open a dashboard page after an api action target succeeds with redirect ([#1210](https://github.com/AntelopeJS/dms/pull/1210))
- **dms:** Draw an identity cell's avatar as a square logo with avatarFrame ([#1209](https://github.com/AntelopeJS/dms/pull/1209))
- **dms:** Pass the written row to a guard's AfterWrite ([#1219](https://github.com/AntelopeJS/dms/pull/1219))
- **interface-dms:** Add a fixed filter to RelationType pickers ([#1223](https://github.com/AntelopeJS/dms/pull/1223))
- **dms:** Pin a first-level menu entry to the sidebar footer ([#1125](https://github.com/AntelopeJS/dms/pull/1125))
- **dms:** Let a subject offer e-mail and a mail module deliver it ([#1126](https://github.com/AntelopeJS/dms/pull/1126))
- **dms:** Give repeater columns a new-row value and fill rows up to min ([#1127](https://github.com/AntelopeJS/dms/pull/1127))
- **dms:** Store phone numbers in E.164 and pick their country in the input ([#1212](https://github.com/AntelopeJS/dms/pull/1212))
- **layout:** Show a notification's exact date and time on hover ([#1154](https://github.com/AntelopeJS/dms/pull/1154))
- **dms:** Hand a header button's modal, drawer or side panel the page's record and route params ([#1226](https://github.com/AntelopeJS/dms/pull/1226))
- **layout:** Press ? to open the keyboard shortcuts page ([#1155](https://github.com/AntelopeJS/dms/pull/1155))

### 🔥 Performance

- **dms:** Halve the builder suite and fix the e2e run-state race ([#1165](https://github.com/AntelopeJS/dms/pull/1165))
- **dms:** Key the e2e build cache on pnpm 12's JSON .modules.yaml ([#1169](https://github.com/AntelopeJS/dms/pull/1169))
- **dms:** Keep the parsed declarations of the builder's index across operations ([#1183](https://github.com/AntelopeJS/dms/pull/1183))
- **dms:** Typecheck only the files a builder save can break ([#1191](https://github.com/AntelopeJS/dms/pull/1191))

### 🩹 Fixes

- Repair the main checks broken by the #1158 dependency bumps ([#1161](https://github.com/AntelopeJS/dms/pull/1161))
- **dms:** Retry the e2e kit's dashboard install while the registry answers 404 on a new tarball ([#1173](https://github.com/AntelopeJS/dms/pull/1173))
- **dms:** Stop the run when a SIGINT or SIGTERM reaches the process that started it ([#1182](https://github.com/AntelopeJS/dms/pull/1182))
- **dms:** Hold a live table and say why while a drawer has its row open ([#1181](https://github.com/AntelopeJS/dms/pull/1181))
- **dms:** Keep a moved page's planned path in ts-morph's form on Windows ([#1180](https://github.com/AntelopeJS/dms/pull/1180))
- **dms:** Find a deleted resource's barrel export on Windows paths ([#1185](https://github.com/AntelopeJS/dms/pull/1185))
- **dms:** Rebuild the builder's projects when the install state or the tsconfig changes ([#1188](https://github.com/AntelopeJS/dms/pull/1188))
- **dms:** Answer 503 within 5 s when the database cannot verify a session ([#1189](https://github.com/AntelopeJS/dms/pull/1189))
- **dms:** Name the product AntelopeJS DMS in onboarding, logo and settings ([#1192](https://github.com/AntelopeJS/dms/pull/1192))
- **dms:** Name the relations already mapped in the database analysis ([#1194](https://github.com/AntelopeJS/dms/pull/1194))
- **dms:** Show a relation's label in a monospace cell ([#1193](https://github.com/AntelopeJS/dms/pull/1193))
- **dms:** Open no long-lived connection from a mockup preview frame ([#1196](https://github.com/AntelopeJS/dms/pull/1196))
- **dms:** Format a horizontal bar's categories as dates, not as the value format ([#1195](https://github.com/AntelopeJS/dms/pull/1195))
- **dms:** Skip the comparison query when a stats route gets no comparison bounds ([#1199](https://github.com/AntelopeJS/dms/pull/1199))
- **dms:** Show a reconnecting state on the mockup canvas while its stream is down ([#1203](https://github.com/AntelopeJS/dms/pull/1203))
- **dms:** Draw every page thumbnail of a large mockup Overview, past the live cap as a snapshot ([#1205](https://github.com/AntelopeJS/dms/pull/1205))
- **dms:** Keep mockup Overview section headings clear of thumbnails at low zoom ([#1206](https://github.com/AntelopeJS/dms/pull/1206))
- **dms:** Accept xAxis options on a mockup ChartBar ([#1208](https://github.com/AntelopeJS/dms/pull/1208))
- **dms:** Enforce mockup block locks on MCP writes, deselects and lock takes ([#1211](https://github.com/AntelopeJS/dms/pull/1211))
- **dms:** Answer a period-bound stats route for the All period over PostgreSQL ([#1214](https://github.com/AntelopeJS/dms/pull/1214))
- **period-selector:** Keep the other bound while a date is typed ([#1150](https://github.com/AntelopeJS/dms/pull/1150))
- **dms:** Draw two initials for a one-word identity or card name ([#1213](https://github.com/AntelopeJS/dms/pull/1213))
- **dms:** Time out a GenerateHtml render that hangs ([#1216](https://github.com/AntelopeJS/dms/pull/1216))
- **dms:** Rotate the refresh token on every refresh and revoke a replayed session ([#1215](https://github.com/AntelopeJS/dms/pull/1215))
- **dms:** Validate only the edited row of a repeater ([#1217](https://github.com/AntelopeJS/dms/pull/1217))
- **dms:** Log the first-owner setup token only in development ([#1221](https://github.com/AntelopeJS/dms/pull/1221))
- **dms:** Fix the Altab QA defects in counts, dates, addresses, KPI titles, row actions and page links ([#1224](https://github.com/AntelopeJS/dms/pull/1224))
- **dms:** Mount GET /dms/dev/reload only in development ([#1225](https://github.com/AntelopeJS/dms/pull/1225))
- **dms:** Store invitation tokens as digests and mint a new one to copy a link ([#1218](https://github.com/AntelopeJS/dms/pull/1218))
- **interface-dms:** Refuse a table action no table view declares to everyone but a platform owner ([#1220](https://github.com/AntelopeJS/dms/pull/1220))
- **dms:** Pass the nightly's Windows legs and its Stress mongod check ([#1227](https://github.com/AntelopeJS/dms/pull/1227))

### 💅 Refactors

- **dms:** Delete dms-control and the verify-dms harness ([#1172](https://github.com/AntelopeJS/dms/pull/1172))
- **dms:** Name the e2e kit's environment variables after the kit ([#1184](https://github.com/AntelopeJS/dms/pull/1184))
- **dms:** Remove the preview_blocks MCP tool ([#1204](https://github.com/AntelopeJS/dms/pull/1204))
- **interface-dms:** Remove TenantMemberModel.listAll() ([#1228](https://github.com/AntelopeJS/dms/pull/1228))

### 📖 Documentation

- **readme:** Show the mockup run and its new numbers ([#1176](https://github.com/AntelopeJS/dms/pull/1176))
- **ai:** Group the AI & coding agents pages and rewrite them ([#1190](https://github.com/AntelopeJS/dms/pull/1190))

### 📦 Build

- Move pnpm to 10.34.9 ([#1179](https://github.com/AntelopeJS/dms/pull/1179))

### ✅ Tests

- **dms:** Port the dms HTTP and command-line journeys to integration tests ([#1167](https://github.com/AntelopeJS/dms/pull/1167))
- **dms:** Run the run-exports kit test and name the journeys config's renderer ([#1174](https://github.com/AntelopeJS/dms/pull/1174))
- **dms:** Count only the bridge publication's own warnings ([#1187](https://github.com/AntelopeJS/dms/pull/1187))
- **dms:** Import the relation input before its test starts its timer ([#1186](https://github.com/AntelopeJS/dms/pull/1186))
- **dms:** Read the API's module set on a connection of its own in the dashboard wait ([#1197](https://github.com/AntelopeJS/dms/pull/1197))
- **dms:** Serve the dev-frontend test's fake dashboard on a restartable port ([#1229](https://github.com/AntelopeJS/dms/pull/1229))
- **dms:** Take the e2e mongod's port from restartablePort and refuse a freePort port where a server restarts ([#1230](https://github.com/AntelopeJS/dms/pull/1230))

### 🤖 CI

- **dms:** Run the merge queue tier and plan every job from one selector ([#1159](https://github.com/AntelopeJS/dms/pull/1159))
- **dms:** Shard the e2e queue suite by measured seconds ([#1163](https://github.com/AntelopeJS/dms/pull/1163))
- **dms:** Run the builder suite on 5 shards and refresh its weights ([#1171](https://github.com/AntelopeJS/dms/pull/1171))

#### ⚠️ Breaking Changes

- **dms:** Remove the preview_blocks MCP tool ([#1204](https://github.com/AntelopeJS/dms/pull/1204))
- **dms:** Store invitation tokens as digests and mint a new one to copy a link ([#1218](https://github.com/AntelopeJS/dms/pull/1218))
- **interface-dms:** Refuse a table action no table view declares to everyone but a platform owner ([#1220](https://github.com/AntelopeJS/dms/pull/1220))
- **dms:** Store phone numbers in E.164 and pick their country in the input ([#1212](https://github.com/AntelopeJS/dms/pull/1212))
- **interface-dms:** Remove TenantMemberModel.listAll() ([#1228](https://github.com/AntelopeJS/dms/pull/1228))

### ❤️ Contributors

- Antony Rizzitelli
- Maxime Westhoven
- Emre Öcel

## v0.21.3

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.21.2...v0.21.3)

### 🚀 Enhancements

- **layout:** Add a copy button to the error page's message ([#1153](https://github.com/AntelopeJS/dms/pull/1153))
- **dms:** Mockup workbench, builder sections and column presentation, Safe-mode MCP access ([#1156](https://github.com/AntelopeJS/dms/pull/1156))

### 🩹 Fixes

- **ui:** Use an email input type for email fields ([#1147](https://github.com/AntelopeJS/dms/pull/1147))
- **ui:** Name the table toolbar's icon-only buttons for screen readers ([#1152](https://github.com/AntelopeJS/dms/pull/1152))
- **deps:** Require the latest @antelopejs dependencies ([#1157](https://github.com/AntelopeJS/dms/pull/1157))

### ❤️ Contributors

- Oikantik Basu
- İsmail Duran
- Antony Rizzitelli

## v0.21.2

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.21.1...v0.21.2)

### 🩹 Fixes

- **dms:** Drop the shadow on the sticky columns of TableView ([#1148](https://github.com/AntelopeJS/dms/pull/1148))

### 📖 Documentation

- **dms:** Drop the stale scroll fade from the table docs and TSDoc ([#1149](https://github.com/AntelopeJS/dms/pull/1149))

### ❤️ Contributors

- Antony Rizzitelli

## v0.21.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.21.0...v0.21.1)

### 🩹 Fixes

- **dms:** Load the error messages before an auth form shows a failure ([#1136](https://github.com/AntelopeJS/dms/pull/1136))
- **interface-dms:** Load into a dms that does not implement distinctWithSearch ([#1137](https://github.com/AntelopeJS/dms/pull/1137))

### ❤️ Contributors

- Antony Rizzitelli

## v0.21.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.20.8...v0.21.0)

### 🔥 Performance

- **dms:** Count, filter and page role holders in the database query ([#1118](https://github.com/AntelopeJS/dms/pull/1118))

### 🩹 Fixes

- **dms:** Draw no request-sending input from a fetched confirm dialog ([#1091](https://github.com/AntelopeJS/dms/pull/1091))
- **dms:** Judge a block's request targets inside the builder engine for agent calls ([#1090](https://github.com/AntelopeJS/dms/pull/1090))
- **dms:** Write column references instead of row values in mapped modules ([#1104](https://github.com/AntelopeJS/dms/pull/1104))
- **dms:** Clear account cookies a previous session secret sealed ([#1130](https://github.com/AntelopeJS/dms/pull/1130))
- **dms:** Emit the e2e types with TypeScript 6 to keep their TSDoc ([#1133](https://github.com/AntelopeJS/dms/pull/1133))
- **dms:** Wait for the dev dashboard to serve a new backend's module set ([#1134](https://github.com/AntelopeJS/dms/pull/1134))

### 💅 Refactors

- **interface-dms-builder:** Remove the SampleDatabaseRows operation ([#1129](https://github.com/AntelopeJS/dms/pull/1129))

### 📖 Documentation

- Drop the reverted pull request pairs from the 16 November changelogs ([#1128](https://github.com/AntelopeJS/dms/pull/1128))

### 📦 Build

- Build and typecheck with TypeScript 7 through antelopejs-tsc ([#1132](https://github.com/AntelopeJS/dms/pull/1132))

#### ⚠️ Breaking Changes

- **interface-dms-builder:** Remove the SampleDatabaseRows operation ([#1129](https://github.com/AntelopeJS/dms/pull/1129))

### ❤️ Contributors

- Antony Rizzitelli

## v0.20.8

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.20.7...v0.20.8)

### 🚀 Enhancements

- **e2e:** Name the verify skill of a suite and serve the development dashboard to the journeys that need it ([#1110](https://github.com/AntelopeJS/dms/pull/1110))

### 🔥 Performance

- **dms:** Reuse a finished database analysis while its inputs are unchanged ([#1087](https://github.com/AntelopeJS/dms/pull/1087))
- **dms:** Read only the user ids, the visible notifications and the invite roles the query needs ([#1117](https://github.com/AntelopeJS/dms/pull/1117))

### 🩹 Fixes

- **dms:** Honor Retry-After when the SSE stream is refused ([#1086](https://github.com/AntelopeJS/dms/pull/1086))
- **dms:** Prune the imports a removed or configured builder field orphans ([#1085](https://github.com/AntelopeJS/dms/pull/1085))
- **dms:** Drop a table row read that a later list read supersedes ([#1092](https://github.com/AntelopeJS/dms/pull/1092))
- **deps:** Depend on the interface siblings through workspace:^ ([#1097](https://github.com/AntelopeJS/dms/pull/1097))
- **dms:** Hide only the row literals a mapping wrote from the builder structure tools ([#1089](https://github.com/AntelopeJS/dms/pull/1089))
- **dms:** Handle connection errors of the realtime Redis subscriber ([#1101](https://github.com/AntelopeJS/dms/pull/1101))
- **dms:** Render nothing for a Form with no fields and no fetchUrl ([#1115](https://github.com/AntelopeJS/dms/pull/1115))
- **dms:** Log a Redis reconnect once instead of on every attempt ([#1116](https://github.com/AntelopeJS/dms/pull/1116))
- **dms:** Keep the default view a first visit opens, so a hidden column stays hidden on reload ([#1121](https://github.com/AntelopeJS/dms/pull/1121))
- **dms:** Map read-only a relation the database account may not write ([#1119](https://github.com/AntelopeJS/dms/pull/1119))
- **dms:** List a sent invite's roles once each, in the order the role read returns them ([#1122](https://github.com/AntelopeJS/dms/pull/1122))

### 💅 Refactors

- **dms:** Remove the checks marked Drop in the tooling review ([#1077](https://github.com/AntelopeJS/dms/pull/1077))
- **dms:** Fix the local anti-slop findings of the dms-core layer ([#1100](https://github.com/AntelopeJS/dms/pull/1100))

### 📦 Build

- Move to @antelopejs/tooling-configs 0.8 and the three-tier CI ([#1080](https://github.com/AntelopeJS/dms/pull/1080))
- **dms:** Publish the stable release through the shared workflow's hook ([#1083](https://github.com/AntelopeJS/dms/pull/1083))

### ✅ Tests

- **playground:** Lint client loads of server code that dependency-cruiser misses ([#1084](https://github.com/AntelopeJS/dms/pull/1084))
- **dms:** Property-test the builder's read and save of page options ([#1095](https://github.com/AntelopeJS/dms/pull/1095))
- **dms:** Wait for the welcome notification before the current-password snapshot ([#1103](https://github.com/AntelopeJS/dms/pull/1103))
- **e2e:** Run the verify skill's journeys as a Playwright suite in CI ([#1082](https://github.com/AntelopeJS/dms/pull/1082))
- **dms:** Add formal targets for the MCP tools' row values and block request targets ([#1102](https://github.com/AntelopeJS/dms/pull/1102))
- **dms:** Add formal targets for invites, theme logo orphans and builder option echo ([#1096](https://github.com/AntelopeJS/dms/pull/1096))

### 🤖 CI

- Typecheck the dependent modules' frontends against the built Vue layer ([#1120](https://github.com/AntelopeJS/dms/pull/1120))

### ❤️ Contributors

- Antony Rizzitelli

## v0.20.7

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.20.6...v0.20.7)

### 🩹 Fixes

- **dms:** Refuse a builder block that sends requests outside its page's data API ([#1074](https://github.com/AntelopeJS/dms/pull/1074))
- **dms:** Keep a mockup's sample tree off live routes ([#1075](https://github.com/AntelopeJS/dms/pull/1075))
- **dms:** Judge mockup_apply_to_page writes and drop x-dms-ui- headers from uploads ([#1076](https://github.com/AntelopeJS/dms/pull/1076))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.20.6

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.20.5...v0.20.6)

### 🩹 Fixes

- **dms:** Take no screenshot in page_verify ([#1072](https://github.com/AntelopeJS/dms/pull/1072))
- **dms:** Hide the row values a mapping wrote from the builder tools that read its code ([#1073](https://github.com/AntelopeJS/dms/pull/1073))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.20.5

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.20.4...v0.20.5)

### 💅 Refactors

- **dms:** Check a database connection with the probe its driver exports ([#1055](https://github.com/AntelopeJS/dms/pull/1055))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.20.4

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.20.3...v0.20.4)

### 🩹 Fixes

- **dms:** The tools the AI calls answer the shape of a connected database, never its values ([#1065](https://github.com/AntelopeJS/dms/pull/1065))
- **dms:** Resolve a form's success link from its submit answer read as JSON ([#1071](https://github.com/AntelopeJS/dms/pull/1071))

### 💅 Refactors

- **dms:** Lint the dms-ui app area of the Vue layer ([#1067](https://github.com/AntelopeJS/dms/pull/1067))
- **dms:** Lint the Vue layer's scripts with the AntelopeJS preset ([#1070](https://github.com/AntelopeJS/dms/pull/1070))
- **dms:** Fix the anti-slop findings of the dms-ui build components, mockups and utils ([#1063](https://github.com/AntelopeJS/dms/pull/1063))
- **dms:** Fix the anti-slop findings of the dms-core layer ([#1066](https://github.com/AntelopeJS/dms/pull/1066))
- **dms:** Fix the anti-slop findings of the Vue layer's tests ([#1061](https://github.com/AntelopeJS/dms/pull/1061))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.20.3

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.20.2...v0.20.3)

### 🩹 Fixes

- **dms:** Post e-mail renders to the dashboard's own origin ([#1060](https://github.com/AntelopeJS/dms/pull/1060))
- **dms:** Refuse a database driver's connection target written as a value ([#1059](https://github.com/AntelopeJS/dms/pull/1059))

### 💅 Refactors

- **dms:** Fix the anti-slop findings of the dms-layout layer ([#1064](https://github.com/AntelopeJS/dms/pull/1064))
- **dms:** Fix the anti-slop findings of the dms-ui build composables ([#1068](https://github.com/AntelopeJS/dms/pull/1068))

### 📦 Build

- **dms:** Lint the Vue layer with the AntelopeJS preset, starting with dms-auth and dms-onboarding (ANT-2241) ([#1056](https://github.com/AntelopeJS/dms/pull/1056))
- **deps:** Move dms to core 1.24, dms-frontend 0.11.4 and the batch driver patches ([#1062](https://github.com/AntelopeJS/dms/pull/1062))

### ✅ Tests

- **dms:** Run the scaffold ranges check with the installed antelopejs-checks ([#1058](https://github.com/AntelopeJS/dms/pull/1058))
- **dms:** Expect the dms-frontend install hint at the range the Vue layer declares ([#1069](https://github.com/AntelopeJS/dms/pull/1069))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.20.2

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.20.1...v0.20.2)

### 🩹 Fixes

- **dms:** Scaffold a builder module on the interface ranges the DMS declares ([#1052](https://github.com/AntelopeJS/dms/pull/1052))
- **dms:** Sign in to a checked database with the URL's credentials only ([#1057](https://github.com/AntelopeJS/dms/pull/1057))

### 📦 Build

- **deps:** Lock @antelopejs/core 1.23.3 in the workspace ([#1054](https://github.com/AntelopeJS/dms/pull/1054))
- **deps:** Move to @antelopejs/tooling-configs 0.7.2 ([#1053](https://github.com/AntelopeJS/dms/pull/1053))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.20.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.20.0...v0.20.1)

### 🚀 Enhancements

- **dms:** Fail a layer's lint on a Dms component nothing installed registers ([#1033](https://github.com/AntelopeJS/dms/pull/1033))

### 🩹 Fixes

- **dms:** Restrict credential files to their owner on Windows ([#1008](https://github.com/AntelopeJS/dms/pull/1008))
- **dms:** Keep a logo file the app config builds with +, concat or join ([#1024](https://github.com/AntelopeJS/dms/pull/1024))
- **interface-dms:** Keep one pending invite when a cancel, accept or expiry lands during a fresh invite's withdrawal ([#1021](https://github.com/AntelopeJS/dms/pull/1021))
- **dms:** Install a scaffolded module outside the project's pnpm workspace ([#1022](https://github.com/AntelopeJS/dms/pull/1022))
- **dms:** Check preview_blocks sketches with the mockup compiler's sanitizer and publish it as @antelopejs/dms/sketch ([#1009](https://github.com/AntelopeJS/dms/pull/1009))
- **dms:** Offer the MySQL driver on interface-database 0.4 ([#1029](https://github.com/AntelopeJS/dms/pull/1029))
- **dms:** Capture the auth middleware's toast before its first await ([#1031](https://github.com/AntelopeJS/dms/pull/1031))
- **dms:** Finish a dms-control watch restart of the playground ([#1035](https://github.com/AntelopeJS/dms/pull/1035))
- **dms:** Keep a logo the app config names in a query, a fragment or a literal-only join ([#1036](https://github.com/AntelopeJS/dms/pull/1036))
- **interface-dms:** Let a resend through a withdrawn fresh invite left by a failed delete, and name the invite that blocks it ([#1037](https://github.com/AntelopeJS/dms/pull/1037))
- **deps:** Require zod 3.25 in interface-dms and dms so a reused lock drops zod 3.24 ([#1039](https://github.com/AntelopeJS/dms/pull/1039))
- **interface-dms:** Hand a fresh invite whose rival retires during its withdrawal a pending invitation ([#1038](https://github.com/AntelopeJS/dms/pull/1038))
- **dms:** Refuse access and refresh tokens that carry no session ([#1042](https://github.com/AntelopeJS/dms/pull/1042))
- **dms:** Keep a logo the app config names in a percent-encoded optimizer URL ([#1041](https://github.com/AntelopeJS/dms/pull/1041))
- **interface-dms:** Keep a new invitation's re-read when its stray-removal retry finds the read invite cancelled ([#1045](https://github.com/AntelopeJS/dms/pull/1045))
- **dms:** Run the DMS component check without @antelopejs/dms-frontend, and name what a layer must install ([#1044](https://github.com/AntelopeJS/dms/pull/1044))
- **interface-dms:** Settle a fresh invite once as kept or withdrawn, so no caller yields to one that then withdraws ([#1046](https://github.com/AntelopeJS/dms/pull/1046))
- **dms:** Report a connection variable the starting environment shadows instead of writing it to .env ([#1049](https://github.com/AntelopeJS/dms/pull/1049))
- **dms:** Let a restart load a .env value after a builder call loaded the configuration ([#1050](https://github.com/AntelopeJS/dms/pull/1050))
- **deps:** Cap every @antelopejs range below the next minor ([#1051](https://github.com/AntelopeJS/dms/pull/1051))

### 📖 Documentation

- **interface-dms-builder:** Say when a second catalog provider needs exportPriority or a pin ([#1026](https://github.com/AntelopeJS/dms/pull/1026))
- **dms:** Replace dms-ai and dms-builder with dms-assistant ([#894](https://github.com/AntelopeJS/dms/pull/894))
- Name the assistant dms-assistant where dms-ai was left ([#1048](https://github.com/AntelopeJS/dms/pull/1048))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.14.1 ([a53e6e9b](https://github.com/AntelopeJS/dms/commit/a53e6e9b))
- **release:** @antelopejs/interface-dms v0.14.2 ([82a1a90e](https://github.com/AntelopeJS/dms/commit/82a1a90e))

### ✅ Tests

- **dms:** Let the invite host take any zod 3.x and spawn npm through its Windows shim ([#1023](https://github.com/AntelopeJS/dms/pull/1023))
- **dms:** Load TableView in the table runtime setup, not the first test ([#1025](https://github.com/AntelopeJS/dms/pull/1025))
- **dms:** Acknowledge test MongoDB writes on apply so Windows integration runs stop stalling ([#1027](https://github.com/AntelopeJS/dms/pull/1027))
- **dms:** Restore the mail renderer and sender after each suite that captures emails ([#1030](https://github.com/AntelopeJS/dms/pull/1030))
- **dms:** Give the menu-access-events setup hook a timeout sized to its sign-ups ([#1032](https://github.com/AntelopeJS/dms/pull/1032))
- **dms:** Size the sketch rebuild test's timeout to its seventeen checks ([#1040](https://github.com/AntelopeJS/dms/pull/1040))
- **dms:** Keep the integration file storage off the test mongod's disk ([#1028](https://github.com/AntelopeJS/dms/pull/1028))
- **dms:** Move cold module and Intl setup out of two frontend-vue test bodies ([#1047](https://github.com/AntelopeJS/dms/pull/1047))

### 🤖 CI

- Run the CI on Windows in parallel with Linux ([#906](https://github.com/AntelopeJS/dms/pull/906))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.20.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.19.6...v0.20.0)

### 🚀 Enhancements

- **dms:** Serve the builder engine and its MCP tools to coding agents in development ([#857](https://github.com/AntelopeJS/dms/pull/857))
- **mcp:** Mockup tools to write and patch a spec and read and resolve its annotations ([#859](https://github.com/AntelopeJS/dms/pull/859))
- **mcp:** Add page_verify, which tests a real page in a headless browser ([#861](https://github.com/AntelopeJS/dms/pull/861))
- **branding:** Edit the platform theme from a dev-only Branding editor ([#870](https://github.com/AntelopeJS/dms/pull/870))
- **widgets:** Let an app widget take a click action and an attention dot ([#871](https://github.com/AntelopeJS/dms/pull/871))
- **interface:** OwnerOnly page option for platform-owner-only pages ([#880](https://github.com/AntelopeJS/dms/pull/880))
- **verify:** Dms-control can start development backends ([#881](https://github.com/AntelopeJS/dms/pull/881))
- **mockup:** Edit mode in /mockup ([#866](https://github.com/AntelopeJS/dms/pull/866))
- **sidebar:** Let a module lock its sidebar entries with a reason ([#868](https://github.com/AntelopeJS/dms/pull/868))
- **mockup:** Turn a live page into a mockup with Edit as mockup ([#873](https://github.com/AntelopeJS/dms/pull/873))
- **dms:** Read a template literal of constants as the string it builds ([#879](https://github.com/AntelopeJS/dms/pull/879))
- **mockup:** Add a dev-only Mockups page opened from a header icon ([#872](https://github.com/AntelopeJS/dms/pull/872))
- **dms:** Refuse builder write paths on a read-only external connection ([#883](https://github.com/AntelopeJS/dms/pull/883))
- **mcp:** Mark a held tool's failure after confirmation with confirmation_consumed ([#900](https://github.com/AntelopeJS/dms/pull/900))
- **dms:** Let the database MCP tools read every declared catalog connection ([#917](https://github.com/AntelopeJS/dms/pull/917))
- **dms:** Add the dms MCP server to the project's .codex/config.toml in development ([#943](https://github.com/AntelopeJS/dms/pull/943))
- **dms-control:** Let a journey declare standby: false ([#946](https://github.com/AntelopeJS/dms/pull/946))
- **mockup:** Build a converted mockup back into its live page with mockup_apply_to_page ([#916](https://github.com/AntelopeJS/dms/pull/916))
- **dms:** Move the leader dashboard tab on navigate_to_page ([#996](https://github.com/AntelopeJS/dms/pull/996))
- **dms:** Serve the external-database connect flow through interface-dms-builder ([#891](https://github.com/AntelopeJS/dms/pull/891))
- **mockup:** Mark a built mockup out of sync when its pages change after the build ([#995](https://github.com/AntelopeJS/dms/pull/995))
- **interface-dms-builder:** List the database connections a module entry declares ([#905](https://github.com/AntelopeJS/dms/pull/905))
- **interface-dms-builder:** Accept mongodb+srv URLs in the database connect flow ([#1006](https://github.com/AntelopeJS/dms/pull/1006))
- **dms:** ⚠️  Move to interface-database 0.4.0 ([#907](https://github.com/AntelopeJS/dms/pull/907))
- **dms:** Record source chat for a mockup spec the chat's MCP session writes ([#1011](https://github.com/AntelopeJS/dms/pull/1011))

### 🩹 Fixes

- **test:** Split long unit test callbacks and resync the dms README ([#889](https://github.com/AntelopeJS/dms/pull/889))
- **mockup:** Make the mockup API and the Branding and mockup pages owner-only ([#887](https://github.com/AntelopeJS/dms/pull/887))
- **auth:** Verify a token naming no user against a dummy key and read its session after ([#885](https://github.com/AntelopeJS/dms/pull/885))
- **mockup:** Keep a note on its block after any insert, move, remove or page rename ([#886](https://github.com/AntelopeJS/dms/pull/886))
- **test:** Reconcile the mockup routes tests with the owner-only route setup ([#893](https://github.com/AntelopeJS/dms/pull/893))
- **mcp:** Hold a refused builder call for the MCP session that made it ([#895](https://github.com/AntelopeJS/dms/pull/895))
- **dms:** Run the queries interface-database 0.4.0 no longer runs when awaited ([#903](https://github.com/AntelopeJS/dms/pull/903))
- **interface-dms:** ⚠️  Type the published contracts as the runtime implements them and break the table-view/data-types cycle ([#904](https://github.com/AntelopeJS/dms/pull/904))
- **frontend-vue:** Narrow the backend answers and request bodies the auth routes read ([#909](https://github.com/AntelopeJS/dms/pull/909))
- **dms:** ⚠️  Grant only held permissions in the roles API and read platform ownership from user.owner ([#913](https://github.com/AntelopeJS/dms/pull/913))
- ⚠️  Grant * only to the platform owner, never through a stored role ([#949](https://github.com/AntelopeJS/dms/pull/949))
- **builder:** List a stored * role as reaching no page in the page access panel ([#970](https://github.com/AntelopeJS/dms/pull/970))
- **dms:** Refuse agent config writes a template reads, and keys written twice or computed along a path ([#914](https://github.com/AntelopeJS/dms/pull/914))
- **dms:** Keep a partial export summary with incomplete failures and a failed SSR permission load off the error page ([#918](https://github.com/AntelopeJS/dms/pull/918))
- **dms:** Move the shortcuts-aggregated declaration out of the auto-imported types folder ([#919](https://github.com/AntelopeJS/dms/pull/919))
- **dms:** Derive the status tints and lines from the theme's status palettes ([#920](https://github.com/AntelopeJS/dms/pull/920))
- **interface-dms:** ⚠️  Close the dms#904 contract leftovers (RelationType fallback, field props, export SAFETY) ([#921](https://github.com/AntelopeJS/dms/pull/921), [#904](https://github.com/AntelopeJS/dms/issues/904))
- **dms:** Indent a block ConfigureModule adds as the configuration's own literals ([#922](https://github.com/AntelopeJS/dms/pull/922))
- **dms:** Build a scaffolded module to CommonJS in dist whatever the project's tsconfig emits ([#923](https://github.com/AntelopeJS/dms/pull/923))
- **dms:** Name a block by its type in the mockup breadcrumb when its only id is stamped ([#925](https://github.com/AntelopeJS/dms/pull/925))
- **dms:** Keep the constants a page option was written with through a page draft save ([#927](https://github.com/AntelopeJS/dms/pull/927))
- **dms:** Replace a shorthand page option on patch instead of adding a second one ([#964](https://github.com/AntelopeJS/dms/pull/964))
- **dms:** Read an enum member in a block option as its value ([#928](https://github.com/AntelopeJS/dms/pull/928))
- **dms:** Stop reporting an unreadable mockup spec as a failed save ([#930](https://github.com/AntelopeJS/dms/pull/930))
- **dms:** Delete the email logo file SetTheme no longer references ([#931](https://github.com/AntelopeJS/dms/pull/931))
- **dms:** Indent builder edits like the project's sources when no config sets it ([#932](https://github.com/AntelopeJS/dms/pull/932))
- **mockup:** Draw a Form whose sections hold their own fields ([#933](https://github.com/AntelopeJS/dms/pull/933))
- **dms:** Carry the dms-builder QueryValue route and TypeScript 6 checker fixes into the engine ([#934](https://github.com/AntelopeJS/dms/pull/934))
- **dms:** Typecheck builder saves with TypeScript 6 so a writable mapping passes the lib check ([#935](https://github.com/AntelopeJS/dms/pull/935))
- **dms:** Name a table view's list URL and read dropdown openers in page_verify ([#936](https://github.com/AntelopeJS/dms/pull/936))
- **dms-control:** Give the run's API forwarder a port outside the ephemeral range ([#961](https://github.com/AntelopeJS/dms/pull/961))
- **mcp:** Find page blocks on a production dashboard in page_verify ([#944](https://github.com/AntelopeJS/dms/pull/944))
- **dms:** ⚠️  Hold built page paths and live routes to one route pattern ([#950](https://github.com/AntelopeJS/dms/pull/950))
- **dms:** Stop the module-root search at the playground's checkout ([#952](https://github.com/AntelopeJS/dms/pull/952))
- **dms:** Derive the assistant tint, line and halo from the theme's secondary palette ([#953](https://github.com/AntelopeJS/dms/pull/953))
- **frontend:** Build the theming fixture again ([#955](https://github.com/AntelopeJS/dms/pull/955))
- **frontend:** Generate the layout theme's utility classes from its own stylesheet ([#968](https://github.com/AntelopeJS/dms/pull/968))
- **dms:** Keep the build-key tests independent of installs above TMPDIR ([#956](https://github.com/AntelopeJS/dms/pull/956))
- **dms:** Ship @types/jsonwebtoken for the published declarations ([#958](https://github.com/AntelopeJS/dms/pull/958))
- **dms:** Open no file watcher in the notification tone lint check ([#960](https://github.com/AntelopeJS/dms/pull/960))
- **interface-dms:** Keep one pending invite when two invites of one email race ([#974](https://github.com/AntelopeJS/dms/pull/974))
- **dms:** Give a mockup form field written with only a type its data type's input ([#959](https://github.com/AntelopeJS/dms/pull/959))
- **interface-dms:** ⚠️  Send the archive filter as text and type an empty select's validation honestly ([#947](https://github.com/AntelopeJS/dms/pull/947))
- **interface-dms:** ⚠️  Move to interface-data-api 0.7's StoredRow ([#888](https://github.com/AntelopeJS/dms/pull/888))
- **dms:** Make main green after the merge wave ([#978](https://github.com/AntelopeJS/dms/pull/978))
- **checks:** Run the backend invariant checks in pnpm run checks ([#941](https://github.com/AntelopeJS/dms/pull/941))
- **dms:** Refuse writes on a read external connection outside the builder tools ([#929](https://github.com/AntelopeJS/dms/pull/929))
- **dms:** Stop naming a table view once the user's changes leave it ([#924](https://github.com/AntelopeJS/dms/pull/924))
- **dms:** Drop the constant chain and default import a patched option value read ([#977](https://github.com/AntelopeJS/dms/pull/977))
- **dms:** Forget the stored account when the backend refuses its renewal ([#911](https://github.com/AntelopeJS/dms/pull/911))
- **dms:** Rebase a project's relative path specs onto the module the builder scaffolds ([#938](https://github.com/AntelopeJS/dms/pull/938))
- **dms:** Hold the Vue built-page path check to the backend's route pattern ([#975](https://github.com/AntelopeJS/dms/pull/975))
- **dms:** Keep a logo file the app config still names through a constant ([#985](https://github.com/AntelopeJS/dms/pull/985))
- **dms:** Emit a declaration for every frontend-vue component ([#973](https://github.com/AntelopeJS/dms/pull/973))
- **dms:** Revoke the session on sign-out under dms-frontend 0.11 ([#979](https://github.com/AntelopeJS/dms/pull/979))
- **dms:** Fill the roles overview's grantable with the editor's held permissions ([#980](https://github.com/AntelopeJS/dms/pull/980))
- **dms:** Read page options written as constants and leave an unchanged echo as written ([#962](https://github.com/AntelopeJS/dms/pull/962))
- **dms:** Keep a live route whose {{ }} token pads its key with spaces ([#976](https://github.com/AntelopeJS/dms/pull/976))
- **interface-dms:** Keep one pending invite when a fresh invite lands after a replacement ([#986](https://github.com/AntelopeJS/dms/pull/986))
- **dms:** Extend the project tsconfig from a scaffolded module and leave out what only the project installs ([#963](https://github.com/AntelopeJS/dms/pull/963))
- **mockup:** Write a title the mockup changed as the live page's display name ([#972](https://github.com/AntelopeJS/dms/pull/972))
- **dms:** Mint the unknown-user dummy key per process and refuse unknown users in validateRefreshToken ([#987](https://github.com/AntelopeJS/dms/pull/987))
- **dms:** Prune the bindings a patched value read by symbol, not by spelling ([#990](https://github.com/AntelopeJS/dms/pull/990))
- **dms:** Stop warning that a roles editor can become owner or grant any permission ([#991](https://github.com/AntelopeJS/dms/pull/991))
- **dms-control:** Give the run's mail sink and dashboard ports outside the ephemeral range ([#966](https://github.com/AntelopeJS/dms/pull/966))
- **dms:** Read category options written as constants and leave an unchanged echo as written ([#969](https://github.com/AntelopeJS/dms/pull/969))
- **mockup:** Say in the apply answer when the page's display name was written ([#984](https://github.com/AntelopeJS/dms/pull/984))
- **dms:** Leave a page displayName written as code when ConfigurePage echoes the id it reads as ([#981](https://github.com/AntelopeJS/dms/pull/981))
- **mockup:** Title a single-page mockup with its page's new name on apply and replace ([#982](https://github.com/AntelopeJS/dms/pull/982))
- **dms:** Read a page's or category's urlSlug written as a constant ([#993](https://github.com/AntelopeJS/dms/pull/993))
- **dms:** Read a module's title and default category name written as constants ([#994](https://github.com/AntelopeJS/dms/pull/994))
- **dms:** Reject every builder operation at once when the builder is off ([#896](https://github.com/AntelopeJS/dms/pull/896))
- **dms:** Read MySQL privileges the way the session holds them in the database probe ([#1005](https://github.com/AntelopeJS/dms/pull/1005))
- **dms:** Declare typescript as an optional peer for the api-error-presentation check ([#997](https://github.com/AntelopeJS/dms/pull/997))
- **dms:** Leave an icon written as code when an echo sends it as null ([#1003](https://github.com/AntelopeJS/dms/pull/1003))
- **dms:** Keep a logo file the app config reaches through an imported constant ([#999](https://github.com/AntelopeJS/dms/pull/999))
- **dms:** Prune every declaration of a merged interface, enum or overloaded function ([#1001](https://github.com/AntelopeJS/dms/pull/1001))
- **dms:** Prune one name of a destructured literal with its member ([#1004](https://github.com/AntelopeJS/dms/pull/1004))
- **dms:** Resolve the root category declared in a linked interface so a remap reuses its category ([#1007](https://github.com/AntelopeJS/dms/pull/1007))
- **dms:** Refuse a MySQL socket host in the connect check ([#1002](https://github.com/AntelopeJS/dms/pull/1002))
- **verify-dms:** Wait 180 s for an MCP bridge answer ([#1012](https://github.com/AntelopeJS/dms/pull/1012))
- **dms:** Keep a logo file the app config names through a template literal ([#1010](https://github.com/AntelopeJS/dms/pull/1010))
- **dms:** Serve the project's database wiring to MCP clients so a connect batch writes a startable driver range ([#1016](https://github.com/AntelopeJS/dms/pull/1016))
- **interface-dms:** Keep one pending invite when a fourth caller replaces a fresh invite ([#1013](https://github.com/AntelopeJS/dms/pull/1013))
- **interface-dms:** Accept any zod 3.x from 3.24.2 so a module's newer zod is shared ([#1015](https://github.com/AntelopeJS/dms/pull/1015))
- **dms:** Accept any zod 3.x from 3.24.2 so the workspace shares one zod copy ([#1018](https://github.com/AntelopeJS/dms/pull/1018))
- **dms:** Keep a logo file the app config builds from substitutions alone ([#1019](https://github.com/AntelopeJS/dms/pull/1019))
- **dms:** ⚠️  Verify a token's signature before looking up its user ([#1014](https://github.com/AntelopeJS/dms/pull/1014))
- **release:** Build interface-dms-builder before the release lint ([#1020](https://github.com/AntelopeJS/dms/pull/1020))

### 💅 Refactors

- Fix the code behind the small-rule lint directives ([#897](https://github.com/AntelopeJS/dms/pull/897))
- **interface-dms:** Break the page-categories import cycle ([#898](https://github.com/AntelopeJS/dms/pull/898))
- **frontend-vue:** ⚠️  Give every Vue component a multi-word name ([#910](https://github.com/AntelopeJS/dms/pull/910))
- ⚠️  Call keyed notification sends and store declarations without capability guards ([#937](https://github.com/AntelopeJS/dms/pull/937))
- ⚠️  Remove the migration guides and the compatibility code before 0.20.0 ([#915](https://github.com/AntelopeJS/dms/pull/915))
- **dms:** Drop the skills moved to the antelopejs plugin ([#890](https://github.com/AntelopeJS/dms/pull/890))

### 📖 Documentation

- Name MySQL and MariaDB in the Connect lists ([#884](https://github.com/AntelopeJS/dms/pull/884))
- Describe current file-key and ownership behaviour without legacy or shim wording ([#957](https://github.com/AntelopeJS/dms/pull/957))
- **verify-dms:** Point the Branding and mockups gotchas at dms-control up --dev-backend ([#942](https://github.com/AntelopeJS/dms/pull/942))
- Delete the remaining migration guides and UPGRADING.md ([#926](https://github.com/AntelopeJS/dms/pull/926))
- **dms:** Name AdonisJS and MySQL without versions in prose ([#1017](https://github.com/AntelopeJS/dms/pull/1017))

### 📦 Build

- **frontend-vue:** Turn no-undef back on with the dms and renderer globals ([#899](https://github.com/AntelopeJS/dms/pull/899))
- **dms:** Type-check the frontend-vue tests in pnpm run checks ([#992](https://github.com/AntelopeJS/dms/pull/992))

### 🏡 Chore

- **release:** @antelopejs/interface-dms-builder v0.5.0 ([0993d22a](https://github.com/AntelopeJS/dms/commit/0993d22a))
- **release:** @antelopejs/interface-dms v0.14.0 ([1c5c7f16](https://github.com/AntelopeJS/dms/commit/1c5c7f16))
- **release:** @antelopejs/interface-dms-builder v0.5.1 ([77d48d67](https://github.com/AntelopeJS/dms/commit/77d48d67))

### ✅ Tests

- Move tests that pass a forbidden value into untyped specs ([#901](https://github.com/AntelopeJS/dms/pull/901))
- **dms:** Give the fake run's API port a port outside the ephemeral range ([#939](https://github.com/AntelopeJS/dms/pull/939))
- **dms:** Assert the concurrent annotation creates as a set, not in call order ([#940](https://github.com/AntelopeJS/dms/pull/940))
- **verify-dms:** Run page_verify as a member role against a mockup ([#945](https://github.com/AntelopeJS/dms/pull/945))
- **interface-dms:** Bound the decoder load tests by CPU time, not wall time ([#951](https://github.com/AntelopeJS/dms/pull/951))
- **dms:** Stop the build-layout fixture's install walk at its own folder ([#965](https://github.com/AntelopeJS/dms/pull/965))
- **dms-control:** Fail when prepare drops a journey's backend or standby pin ([#971](https://github.com/AntelopeJS/dms/pull/971))
- **dms:** Bind the dms-dev test servers to kernel-chosen ports ([#988](https://github.com/AntelopeJS/dms/pull/988))
- **dms:** Stop the mockup store save test flaking on its debounce lower bound ([#983](https://github.com/AntelopeJS/dms/pull/983))
- **dms:** Validate mockup specs through the generated JSON Schema route patterns ([#989](https://github.com/AntelopeJS/dms/pull/989))
- **dms:** Bundle the Phosphor icons the Vue tests render instead of fetching them ([#998](https://github.com/AntelopeJS/dms/pull/998))
- **dms:** Check that recent modules list the most recent visit first ([#1000](https://github.com/AntelopeJS/dms/pull/1000))
- **verify-dms:** Fail a journey when the builder loses its provider on a dev reload ([#948](https://github.com/AntelopeJS/dms/pull/948))

### 🤖 CI

- **release:** Raise the dms interface-dms range when the interface release leaves it ([#908](https://github.com/AntelopeJS/dms/pull/908))
- **release:** Refuse a dms release while an interface it depends on has unreleased source ([#912](https://github.com/AntelopeJS/dms/pull/912))
- **release:** Refuse a dms release while the in-tree interface-dms-builder version is unpublished ([#954](https://github.com/AntelopeJS/dms/pull/954))
- **release:** Refuse a dms release when the in-tree interface-dms-builder version leaves its declared range ([#967](https://github.com/AntelopeJS/dms/pull/967))

#### ⚠️ Breaking Changes

- **dms:** ⚠️  Move to interface-database 0.4.0 ([#907](https://github.com/AntelopeJS/dms/pull/907))
- **interface-dms:** ⚠️  Type the published contracts as the runtime implements them and break the table-view/data-types cycle ([#904](https://github.com/AntelopeJS/dms/pull/904))
- **dms:** ⚠️  Grant only held permissions in the roles API and read platform ownership from user.owner ([#913](https://github.com/AntelopeJS/dms/pull/913))
- ⚠️  Grant * only to the platform owner, never through a stored role ([#949](https://github.com/AntelopeJS/dms/pull/949))
- **interface-dms:** ⚠️  Close the dms#904 contract leftovers (RelationType fallback, field props, export SAFETY) ([#921](https://github.com/AntelopeJS/dms/pull/921), [#904](https://github.com/AntelopeJS/dms/issues/904))
- **dms:** ⚠️  Hold built page paths and live routes to one route pattern ([#950](https://github.com/AntelopeJS/dms/pull/950))
- **interface-dms:** ⚠️  Send the archive filter as text and type an empty select's validation honestly ([#947](https://github.com/AntelopeJS/dms/pull/947))
- **interface-dms:** ⚠️  Move to interface-data-api 0.7's StoredRow ([#888](https://github.com/AntelopeJS/dms/pull/888))
- **dms:** ⚠️  Verify a token's signature before looking up its user ([#1014](https://github.com/AntelopeJS/dms/pull/1014))
- **frontend-vue:** ⚠️  Give every Vue component a multi-word name ([#910](https://github.com/AntelopeJS/dms/pull/910))
- ⚠️  Call keyed notification sends and store declarations without capability guards ([#937](https://github.com/AntelopeJS/dms/pull/937))
- ⚠️  Remove the migration guides and the compatibility code before 0.20.0 ([#915](https://github.com/AntelopeJS/dms/pull/915))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))
- Dada-sudo <damir@altab.be>

## v0.19.6

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.19.5...v0.19.6)

### 🩹 Fixes

- **auth:** Answer one 401 for every token refused before its signature checks out ([#882](https://github.com/AntelopeJS/dms/pull/882))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.19.5

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.19.4...v0.19.5)

### 🚀 Enhancements

- **frontend:** Publish @antelopejs/dms/eslint-globals for the layer's auto-imports ([#869](https://github.com/AntelopeJS/dms/pull/869))

### 💅 Refactors

- **frontend:** Drop oxlint directives no linter reads ([#862](https://github.com/AntelopeJS/dms/pull/862))
- Type unpublished dictionaries from their owners ([#863](https://github.com/AntelopeJS/dms/pull/863))
- Narrow with type guards instead of runtime typeof ([#864](https://github.com/AntelopeJS/dms/pull/864))
- Type unknown parameters and returns from their owners ([#865](https://github.com/AntelopeJS/dms/pull/865))
- Remove type assertions or give each a SAFETY reason ([#867](https://github.com/AntelopeJS/dms/pull/867))
- Remove the type assertions behind existing SAFETY comments ([#874](https://github.com/AntelopeJS/dms/pull/874))
- Keep lookup tables' known types instead of widening them ([#875](https://github.com/AntelopeJS/dms/pull/875))
- Replace ts-expect-error with type-level assertions where a type can carry the check ([#876](https://github.com/AntelopeJS/dms/pull/876))

### 📖 Documentation

- Name MySQL and MariaDB as database modules the DMS runs on ([#878](https://github.com/AntelopeJS/dms/pull/878))

### 📦 Build

- **lint:** Remove the config rule offs whose findings are fixed ([#877](https://github.com/AntelopeJS/dms/pull/877))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.13.3 ([396200e3](https://github.com/AntelopeJS/dms/commit/396200e3))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.19.4

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.19.3...v0.19.4)

### 🔥 Performance

- **table:** Stop re-rendering every row after the table mounts ([#860](https://github.com/AntelopeJS/dms/pull/860))

### 🩹 Fixes

- **release:** Regenerate the dms README table when interface-dms bumps ([#855](https://github.com/AntelopeJS/dms/pull/855))

### 📦 Build

- **deps:** Take tooling-configs 0.5.3 so checks orders typecheck before lint ([#856](https://github.com/AntelopeJS/dms/pull/856))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.19.3

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.19.2...v0.19.3)

### 🔥 Performance

- **layout:** Split the Geist fonts so the first paint loads only Latin ([#854](https://github.com/AntelopeJS/dms/pull/854))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.19.2

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.19.1...v0.19.2)

### 🔥 Performance

- **interface-dms:** Skip the watch-action walk when options hold none ([#846](https://github.com/AntelopeJS/dms/pull/846))
- **dms-auth:** Sign and verify tokens with a secret KeyObject ([#847](https://github.com/AntelopeJS/dms/pull/847))
- **auth:** Hash passwords off the event loop with setHashAsync ([#852](https://github.com/AntelopeJS/dms/pull/852))

### 🩹 Fixes

- **dms-ui:** Show the dragged row or card under the pointer in the table view ([#845](https://github.com/AntelopeJS/dms/pull/845))
- **dms:** Retry default-tenant provisioning when a failed run lost its lease ([#849](https://github.com/AntelopeJS/dms/pull/849))

### 📖 Documentation

- **ai:** List the sync search order the code uses ([#850](https://github.com/AntelopeJS/dms/pull/850))
- **readme:** Remove the links that 404 for signed-out visitors ([#853](https://github.com/AntelopeJS/dms/pull/853))

### 📦 Build

- Adopt @antelopejs/tooling-configs 0.5.1 ([#851](https://github.com/AntelopeJS/dms/pull/851))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.13.1 ([91951f70](https://github.com/AntelopeJS/dms/commit/91951f70))
- **release:** @antelopejs/interface-dms v0.13.2 ([843f4f1e](https://github.com/AntelopeJS/dms/commit/843f4f1e))

### ✅ Tests

- **formal:** Model the default tenant's provisioning lease with TLA+ ([#848](https://github.com/AntelopeJS/dms/pull/848))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.19.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.19.0...v0.19.1)

### 🚀 Enhancements

- **dms-ui:** Show a KPI payload's caption as the card's footnote ([#844](https://github.com/AntelopeJS/dms/pull/844))

### 🩹 Fixes

- **docs:** Open the sign-in capture signed out so later scenes keep the session ([#836](https://github.com/AntelopeJS/dms/pull/836))
- **dms-control:** Let read-only commands read a run from another PID namespace ([#843](https://github.com/AntelopeJS/dms/pull/843))
- **agents:** Type-check the probes' JSDoc with checkJs ([#842](https://github.com/AntelopeJS/dms/pull/842))

### 📖 Documentation

- **readme:** Tell the one-run story from the X article ([#841](https://github.com/AntelopeJS/dms/pull/841))

### 📦 Build

- **deps:** Take tooling-configs 0.5.0 ([#840](https://github.com/AntelopeJS/dms/pull/840))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.19.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.18.2...v0.19.0)

### 🚀 Enhancements

- **dms-control:** Serve the dashboard with ajs dms dev under up --dev-frontend ([#829](https://github.com/AntelopeJS/dms/pull/829))
- **table-view:** Add liveHold.whileOnScreen to let a live table follow its feed on screen ([#808](https://github.com/AntelopeJS/dms/pull/808))

### 🩹 Fixes

- **verify-dms:** Expect the assistant ask item in the palette no-match journey ([#799](https://github.com/AntelopeJS/dms/pull/799))
- **notifications:** Undo mark-all-read in one bulk update ([#826](https://github.com/AntelopeJS/dms/pull/826))
- **dms:** Auto-import isReducedMotionActive for frontend modules ([#823](https://github.com/AntelopeJS/dms/pull/823))
- **dms-control:** Resolve moduleRoot to the module above a skill playground ([#827](https://github.com/AntelopeJS/dms/pull/827))
- **preview:** Draw a serialized resource form that reads any path of the site ([#820](https://github.com/AntelopeJS/dms/pull/820))
- **dms-control:** Key a non-literal module specifier by its structure in the emit fingerprint ([#816](https://github.com/AntelopeJS/dms/pull/816))
- **dms:** Keep the newest row read when two table row updates answer out of order ([#812](https://github.com/AntelopeJS/dms/pull/812))
- **dms-ui:** Keep query-only block action links in the browser ([#832](https://github.com/AntelopeJS/dms/pull/832))
- **chart:** Stop a donut redrawing itself through its parent resize observer ([#835](https://github.com/AntelopeJS/dms/pull/835))
- **release:** Decide the interface range check as semver does ([#813](https://github.com/AntelopeJS/dms/pull/813))
- **dms-control:** Let journeys stop and restart the run's mongod ([#831](https://github.com/AntelopeJS/dms/pull/831))
- **dms-control:** Start the base backend when the base ref has no playground ([#818](https://github.com/AntelopeJS/dms/pull/818))
- **dms-control:** Start the run's mongod as a single-node replica set ([#830](https://github.com/AntelopeJS/dms/pull/830))
- **realtime:** Read a page's data again once its subscription is in place ([#810](https://github.com/AntelopeJS/dms/pull/810))
- **dms-control:** Ship playwright-core as an optional dependency of @antelopejs/dms ([#817](https://github.com/AntelopeJS/dms/pull/817))
- **auth:** Show a no-workspace screen when no module serves /auth/no-workspace ([#800](https://github.com/AntelopeJS/dms/pull/800))
- **dms-control:** Fail a formal finding dropped by a check edit instead of counting it fixed ([#821](https://github.com/AntelopeJS/dms/pull/821))
- **playground:** Load an api that reads RouteHandler.controller ([#819](https://github.com/AntelopeJS/dms/pull/819))
- **dms-ui:** Build a module drawer's provides from the raw caller provides ([#809](https://github.com/AntelopeJS/dms/pull/809))
- **dms-control:** Identify each process from the read that finds it, and check it again before each signal ([#801](https://github.com/AntelopeJS/dms/pull/801))
- **interface-dms:** Answer 400 to a guarded confirmation body that is not a JSON object ([#828](https://github.com/AntelopeJS/dms/pull/828))
- **interface-dms:** Accept a model row or a PromiseLike from PageRecordLoader ([#815](https://github.com/AntelopeJS/dms/pull/815))
- **interface-dms:** Refuse upload field options that are not an object ([#825](https://github.com/AntelopeJS/dms/pull/825))
- **oauth:** Create no account before the platform has its owner ([#807](https://github.com/AntelopeJS/dms/pull/807))
- **dms:** Stop without waiting for a default tenant provisioning run in progress ([#804](https://github.com/AntelopeJS/dms/pull/804))
- **tenant-lifecycle:** Name a blocked release and give operators a way to retire it ([#822](https://github.com/AntelopeJS/dms/pull/822))
- **onboarding:** Keep the register as the one writer of has_onboarded ([#806](https://github.com/AntelopeJS/dms/pull/806))

### 💅 Refactors

- **iface:** Drop the shape-name suppressions in block-registry describe ([#803](https://github.com/AntelopeJS/dms/pull/803))

### 📖 Documentation

- Refresh the stale block screenshots ([#802](https://github.com/AntelopeJS/dms/pull/802))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.13.0 ([187e2598](https://github.com/AntelopeJS/dms/commit/187e2598))
- **dms:** Depend on @antelopejs/interface-dms 0.13 ([#839](https://github.com/AntelopeJS/dms/pull/839))

### ✅ Tests

- **frontend:** Import the table row actions subject at file load ([#805](https://github.com/AntelopeJS/dms/pull/805))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.18.2

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.18.1...v0.18.2)

### 💅 Refactors

- **dms-control:** Remove publish, its evidence branch, comment and status ([#838](https://github.com/AntelopeJS/dms/pull/838))

### 📖 Documentation

- **readme:** Lead with the problem and add animated section banners ([#833](https://github.com/AntelopeJS/dms/pull/833))
- **readme:** Open on the Helio tour and explain the Connect flow ([#834](https://github.com/AntelopeJS/dms/pull/834))
- **getting-started:** Title the starter guide "Quickstart" ([#837](https://github.com/AntelopeJS/dms/pull/837))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.18.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.18.0...v0.18.1)

### 🚀 Enhancements

- **verify-dms:** Run every feature when a shared file changes ([#783](https://github.com/AntelopeJS/dms/pull/783))
- **dms-control:** Record per-phase timings of a verify run ([#784](https://github.com/AntelopeJS/dms/pull/784))

### 🔥 Performance

- **dms-control:** Stop the previous journey's backend at once ([#785](https://github.com/AntelopeJS/dms/pull/785))
- **ci:** Scan the playground import fixtures together ([#791](https://github.com/AntelopeJS/dms/pull/791))
- **dms-control:** Start the next journey's backend while the current one runs ([#788](https://github.com/AntelopeJS/dms/pull/788))
- **docs:** Capture the documentation screenshots in parallel ([#792](https://github.com/AntelopeJS/dms/pull/792))
- **dms-control:** Reuse the frontend build of unchanged sources ([#787](https://github.com/AntelopeJS/dms/pull/787))
- **dms-control:** Take screenshots on checks and failures only ([#786](https://github.com/AntelopeJS/dms/pull/786))

### 🩹 Fixes

- **dms-control:** Refuse to signal a pid that is not a whole number above 1 ([#789](https://github.com/AntelopeJS/dms/pull/789))
- **ci:** Check the scanner exit status per diagnostic kind in the import test ([#793](https://github.com/AntelopeJS/dms/pull/793))

### 📖 Documentation

- **dms:** Start the quickstart with the dms-starter template ([#782](https://github.com/AntelopeJS/dms/pull/782))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.18.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.17.0...v0.18.0)

### 🚀 Enhancements

- **dms:** Read the sign-in country without a bundled database ([#776](https://github.com/AntelopeJS/dms/pull/776))

### 🩹 Fixes

- **dms-layout:** Re-export usePageHeaderActions by relative path so unimport scans it ([#777](https://github.com/AntelopeJS/dms/pull/777))

### 📖 Documentation

- **dms:** Explain what the AntelopeJS agent plugin unlocks, External database included ([#773](https://github.com/AntelopeJS/dms/pull/773))
- **dms:** Mark the ResourceForm mode and the source tables in the docs examples ([#780](https://github.com/AntelopeJS/dms/pull/780))

### 📦 Build

- **deps:** Bump @antelopejs packages to the 2026-11-06 releases ([#781](https://github.com/AntelopeJS/dms/pull/781))

### 🏡 Chore

- **dms:** Commit the module locks the test runs record ([#775](https://github.com/AntelopeJS/dms/pull/775))
- **ci:** Remove the weekly mutation caller ([#778](https://github.com/AntelopeJS/dms/pull/778))

### 🤖 CI

- Call ci-node.yml@v1 ([#779](https://github.com/AntelopeJS/dms/pull/779))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.17.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.16.2...v0.17.0)

### 🏡 Chore

- **dms-control:** Remove seeded runs and containment journeys from verification ([#774](https://github.com/AntelopeJS/dms/pull/774))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.16.2

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.16.1...v0.16.2)

### 🚀 Enhancements

- **header:** Let a header action draw a module component as its icon ([#772](https://github.com/AntelopeJS/dms/pull/772))

### 🔥 Performance

- **store:** Let the modules listing read stale registry answers ([#768](https://github.com/AntelopeJS/dms/pull/768))

### 🩹 Fixes

- **layout:** Keep the platform title in the document title after sign-in ([#767](https://github.com/AntelopeJS/dms/pull/767))
- **layout:** Keep a closing toast inside the collapsed stack ([#771](https://github.com/AntelopeJS/dms/pull/771))
- **auth:** List each person once in the account switcher ([#770](https://github.com/AntelopeJS/dms/pull/770))
- **dms-dev:** Run dev servers side by side across worktrees ([#769](https://github.com/AntelopeJS/dms/pull/769))

### 📦 Build

- **deps:** Move to @antelopejs/core 1.20 and drop the interface-core override ([#765](https://github.com/AntelopeJS/dms/pull/765))

### 🏡 Chore

- Remove the .amp directory ([#766](https://github.com/AntelopeJS/dms/pull/766))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.16.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.16.0...v0.16.1)

### 🏡 Chore

- Land the cleanup campaign on main ([#764](https://github.com/AntelopeJS/dms/pull/764))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.16.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.15.1...v0.16.0)

### 📖 Documentation

- **readme:** Start the demos with npx @antelopejs/core ([#753](https://github.com/AntelopeJS/dms/pull/753))
- **readme:** Show the Meet and DMS films, with new GIFs ([1e3f7694](https://github.com/AntelopeJS/dms/commit/1e3f7694))
- **readme:** Link the read-only live demo ([#665](https://github.com/AntelopeJS/dms/pull/665))

### 🏡 Chore

- Land the cleanup campaign on main ([#761](https://github.com/AntelopeJS/dms/pull/761))
- **release:** @antelopejs/interface-dms v0.12.0 ([0e6b850d](https://github.com/AntelopeJS/dms/commit/0e6b850d))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.15.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.15.0...v0.15.1)

### 🔥 Performance

- **page:** Send anonymous visitors only the public pages of the site layout ([#675](https://github.com/AntelopeJS/dms/pull/675))

### 🩹 Fixes

- **auth:** Upgrade an outdated password hash on sign-in ([#691](https://github.com/AntelopeJS/dms/pull/691))
- **dashboard:** Name the brand logo for screen readers ([#652](https://github.com/AntelopeJS/dms/pull/652))
- **onboarding:** Require a setup token to register the first owner ([#654](https://github.com/AntelopeJS/dms/pull/654))
- **tenants:** Elect one replica to provision the default tenant through a renewed lease ([#657](https://github.com/AntelopeJS/dms/pull/657))
- **layout:** Count the sidebar's installed modules like the Modules page ([#666](https://github.com/AntelopeJS/dms/pull/666))

### 📖 Documentation

- **github:** Send questions and ideas to Discord ([#672](https://github.com/AntelopeJS/dms/pull/672))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.10.4 ([3c856c69](https://github.com/AntelopeJS/dms/commit/3c856c69))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.15.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.14.0...v0.15.0)

### 🚀 Enhancements

- **dms-ui:** State the data state of each data block on its root element ([#585](https://github.com/AntelopeJS/dms/pull/585))

### 🩹 Fixes

- **table-view:** Currency on prices, settled counters, no add without a new route ([#611](https://github.com/AntelopeJS/dms/pull/611))
- **interface-dms:** Name a bucketed series' periods for a person, 202608 as Aug 2026 ([#617](https://github.com/AntelopeJS/dms/pull/617))
- **chart:** Thin the category x-axis labels of a long series so they never overlap ([#626](https://github.com/AntelopeJS/dms/pull/626))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.10.3 ([53af1aad](https://github.com/AntelopeJS/dms/commit/53af1aad))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.14.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.13.1...v0.14.0)

### 💅 Refactors

- **frontend:** ⚠️  Remove API error migration helpers ([#638](https://github.com/AntelopeJS/dms/pull/638))

#### ⚠️ Breaking Changes

- **frontend:** ⚠️  Remove API error migration helpers ([#638](https://github.com/AntelopeJS/dms/pull/638))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.13.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.13.0...v0.13.1)

### 🩹 Fixes

- **frontend:** Run the API error CLIs when pnpm links the package ([#634](https://github.com/AntelopeJS/dms/pull/634))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.13.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.12.1...v0.13.0)

### 🩹 Fixes

- **chart:** Draw only the fetched series that carry their points ([#587](https://github.com/AntelopeJS/dms/pull/587))
- **store:** Remove the archived CI/CD module from the catalog ([#609](https://github.com/AntelopeJS/dms/pull/609))
- **tenants:** Resume the default tenant's provisioning after start ([#613](https://github.com/AntelopeJS/dms/pull/613))
- **dms-ui:** Hydrate keyboard hints with the platform the server rendered ([#442](https://github.com/AntelopeJS/dms/pull/442))
- **dms-ui:** Print Nuxt UI key hints for the dashboard's keyboard platform ([#541](https://github.com/AntelopeJS/dms/pull/541))
- **playground:** Declare the playground's frontend, so dev and production include it ([#441](https://github.com/AntelopeJS/dms/pull/441))
- **frontend:** Unify API error presentation ([#614](https://github.com/AntelopeJS/dms/pull/614))

### 📖 Documentation

- **readme:** Restore the realtime updates line and the live preview wording ([#589](https://github.com/AntelopeJS/dms/pull/589))
- **readme:** Remove the How AntelopeJS makes money section ([#592](https://github.com/AntelopeJS/dms/pull/592))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.10.2 ([7b173edb](https://github.com/AntelopeJS/dms/commit/7b173edb))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))
- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.12.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.12.0...v0.12.1)

### 🚀 Enhancements

- **dms-layout:** Restore a static GitHub star link in the footer ([#546](https://github.com/AntelopeJS/dms/pull/546))
- **dms:** Support a read-only public demo ([#581](https://github.com/AntelopeJS/dms/pull/581))

### 🩹 Fixes

- **store:** Reuse the runtime id of an uninstalled module on reinstall ([#547](https://github.com/AntelopeJS/dms/pull/547))
- **chart:** Draw the one point per group a series data source answers ([#586](https://github.com/AntelopeJS/dms/pull/586))

### 💅 Refactors

- **frontend:** Remove type assertions in tests ([#525](https://github.com/AntelopeJS/dms/pull/525))
- **frontend:** Remove type assertions in core, auth and layout ([#526](https://github.com/AntelopeJS/dms/pull/526))
- **frontend:** Remove type assertions in ui components and composables ([#527](https://github.com/AntelopeJS/dms/pull/527))
- **frontend:** Remove type assertions in ui data types ([#528](https://github.com/AntelopeJS/dms/pull/528))
- **backend:** Remove SAFETY assertions in test fixtures ([#542](https://github.com/AntelopeJS/dms/pull/542))
- **backend:** Remove SAFETY assertions in serialized-option and fixture tests ([#543](https://github.com/AntelopeJS/dms/pull/543))
- **agents:** Fix the lint findings in dms's own agent files ([#548](https://github.com/AntelopeJS/dms/pull/548))

### 📖 Documentation

- **readme:** Rewrite the README as a landing page ([#554](https://github.com/AntelopeJS/dms/pull/554))

### 🏡 Chore

- **package:** Update the npm description and keywords ([#580](https://github.com/AntelopeJS/dms/pull/580))
- **package:** Restore realtime in the npm description ([#588](https://github.com/AntelopeJS/dms/pull/588))
- **release:** @antelopejs/interface-dms v0.10.1 ([6fd39d98](https://github.com/AntelopeJS/dms/commit/6fd39d98))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.12.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.11.1...v0.12.0)

### 🚀 Enhancements

- **interface-dms:** Expose stable default data type subpaths ([#475](https://github.com/AntelopeJS/dms/pull/475))
- **frontend:** Enforce the backend boundary in production builds ([#501](https://github.com/AntelopeJS/dms/pull/501))
- **skills:** Add the verify-dms verification skill, dms-control and formal checks ([#529](https://github.com/AntelopeJS/dms/pull/529))
- **iface:** Layer interface-dms folders into one acyclic stack ([#539](https://github.com/AntelopeJS/dms/pull/539))

### 🩹 Fixes

- **relation:** Build cyclic relations and label rows without a label ([#471](https://github.com/AntelopeJS/dms/pull/471))
- **iface:** Use the fallback when an error message is not a string ([#502](https://github.com/AntelopeJS/dms/pull/502))
- **iface:** Pass consistent Date bounds from IsBetween ([#503](https://github.com/AntelopeJS/dms/pull/503))
- **iface:** Normalize Action permissions when registering categories ([#504](https://github.com/AntelopeJS/dms/pull/504))
- **iface:** Keep the original invite validation failure when the thrown value is null ([#505](https://github.com/AntelopeJS/dms/pull/505))
- **frontend:** Propagate fetched ChartCard series during fresh SSR ([#506](https://github.com/AntelopeJS/dms/pull/506))
- **iface:** Release a replaced page's component permission identities ([#507](https://github.com/AntelopeJS/dms/pull/507))
- **dms:** Encode preview cache keys unambiguously ([#508](https://github.com/AntelopeJS/dms/pull/508))
- **iface:** Keep a page's default permission when its Action is unbound ([#509](https://github.com/AntelopeJS/dms/pull/509))
- **dms:** Skip persisted presence entries that miss required fields ([#510](https://github.com/AntelopeJS/dms/pull/510))
- **iface:** Reject malformed footer summary rule operands ([#511](https://github.com/AntelopeJS/dms/pull/511))
- **iface:** Refuse to build a notification without its required fields ([#512](https://github.com/AntelopeJS/dms/pull/512))
- **frontend:** Add missing English member-status and form labels ([#513](https://github.com/AntelopeJS/dms/pull/513))
- **frontend:** Attach native and create to $authFetch ([#514](https://github.com/AntelopeJS/dms/pull/514))
- **iface:** Describe non-string Zod literals accurately ([#515](https://github.com/AntelopeJS/dms/pull/515))
- **iface:** Narrow isPrimitive to primitive values ([#516](https://github.com/AntelopeJS/dms/pull/516))
- **iface:** Reject symbol property keys in Searchable ([#517](https://github.com/AntelopeJS/dms/pull/517))
- **dms:** Fail verify on recorded formal findings only when covered behaviour changes ([#540](https://github.com/AntelopeJS/dms/pull/540))

### 💅 Refactors

- **backend:** Remove ordinary comments ([#457](https://github.com/AntelopeJS/dms/pull/457))
- **backend:** Derive types from their owners ([#458](https://github.com/AntelopeJS/dms/pull/458))
- **backend:** Route dependencies through module entries ([#459](https://github.com/AntelopeJS/dms/pull/459))
- **backend:** Split page implementation and oversize suites ([#460](https://github.com/AntelopeJS/dms/pull/460))
- **frontend:** Remove implementation commentary ([#462](https://github.com/AntelopeJS/dms/pull/462))
- **frontend:** Tighten types and lint ([#463](https://github.com/AntelopeJS/dms/pull/463))
- **frontend:** Move shared services behind layer entries ([#469](https://github.com/AntelopeJS/dms/pull/469))
- **frontend:** Split setup responsibilities and remove structural debt ([#470](https://github.com/AntelopeJS/dms/pull/470))
- **playground:** Remove narrative comments ([#464](https://github.com/AntelopeJS/dms/pull/464))
- **playground:** Derive types from demo contracts ([#465](https://github.com/AntelopeJS/dms/pull/465))
- **playground:** Split feature catalogs and fixture literals ([#467](https://github.com/AntelopeJS/dms/pull/467))
- **iface:** Remove comment debt without changing emit ([#453](https://github.com/AntelopeJS/dms/pull/453))
- **iface:** Reduce type and lint debt ([#472](https://github.com/AntelopeJS/dms/pull/472))
- **iface:** Extract private implementation bodies ([#473](https://github.com/AntelopeJS/dms/pull/473))
- **iface:** Split table-view option type owners ([#474](https://github.com/AntelopeJS/dms/pull/474))
- **iface:** Keep native async metadata orchestration ([#476](https://github.com/AntelopeJS/dms/pull/476))
- Finish the dms cleanup and delete the ratchet ([#478](https://github.com/AntelopeJS/dms/pull/478))
- **backend:** Remove type assertions in routes and pages ([#522](https://github.com/AntelopeJS/dms/pull/522))
- **backend:** Remove type assertions in auth and table-view implementations ([#523](https://github.com/AntelopeJS/dms/pull/523))
- **backend:** Remove type assertions in hooks, attachments, automation and fixtures ([#524](https://github.com/AntelopeJS/dms/pull/524))
- **iface:** Remove type assertions in interface-dms ([#530](https://github.com/AntelopeJS/dms/pull/530))

### 📦 Build

- **playground:** Mark the playground package private ([#468](https://github.com/AntelopeJS/dms/pull/468))
- Upgrade the guardrail pack to 0.2.6 for the cleanup stacks ([#452](https://github.com/AntelopeJS/dms/pull/452))
- **playground:** Enforce source import boundaries ([#466](https://github.com/AntelopeJS/dms/pull/466))
- Adopt the suppression budget from tooling-configs 0.2.7 ([#500](https://github.com/AntelopeJS/dms/pull/500))
- **deps:** Adopt @antelopejs/interface-data-api 0.5.0 ([#521](https://github.com/AntelopeJS/dms/pull/521))

### 🏡 Chore

- **release:** @antelopejs/interface-dms v0.10.0 ([404c8fb2](https://github.com/AntelopeJS/dms/commit/404c8fb2))

### ✅ Tests

- **backend:** Replace test debt with behavioral checks ([#456](https://github.com/AntelopeJS/dms/pull/456))
- **frontend:** Replace source-text assertions and module mocks ([#461](https://github.com/AntelopeJS/dms/pull/461))
- **skills:** Add eval cases for the dms skills ([#499](https://github.com/AntelopeJS/dms/pull/499))
- **frontend:** Hold the identity refresh until the OAuth page remounts ([#518](https://github.com/AntelopeJS/dms/pull/518))
- **frontend:** Import the URL preview and password panel subjects at file load ([#519](https://github.com/AntelopeJS/dms/pull/519))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))
- Thomas ([@Thomasims](http://github.com/Thomasims))

## v0.11.1

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.11.0...v0.11.1)

### 🚀 Enhancements

- **menu:** Support nested dynamic menu entries ([#446](https://github.com/AntelopeJS/dms/pull/446))

### 🩹 Fixes

- **release:** Build the interface before the release lint ([#454](https://github.com/AntelopeJS/dms/pull/454))

### 📖 Documentation

- **changelog:** Upgrade notes of dms 0.11.0 ([#440](https://github.com/AntelopeJS/dms/pull/440))

### 📦 Build

- Adopt the AntelopeJS guardrail pack ([#444](https://github.com/AntelopeJS/dms/pull/444))

### 🏡 Chore

- Configure Renovate with the shared preset ([#445](https://github.com/AntelopeJS/dms/pull/445))
- **release:** @antelopejs/interface-dms v0.9.1 ([d94a1de7](https://github.com/AntelopeJS/dms/commit/d94a1de7))

### 🤖 CI

- Run docs-playground on main pushes only ([#443](https://github.com/AntelopeJS/dms/pull/443))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.11.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.10.0...v0.11.0)

### Upgrade notes

- Implements `@antelopejs/interface-dms` `>=0.9.0 <0.10.0` (see its 0.9.0 notes: `DefaultLayoutOptions.record` as a loader, tenant provisioning through `TENANT_BEING_PROVISIONED`).
- **Breaking:** changing modules from the store is reserved to development ([#418](https://github.com/AntelopeJS/dms/pull/418)). A configuration that sets `store.enabled: true` in production no longer opens the store.
- **Breaking:** the GitHub star button is removed from the footer ([#428](https://github.com/AntelopeJS/dms/pull/428)). `branding.footer.githubStar` no longer exists: a layer that sets it gets a TypeScript error on `DmsFooterConfig` and should delete the line.
- **Breaking (layer API):** `isHydratingComponent` is removed, without an alias ([#424](https://github.com/AntelopeJS/dms/pull/424)). Use `isDmsHydrating()` from `@antelopejs/dms-frontend` ≥ 0.9: `ref(!import.meta.env.SSR && !isHydratingComponent())` becomes `ref(!import.meta.env.SSR && !isDmsHydrating())`.
- **Behavior change:** forms read the data API's structured field errors, `400 { code, fields }` from `@antelopejs/interface-data-api` 0.4, and name each refused field by its column label ([#433](https://github.com/AntelopeJS/dms/pull/433)). Requires interface-data-api `>=0.4.0`.
- **Behavior change:** the fallback language of a `@Localized` field is required in generated forms, client and server ([#427](https://github.com/AntelopeJS/dms/pull/427)).
- Table view columns support `visibleWhen` and `disabledWhen`; the write routes ignore hidden or locked values, and an edit that hides a `visibleWhen` field clears it ([#431](https://github.com/AntelopeJS/dms/pull/431)).
- Requires `@antelopejs/dms-frontend` `>=0.9.0 <0.10.0` (with `@antelopejs/api` ≥ 1.5.0), `@antelopejs/interface-database-decorators` `>=0.1.10` and `@antelopejs/interface-database` `>=0.1.11`. Modules move to `@antelopejs/dms` 0.11 and `@antelopejs/interface-dms` `>=0.9.0`.

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

- **release:** @antelopejs/interface-dms v0.9.0 ([555267de](https://github.com/AntelopeJS/dms/commit/555267de))

### ✅ Tests

- Run the backend tests without Ethereal ([#435](https://github.com/AntelopeJS/dms/pull/435))
- **hydration:** Give the live tests isDmsHydrating ([#438](https://github.com/AntelopeJS/dms/pull/438))

#### ⚠️ Breaking Changes

- **store:** ⚠️  Changing modules from the store is reserved to development ([#418](https://github.com/AntelopeJS/dms/pull/418))
- **dms-layout:** ⚠️  Remove the GitHub star button from the footer ([#428](https://github.com/AntelopeJS/dms/pull/428))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Glastis ([@Glastis](http://github.com/Glastis))
- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.10.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.9.8...v0.10.0)

### Upgrade notes

- Implements `@antelopejs/interface-dms` 0.8 (`>=0.8.0 <0.9.0`); modules raise their floor to `@antelopejs/interface-dms >=0.8.0` and `@antelopejs/dms >=0.10.0`.
- `KpiCard`: `showPreviousValue` defaults to `true`, so a card whose data carries `previousValue` prints it beside the change; set `false` to keep a card compact ([#352](https://github.com/AntelopeJS/dms/pull/352)).
- A `RelationType` / `CascaderRelationType` with `multiple: true` filters with `include` / `exclude` instead of `is` / `is_not`: a saved view or a link filtering it with `is:` lists nothing until saved again or rewritten as `include:` ([#363](https://github.com/AntelopeJS/dms/pull/363)).

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

- **release:** @antelopejs/interface-dms v0.8.0 ([43489c4e](https://github.com/AntelopeJS/dms/commit/43489c4e))

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
- Maxime Westhoven <maxime@altab.be>

## v0.9.8

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.9.7...v0.9.8)

### 🩹 Fixes

- **startup:** Answer 503 with Retry-After until the DMS schemas are bound ([#369](https://github.com/AntelopeJS/dms/pull/369))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

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

