/**
 * What a page of a whole-platform mockup is beside the live app: a live page
 * shown untouched, a live page the mockup edits, or a page the mockup adds.
 */
export const PREVIEW_PAGE_STATUSES = ["live", "edited", "new"] as const;
export type PreviewPageStatus = (typeof PREVIEW_PAGE_STATUSES)[number];

/** Whether `value` is a {@link PreviewPageStatus}. */
export function isPageStatus(value: unknown): value is PreviewPageStatus {
  return PREVIEW_PAGE_STATUSES.some((status) => status === value);
}
