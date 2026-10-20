/** Placeholder field rows shown while the container body resolves. */
export const CONTAINER_SKELETON_FIELDS = 4;

/**
 * The backdrop of a closing drawer or modal: it lets a click through to the
 * page as soon as the close starts and fades out quickly (at once with reduced
 * motion), while the panel still animates out and returns focus. Important:
 * reka sets `pointer-events: auto` inline on the overlay, and vaul's
 * unlayered rules time a drawer's fade.
 */
export const CLOSING_OVERLAY_CLASS =
  "data-[state=closed]:pointer-events-none! data-[state=closed]:[animation-duration:100ms]! motion-reduce:data-[state=closed]:[animation:none]!";
