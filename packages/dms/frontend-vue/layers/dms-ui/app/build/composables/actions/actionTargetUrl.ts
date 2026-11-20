import {
  namesPageValue,
  resolveLinkVariables,
  resolveTextVariables,
} from "../../utils/urlVariables";
import { currentPageUrlValues } from "../page/pageUrlValues";
import { interpolateRowText } from "#dms-core/app/utils/url-interpolation";
import { isNumber, isObject, isString } from "#dms-core/app/utils/type-check";

const RESPONSE_TOKEN = /\{\{\s*response\.([^{}\s]+)\s*\}\}/g;
const DASHBOARD_PATH = /^\/(?![/\\])/;

/** Fills page URL tokens at execution time, then fills row tokens. */
export function targetUrl(url: string, rowData?: Data): string {
  const withPageValues = namesPageValue(url)
    ? resolveLinkVariables(url, currentPageUrlValues())
    : url;
  return rowData ? interpolateUrl(withPageValues, rowData) : withPageValues;
}

/** Fills file-name tokens as text, falling back to the server's name. */
export function downloadTargetFilename(
  filename: string | undefined,
  rowData?: Data,
): string | undefined {
  if (!filename) return undefined;
  const withRow = rowData ? interpolateRowText(filename, rowData) : filename;
  return resolveTextVariables(withRow, currentPageUrlValues());
}

function responseField(
  response: Parameters<typeof isObject>[0],
  path: string,
): string | undefined {
  const value = path
    .split(".")
    .reduce<
      Parameters<typeof isObject>[0]
    >((node, key) => (isObject(node) && Object.hasOwn(node, key) ? node[key] : undefined), response);
  if (isNumber(value)) return String(value);
  return isString(value) && value !== "" ? value : undefined;
}

/**
 * The dashboard path an `api` target's `redirect` names once its request
 * answered `response`: its `{{response.<field>}}` tokens filled with encoded
 * values, then its page and row tokens. `undefined`, with a console warning,
 * when the response lacks a string or number at a field it names, or when the
 * result is not a path of the dashboard.
 */
export function apiRedirectPath(
  redirect: string,
  response: Parameters<typeof isObject>[0],
  rowData?: Data,
): string | undefined {
  const missing: string[] = [];
  const withResponse = redirect.replace(RESPONSE_TOKEN, (_, path: string) => {
    const value = responseField(response, path);
    if (value === undefined) missing.push(path);
    return encodeURIComponent(value ?? "");
  });
  if (missing.length > 0) {
    console.warn(
      `[dms] The response has no ${missing.join(", ")} for the redirect "${redirect}": staying on the page.`,
    );
    return undefined;
  }
  const path = targetUrl(withResponse, rowData);
  if (DASHBOARD_PATH.test(path)) return path;
  console.warn(
    `[dms] The redirect "${redirect}" is not a path of the dashboard: staying on the page.`,
  );
  return undefined;
}
