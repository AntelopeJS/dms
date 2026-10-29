export const ComponentId = {
  SELF: "$component:self",
} as const;

export interface WatchActionCondition {
  key: string;
  value: unknown;
}

export interface WatchFunctionParamMap {}

export type WatchFunctionParams<F extends string> =
  F extends keyof WatchFunctionParamMap
    ? WatchFunctionParamMap[F]
    : // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Unregistered watch functions have application-owned payloads; preserve the published fallback.
      Record<string, unknown> | undefined;

export interface WatchAction {
  component: string;
  event: string;
  functionId: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Application watch handlers own parameter schemas; narrowing this published transport contract would reject existing handlers.
  params?: Record<string, unknown>;
  onParam?: WatchActionCondition | WatchActionCondition[];
  requirePermission?: string;
}
