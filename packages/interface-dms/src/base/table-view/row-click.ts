/**
 * What runs a row's click action (its `isDefault` custom action, else `edit`
 * or `details`): a double-click (`"double"`, the default), a single click
 * (`"single"`), for a list read row after row in a side panel, or nothing
 * (`"none"`): the row opens from its actions only, as a table edited cell by
 * cell may want. A single click on a control of the row (a button, a link, a
 * checkbox) or one ending a text selection runs nothing.
 */
export type TableViewRowClick = "single" | "double" | "none";
