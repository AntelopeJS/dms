import type { Ref } from "vue";
import type { ComponentEventData } from "./component";

export const ComponentId = {
  SELF: "$component:self",
} as const;

export type WatchActionFunction = (
  action: WatchAction,
  eventData: ComponentEventData,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- useWatch owns arbitrary mutable component state and also uses Record<string, unknown>; a JSON-only or one-component type would narrow this public callback contract.
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
  params?: object;
  onParam?: WatchActionCondition | WatchActionCondition[];
}
