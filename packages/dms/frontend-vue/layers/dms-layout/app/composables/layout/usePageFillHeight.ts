import type { InjectionKey, Ref } from "vue";

const PAGE_FILL_HEIGHT_KEY: InjectionKey<Readonly<Ref<boolean>>> = Symbol(
  "dms:page-fill-height",
);

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

/**
 * Lets the page rendered in a layout's slot know whether the layout gives it
 * the height of the panel.
 */
export const providePageFillHeight = (fillHeight: Readonly<Ref<boolean>>) => {
  provide(PAGE_FILL_HEIGHT_KEY, fillHeight);
};

/**
 * Whether the layout rendering the page asked it to fill the panel height.
 * `false` under a layout that does not provide it.
 */
export const usePageFillHeight = (): Readonly<Ref<boolean>> =>
  inject(PAGE_FILL_HEIGHT_KEY, () => ref(false), true);
