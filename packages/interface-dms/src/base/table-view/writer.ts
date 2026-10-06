// A data controller has one writing TableView: its permission guards the
// writes of the data routes, its row rules apply to them, and its forms are the
// ones whose files those routes accept. Read-only TableViews may share the
// controller. A second writing one is a declaration the routes cannot honour --
// whose permission, whose rules? -- so its page is refused when it registers.

import { PageDeclarationConflictError } from "../../page/declaration-conflict";

/**
 * Two TableViews with write actions mounted over the same data controller.
 * Thrown while the second one's page registers, which fails it.
 */
export class WritingTableViewConflictError extends PageDeclarationConflictError {}
