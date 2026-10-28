export const ComponentId = {
  SELF: "$component:self",
} as const;

export interface WatchActionCondition {
  key: string;
  value: unknown;
}

export interface WatchFunctionParamMap {}

// oxlint-disable-next-line typescript/no-redundant-type-constituents -- Consumers augment WatchFunctionParamMap by declaration merging; intersecting its keys with string excludes non-string keys.
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
