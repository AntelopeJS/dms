import type { WatchAction } from "./watch";
import type { JsonValue } from "./json";

export interface ComponentOptionsData {
  [key: string]: JsonValue;
}
export interface DefaultComponentProps {
  componentId: string;
  pageId: string;
  routeParams?: Record<string, string>;
  watchActions?: WatchAction[];
  childCount?: number;
}

export interface ComponentEventData {
  component: string;
  data?: unknown;
}

export const Events = {
  LOAD: "DmsComponent.Load",
  UNLOAD: "DmsComponent.Unload",
} as const;
