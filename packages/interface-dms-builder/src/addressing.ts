/** A page's unique route string, e.g. `/settings/profile`. */
export type PageRef = string;

/**
 * A block's address within a page: `<pageRef>#<name>[/<childId>...]`,
 * e.g. `/dashboard#kpis/row/revenue`.
 */
export type BlockPath = string;

/** A category's stable id/slug. */
export type CategoryRef = string;
