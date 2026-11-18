import type {
  MappedResource,
  TableViewSettings,
} from "@antelopejs/interface-dms-builder";

/**
 * The order a mapped table's page takes unless the mapping sets one. A page without an order
 * sorts as 0, so a dashboard the assistant creates in the connection's category comes before
 * the tables whether or not it sets an order, and a page placed by hand may go between.
 */
export const MAPPED_PAGE_ORDER = 100;

/** What a mapping sets on a table's page beyond its title: the menu entry and the table's options. */
export interface PlannedPage {
  /** The category the page is written in, or moved to; left out, the connection's for a new page and where it is for one mapped before. */
  category?: string;
  icon?: string;
  description?: string;
  /** Left out, a new page takes {@link MAPPED_PAGE_ORDER} and a page mapped before keeps its own. */
  order?: number;
  tableOptions?: TableViewSettings;
}

export function plannedPage(resource: MappedResource): PlannedPage {
  return {
    category: resource.category,
    icon: resource.icon,
    description: resource.description,
    order: resource.order,
    tableOptions: resource.tableOptions,
  };
}
