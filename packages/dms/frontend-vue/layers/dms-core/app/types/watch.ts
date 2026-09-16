import type { Ref } from "vue";
import type { ComponentEventData } from "./component";

export const ComponentId = {
  SELF: "$component:self",
} as const;

export type WatchActionFunction = (
  action: WatchAction,
  eventData: ComponentEventData,
  componentState: Ref<Record<string, unknown>>,
) => void;

export interface WatchActionCondition {
  key: string;
  value: unknown;
}

export interface WatchAction {
  component: string;
  event: string;
  functionId: string;
  params?: Record<string, unknown>;
  onParam?: WatchActionCondition | WatchActionCondition[];
}
