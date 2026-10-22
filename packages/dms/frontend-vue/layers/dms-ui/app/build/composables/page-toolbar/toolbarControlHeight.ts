import type { PageToolbarSize } from "./pageToolbarContext";

/**
 * The one height every control of a toolbar takes at each size -- the live
 * pill, the segmented presets, the comparison trigger, the refresh button,
 * the labels and a leading chip -- so a bar is as tall with live as without.
 * The segmented track's and Nuxt UI's buttons' own steps (24/28/32 px),
 * written out so a theme's padding cannot change them.
 *
 * @internal
 */
export const PAGE_TOOLBAR_CONTROL_HEIGHT_CLASSES: Record<
  PageToolbarSize,
  string
> = {
  xs: "h-6",
  sm: "h-7",
  md: "h-8",
};

/**
 * The height class of a control drawn at `size`, empty for a size the
 * toolbar has no step for (a period selector's `lg`, `xl`).
 *
 * @internal
 */
export function toolbarControlHeightClass(size: string): string {
  return PAGE_TOOLBAR_CONTROL_HEIGHT_CLASSES[size as PageToolbarSize] ?? "";
}
