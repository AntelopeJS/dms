import type { CustomButton, CustomButtonSerialized } from "./custom-button";
import type {
  RecordCondition,
  RecordUnavailableCondition,
} from "./record-condition";

/**
 * What an action of a record adds to a button: its availability read on the
 * record the page shows, where it is drawn, and a line explaining it.
 */
export interface RecordActionFields {
  /**
   * Shows the action only while it holds on the record. Until the record has
   * loaded — and on a page that loads none — an action with `when` is held
   * back.
   */
  when?: RecordCondition;
  /**
   * Disables the action, with the reason, while one of them holds on the
   * record; the first that holds gives the reason. A button the server's
   * `availability` already disabled stays disabled with its own reason.
   */
  unavailableWhen?: RecordUnavailableCondition | RecordUnavailableCondition[];
  /**
   * In the page header: draws the action in its "More actions" menu instead
   * of as a button, under the group it names. Groups follow the order their
   * first action is declared in, set apart by a separator — give the
   * destructive actions a group of their own (`"danger"`), last. Ignored by
   * an `ActionList`, which lists every action.
   */
  menuGroup?: string;
  /**
   * What the action does, under its label: in an `ActionList` row, and in
   * the header's menu. A disabled action shows its reason instead.
   */
  description?: string;
}

/**
 * An action on the record a page shows: a header button
 * (`DefaultLayout({ headerActions })`) or a row of an `ActionList`. The same
 * button as a table's toolbar — its target, confirmation, permission and
 * server-side `availability` — whose availability can also follow the record.
 *
 * Its target and confirmation read the record: its fields fill `{field}` in
 * an URL, a confirmation's texts and its `from` (`{id}` being its `_id`), and
 * a drawer or modal receives it as `rowData`. `{{params.X}}` and
 * `{{query.X}}` are filled from the page URL first.
 */
export interface RecordAction extends CustomButton, RecordActionFields {}

/** An action of a record as the client receives it. */
export interface RecordActionSerialized
  extends CustomButtonSerialized, RecordActionFields {}
