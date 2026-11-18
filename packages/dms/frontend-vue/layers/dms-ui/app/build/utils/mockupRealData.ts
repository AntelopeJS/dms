import type { PreviewNode } from "./blockPreview";
import type { MockupDataMode, MockupPageState } from "./mockup";
import {
  FIXTURES_ONLY_QUERY,
  FIXTURES_ONLY_VALUE,
} from "./previewFixturesOnly";

const PREVIEW_PATH = "/dms-preview";

/**
 * Whether `page` is drawn on its live routes. A live reference page always
 * is: it draws its live page, whatever the developer chose. A page with a
 * live tree reads them when the developer chose Real data, and when no
 * choice was made if the page was converted from a live page; any other page
 * reads its fixtures.
 */
export function readsRealData(
  page: Pick<MockupPageState, "realTree" | "livePage" | "live"> | undefined,
  choice: MockupDataMode | undefined,
): boolean {
  if (page?.live !== undefined) return true;
  if (page?.realTree === undefined) return false;
  return choice ? choice === "real" : page.livePage !== undefined;
}

/** The preview document for a page: one that refuses every live route unless `realData`. */
export function mockupPreviewPath(realData: boolean): string {
  return realData
    ? PREVIEW_PATH
    : `${PREVIEW_PATH}?${FIXTURES_ONLY_QUERY}=${FIXTURES_ONLY_VALUE}`;
}

/** The tree of `page` for the frame `mockupPreviewPath(realData)` opens. */
export function mockupDataTree(
  page: Pick<MockupPageState, "tree" | "realTree">,
  realData: boolean,
): PreviewNode[] {
  return realData && page.realTree ? page.realTree : page.tree;
}
