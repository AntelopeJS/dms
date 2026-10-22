import { get } from "@nuxt/ui/runtime/utils/index.js";
import type { ActionTarget } from "#dms-ui/app/composables/table-view/types/action-target";

// The record a page shows (`DefaultLayout({ record })`), as its header
// buttons read it: `{{record.X}}` in a target, a button acting on it.

/** The record of the page as the header knows it. */
export type PageRecord =
  | { status: "loading" }
  | { status: "loaded"; values: Record<string, unknown> }
  /** Not found, refused, or its URL names a value the page does not carry. */
  | { status: "missing" };

/** What the header needs of a button to bind it to the page's record. */
export interface RecordBoundButton {
  target?: ActionTarget;
  requiresRecord?: boolean;
  disabled?: boolean;
}

const RECORD_TOKEN = /\{\{\s*record\.([\w.-]+)\s*\}\}/g;
const NAMES_RECORD = /\{\{\s*record\./;

const targetUrl = (target: ActionTarget | undefined): string | undefined => {
  const url = (target as { url?: unknown } | undefined)?.url;
  return typeof url === "string" ? url : undefined;
};

/** Whether a button acts on the page's record. */
export function isRecordBound(button: RecordBoundButton): boolean {
  if (button.requiresRecord) return true;
  const url = targetUrl(button.target);
  return !!url && NAMES_RECORD.test(url);
}

/**
 * A URL with its `{{record.X}}` tokens filled in, each value percent-encoded
 * (an address is one query value). A token the record has no value for is
 * left as written.
 */
export function fillRecordTokens(
  url: string,
  record: Record<string, unknown>,
): string {
  return url.replace(RECORD_TOKEN, (match, key: string) => {
    const value: unknown = get(record, key);
    return typeof value === "string" || typeof value === "number"
      ? encodeURIComponent(String(value))
      : match;
  });
}

/**
 * The button as the page's record leaves it: unchanged when it does not act
 * on the record; disabled while the record loads; left out (`null`) when the
 * record is missing; its target's `{{record.X}}` filled in once loaded.
 */
export function withPageRecord<T extends RecordBoundButton>(
  button: T,
  record: PageRecord | undefined,
): T | null {
  if (!record || !isRecordBound(button)) return button;
  if (record.status === "missing") return null;
  if (record.status === "loading") return { ...button, disabled: true };
  const url = targetUrl(button.target);
  if (!url) return button;
  return {
    ...button,
    target: { ...button.target, url: fillRecordTokens(url, record.values) },
  } as T;
}
