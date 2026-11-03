# Upgrade notes

Each section is the upgrade-notes block of one `@antelopejs/interface-dms` release. Paste it into the GitHub release body and under the release's heading in `CHANGELOG.md`. The changelog generator writes only commit subjects.

## v0.12.0

### Hooks

- **Hook handlers are typed by their hook.** `HookCallback` is removed from `@antelopejs/interface-dms/hooks`. Use `HookHandler<H>` ([#696](https://github.com/AntelopeJS/dms/pull/696)).
- **`CollectHooks<H>` resolves to `Awaited<HookHandlerResult<H>>[]`** instead of `HookSignatures[H]["result"][]`. An event hook, whose result is `undefined`, collects `unknown[]`, because its handlers may return anything. A hook with a result collects that result. Runtime behaviour is unchanged ([#696](https://github.com/AntelopeJS/dms/pull/696)).
- **A hook name that is not a member of `Hook` throws.** Before, the first use of an untyped name created a registry for it ([#696](https://github.com/AntelopeJS/dms/pull/696)).

### Guards

- **A guard's JSON body must be an object.** The guard body decoder throws on a body that is not a JSON object, a JSON array included. Before, such a body was accepted. This applies to every caller, the member data controllers and the table-view attachments included.

### Peer ranges

- interface-dms 0.12.0 declares `@antelopejs/interface-api` `>=0.3.0 <1.0.0` and `@antelopejs/interface-data-api` `>=0.6.0 <1.0.0`. npm refuses an older interface-api or interface-data-api beside it, and pnpm reports the mix ([#616](https://github.com/AntelopeJS/dms/pull/616), [#622](https://github.com/AntelopeJS/dms/pull/622)).

### Published versions that break under `@antelopejs/api` 2.0.0

- interface-dms 0.10.1 to 0.10.3, and dms 0.12.1 to 0.15.0, build a page layout route with `proto` and no `controller` (`dist/page/internal/metadata-layout.js:35`). api 2.0.0 refuses such a handler at registration with a `TypeError` naming the route. interface-dms 0.12.0 and dms 0.16.0 register by `controller`.
