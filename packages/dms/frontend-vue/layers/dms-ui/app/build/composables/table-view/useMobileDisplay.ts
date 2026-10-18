import { onMounted, ref, type Ref } from "vue";

/** The viewports a table view opens on its `mobileDisplay`: a phone's. */
export const PHONE_VIEWPORT_QUERY = "(max-width: 767px)";

export interface MobileDisplayOptions {
  /** The table view's `mobileDisplay`, if any. */
  mobileDisplay: string | undefined;
  /** The table view's `defaultDisplay`, resolved. */
  defaultDisplay: string;
  /** The ids of the displays the table view offers. */
  offered: ReadonlySet<string>;
  /** The display shown. */
  display: Ref<string>;
  /**
   * The display shown is someone's choice — the user saved one, a view is
   * open, the default display is the only way in: a phone keeps it.
   */
  isDisplayChosen: () => boolean;
}

/**
 * Opens a phone on the table view's `mobileDisplay` once mounted, the
 * server render having drawn the default display, when nobody chose one.
 *
 * @returns The display the preference counts as the default: the phone's
 *   once applied, so it is not saved as the user's choice and the same user
 *   on a wide screen keeps the table's default
 */
export function useMobileDisplay(options: MobileDisplayOptions): Ref<string> {
  const effectiveDefault = ref(options.defaultDisplay);
  onMounted(() => {
    const { mobileDisplay } = options;
    if (!mobileDisplay || !options.offered.has(mobileDisplay)) return;
    if (options.isDisplayChosen()) return;
    if (!window.matchMedia?.(PHONE_VIEWPORT_QUERY).matches) return;
    effectiveDefault.value = mobileDisplay;
    options.display.value = mobileDisplay;
  });
  return effectiveDefault;
}
