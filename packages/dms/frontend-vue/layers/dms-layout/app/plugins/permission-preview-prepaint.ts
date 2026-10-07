import {
  PERMISSION_PREVIEW_PENDING_ATTRIBUTE,
  PERMISSION_PREVIEW_QUERY_KEY,
  PERMISSION_PREVIEW_STORAGE_PREFIX,
  PERMISSION_PREVIEW_TAB_KEY,
} from "#dms-core/app/build/utils/permission-preview";

const PRE_PAINT_SCRIPT_ID = "dms-role-preview";
const PENDING_VALUE = "pending";
// Never leave a page hidden: past this delay (the preview plugin failed to
// load, the preview request hangs) the page shows as it is.
const PENDING_TIMEOUT_MS = 6000;

/**
 * Runs in `<head>` before first paint. A preview tab (opened with the
 * preview query, or reloaded while being one) is only known in the browser,
 * from its storage: without this, a reload showed the full page for a second
 * before its veils and bar. A normal tab reads two storage keys and stops.
 * Source text rather than a serialized function, which a bundler could fill
 * with helpers the page does not have.
 */
const PRE_PAINT_SCRIPT = `(() => {
  try {
    const id =
      new URLSearchParams(location.search).get(${JSON.stringify(PERMISSION_PREVIEW_QUERY_KEY)}) ||
      sessionStorage.getItem(${JSON.stringify(PERMISSION_PREVIEW_TAB_KEY)});
    if (!id || !localStorage.getItem(${JSON.stringify(PERMISSION_PREVIEW_STORAGE_PREFIX)} + id)) return;
    const root = document.documentElement;
    root.setAttribute(${JSON.stringify(PERMISSION_PREVIEW_PENDING_ATTRIBUTE)}, ${JSON.stringify(PENDING_VALUE)});
    setTimeout(() => root.removeAttribute(${JSON.stringify(PERMISSION_PREVIEW_PENDING_ATTRIBUTE)}), ${PENDING_TIMEOUT_MS});
  } catch {}
})();`;

/** Server only: the script only matters before the first paint. */
export default defineDmsPlugin(() => {
  if (!import.meta.env.SSR) return;
  useHead({
    script: [{ id: PRE_PAINT_SCRIPT_ID, innerHTML: PRE_PAINT_SCRIPT }],
  });
});
