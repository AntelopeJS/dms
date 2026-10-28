import {
  namesPageValue,
  resolveLinkVariables,
  resolveTextVariables,
} from "../../utils/urlVariables";
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
