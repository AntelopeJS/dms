import { PageDeclarationConflictError } from "./declaration-conflict";

/**
 * Two page-mode table views registering the same form sub-page. Fatal: it is a
 * declaration the page cannot honour, not a component that merely fails to
 * contribute.
 */
export class FormPageRouteConflictError extends PageDeclarationConflictError {}
