import type { TabItem } from "./item";

// A tab set is also used directly in hand-written pages, outside any
// registered component: the ids exist only for server-driven ones.
interface TabComponentProps {
  componentId?: string;
  pageId?: string;
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
  /**
   * GET answering `{ [slot]: string | number }`: the badge of each tab it
   * names, read in one request and again when a watch action fires.
   */
  badgesUrl?: string;
}

/** The badges `badgesUrl` answers with, by tab slot. */
export type TabBadges = Record<string, string | number>;
