import { Logging } from "@antelopejs/interface-core/logging";
import type {
  DefaultLayoutSerializedOptions,
  PageHeaderButtonDeclared,
} from "../../base/internal/layouts";
import type { ComponentFilterContext, ComponentInfo } from "../../component";

// The record a page shows (`DefaultLayout({ record })`), read with its layout:
// `{{record.X}}` in a header button's target, a button acting on it.

const RECORD_TOKEN = /\{\{\s*record\.([\w.-]+)\s*\}\}/g;
const NAMES_RECORD = /\{\{\s*record\./;
const PATH_SEPARATOR = ".";

type PageRecord = Readonly<Record<string, unknown>>;

const targetUrl = (target: unknown): string | undefined => {
  const url = (target as { url?: unknown } | undefined)?.url;
  return typeof url === "string" ? url : undefined;
};

function valueAt(record: PageRecord, path: string): unknown {
  return path
    .split(PATH_SEPARATOR)
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined,
      record,
    );
}

/**
 * The record the page's layout reads for one request, `undefined` when the
 * layout declares none or its loader finds none. A loader that throws counts
 * as finding none: the buttons acting on the record are left out, and the
 * page still loads.
 *
 * @internal
 */
export async function readPageRecord(
  layout: ComponentInfo | undefined,
  context: ComponentFilterContext,
): Promise<PageRecord | undefined> {
  const options = layout?.options as DefaultLayoutSerializedOptions | undefined;
  if (!options?.record) return undefined;
  try {
    return (await options.record(context)) ?? undefined;
  } catch (error) {
    Logging.Error("[dms] the record of the page could not be read:", error);
    return undefined;
  }
}

/** Whether a header button acts on the page's record. */
function isRecordBound(button: PageHeaderButtonDeclared): boolean {
  if (button.requiresRecord) return true;
  const url = targetUrl(button.target);
  return !!url && NAMES_RECORD.test(url);
}

/**
 * A URL with its `{{record.X}}` tokens filled in, each value percent-encoded
 * (an address is one query value). A token the record has no value for is
 * left as written.
 */
function fillRecordTokens(url: string, record: PageRecord): string {
  return url.replace(RECORD_TOKEN, (match, path: string) => {
    const value = valueAt(record, path);
    return typeof value === "string" || typeof value === "number"
      ? encodeURIComponent(String(value))
      : match;
  });
}

/**
 * A header button as the page's record leaves it: unchanged when the layout
 * reads no record or the button does not act on it, left out (`undefined`)
 * when the record was not found, its target's `{{record.X}}` filled in
 * otherwise.
 *
 * @internal
 */
export function withPageRecord(
  button: PageHeaderButtonDeclared,
  declaresRecord: boolean,
  record: PageRecord | undefined,
): PageHeaderButtonDeclared | undefined {
  if (!declaresRecord || !isRecordBound(button)) return button;
  if (!record) return undefined;
  const url = targetUrl(button.target);
  if (!url) return button;
  return {
    ...button,
    target: {
      ...button.target,
      url: fillRecordTokens(url, record),
    } as PageHeaderButtonDeclared["target"],
  };
}
