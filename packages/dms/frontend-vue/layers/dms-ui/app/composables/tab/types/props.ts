import type { TabItem } from "./item";

interface TabComponentProps {
  componentId: string;
  pageId: string;
  routeParams?: Record<string, string>;
  watchActions?: WatchAction[];
  childCount?: number;
}

export enum TabVariant {
  pill = "pill",
  link = "link",
}

export interface TabProps extends TabComponentProps {
  items: TabItem[];
  color?: Color;
  size?: Size;
  variant?: TabVariant;
  orientation?: AxeOrientation;
  unmountOnHide?: boolean;
  persistState?: boolean;
  stateKey?: string;
}
