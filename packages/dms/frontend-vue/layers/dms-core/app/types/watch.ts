import type { Ref } from "vue";
import type { ComponentEventData } from "./component";

export const ComponentId = {
  SELF: "$component:self",
} as const;

/** A watch action, run against the state of the component that watches: `Value` is what that state holds per key. */
export type WatchActionFunction<Value = unknown> = (
  action: WatchAction,
  eventData: ComponentEventData,
  componentState: Ref<Record<string, Value>>,
) => void;

export interface WatchActionCondition {
  key: string;
  value: unknown;
}

export interface WatchAction {
  component: string;
  event: string;
  functionId: string;
  params?: object;
  onParam?: WatchActionCondition | WatchActionCondition[];
}
