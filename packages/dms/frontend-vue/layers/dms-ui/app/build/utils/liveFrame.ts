/** The query a dashboard page reads to draw itself bare, inside a mockup's preview: no sidebar, no top bar, no click reaching it. */
export const BARE_FRAME_QUERY = "dms-frame";
export const BARE_FRAME_VALUE = "bare";

/** The URL of the live page at `path`, drawn bare: its own query and fragment kept. */
export function bareFrameUrl(path: string): string {
  const url = new URL(path, "http://dms.invalid");
  url.searchParams.set(BARE_FRAME_QUERY, BARE_FRAME_VALUE);
  return `${url.pathname}${url.search}${url.hash}`;
}
