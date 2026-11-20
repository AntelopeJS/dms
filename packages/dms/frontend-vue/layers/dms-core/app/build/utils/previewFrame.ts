/** The page the mockup viewer and the Mockups list embed to draw a mockup, once per page or card. */
const BLOCK_PREVIEW_PATH = "/dms-preview";

/**
 * Whether this document is a `/dms-preview` frame. A frame opens no
 * long-lived connection of its own: the Overview draws a dozen of them, and
 * a stream each would hold every connection the browser opens to the host.
 * The page embedding it feeds it what it draws through `postMessage`.
 */
export function isPreviewFrame(): boolean {
  return globalThis.location?.pathname === BLOCK_PREVIEW_PATH;
}
