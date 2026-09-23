// Page-mode form sub-pages are not declared: the TableView factory registers
// one set of them per table view, deriving their id and their slug from the
// page and from the table view's own key. Two table views resolving to the same
// id or the same slug used to be silent — `publish()` disposes whatever already
// held the id, and the layout handler map keeps only the last writer for a slug
// — so a page would boot with one of its two forms quietly gone. Claims are
// checked here instead, and a collision is fatal.

import { pageLayoutHandlers, pageMetadataByFullId } from "./registry";

/** One page-mode form sub-page a table view is about to register. */
export interface FormPageRouteClaim {
  /** Permission id of the table view registering it. */
  owner: string;
  /** Page carrying the table view. */
  pageFullId: string;
  /** `new`, `edit` or `view`. */
  kind: string;
  fullId: string;
  fullSlug: string;
}

/**
 * Two page-mode table views registering the same form sub-page. Fatal: it is a
 * declaration the page cannot honour, not a component that merely fails to
 * contribute, so it is rethrown out of the hooks that isolate component errors.
 */
export class FormPageRouteConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormPageRouteConflictError";
  }
}

const claimsByFullId = new Map<string, FormPageRouteClaim>();
const claimsBySlug = new Map<string, FormPageRouteClaim>();

function conflict(
  held: FormPageRouteClaim,
  claim: FormPageRouteClaim,
  what: string,
): never {
  throw new FormPageRouteConflictError(
    `[dms] TableView "${held.owner}" and TableView "${claim.owner}" on page "${claim.pageFullId}" both register their "${claim.kind}" form page ${what}. Give one of them a URL of its own with formContainer.pages.${claim.kind}.urlSlug.`,
  );
}

/**
 * Record a form sub-page a table view is about to register, refusing one that
 * another table view already holds.
 *
 * A claim only stands in the way while the page it named is live: the same
 * table view re-registering after a hot reload re-claims what it held, and a
 * page that went away releases its id and its slug through its own teardown.
 */
export function claimFormPageRoute(claim: FormPageRouteClaim): void {
  const byId = claimsByFullId.get(claim.fullId);
  if (
    byId &&
    byId.owner !== claim.owner &&
    pageMetadataByFullId.has(claim.fullId)
  ) {
    conflict(byId, claim, `under the id "${claim.fullId}"`);
  }

  const bySlug = claimsBySlug.get(claim.fullSlug);
  if (
    bySlug &&
    bySlug.owner !== claim.owner &&
    pageLayoutHandlers.has(claim.fullSlug)
  ) {
    conflict(bySlug, claim, `at "${claim.fullSlug}"`);
  }

  if (byId && byId.fullSlug !== claim.fullSlug) {
    claimsBySlug.delete(byId.fullSlug);
  }
  claimsByFullId.set(claim.fullId, claim);
  claimsBySlug.set(claim.fullSlug, claim);
}
