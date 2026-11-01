import { PageDeclarationConflictError } from "../../page/declaration-conflict";

/**
 * Two TableViews with write actions mounted over the same data controller.
 * Thrown while the second one's page registers, which fails it.
 */
export class WritingTableViewConflictError extends PageDeclarationConflictError {}
