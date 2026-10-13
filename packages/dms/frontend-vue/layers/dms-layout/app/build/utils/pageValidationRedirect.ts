import { parseURL, withoutTrailingSlash } from "ufo";
import {
  type ReplaceUrlVariablesContext,
  resolveLinkVariables,
} from "#dms-ui/app/build/utils/urlVariables";
import type { PageValidation } from "../../types/page";

const ROOT_PATH = "/";

function normalizePath(path: string): string {
  return withoutTrailingSlash(path) || ROOT_PATH;
}

/**
 * Where a page that failed its validation sends the user: its `redirectTo`
 * with the page URL's tokens filled, or `undefined` for the not-found error.
 * A target on the page's own path would fail the same way again, so it is
 * refused as well.
 */
export function pageValidationRedirect(
  validation: PageValidation | undefined,
  currentPath: string,
  context: ReplaceUrlVariablesContext,
): string | undefined {
  if (!validation?.redirectTo) return undefined;
  const target = resolveLinkVariables(validation.redirectTo, context);
  const targetPath = parseURL(target).pathname;
  if (!targetPath || normalizePath(targetPath) === normalizePath(currentPath)) {
    return undefined;
  }
  return target;
}
