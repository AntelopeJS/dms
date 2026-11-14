# Changelog

## v0.5.0

[compare changes](https://github.com/AntelopeJS/dms/compare/v0.19.6...v0.5.0)

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

### 📦 Build

- **frontend-vue:** Turn no-undef back on with the dms and renderer globals ([#899](https://github.com/AntelopeJS/dms/pull/899))
- **dms:** Type-check the frontend-vue tests in pnpm run checks ([#992](https://github.com/AntelopeJS/dms/pull/992))

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

- **interface-dms:** ⚠️  Type the published contracts as the runtime implements them and break the table-view/data-types cycle ([#904](https://github.com/AntelopeJS/dms/pull/904))
- **dms:** ⚠️  Grant only held permissions in the roles API and read platform ownership from user.owner ([#913](https://github.com/AntelopeJS/dms/pull/913))
- ⚠️  Grant * only to the platform owner, never through a stored role ([#949](https://github.com/AntelopeJS/dms/pull/949))
- **interface-dms:** ⚠️  Close the dms#904 contract leftovers (RelationType fallback, field props, export SAFETY) ([#921](https://github.com/AntelopeJS/dms/pull/921), [#904](https://github.com/AntelopeJS/dms/issues/904))
- **dms:** ⚠️  Hold built page paths and live routes to one route pattern ([#950](https://github.com/AntelopeJS/dms/pull/950))
- **interface-dms:** ⚠️  Send the archive filter as text and type an empty select's validation honestly ([#947](https://github.com/AntelopeJS/dms/pull/947))
- **interface-dms:** ⚠️  Move to interface-data-api 0.7's StoredRow ([#888](https://github.com/AntelopeJS/dms/pull/888))
- **frontend-vue:** ⚠️  Give every Vue component a multi-word name ([#910](https://github.com/AntelopeJS/dms/pull/910))
- ⚠️  Call keyed notification sends and store declarations without capability guards ([#937](https://github.com/AntelopeJS/dms/pull/937))
- ⚠️  Remove the migration guides and the compatibility code before 0.20.0 ([#915](https://github.com/AntelopeJS/dms/pull/915))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))
- Dada-sudo <damir@altab.be>

## v0.4.1

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.4.0...v0.4.1)

### 🚀 Enhancements

- **skills:** Add the verify-dms-builder verification skill ([#147](https://github.com/AntelopeJS/dms-builder/pull/147))

### 🔥 Performance

- **ci:** Run the engine specs in parallel across 4 balanced shards ([#165](https://github.com/AntelopeJS/dms-builder/pull/165))
- **test:** Map the shop once per spec file and restore it for each test ([#170](https://github.com/AntelopeJS/dms-builder/pull/170))
- **verify:** Plan against origin/main, and run every feature on a shared-file diff ([#171](https://github.com/AntelopeJS/dms-builder/pull/171))
- **test:** Split the three longest engine specs and regroup the shards by measured duration ([#172](https://github.com/AntelopeJS/dms-builder/pull/172))

### 🩹 Fixes

- **verify:** Sync the playground lockfile with @antelopejs/core ^1.21.0 ([#169](https://github.com/AntelopeJS/dms-builder/pull/169))
- **query-preview:** Read a GET parameter named __proto__ as an argument ([#174](https://github.com/AntelopeJS/dms-builder/pull/174))
- **engine:** Keep a query's arrangement and comparison in ConfigureQuery ([#176](https://github.com/AntelopeJS/dms-builder/pull/176))
- **frontend:** Label the change list's revert control Revert: <edit> on hover too ([#183](https://github.com/AntelopeJS/dms-builder/pull/183))
- **frontend:** Show one preview row per group for a source arranged as a chart card ([#184](https://github.com/AntelopeJS/dms-builder/pull/184))
- **engine:** Find a resource by the name it was created with as well as its ref ([#175](https://github.com/AntelopeJS/dms-builder/pull/175))
- **editor:** Act on the selected block from a focused Layers row ([#178](https://github.com/AntelopeJS/dms-builder/pull/178))
- **engine:** Refuse a nested block of unknown type as invalid_config ([#177](https://github.com/AntelopeJS/dms-builder/pull/177))
- **frontend:** Move a category in the menu at once and write only the places that change ([#173](https://github.com/AntelopeJS/dms-builder/pull/173))
- **routes:** Serve DELETE /api/builder/resource so the builder can delete a table ([#179](https://github.com/AntelopeJS/dms-builder/pull/179))
- **engine:** Import every decorator a generated resource file names ([#182](https://github.com/AntelopeJS/dms-builder/pull/182))
- **engine:** Refuse a write as stale when the file changed on disk ([#185](https://github.com/AntelopeJS/dms-builder/pull/185))
- **queries:** Refuse undeclared template parameters in PreviewQuery as AddQuery does ([#181](https://github.com/AntelopeJS/dms-builder/pull/181))
- **builder:** Keep the stale check across a page move with an unsaved draft ([#186](https://github.com/AntelopeJS/dms-builder/pull/186))

### 📖 Documentation

- **readme:** Link back to AntelopeJS DMS ([#187](https://github.com/AntelopeJS/dms-builder/pull/187))
- **readme:** Open with the AntelopeJS DMS module kit ([#189](https://github.com/AntelopeJS/dms-builder/pull/189))

### 📦 Build

- **deps:** Bump @antelopejs packages to the 2026-11-06 releases ([#168](https://github.com/AntelopeJS/dms-builder/pull/168))
- **deps:** Bump @antelopejs/dms to 0.18.2 and drop verify publish ([#188](https://github.com/AntelopeJS/dms-builder/pull/188))

### 🏡 Chore

- Land the cleanup campaign on main ([#161](https://github.com/AntelopeJS/dms-builder/pull/161))
- **release:** @antelopejs/dms-builder v0.10.0 ([f70acc2](https://github.com/AntelopeJS/dms-builder/commit/f70acc2))
- **verify:** Remove seeded runs from the verification skill ([#164](https://github.com/AntelopeJS/dms-builder/pull/164))
- **ci:** Remove the weekly mutation caller ([#166](https://github.com/AntelopeJS/dms-builder/pull/166))

### 🤖 CI

- Call ci-node.yml@v1 ([#167](https://github.com/AntelopeJS/dms-builder/pull/167))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.4.0

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.3.1...v0.4.0)

### 🩹 Fixes

- **deps:** Require the builder interface that previews page removals ([#145](https://github.com/AntelopeJS/dms-builder/pull/145))

### 📖 Documentation

- **readme:** Show the Builder at work in a GIF ([0e7bb2e](https://github.com/AntelopeJS/dms-builder/commit/0e7bb2e))

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.9.1 ([8b67bc2](https://github.com/AntelopeJS/dms-builder/commit/8b67bc2))
- Land the cleanup campaign on main ([#159](https://github.com/AntelopeJS/dms-builder/pull/159))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.3.1

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.3.0...v0.3.1)

### 🚀 Enhancements

- **frontend-vue:** Send the assistant handoff and add a Copy prompt button ([#133](https://github.com/AntelopeJS/dms-builder/pull/133))
- **frontend-vue:** Translate the Database workspace to fr-FR ([#137](https://github.com/AntelopeJS/dms-builder/pull/137))
- **dms-builder:** Ask a developer to connect a database on the first dashboard page ([#134](https://github.com/AntelopeJS/dms-builder/pull/134))
- **interface:** Answer which pages a mapping would remove before it writes ([#136](https://github.com/AntelopeJS/dms-builder/pull/136))

### 🩹 Fixes

- **deps:** Require the builder interface that carries compose-page ([#129](https://github.com/AntelopeJS/dms-builder/pull/129))

### 📖 Documentation

- **github:** Send questions and ideas to Discord ([#135](https://github.com/AntelopeJS/dms-builder/pull/135))

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.9.0 ([8f70df3](https://github.com/AntelopeJS/dms-builder/commit/8f70df3))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.3.0

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.2.5...v0.3.0)

### 🚀 Enhancements

- **dms-builder:** Set displays, views and footer figures on table pages, and hand a reviewed mapping to the assistant ([#118](https://github.com/AntelopeJS/dms-builder/pull/118))
- **dms-builder:** Compose a whole page, queries and blocks, in one call ([#122](https://github.com/AntelopeJS/dms-builder/pull/122))

### 🩹 Fixes

- **scaffold:** Keep a scaffolded module's build info in dist ([#110](https://github.com/AntelopeJS/dms-builder/pull/110))
- **playground:** Depend on @antelopejs/dms so dev and build resolve a matching renderer ([#126](https://github.com/AntelopeJS/dms-builder/pull/126))
- **frontend:** Use DMS core API error presenter ([#127](https://github.com/AntelopeJS/dms-builder/pull/127))

### 📖 Documentation

- **readme:** Link the DMS and fix the interface-dms range ([#116](https://github.com/AntelopeJS/dms-builder/pull/116))
- **readme:** Use one Discord invite ([#111](https://github.com/AntelopeJS/dms-builder/pull/111))

### 📦 Build

- **deps:** Bump @antelopejs/tooling-configs to 0.2.17 ([#79](https://github.com/AntelopeJS/dms-builder/pull/79))

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.7.0 ([0a1c88c](https://github.com/AntelopeJS/dms-builder/commit/0a1c88c))
- **release:** @antelopejs/dms-builder v0.7.1 ([801521d](https://github.com/AntelopeJS/dms-builder/commit/801521d))
- Git-ignore the production frontend workspace ([#62](https://github.com/AntelopeJS/dms-builder/pull/62))
- **release:** @antelopejs/dms-builder v0.8.0 ([c0ca9b4](https://github.com/AntelopeJS/dms-builder/commit/c0ca9b4))

### ❤️ Contributors

- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))
- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.2.5

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.2.4...v0.2.5)

### 🚀 Enhancements

- **database:** Connect, edit and remove external databases end to end ([#65](https://github.com/AntelopeJS/dms-builder/pull/65))
- Map MongoDB and RethinkDB databases ([#66](https://github.com/AntelopeJS/dms-builder/pull/66))
- **frontend:** Enforce the backend boundary in production builds ([#74](https://github.com/AntelopeJS/dms-builder/pull/74))
- The guided connection flow, from Connect to the fork ([#78](https://github.com/AntelopeJS/dms-builder/pull/78))

### 💅 Refactors

- Replace comments with TSDoc or remove them ([#70](https://github.com/AntelopeJS/dms-builder/pull/70))
- Tighten engine and spec types, remove avoidable assertions ([#76](https://github.com/AntelopeJS/dms-builder/pull/76))
- Split the oversize frontend files ([#77](https://github.com/AntelopeJS/dms-builder/pull/77))

### 📖 Documentation

- **changelog:** Upgrade notes of dms-builder 0.6.1 ([#61](https://github.com/AntelopeJS/dms-builder/pull/61))

### 📦 Build

- Run on @antelopejs/dms 0.11 and @antelopejs/dms-frontend 0.9 ([#60](https://github.com/AntelopeJS/dms-builder/pull/60))
- Upgrade the guardrail pack to 0.2.11 ([#68](https://github.com/AntelopeJS/dms-builder/pull/68))

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.6.1 ([1372e17](https://github.com/AntelopeJS/dms-builder/commit/1372e17))
- Adopt the guardrail pack from tooling-configs 0.2.0 ([#63](https://github.com/AntelopeJS/dms-builder/pull/63))
- Configure Renovate with the shared preset ([#64](https://github.com/AntelopeJS/dms-builder/pull/64))

### ✅ Tests

- **skills:** Add eval cases for dms-builder ([#67](https://github.com/AntelopeJS/dms-builder/pull/67))
- Move file reads and manifest invariants out of the test suites ([#69](https://github.com/AntelopeJS/dms-builder/pull/69))

### ❤️ Contributors

- Thomas ([@Thomasims](http://github.com/Thomasims))
- Antony Rizzitelli ([@Upd4ting](http://github.com/Upd4ting))

## v0.2.4

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.2.3...v0.2.4)

### 🚀 Enhancements

- **frontend:** The frontend registration as a pure function, declared as dmsFrontend ([#58](https://github.com/AntelopeJS/dms-builder/pull/58))
- **builder:** Translate the entry point and editor chrome (en, fr) ([#53](https://github.com/AntelopeJS/dms-builder/pull/53))
- **builder:** Place page controls in the DMS page toolbar ([#54](https://github.com/AntelopeJS/dms-builder/pull/54))

### 🩹 Fixes

- **builder:** Read blocks imported from base subpaths and keep unknown ones ([#55](https://github.com/AntelopeJS/dms-builder/pull/55))
- **playground:** Declare the board's test form a create ([#57](https://github.com/AntelopeJS/dms-builder/pull/57))

### 📦 Build

- Run on @antelopejs/dms 0.10 and @antelopejs/dms-frontend 0.8 ([#59](https://github.com/AntelopeJS/dms-builder/pull/59))

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.5.3 ([072feda](https://github.com/AntelopeJS/dms-builder/commit/072feda))
- **release:** @antelopejs/dms-builder v0.6.0 ([9ac5123](https://github.com/AntelopeJS/dms-builder/commit/9ac5123))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Maxime Westhoven <maxime@altab.be>

## v0.2.3

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.2.2...v0.2.3)

### 🚀 Enhancements

- **builder:** Share simple options with fixed-data documentation previews ([#52](https://github.com/AntelopeJS/dms-builder/pull/52))
- Analyse and map an external database into a module bound to it ([#43](https://github.com/AntelopeJS/dms-builder/pull/43))

### 🩹 Fixes

- **deps:** Require builder interface with option locks ([8c91fa4](https://github.com/AntelopeJS/dms-builder/commit/8c91fa4))
- **frontend:** Run on @antelopejs/dms-frontend 0.7 ([#56](https://github.com/AntelopeJS/dms-builder/pull/56))

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.5.0 ([d0fb198](https://github.com/AntelopeJS/dms-builder/commit/d0fb198))
- **release:** @antelopejs/dms-builder v0.5.1 ([103920e](https://github.com/AntelopeJS/dms-builder/commit/103920e))
- **release:** @antelopejs/dms-builder v0.5.2 ([6a5a034](https://github.com/AntelopeJS/dms-builder/commit/6a5a034))

### ❤️ Contributors

- Thomas ([@Thomasims](http://github.com/Thomasims))
- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.2

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.2.1...v0.2.2)

### 🚀 Enhancements

- **builder:** Safely edit source-backed DMS options ([#51](https://github.com/AntelopeJS/dms-builder/pull/51))

### 🩹 Fixes

- Install builder frontend with the root workspace ([#48](https://github.com/AntelopeJS/dms-builder/pull/48))

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.4.1 ([10040d9](https://github.com/AntelopeJS/dms-builder/commit/10040d9))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.1

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.2.0...v0.2.1)

### 🚀 Enhancements

- ⚠️  Migrate to DMS 0.9 and renderer 0.6 ([#45](https://github.com/AntelopeJS/dms-builder/pull/45))

### 📖 Documentation

- Add user guide and module skill ([#39](https://github.com/AntelopeJS/dms-builder/pull/39))
- Complete Builder options and align interface compatibility ([#46](https://github.com/AntelopeJS/dms-builder/pull/46))
- Make dense guide sections easier to scan ([#47](https://github.com/AntelopeJS/dms-builder/pull/47))

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.3.0 ([b78f660](https://github.com/AntelopeJS/dms-builder/commit/b78f660))
- **release:** @antelopejs/dms-builder v0.4.0 ([c7a6beb](https://github.com/AntelopeJS/dms-builder/commit/c7a6beb))
- **interface:** Raise verified foundation dependency floors ([#49](https://github.com/AntelopeJS/dms-builder/pull/49))

#### ⚠️ Breaking Changes

- ⚠️  Migrate to DMS 0.9 and renderer 0.6 ([#45](https://github.com/AntelopeJS/dms-builder/pull/45))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.2.0

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.1.4...v0.2.0)

### 💅 Refactors

- ⚠️  Remove pre-DMS-0.8 compatibility, dead code and duplicated helpers ([#41](https://github.com/AntelopeJS/dms-builder/pull/41))

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.2.7 ([5942f48](https://github.com/AntelopeJS/dms-builder/commit/5942f48))

#### ⚠️ Breaking Changes

- ⚠️  Remove pre-DMS-0.8 compatibility, dead code and duplicated helpers ([#41](https://github.com/AntelopeJS/dms-builder/pull/41))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.1.4

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.1.3...v0.1.4)

### 🚀 Enhancements

- **panels:** Lay out simple-mode block panels as cards ([8f798b5](https://github.com/AntelopeJS/dms-builder/commit/8f798b5))
- **palette:** Leave the charts a chart card draws with to the card ([b33f90c](https://github.com/AntelopeJS/dms-builder/commit/b33f90c))
- **frontend-vue:** Declare the @antelopejs/dms-frontend releases the layer supports ([#30](https://github.com/AntelopeJS/dms-builder/pull/30))
- **palette:** Leave the types the DMS never declared to the advanced view ([ee357f7](https://github.com/AntelopeJS/dms-builder/commit/ee357f7))
- **catalog:** Keep a placeholder's size to the advanced view ([11dbe53](https://github.com/AntelopeJS/dms-builder/commit/11dbe53))
- **palette:** Lay out the components as icon tiles ([a5ba986](https://github.com/AntelopeJS/dms-builder/commit/a5ba986))
- **panels:** Set a spacer up by the room it takes ([baf2a70](https://github.com/AntelopeJS/dms-builder/commit/baf2a70))
- **panels:** Pick and reach a block's table the same way in every panel ([4de4277](https://github.com/AntelopeJS/dms-builder/commit/4de4277))
- **panels:** Leave a form's fields to its table ([b4a0b84](https://github.com/AntelopeJS/dms-builder/commit/b4a0b84))
- **panels:** Pick an icon option by sight, as a page's icon is picked ([40570e4](https://github.com/AntelopeJS/dms-builder/commit/40570e4))
- **panels:** Set a tree up without JSON or methods ([941263d](https://github.com/AntelopeJS/dms-builder/commit/941263d))
- **trees:** Build a tree from the page's tables ([49a0785](https://github.com/AntelopeJS/dms-builder/commit/49a0785))
- **canvas:** Place a tab set with a first tab already in it ([7015301](https://github.com/AntelopeJS/dms-builder/commit/7015301))
- **panels:** Set a tab set up one line per tab ([a07ca90](https://github.com/AntelopeJS/dms-builder/commit/a07ca90))
- **panels:** Offer two rows of icons before anything is searched ([2fde83b](https://github.com/AntelopeJS/dms-builder/commit/2fde83b))
- **panels:** Fold a KPI card's and a top list's settings behind a line each ([08b856f](https://github.com/AntelopeJS/dms-builder/commit/08b856f))
- **editor:** Rebuild the frame: side rail, inspector and workspaces ([500b6b2](https://github.com/AntelopeJS/dms-builder/commit/500b6b2))
- **editor:** Restyle the palette, pages and block menu to the v2 design ([5e90bf8](https://github.com/AntelopeJS/dms-builder/commit/5e90bf8))
- **inspector:** Tab block settings, stage page settings in the draft ([71ee252](https://github.com/AntelopeJS/dms-builder/commit/71ee252))
- **workspaces:** Lay tables and data sources out as list and detail ([bbc9c13](https://github.com/AntelopeJS/dms-builder/commit/bbc9c13))
- **editor:** Keep the draft on this device, and ask before leaving ([b3a8325](https://github.com/AntelopeJS/dms-builder/commit/b3a8325))
- **api:** Table usage, page deletion impact and the permission list ([91e9f55](https://github.com/AntelopeJS/dms-builder/commit/91e9f55))
- **api:** Read who reaches a page and each of its blocks ([2194142](https://github.com/AntelopeJS/dms-builder/commit/2194142))
- **editor:** Say which roles a block reaches, and what a save takes ([a9688d4](https://github.com/AntelopeJS/dms-builder/commit/a9688d4))
- **editor:** View the draft as a role sees it ([514d84d](https://github.com/AntelopeJS/dms-builder/commit/514d84d))
- **palette:** Lay the blocks out as tiles again, the list on request ([e395d6c](https://github.com/AntelopeJS/dms-builder/commit/e395d6c))
- **editor:** Write section rows and content guards for the author ([9177371](https://github.com/AntelopeJS/dms-builder/commit/9177371))
- **editor:** Place the period selector and the live switch for the page ([600a5d3](https://github.com/AntelopeJS/dms-builder/commit/600a5d3))
- **tables:** Give a table its icon from the builder, through @TableIcon ([ae61f46](https://github.com/AntelopeJS/dms-builder/commit/ae61f46))
- **editor:** Make the blocks readable to someone who does not code ([9cb3215](https://github.com/AntelopeJS/dms-builder/commit/9cb3215))

### 🩹 Fixes

- **deps:** Relax @antelopejs/interface-database to >=0.1.7 <1.0.0 ([#28](https://github.com/AntelopeJS/dms-builder/pull/28))
- **deps:** Cap @antelopejs/interface-dms-builder below the next minor and check interface ranges ([#32](https://github.com/AntelopeJS/dms-builder/pull/32))
- **canvas:** Draw a chart card's chart on the page being built ([5b51ffe](https://github.com/AntelopeJS/dms-builder/commit/5b51ffe))
- **pages:** Wait for a page's route before opening it from the tree ([05021f5](https://github.com/AntelopeJS/dms-builder/commit/05021f5))
- **canvas:** Draw the selection frame inside the block ([00cd982](https://github.com/AntelopeJS/dms-builder/commit/00cd982))
- **catalog:** Offer no factory the builder could not write a call to ([3904de1](https://github.com/AntelopeJS/dms-builder/commit/3904de1))
- **canvas:** Follow the draft where the canvas drew the saved page ([81b001d](https://github.com/AntelopeJS/dms-builder/commit/81b001d))
- **canvas:** Follow a spacer's size and a table's row actions as edited ([51fea3e](https://github.com/AntelopeJS/dms-builder/commit/51fea3e))
- **spacer:** Make "all the free room" take columns or lines ([b8e6c11](https://github.com/AntelopeJS/dms-builder/commit/b8e6c11))
- **editor:** Keep drafts through direct writes, report failed requests ([5500e5d](https://github.com/AntelopeJS/dms-builder/commit/5500e5d))

### 💅 Refactors

- **chart-card:** Drop the data preview from the panel ([d8021e2](https://github.com/AntelopeJS/dms-builder/commit/d8021e2))
- **trees:** Remove the tree builder, gone from the DMS ([bd779a1](https://github.com/AntelopeJS/dms-builder/commit/bd779a1))

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.2.3 ([22968b6](https://github.com/AntelopeJS/dms-builder/commit/22968b6))
- **release:** @antelopejs/dms-builder v0.2.4 ([4899251](https://github.com/AntelopeJS/dms-builder/commit/4899251))
- **release:** @antelopejs/dms-builder v0.2.5 ([38d06d6](https://github.com/AntelopeJS/dms-builder/commit/38d06d6))
- **release:** @antelopejs/dms-builder v0.2.6 ([69b0cc2](https://github.com/AntelopeJS/dms-builder/commit/69b0cc2))
- **playground:** Open module source ranges ([#33](https://github.com/AntelopeJS/dms-builder/pull/33))
- **playground:** Script a test owner account to sign in with ([00258c0](https://github.com/AntelopeJS/dms-builder/commit/00258c0))

### 🎨 Styles

- **banners:** Lay the strips out like the DMS's role preview bar ([3a74bd8](https://github.com/AntelopeJS/dms-builder/commit/3a74bd8))

### 🤖 CI

- Speed up pipeline ([#37](https://github.com/AntelopeJS/dms-builder/pull/37))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>
- Glastis <glastis@glastis.com>
- Alessandro Aloisio ([@alessaloisio](http://github.com/alessaloisio))

## v0.1.3

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.1.2...v0.1.3)

### 🩹 Fixes

- **db:** Index relation columns by default and refuse deleting a referenced resource ([#26](https://github.com/AntelopeJS/dms-builder/pull/26))

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.2.2 ([88f388e](https://github.com/AntelopeJS/dms-builder/commit/88f388e))
- **playground:** Move to @antelopejs/dms-frontend 0.3.2 ([#27](https://github.com/AntelopeJS/dms-builder/pull/27))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.1.2

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.1.1...v0.1.2)

### 🚀 Enhancements

- Configure a chart's data without writing a route ([#9](https://github.com/AntelopeJS/dms-builder/pull/9))

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.2.1 ([5627d59](https://github.com/AntelopeJS/dms-builder/commit/5627d59))

### ❤️ Contributors

- Fabrice Cst <fabrice@altab.be>

## v0.1.1

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.1.0...v0.1.1)

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.2.0 ([6691db5](https://github.com/AntelopeJS/dms-builder/commit/6691db5))

## v0.1.0

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.0.2...v0.1.0)

### 🩹 Fixes

- **release:** ⚠️  Publish with pnpm and depend on the interface by range ([#4](https://github.com/AntelopeJS/dms-builder/pull/4))
- **frontend:** ⚠️  Register the frontend module under its package name ([#5](https://github.com/AntelopeJS/dms-builder/pull/5))
- **builder:** Gate the builder on the project's development mode ([#11](https://github.com/AntelopeJS/dms-builder/pull/11))
- **queries:** Register the count and aggregate query templates ([#21](https://github.com/AntelopeJS/dms-builder/pull/21))

### 💅 Refactors

- **frontend:** Route both builder navigations through one dev-reload helper ([#3](https://github.com/AntelopeJS/dms-builder/pull/3))
- **frontend:** Import the SDK through #dms/frontend-module ([#12](https://github.com/AntelopeJS/dms-builder/pull/12))
- **build:** Merge tsconfig.build.json into tsconfig.json ([#16](https://github.com/AntelopeJS/dms-builder/pull/16))
- **package:** ⚠️  Drop moduleResolution node support and consumer compile checks ([#19](https://github.com/AntelopeJS/dms-builder/pull/19))
- Remove dead exports reported by knip ([#20](https://github.com/AntelopeJS/dms-builder/pull/20))

### 🏡 Chore

- **release:** @antelopejs/dms-builder v0.0.2 ([b9b4acc](https://github.com/AntelopeJS/dms-builder/commit/b9b4acc))
- **release:** @antelopejs/dms-builder v0.1.0 ([d0e2236](https://github.com/AntelopeJS/dms-builder/commit/d0e2236))
- **release:** @antelopejs/dms-builder v0.1.1 ([50e5a87](https://github.com/AntelopeJS/dms-builder/commit/50e5a87))
- Require @antelopejs/core 1.7 ([#8](https://github.com/AntelopeJS/dms-builder/pull/8))
- Align community files with the organization defaults ([#10](https://github.com/AntelopeJS/dms-builder/pull/10))
- **release:** @antelopejs/dms-builder v0.1.2 ([1ca7af9](https://github.com/AntelopeJS/dms-builder/commit/1ca7af9))
- Migrate frontend CLI and core version ([#13](https://github.com/AntelopeJS/dms-builder/pull/13))
- Remove obsolete playground script ([#14](https://github.com/AntelopeJS/dms-builder/pull/14))
- **release:** @antelopejs/dms-builder v0.1.3 ([f710aaa](https://github.com/AntelopeJS/dms-builder/commit/f710aaa))

### 🤖 CI

- **release:** Release next from a dedicated branch and restore requireCommits ([#17](https://github.com/AntelopeJS/dms-builder/pull/17))
- **release:** Reference the shared release workflows through v1 ([#18](https://github.com/AntelopeJS/dms-builder/pull/18))

#### ⚠️ Breaking Changes

- **release:** ⚠️  Publish with pnpm and depend on the interface by range ([#4](https://github.com/AntelopeJS/dms-builder/pull/4))
- **frontend:** ⚠️  Register the frontend module under its package name ([#5](https://github.com/AntelopeJS/dms-builder/pull/5))
- **package:** ⚠️  Drop moduleResolution node support and consumer compile checks ([#19](https://github.com/AntelopeJS/dms-builder/pull/19))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

## v0.0.2

[compare changes](https://github.com/AntelopeJS/dms-builder/compare/interface-v0.0.1...v0.0.2)

### 🏡 Chore

- Regenerate lockfiles against the published DMS packages ([#1](https://github.com/AntelopeJS/dms-builder/pull/1))
- **release:** Skip the npm auth pre-flight for trusted publishing ([#2](https://github.com/AntelopeJS/dms-builder/pull/2))

### ❤️ Contributors

- Antony Rizzitelli <rizzitelli.antony@pm.me>

