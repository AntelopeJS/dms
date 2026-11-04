import type { WatchAction } from "../watch-actions";
import type { MaybePromise } from "../types";
import { readWatchActions } from "./component-watches";

/** @internal The callback `ComponentBuilder.watchFilter` installs. */
export type WatchFilter = (
  permissions: Set<string>,
  watches: WatchAction[],
  permissionId: string,
) => MaybePromise<WatchAction[]>;

/**
 * `options` with its `watchActions` narrowed by `filter`; untouched when there
 * is no filter or the options declare no watch.
 *
 * @internal
 */
export async function applyWatchFilter<O, R>(
  owner: R,
  filter:
    | ((this: R, ...args: Parameters<WatchFilter>) => ReturnType<WatchFilter>)
    | undefined,
  permissions: Set<string>,
  options: O,
  permissionId: string,
): Promise<O> {
  if (!options || !filter) {
    return options;
  }
  const watches = readWatchActions(options);
  if (watches.length === 0) {
    return options;
  }
  const filtered = await filter.call(owner, permissions, watches, permissionId);
  return { ...options, watchActions: filtered };
}
