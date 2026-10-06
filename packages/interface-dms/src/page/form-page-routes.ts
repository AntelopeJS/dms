// Page-mode form sub-pages are not declared: the TableView factory registers
// one set of them per table view, deriving their id and their slug from the
// page and from the table view's own key. Two table views resolving to the same
// id or the same slug used to be silent — `publish()` disposes whatever already
// held the id, and the layout handler map keeps only the last writer for a slug
// — so a page would boot with one of its two forms quietly gone. Claims are
// checked here instead, and a collision is fatal.

import { PageDeclarationConflictError } from "./declaration-conflict";

/**
 * Two page-mode table views registering the same form sub-page. Fatal: it is a
 * declaration the page cannot honour, not a component that merely fails to
 * contribute.
 */
export class FormPageRouteConflictError extends PageDeclarationConflictError {}
