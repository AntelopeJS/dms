export const ComponentId = {
  SELF: "$component:self",
} as const;

export interface WatchActionCondition {
  key: string;
  value: unknown;
}

// Intentionally empty: modules extend it through declaration merging.
export interface WatchFunctionParamMap {}

// WatchFunctionParamMap is empty here and filled by declaration merging in
// the consuming modules, so `keyof` is only `never` from this file's point
// of view. `& string` is what keeps the merged keys usable as identifiers.
// oxlint-disable-next-line typescript/no-redundant-type-constituents
export type WatchFunctionId = keyof WatchFunctionParamMap & string;

export type WatchFunctionParams<F extends string> =
  F extends keyof WatchFunctionParamMap
    ? WatchFunctionParamMap[F]
    : Record<string, unknown> | undefined;

export interface WatchAction {
  component: string;
  event: string;
  functionId: string;
  params?: Record<string, unknown>;
  onParam?: WatchActionCondition | WatchActionCondition[];
  requirePermission?: string;
}
