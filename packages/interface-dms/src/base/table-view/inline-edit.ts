/**
 * How an editable cell shows it is one. `hover`: its value, framed as its
 * input while hovered, a click opening the input. `always`: the input
 * itself, typed into at once, saved when left or on Enter.
 */
export type TableViewInlineEditInputs = "hover" | "always";

/**
 * Which cells a table view edits in place (see
 * {@link TableViewOptions.inlineEdit}), each saved at once by a partial edit
 * (`PUT <location>/edit` with that field alone): a click on a cell turns it
 * into its field's input, Enter or leaving the cell saves, Esc cancels; a
 * pick in a select or a date picker saves, and a switch or a checkbox saves
 * as it toggles, without opening anything. The click edits the cell and does
 * not open the row; a click anywhere else on the row still does.
 *
 * A cell is edited in place when its column is listed, is in the edit form
 * and writable there, is not localized, and its input is a simple one: a
 * text, email, phone or URL, a number, price or percentage, a switch or
 * checkbox, a single select or segmented select, a single date, a time or a
 * colour. Any other column (a relation, rich text, code, files, images, a
 * list, an address, key-values, tags) keeps its display and is edited
 * through the edit form. A row the `edit` action's `rule` refuses keeps its
 * display, and so does a field its `disabledWhen` makes read-only or its
 * `visibleWhen` hides, evaluated on the listed row.
 *
 * On the grid and the `grouped` display; the board and the cards are left as
 * they are. Needs the `edit` action: a caller without it gets the read-only
 * grid. Ignored by `TableView.fromSource`, which has no edit route.
 *
 * An inline edit sends the field alone, without the edit form around it:
 * what `forms.edit` declares on the form's builder (its watches setting
 * another field) and the form's own submit defaults do not run. A rule the
 * data must keep belongs to the column (`disabledWhen`, `visibleWhen`) or to
 * a guard, which the edit route enforces either way.
 */
export interface TableViewInlineEditOptions {
  /**
   * The columns edited in place, by field id, among those that can be. Left
   * out, every column that can be.
   * @example ["price", "stock", "active"]
   */
  columns?: string[];
  /** Defaults to `hover`. See {@link TableViewInlineEditInputs}. */
  inputs?: TableViewInlineEditInputs;
}
