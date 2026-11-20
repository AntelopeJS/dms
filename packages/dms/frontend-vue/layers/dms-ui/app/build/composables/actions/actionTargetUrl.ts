import {
  hasUrlVariables,
  namesPageValue,
  resolveLinkVariables,
  resolveTextVariables,
} from "../../utils/urlVariables";
import type { JsonObject } from "../../utils/json";
import { currentPageUrlValues } from "../page/pageUrlValues";
import { interpolateRowText } from "#dms-core/app/utils/url-interpolation";

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

/**
 * The page an `api` target's `redirect` names once its request answered
 * `response`: its page and `{{response.X}}` tokens filled as a form's
 * `redirectOnSuccess` is, then its row tokens. `undefined`, with a console
 * warning, while a token is left, such as a field the response lacks.
 */
export function apiRedirectPath(
  redirect: string,
  response: JsonObject | undefined,
  rowData?: Data,
): string | undefined {
  const withResponse = resolveLinkVariables(redirect, {
    ...currentPageUrlValues(),
    response,
  });
  const path = rowData ? interpolateUrl(withResponse, rowData) : withResponse;
  if (!hasUrlVariables(path)) return path;
  console.warn(
    `[dms] The redirect "${redirect}" names a value the response lacks: staying on the page.`,
  );
  return undefined;
}
