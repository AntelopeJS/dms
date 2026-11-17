import { inject, provide, ref, type InjectionKey, type Ref } from "vue";

const PAGE_FILL_HEIGHT_KEY: InjectionKey<Readonly<Ref<boolean>>> = Symbol(
  "dms:page-fill-height",
);

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
