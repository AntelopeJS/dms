/** The areas the feature index groups features under, in reading order. */
export const FEATURE_AREAS = {
  blocks: "Blocks & charts",
  tableView: "Table view",
  matrix: "Matrix",
  form: "Forms",
  pages: "Pages & navigation",
  frontend: "Frontend modules",
} as const;

export type FeatureArea = (typeof FEATURE_AREAS)[keyof typeof FEATURE_AREAS];

/**
 * One feature of the DMS and the playground page that shows it. The feature
 * index lists every entry, and flags the ones whose demo page is gone.
 */
export interface PlaygroundFeature {
  /** Area of the DMS, the group the index files the feature under. */
  area: FeatureArea;
  /** What a visitor sees, in a few words ("Rows pinned above the others"). */
  feature: string;
  /** The API that turns it on, as an author writes it (`TableView({ pinnedRows })`). */
  api: string;
  /**
   * Path of the page showing it, from the dashboard root. It may carry a
   * query or a hash leading to the right spot (`/table-view/x?tab=open`).
   */
  demo: string;
  /**
   * Slug the demo page registered, with its route parameters
   * (`/projects/:projectId`), when `demo` is a concrete URL of such a page:
   * the index checks this one instead.
   */
  slug?: string;
  /** DMS release that added it, when it is recent enough to be worth naming. */
  since?: string;
}
