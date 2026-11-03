# Upgrade notes

Each section is the upgrade-notes block of one `@antelopejs/interface-dms` release. Paste it into the GitHub release body and under the release's heading in `CHANGELOG.md`. The changelog generator writes only commit subjects.

## v0.12.0

### Hooks

- **Hook handlers are typed by their hook.** `HookCallback` is removed from `@antelopejs/interface-dms/hooks`. Use `HookHandler<H>` ([#696](https://github.com/AntelopeJS/dms/pull/696)).
- **`CollectHooks<H>` resolves to `Awaited<HookHandlerResult<H>>[]`** instead of `HookSignatures[H]["result"][]`. An event hook, whose result is `undefined`, collects `unknown[]`, because its handlers may return anything. A hook with a result collects that result. Runtime behaviour is unchanged ([#696](https://github.com/AntelopeJS/dms/pull/696)).
- **A hook name that is not a member of `Hook` throws.** Before, the first use of an untyped name created a registry for it ([#696](https://github.com/AntelopeJS/dms/pull/696)).

### Types

- **Layer exceptions removed.** `Component` and `ComponentBuilder` hand their `onCreated` hook a `CreatedPage` (`target`, `pageInfo.fullId`, `pageInfo.fullSlug`), which `PageMetadata` implements. An `onCreated` callback typed `(page: PageMetadata) => void` no longer compiles: type its parameter `CreatedPage` or leave it inferred. The root entry also exports `CreatedPage` and `ImageValue`. `ResourceForm` takes a `ControllerClass` and no type argument, so `ResourceForm<typeof Foo>(...)` stops compiling ("Expected 0 type arguments"). A module that types a stock watch function's params from `watch-actions` with no `base/` import, for example after importing `User` from `auth/db/tables`, reads the fallback `Record<string, unknown> | undefined` instead of the stock fields. A module that imports the root entry or any `base/` subpath still sees them ([#582](https://github.com/AntelopeJS/dms/pull/582)).
- **`isErrorWithMessage` answers `false` for an object whose `message` is not a string.** It is exported from `@antelopejs/interface-dms/base/types`. Code that calls it compiles unchanged and gets the new answer. `getErrorMessage` answers as before ([#582](https://github.com/AntelopeJS/dms/pull/582)).
- **Table-view route wrappers are typed by their route's arguments.** `withFilePromotion`, `createValidatedRoute`, `withColumnConditions` and `memberWriteRoute` take the route they wrap typed by its arguments. `withActionCheck`, `withRealtimeMutation` and `withPresenceAcquire` take fixed arguments, and the new `withParamsActionCheck` covers `Get`. `createGuardedRoute` is split into `createGuardedWriteRoute` (`new`, `edit`) and `createGuardedConfirmRoute` (`delete`, `archive`, `restore`). `TableViewRoutes.Get`, `New`, `Edit`, `Delete`, `Archive` and `Restore` are typed by their arguments, and `TableViewRoutes.EditWith` takes a route with the arguments of `DefaultRoutes.Edit`. A guarded `new` or `edit` now parses its body before the guard runs: a body that is not a JSON object answers 400 without running the guard, and an empty or invalid body answers 400 instead of 500 ([#605](https://github.com/AntelopeJS/dms/pull/605)).
- **The table-view list page, JSON archive entries and awaited rule fields are typed.** `TableViewRoutes.List` and `Select` take `[RequestContext, ListParameters, User]` and answer the new `TableViewListPage` (`{ results; total; offset; limit }`). `TenantExportArchive.addJson(path, data)` takes a `JsonValue` instead of `unknown`. `FieldRule` compares `Awaited<T[K]>`, so a getter answering a promise is compared with the value it resolves to ([#606](https://github.com/AntelopeJS/dms/pull/606)).
- **Table-view generics accept any object row.** Row generics move from `T extends Record<string, unknown>` to `T extends object`, with the published defaults unchanged. Code that relied on `T` being indexable inside a generic over the row stops compiling, and an inferred row with no candidate is now `object` ([#656](https://github.com/AntelopeJS/dms/pull/656)).
- **Invite extension payloads are JSON.** `InviteExtensionPayloads` is `Record<string, InviteExtensionJson>` instead of `Record<string, unknown>`, where `InviteExtensionJson` is a JSON value that may be read-only. It types `UserInvite.extensions`, the `extensions` option of `inviteUserToTenant` and the other invite calls, and the invite-deleted hook payload. These shapes stop compiling as an `InviteExtensionPayloads`: an object typed by an `interface`, a `Date`, a class instance, `undefined`, and a `Record<string, unknown>`. Pass JSON: a `type` alias object, an object with optional members, and a `readonly` array still compile. A value read back from `UserInvite.extensions` is now `InviteExtensionJson` instead of `unknown`. An invite submission whose body nests arrays or objects more than 64 levels deep answers 400, and one holding a value that is not JSON, which only a direct call from code can pass, is read as having no fields where before the value reached the extension's schema ([#712](https://github.com/AntelopeJS/dms/pull/712)).
- **`resolveBulkRowIds` takes a data controller or a `BulkRowSource`.** Its `table` parameter was `unknown` and is now `DataControllerInstance | BulkRowSource`. A route that passes `this`, or a `BulkRowSource`, compiles unchanged. A call that passes a string, a number, `null` or `undefined` stops compiling. `DataControllerInstance` is `object`, so any other object still compiles ([#729](https://github.com/AntelopeJS/dms/pull/729)).
- **Layout banner props are JSON.** `LayoutBannerComponentInfo.props` is `{ readonly [prop: string]: JsonValue }` instead of `Record<string, unknown>`. Props were already sent to the browser as JSON. A banner that puts a function, a `Date`, `undefined`, a `bigint`, a `symbol` or a class instance in its props stops compiling, and so does a props variable typed `Record<string, unknown>`: pass a string, a number, a boolean, `null`, a mutable array or a plain object of those. The array in `JsonValue` is mutable, so a `readonly` array or tuple, and a variable declared `as const` that holds an array, stop compiling too: pass a copy such as `[...list]`. An object typed by an `interface` and nested in props is not assignable to `JsonValue`: type it with a `type` literal ([#729](https://github.com/AntelopeJS/dms/pull/729)).
- **`ColumnDisplaySerialized.options` is `object`.** It was `Record<string, unknown>`. Code that reads a member of it stops compiling until it checks the member (`"unit" in options`) or reads the display's own options type. Code that passes `options` to a parameter or variable typed `Record<string, unknown>` stops compiling too. Nothing changes at runtime ([#729](https://github.com/AntelopeJS/dms/pull/729)).

### Components

- **Option transforms belong to `ComponentBuilder`.** `Component` no longer has the protected `_optionTransforms` list, and `Component.serialize()` applies no transform. `ComponentBuilder` keeps its transforms privately, typed by its options `T`, and its `serialize()` applies them as before. `transformOptions` is unchanged. A subclass that pushed into `_optionTransforms` stops compiling: extend `ComponentBuilder` if it extended `Component`, and call `transformOptions`.

### Guards

- **A guard's JSON body must be an object.** When the body arrives as JSON text or bytes, the guard body decoder throws unless it holds a JSON object, so a JSON array or `null` is refused. Before, such a body was accepted. A body that is already decoded is returned as is, arrays included. This applies to every caller, the member data controllers and the table-view attachments included.

### Peer ranges

Four peer floors rise since interface-dms 0.10.3. npm refuses an older copy of any of them beside interface-dms 0.12.0, and pnpm reports the mix.

- `@antelopejs/interface-api` `>=0.0.15` to `>=0.3.0 <1.0.0` ([#622](https://github.com/AntelopeJS/dms/pull/622)).
- `@antelopejs/interface-data-api` `>=0.5.0` to `>=0.6.0 <1.0.0` ([#616](https://github.com/AntelopeJS/dms/pull/616)).
- `@antelopejs/interface-core` `>=0.2.4` to `>=0.4.0 <1.0.0` ([#639](https://github.com/AntelopeJS/dms/pull/639)).
- `@antelopejs/interface-database-decorators` `>=0.1.10` to `>=0.1.12 <1.0.0`, taken from `main` ([#699](https://github.com/AntelopeJS/dms/pull/699)).

### Published versions that break under `@antelopejs/api` 2.0.0

Each version below builds a route handler with `proto` and no `controller`, so api 2.0.0 refuses it at registration. Measured on 2026-11-03: every published version of the first three packages was packed from npm, and its `dist` was searched for a `proto:` handler with no `controller:` within six lines.

- `@antelopejs/interface-data-api`: every published version, 0.0.2 to 0.5.0 (`dist/index.js:70` or `:71`). Fixed by interface-data-api 0.6.0.
- `@antelopejs/interface-dms`: every published version, 0.0.1 to 0.10.3 (`dist/page/metadata.js` up to 0.9.1, `dist/page/internal/metadata-layout.js:35` from 0.10.0). Fixed by interface-dms 0.12.0.
- `@antelopejs/dms` 0.5.0 to 0.15.0: each caps its `@antelopejs/interface-dms` range below 0.11.0, so it can only resolve one of the versions above. Fixed by dms 0.16.0. dms 0.4.8 and earlier accept any interface-dms below 1.0.0. Whether they run with interface-dms 0.12.0 was not checked.
- `@antelopejs/dms-automation`: every published version, 0.0.1 to 0.8.0 (`dist/runtime/builtins/triggers/webhook.js`). Fixed by dms-automation 0.9.0.
- `@antelopejs-private/datatable` 0.0.9 (`dist/interface/index.js:348`). Nothing fixes it. This row comes from the release plan and was not re-measured, because the package is on the private registry.

dms 0.16.0 and dms-automation 0.9.0 are the proposed release targets, not yet set in their manifests.
