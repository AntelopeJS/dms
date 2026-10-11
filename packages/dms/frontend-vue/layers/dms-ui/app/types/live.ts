/**
 * Mirror of `PageLiveOptions` from `@antelopejs/interface-dms/page`: the
 * Direct / Pause valve a page declares with `live`.
 */
export interface PageLiveOptions {
  /** Shortest interval, in seconds, between two refetches of one block. */
  maxRate?: number;
}
