import * as watchActions from "../../watch-actions";

export import ComponentId = watchActions.ComponentId;
export type {
  WatchAction,
  WatchActionCondition,
  WatchFunctionParams,
} from "../../watch-actions";
export { WatchFunctionParamMap } from "../../watch-actions";

// oxlint-disable-next-line typescript/no-redundant-type-constituents -- Consumers augment WatchFunctionParamMap by declaration merging; intersecting its keys with string excludes non-string keys.
export type WatchFunctionId = keyof watchActions.WatchFunctionParamMap & string;
