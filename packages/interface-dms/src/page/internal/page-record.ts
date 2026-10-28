import { Logging } from "@antelopejs/interface-core/logging";
import type {
  DefaultLayoutSerializedOptions,
  PageHeaderButtonDeclared,
} from "../../base/internal/layouts";
import type { ComponentFilterContext, ComponentInfo } from "../../component";

const RECORD_TOKEN = /\{\{\s*record\.([\w.-]+)\s*\}\}/g;
const NAMES_RECORD = /\{\{\s*record\./;
const PATH_SEPARATOR = ".";

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- This alias appears in published declarations and represents the loader's arbitrary record fields; preserving it avoids changing wildcard consumers' contracts.
type PageRecord = Readonly<Record<string, unknown>>;

const targetUrl = (
  target:
    | (NonNullable<PageHeaderButtonDeclared["target"]> & { url?: unknown })
    | undefined,
): string | undefined => {
  const url = target?.url;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Only string URL properties participate in record interpolation; other target variants remain untouched.
  return typeof url === "string" ? url : undefined;
};

function valueAt(record: PageRecord, path: string): PageRecord[string] {
  // SAFETY: The reducer reads keys only after checking a non-null object; PageRecord imposes no constraints on those values.
  return path.split(PATH_SEPARATOR).reduce<unknown>(
    (value, key) =>
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Record paths traverse arbitrary loader fields and stop at nonobjects without imposing a shared record schema.
      value && typeof value === "object"
        ? (value as PageRecord)[key]
        : undefined,
    record,
  );
}

/**
 * How the page's record was read for one request: `found`, `missing` when its
 * loader answered none (not found, not the caller's), `error` when it threw.
 * The frontend takes a record going from `found` to `missing` for one that
 * was deleted.
 */
export type PageRecordStatus = "found" | "missing" | "error";

/** What reading the page's record answered. */
export interface PageRecordRead {
  record?: PageRecord;
  status: PageRecordStatus;
}

/**
 * The record the page's layout reads for one request, `undefined` when the
 * layout declares none. A loader that throws counts as finding none, with
 * the `error` status: the buttons acting on the record are left out, and the
 * page still loads.
 *
 * @internal
 */
export async function readPageRecord(
  layout: ComponentInfo | undefined,
  context: ComponentFilterContext,
): Promise<PageRecordRead | undefined> {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- ComponentInfo erases layout-specific options; this published helper trusts the layout's optional record loader without validating unrelated layout shapes.
  const options = layout?.options as DefaultLayoutSerializedOptions | undefined;
  if (!options?.record) return undefined;
  try {
    const record = (await options.record(context)) ?? undefined;
    return record ? { record, status: "found" } : { status: "missing" };
  } catch (error) {
    Logging.Error("[dms] the record of the page could not be read:", error);
    return { status: "error" };
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
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The record loader owns its schema; the URL interpolation contract encodes only string and number leaves.
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
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- targetUrl checked only the URL property, not the entire action-target union; keep the existing target spread and URL replacement without changing that public union.
    target: {
      ...button.target,
      url: fillRecordTokens(url, record),
    } as PageHeaderButtonDeclared["target"],
  };
}
