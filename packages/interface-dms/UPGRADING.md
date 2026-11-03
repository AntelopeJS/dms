# Upgrade notes

Each section is the upgrade-notes block of one `@antelopejs/interface-dms` release. Paste it into the GitHub release body and under the release's heading in `CHANGELOG.md`. The changelog generator writes only commit subjects.

## v0.12.0

### Hooks

- **Hook handlers are typed by their hook.** `HookCallback` is removed from `@antelopejs/interface-dms/hooks`. Use `HookHandler<H>` ([#696](https://github.com/AntelopeJS/dms/pull/696)).
- **`CollectHooks<H>` resolves to `Awaited<HookHandlerResult<H>>[]`** instead of `HookSignatures[H]["result"][]`. An event hook, whose result is `undefined`, collects `unknown[]`, because its handlers may return anything. A hook with a result collects that result. Runtime behaviour is unchanged ([#696](https://github.com/AntelopeJS/dms/pull/696)).
- **A hook name that is not a member of `Hook` throws.** Before, the first use of an untyped name created a registry for it ([#696](https://github.com/AntelopeJS/dms/pull/696)).

### Types

- **Layer exceptions removed.** `Component` and `ComponentBuilder` hand their `onCreated` hook a `CreatedPage` (`target`, `pageInfo.fullId`, `pageInfo.fullSlug`), which `PageMetadata` satisfies. `CreatedPage` and `ImageValue` are declared in `types.ts`. `ResourceForm` takes a `ControllerClass` instead of a type parameter. A module that types a stock watch function's params from `watch-actions` with no `base/` import, for example after importing `User` from `auth/db/tables`, reads the fallback `Record<string, unknown> | undefined` instead of the stock fields. A module that imports the root entry or any `base/` subpath still sees them ([#582](https://github.com/AntelopeJS/dms/pull/582)).
- **Table-view route wrappers are typed by their route's arguments.** `withFilePromotion`, `createValidatedRoute`, `withColumnConditions` and `memberWriteRoute` take the route they wrap typed by its arguments. `withActionCheck`, `withRealtimeMutation` and `withPresenceAcquire` take fixed arguments, and the new `withParamsActionCheck` covers `Get`. `createGuardedRoute` is split into `createGuardedWriteRoute` (`new`, `edit`) and `createGuardedConfirmRoute` (`delete`, `archive`, `restore`). `TableViewRoutes.EditWith` takes a route with the arguments of `DefaultRoutes.Edit`. A guarded `new` or `edit` now parses its body before the guard runs: a body that is not a JSON object answers 400 without running the guard, and an empty or invalid body answers 400 instead of 500 ([#605](https://github.com/AntelopeJS/dms/pull/605)).
- **The table-view list page, JSON archive entries and awaited rule fields are typed.** `TableViewRoutes.List` and `Select` take `[RequestContext, ListParameters, User]` and answer the new `TableViewListPage` (`{ results; total; offset; limit }`). `TenantExportArchive.addJson(path, data)` takes a `JsonValue` instead of `unknown`. `FieldRule` compares `Awaited<T[K]>`, so a getter answering a promise is compared with the value it resolves to ([#606](https://github.com/AntelopeJS/dms/pull/606)).
- **Table-view generics accept any object row.** Row generics move from `T extends Record<string, unknown>` to `T extends object`, with the published defaults unchanged. Code that relied on `T` being indexable inside a generic over the row stops compiling, and an inferred row with no candidate is now `object` ([#656](https://github.com/AntelopeJS/dms/pull/656)).

### Guards

- **A guard's JSON body must be an object.** When the body arrives as JSON text or bytes, the guard body decoder throws unless it holds a JSON object, so a JSON array or `null` is refused. Before, such a body was accepted. A body that is already decoded is returned as is, arrays included. This applies to every caller, the member data controllers and the table-view attachments included.

### Peer ranges

Four peer floors rise since interface-dms 0.10.3. npm refuses an older copy of any of them beside interface-dms 0.12.0, and pnpm reports the mix.

- `@antelopejs/interface-api` `>=0.0.15` to `>=0.3.0 <1.0.0` ([#622](https://github.com/AntelopeJS/dms/pull/622)).
- `@antelopejs/interface-data-api` `>=0.5.0` to `>=0.6.0 <1.0.0` ([#616](https://github.com/AntelopeJS/dms/pull/616)).
- `@antelopejs/interface-core` `>=0.2.4` to `>=0.4.0 <1.0.0` ([#639](https://github.com/AntelopeJS/dms/pull/639)).
- `@antelopejs/interface-database-decorators` `>=0.1.10` to `>=0.1.12 <1.0.0`, taken from `main` ([#699](https://github.com/AntelopeJS/dms/pull/699)).

### Published versions that break under `@antelopejs/api` 2.0.0

- interface-dms 0.10.1 to 0.10.3, and dms 0.12.1 to 0.15.0, build a page layout route with `proto` and no `controller` (`dist/page/internal/metadata-layout.js:35`). api 2.0.0 refuses such a handler at registration with a `TypeError` naming the route. interface-dms 0.12.0 and dms 0.16.0 register by `controller`. dms 0.16.0 is the proposed release target, not yet set in `packages/dms/package.json`.
