/** A browser window size the page is rendered at. */
export interface Viewport {
  name: string;
  width: number;
  height: number;
}

/** The viewports a caller names instead of giving their size. */
export const NAMED_VIEWPORTS = {
  desktop: { name: "desktop", width: 1440, height: 900 },
  mobile: { name: "mobile", width: 390, height: 844 },
} as const satisfies Record<string, Viewport>;

/** Who the browser is signed in as. */
export interface VerifyAccountSummary {
  /** `owner`: the platform owner; `member`: a workspace member holding `role`. */
  kind: "owner" | "member";
  email: string;
  /** The role the account was picked for, absent for the owner. */
  role?: string;
}

/** One block the layout serves the account, as the browser drew it. */
export interface RenderedBlock {
  /** Layout path: the page component key, then each child id, joined by dots. */
  path: string;
  /** The registered component, such as `dms-table-view`. */
  component: string;
  present: boolean;
  /** Present and drawn with a non-empty box inside the page width. */
  visible: boolean;
  /** Present but drew no box, as a block with nothing to show does, such as a banner its route answered empty. */
  drewNothing?: boolean;
  /** Not drawn on load, but once the tab holding it was selected. */
  inTab?: boolean;
  /** Project-relative path of the block's screenshot, when it was visible. */
  screenshot?: string;
}

/** What the page looked like at one viewport. */
export interface ViewportRender {
  viewport: string;
  width: number;
  height: number;
  /** Project-relative path of the full-page screenshot. */
  screenshot: string;
  blocks: RenderedBlock[];
  layout: {
    /** The document is wider than the viewport: the page scrolls sideways. */
    horizontalOverflow: boolean;
    /** Paths of blocks reaching past the right edge of the viewport. */
    overflowingBlocks: string[];
    /** Pairs of top-level blocks whose boxes overlap. */
    overlappingBlocks: [string, string][];
  };
}

/** How one block of the mockup compares with the page. */
export interface MockupBlockComparison {
  /** Layout path in the mockup render. */
  mockupPath: string;
  /** The block type the mockup draws. */
  type: string;
  /** Layout path of the page block matched to it, by path then by type in order. */
  pagePath?: string;
  /** Project-relative paths of the two screenshots to compare side by side. */
  mockupScreenshot?: string;
  pageScreenshot?: string;
  status: "matched" | "missing";
}

/** The page against the render of a mockup page. */
export interface MockupComparison {
  mockup: string;
  page: string;
  /** Project-relative path of the full mockup screenshot, desktop width. */
  screenshot?: string;
  blocks: MockupBlockComparison[];
  /** Page blocks with no counterpart in the mockup. */
  extraPageBlocks: string[];
  /** Why no comparison ran, when none did. */
  unavailable?: string;
}

/** The data state a data block reports (`data-dms-block-state`), or a preview notice. */
export type DataState =
  | "ok"
  | "empty"
  | "error"
  | "loading"
  | "needs_backend"
  | "unknown_block";

export interface DataBlock {
  path: string;
  /** The block kind, such as `TableView`, `ChartCard`, `KpiCard`. */
  type: string;
  state: DataState;
  viewport: string;
  /** The URL the block reads, from its options: where a failed answer came from. */
  source?: string;
}

export interface ConsoleError {
  viewport: string;
  text: string;
}

export interface FailedRequest {
  viewport: string;
  method: string;
  url: string;
  /** The HTTP status, or the network failure when no answer came. */
  status: number | string;
}

/** What an interaction targets. */
export type InteractionKind = "link" | "tab" | "sort" | "filter" | "form";

export interface Interaction {
  kind: InteractionKind;
  /** The control, as a person finds it: its role and accessible name. */
  target: string;
  ok: boolean;
  detail: string;
}

/** Whether one role can open the page, by the access rule and in the browser. */
export interface RoleAccess {
  role: string;
  /** What the role's permissions grant, by the same rule the server applies. */
  expected: "allowed" | "refused";
  /** What the browser saw signed in as a member holding only that role. */
  observed: "rendered" | "refused" | "not_checked";
  /** Why the browser did not check it, such as no member holding the role. */
  note?: string;
  ok: boolean;
}

/** Everything one page was checked for. */
export interface PageReport {
  page: string;
  fullId?: string;
  ok: boolean;
  /** One line per failed check, the first thing to read and fix. */
  failures: string[];
  render: {
    viewports: ViewportRender[];
    mockup?: MockupComparison;
  };
  data: DataBlock[];
  errors: {
    console: ConsoleError[];
    failedRequests: FailedRequest[];
  };
  interactions: Interaction[];
  permissions: RoleAccess[];
}

/** The answer of `page_verify`. */
export interface PageVerifyReport {
  ok: boolean;
  dashboardUrl: string;
  account: VerifyAccountSummary;
  /** Project-relative folder holding every screenshot of this run. */
  screenshots: string;
  /** What the run could not do, such as a role no member holds. */
  notes: string[];
  pages: PageReport[];
}
