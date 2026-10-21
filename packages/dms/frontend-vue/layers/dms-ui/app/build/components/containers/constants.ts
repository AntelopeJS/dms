/** Placeholder field rows shown while the container body resolves. */
export const CONTAINER_SKELETON_FIELDS = 4;

/**
 * The placeholder rows' grid: two columns once the drawer or modal body has
 * a form's room for them (FieldRow's 560px step), whatever the window.
 */
export const CONTAINER_SKELETON_CLASS = "grid gap-4 @min-[560px]:grid-cols-2";

/**
 * The backdrop of a closing drawer or modal: it lets a click through to the
 * page as soon as the close starts and fades out quickly (at once with reduced
 * motion), while the panel still animates out and returns focus. Important:
 * reka sets `pointer-events: auto` inline on the overlay, and vaul's
 * unlayered rules time a drawer's fade.
 */
export const CLOSING_OVERLAY_CLASS =
  "data-[state=closed]:pointer-events-none! data-[state=closed]:[animation-duration:100ms]! motion-reduce:data-[state=closed]:[animation:none]!";

/**
 * The panel of a drawer, modal or slideover a closing dialog uncovered (see
 * `UNCOVERED_ATTRIBUTE` in `closingLayers.ts`): it takes clicks again while
 * the one above animates out. Important: reka keeps `pointer-events: none`
 * inline on it until the one above has unmounted.
 */
export const UNCOVERED_PANEL_CLASS =
  "data-[dms-uncovered]:pointer-events-auto!";
