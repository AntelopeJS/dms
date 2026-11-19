import type { Ref } from "vue";
import type { ComponentEventData } from "./component";
import type { DataTypeValue } from "./data-type";

export const ComponentId = {
  SELF: "$component:self",
} as const;

/**
 * What a component's watch actions write into its state: a field's value, or
 * a set of field ids (the fields a form disables, hides or requires).
 */
export interface ComponentWatchState {
  [key: string]: DataTypeValue | Set<string>;
}

export type WatchActionFunction = (
  action: WatchAction,
  eventData: ComponentEventData,
  componentState: Ref<ComponentWatchState>,
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
