/** @internal @packageDocumentation */

/**
 * What makes a `liveHold` table hold its rows while its live page is in
 * Direct: the table alone keeps them and counts its events into the
 * "N new · Show" banner, the other blocks of the page staying live. The
 * banner says why the table holds ("Table on hold · search active"). It reads
 * the rows once again when the hold ends, if it missed any.
 */
export interface TableViewLiveHoldOptions {
  /**
   * Whether the table holds its rows while they are on screen or scrolled
   * past. `true`: a new row landing at the top would push down the rows the
   * user reads, so the new ones wait behind the "N new · Show" pill. `false`:
   * the table follows its feed while its page is in Direct, holding only while
   * paused or for a reason it names. It has no default, so each table says
   * which one it wants.
   */
  whileOnScreen: boolean;
  /**
   * While one of its rows is open in a row action's side panel or drawer.
   * Defaults to false.
   */
  whileRowOpen?: boolean;
  /** While the user has scrolled its first row out of view. Defaults to false. */
  whileScrolled?: boolean;
  /** While the user's search narrows the rows. Defaults to false. */
  whileSearching?: boolean;
  /**
   * While the user sorts the rows otherwise than by the table's `defaultSort`
   * (the newest first, for a log): new rows would land anywhere among them.
   * Defaults to false.
   */
  whileSorted?: boolean;
  /**
   * What the strip calls the new rows, given `{count}`, as the `LiveToggle`'s
   * own `missedLabel`: an i18n key prefixed with `$`
   * (`"$api.live.new_requests"`, "12 new requests"), or a text. While the
   * page is paused, the strip adds the breakdown a component gave with
   * `usePageLive().setMissedDetail` ("12 new requests · 2 in 5xx").
   * Defaults to "N new".
   */
  missedLabel?: string;
}
