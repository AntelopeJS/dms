import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  type BlockAnchor,
  type BlockTree,
  locateBlock,
  type NodeSite,
  viewOf,
} from "./anchor";
import type { JsonObject, MockupIssue } from "./model";
import { specValueAt } from "./model";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const IDLE_MINUTES = 2;

/** How long a lock outlives its last acquire or renewal. */
export const LOCK_IDLE_MS = IDLE_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;

/** What a browser names itself with on `/events`: a UUID it makes once per session. */
export const viewerIdSchema = z.string().uuid().brand("Viewer");
export type ViewerId = z.infer<typeof viewerIdSchema>;

/** The viewer `raw` names, or undefined when `raw` is not a viewer id. */
export function parseViewerId(
  raw: string | null | undefined,
): ViewerId | undefined {
  const parsed = viewerIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** The signed-in user a viewer is: the id its locks answer to, and the name others see. */
export interface Who {
  userId: string;
  name: string;
}

/** One browser session on a mockup: it exists while at least one of its event streams is open. */
export interface Viewer extends Who {
  id: ViewerId;
  streams: number;
}

/**
 * The block a viewer is editing: found again through `anchor` after every
 * spec change, `site` being where it was last found.
 */
interface NodeLock {
  anchor: BlockAnchor;
  site: NodeSite;
  viewer: ViewerId;
  /** The clock reading from which the lock no longer holds. */
  expiresAt: number;
}

/** Who is on a mockup and what each holds: a viewer holds at most one lock. */
export interface MockupPresence {
  viewers: ReadonlyMap<ViewerId, Viewer>;
  locks: readonly NodeLock[];
}

/** What the `presence` event sends: the viewers and the blocks held, with where each block is now. */
export interface PresenceSnapshot {
  viewers: Array<{ viewer: ViewerId; name: string }>;
  locks: Array<{ viewer: ViewerId; name: string; page: string; path: string }>;
}

/** A mockup nobody is on. */
export const NO_PRESENCE: MockupPresence = { viewers: new Map(), locks: [] };

/** What taking a lock answers. */
export type Acquisition =
  | { kind: "granted"; table: MockupPresence }
  | { kind: "held"; by: string }
  | { kind: "unknown_viewer" }
  | { kind: "no_node" };

function isWithin(pointer: string, ancestor: string): boolean {
  return pointer === ancestor || pointer.startsWith(`${ancestor}/`);
}

function overlap(left: string, right: string): boolean {
  return isWithin(left, right) || isWithin(right, left);
}

/**
 * `table` with one more open stream of the viewer `id`. Undefined when `id`
 * is another user's: a viewer answers to the one user who first named it.
 */
export function joined(
  table: MockupPresence,
  id: ViewerId,
  who: Who,
): MockupPresence | undefined {
  const known = table.viewers.get(id);
  if (known && known.userId !== who.userId) return undefined;
  const viewers = new Map(table.viewers);
  viewers.set(id, { id, ...who, streams: (known?.streams ?? 0) + 1 });
  return { ...table, viewers };
}

/** `table` once one stream of the viewer `id` closed: the last one takes the viewer and its lock with it. */
export function left(table: MockupPresence, id: ViewerId): MockupPresence {
  const known = table.viewers.get(id);
  if (!known) return table;
  const viewers = new Map(table.viewers);
  if (known.streams > 1) {
    viewers.set(id, { ...known, streams: known.streams - 1 });
    return { ...table, viewers };
  }
  viewers.delete(id);
  return { viewers, locks: table.locks.filter((lock) => lock.viewer !== id) };
}

/** The viewer `id` when it is registered to `userId`. */
export function viewerOf(
  table: MockupPresence,
  id: ViewerId,
  userId: string,
): Viewer | undefined {
  const known = table.viewers.get(id);
  return known?.userId === userId ? known : undefined;
}

function sameLocks(
  left: readonly NodeLock[],
  right: readonly NodeLock[],
): boolean {
  return (
    left.length === right.length &&
    left.every((lock, index) => lock === right[index])
  );
}

/** `table` without the locks that ran out at `now`; the table itself when none did. */
export function unexpired(table: MockupPresence, now: number): MockupPresence {
  const locks = table.locks.filter((lock) => lock.expiresAt > now);
  return sameLocks(locks, table.locks) ? table : { ...table, locks };
}

/**
 * `table` once the spec is `tree`: each lock is found again where its block
 * is now, and one whose block is gone, or ran out at `now`, is freed. Without
 * a `tree`, the spec being unreadable, only the expiry frees.
 */
export function settled(
  table: MockupPresence,
  tree: BlockTree | undefined,
  now: number,
): MockupPresence {
  const live = unexpired(table, now);
  if (!tree) return live;
  const locks = live.locks.flatMap((lock) => {
    const site = locateBlock(tree, lock.anchor);
    if (!site) return [];
    return lock.site.page === site.page && lock.site.path === site.path
      ? [lock]
      : [{ ...lock, site }];
  });
  return sameLocks(locks, live.locks) ? live : { ...live, locks };
}

/**
 * Takes the lock on the block `anchor` names in `tree` for `viewer`, who then
 * holds no other. Refused while another viewer holds that block, one of its
 * ancestors or one of its descendants. Holding it already renews it.
 */
export function acquired(
  table: MockupPresence,
  request: {
    viewer: ViewerId;
    anchor: BlockAnchor;
    tree: BlockTree;
    now: number;
  },
): Acquisition {
  const { viewer, anchor, tree, now } = request;
  if (!table.viewers.has(viewer)) return { kind: "unknown_viewer" };
  const site = locateBlock(tree, anchor);
  if (!site) return { kind: "no_node" };
  const current = settled(table, tree, now);
  const blocker = current.locks.find(
    (lock) => lock.viewer !== viewer && overlap(lock.site.path, site.path),
  );
  if (blocker) {
    return { kind: "held", by: table.viewers.get(blocker.viewer)?.name ?? "" };
  }
  const own: NodeLock = {
    anchor,
    site,
    viewer,
    expiresAt: now + LOCK_IDLE_MS,
  };
  return {
    kind: "granted",
    table: {
      ...current,
      locks: [...current.locks.filter((lock) => lock.viewer !== viewer), own],
    },
  };
}

/** `table` without the lock `viewer` holds. */
export function released(
  table: MockupPresence,
  viewer: ViewerId,
): MockupPresence {
  const locks = table.locks.filter((lock) => lock.viewer !== viewer);
  return sameLocks(locks, table.locks) ? table : { ...table, locks };
}

/** What a `presence` event sends for `table`. */
export function describe(table: MockupPresence): PresenceSnapshot {
  return {
    viewers: [...table.viewers.values()].map(({ id, name }) => ({
      viewer: id,
      name,
    })),
    locks: table.locks.flatMap((lock) => {
      const holder = table.viewers.get(lock.viewer);
      return holder
        ? [
            {
              viewer: lock.viewer,
              name: holder.name,
              page: lock.site.page,
              path: lock.site.path,
            },
          ]
        : [];
    }),
  };
}

/**
 * The issues that refuse the write of `next` over `file`: one for each block
 * another viewer holds, which is gone from `next` or differs there. A write
 * naming no viewer is refused for every block held.
 */
export function lockRefusals(
  table: MockupPresence,
  write: {
    viewer: ViewerId | undefined;
    file: JsonObject;
    next: JsonObject;
    now: number;
  },
): MockupIssue[] {
  const { viewer, file, next, now } = write;
  const before = viewOf(file);
  const after = viewOf(next);
  return unexpired(table, now).locks.flatMap((lock) => {
    const at = before && locateBlock(before, lock.anchor);
    if (lock.viewer === viewer || !at) return [];
    const into = after && locateBlock(after, lock.anchor);
    const kept = into && specValueAt(next, into.path);
    if (
      kept !== undefined &&
      isDeepStrictEqual(kept, specValueAt(file, at.path))
    ) {
      return [];
    }
    const name = table.viewers.get(lock.viewer)?.name ?? "";
    return [{ path: at.path, message: `${name} is editing this block` }];
  });
}
