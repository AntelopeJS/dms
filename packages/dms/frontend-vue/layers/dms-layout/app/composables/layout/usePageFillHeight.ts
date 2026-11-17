/**
 * The flex column a page filling the panel (`DefaultLayout({ fillHeight })`)
 * is laid out in, from the scrolling panel body down to the component that
 * takes the height left.
 */
export const PAGE_FILL_HEIGHT_CLASSES = {
  /**
   * The page region, the panel body's only child. The minimum height sits
   * here rather than on the component that fills: a floor set lower down
   * overflows this region, and the panel then scrolls past its own bottom
   * padding.
   */
  region: "flex min-h-[30rem] flex-1 flex-col",
  /** The page stack, and the component wrapper that takes the height left. */
  column: "flex min-h-0 flex-1 flex-col",
} as const;
