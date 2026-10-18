import { onMounted, type Ref } from "vue";
import type { TableViewViewStateConfig } from "../../../composables/table-view/types";

/** The viewports a table view opens on its `mobileDisplay`: a phone's. */
export const PHONE_VIEWPORT_QUERY = "(max-width: 767px)";

export interface MobileDisplayOptions {
  /** The table view's `mobileDisplay`, if any. */
  mobileDisplay: string | undefined;
  /**
   * The display the table counts as its default, starting at its resolved
   * `defaultDisplay`: the phone's once applied, so it is not saved as the
   * user's choice, and a view that sets no display opens on it.
   */
  defaultDisplay: Ref<string>;
  /** The ids of the displays the table view offers. */
  offered: ReadonlySet<string>;
  /** The display shown. */
  display: Ref<string>;
  /**
   * The view open, if any. One that fixes a display keeps it; one that
   * leaves the display out (a `defaultView` showing every row) does not.
   */
  activeView: Ref<TableViewViewStateConfig | undefined>;
  /**
   * The display shown is someone's choice — the user saved one, the default
   * display is the only way in: a phone keeps it.
   */
  isDisplayChosen: () => boolean;
}

/**
 * Opens a phone on the table view's `mobileDisplay` once mounted, the
 * server render having drawn the default display, when nobody chose one.
 * Called after the table's views, so a view resolved once mounted is open.
 */
export function useMobileDisplay(options: MobileDisplayOptions): void {
  onMounted(() => {
    const { mobileDisplay, offered } = options;
    if (!mobileDisplay || !offered.has(mobileDisplay)) return;
    if (options.isDisplayChosen()) return;
    const viewDisplay = options.activeView.value?.display;
    if (viewDisplay && offered.has(viewDisplay)) return;
    if (!window.matchMedia?.(PHONE_VIEWPORT_QUERY).matches) return;
    options.defaultDisplay.value = mobileDisplay;
    options.display.value = mobileDisplay;
  });
}
