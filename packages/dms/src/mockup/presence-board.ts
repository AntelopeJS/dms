import { Logging } from "@antelopejs/interface-core/logging";
import { type BlockAnchor, type BlockTree, viewOf } from "./anchor";
import type { JsonObject, MockupIssue, MockupName } from "./model";
import {
  type Acquisition,
  acquired,
  describe,
  joined,
  left,
  lockRefusals,
  NO_PRESENCE,
  type MockupPresence,
  type PresenceSnapshot,
  released,
  settled,
  unexpired,
  type Viewer,
  type ViewerId,
  viewerOf,
  type Who,
} from "./presence";
import { readSpecSource, type SpecDigest, withSpecLock } from "./source";
import type { MockupStore } from "./store";

/** How often the locks of a mockup with viewers are checked for expiry. */
const SWEEP_MS = 5000;

/** What a stream hears of who is on its mockup. */
export type PresenceListener = (snapshot: PresenceSnapshot) => void;

/** The time source and the sweep period, which a test sets. */
export interface PresenceClock {
  now: () => number;
  sweepMs: number;
}

/** The session of a signed-in user that opens a stream. */
export type PresenceViewer = Who & { id: ViewerId };

/** The editor that wrote the `spec.json` of digest `digest`. */
interface LastWrite {
  digest: SpecDigest;
  name: string;
}

/** One stream hearing a mockup: the viewer it is the stream of, if any, and the snapshot it last heard, as JSON. */
interface Hearer {
  viewer: ViewerId | undefined;
  sent: string;
}

/** A mockup with someone on it: its table, those who hear it, and what keeps it current. */
interface Entry {
  table: MockupPresence;
  hearers: Map<PresenceListener, Hearer>;
  timer: NodeJS.Timeout;
  unfollow?: () => void;
}

/**
 * Who is on each mockup and the blocks they hold. A mockup has an entry while
 * a stream is open on it; the entry's table changes only through the rules of
 * `presence.ts`, and every change that alters what viewers see is sent to the
 * listeners once.
 */
export class PresenceBoard {
  private readonly entries = new Map<MockupName, Entry>();
  private readonly writes = new Map<MockupName, LastWrite>();

  constructor(
    private readonly store: MockupStore,
    private readonly clock: PresenceClock = {
      now: Date.now,
      sweepMs: SWEEP_MS,
    },
  ) {}

  /**
   * Starts hearing the presence of `name`, `listener` first getting it as it
   * is, with the viewer's own lock and viewer marked as `mine`. With a
   * `viewer`, the session counts as on the mockup until the returned function
   * is called, and a viewer id that another user holds follows without
   * counting, and owns nothing. Calling the returned function again does
   * nothing.
   */
  open(
    name: MockupName,
    viewer: PresenceViewer | undefined,
    listener: PresenceListener,
  ): () => void {
    const entry = this.entries.get(name) ?? this.start(name);
    const table = viewer && joined(entry.table, viewer.id, viewer);
    if (table) this.apply(entry, table);
    const own = table && viewer?.id;
    const snapshot = describe(entry.table, own);
    entry.hearers.set(listener, {
      viewer: own,
      sent: JSON.stringify(snapshot),
    });
    listener(snapshot);
    let isOpen = true;
    return () => {
      if (!isOpen) return;
      isOpen = false;
      this.leave(name, entry, listener, own);
    };
  }

  /** The viewer `id` when it is on `name` as `userId`. */
  viewerOf(name: MockupName, id: ViewerId, userId: string): Viewer | undefined {
    const entry = this.entries.get(name);
    return entry && viewerOf(entry.table, id, userId);
  }

  /** Takes the lock on the block `anchor` names in `tree` for the viewer `id` of `userId`. */
  acquire(
    name: MockupName,
    who: { id: ViewerId; userId: string },
    anchor: BlockAnchor,
    tree: BlockTree,
  ): Acquisition {
    const entry = this.entries.get(name);
    if (!entry || !viewerOf(entry.table, who.id, who.userId)) {
      return { kind: "unknown_viewer" };
    }
    const taken = acquired(entry.table, {
      viewer: who.id,
      anchor,
      tree,
      now: this.clock.now(),
    });
    if (taken.kind === "granted") this.apply(entry, taken.table);
    return taken;
  }

  /** Frees the lock the viewer `id` of `userId` holds; false when it is not on `name`. */
  release(name: MockupName, id: ViewerId, userId: string): boolean {
    const entry = this.entries.get(name);
    if (!entry || !viewerOf(entry.table, id, userId)) return false;
    this.apply(entry, released(entry.table, id));
    return true;
  }

  /** The issues that refuse writing `next` over `file` to `name`: see {@link lockRefusals}. */
  refusals(
    name: MockupName,
    viewer: ViewerId | undefined,
    file: JsonObject,
    next: JsonObject,
  ): MockupIssue[] {
    const entry = this.entries.get(name);
    return entry
      ? lockRefusals(entry.table, { viewer, file, next, now: this.clock.now() })
      : [];
  }

  /**
   * Finds each lock of `name` again in the spec `tree` now holds, which the
   * caller read or wrote under the spec lock of the mockup.
   */
  settle(name: MockupName, tree: BlockTree | undefined): void {
    const entry = this.entries.get(name);
    if (entry) this.apply(entry, settled(entry.table, tree, this.clock.now()));
  }

  /** Remembers that the viewer `viewer` wrote the spec of `name` that has `digest`; no viewer clears it. */
  noteWrite(
    name: MockupName,
    digest: SpecDigest,
    viewer: ViewerId | undefined,
  ): void {
    const holder = viewer && this.entries.get(name)?.table.viewers.get(viewer);
    if (holder) {
      this.writes.set(name, { digest, name: holder.name });
    } else this.writes.delete(name);
  }

  /** The name of the editor whose write made the spec of `name` that has `digest`, if the last write was one. */
  writtenBy(
    name: MockupName,
    digest: SpecDigest,
  ): { name: string } | undefined {
    const written = this.writes.get(name);
    return written?.digest === digest ? { name: written.name } : undefined;
  }

  /** Stops every timer and subscription: the board hears and sends nothing more. */
  close(): void {
    for (const entry of this.entries.values()) this.stop(entry);
    this.entries.clear();
    this.writes.clear();
  }

  private leave(
    name: MockupName,
    entry: Entry,
    listener: PresenceListener,
    id: ViewerId | undefined,
  ): void {
    if (this.entries.get(name) !== entry) return;
    entry.hearers.delete(listener);
    if (id) entry.table = left(entry.table, id);
    if (!entry.hearers.size) {
      this.stop(entry);
      this.entries.delete(name);
    } else this.publish(entry);
  }

  private start(name: MockupName): Entry {
    const entry: Entry = {
      table: NO_PRESENCE,
      hearers: new Map(),
      timer: setInterval(
        () => this.apply(entry, unexpired(entry.table, this.clock.now())),
        this.clock.sweepMs,
      ),
    };
    entry.timer.unref();
    this.entries.set(name, entry);
    this.follow(name, entry).catch((error: unknown) => {
      if (this.entries.get(name) === entry) {
        Logging.Warn(
          `[DMS] mockup "${name}": presence cannot follow its spec`,
          error,
        );
      }
    });
    return entry;
  }

  private stop(entry: Entry): void {
    clearInterval(entry.timer);
    entry.unfollow?.();
    entry.unfollow = undefined;
  }

  /** Finds the locks again after each change of the spec, whoever made it. */
  private async follow(name: MockupName, entry: Entry): Promise<void> {
    const unfollow = await this.store.subscribe(name, (event) => {
      if (event.event === "state") {
        this.relocate(name, entry).catch((error: unknown) => {
          if (this.entries.get(name) === entry) {
            Logging.Warn(
              `[DMS] mockup "${name}": locks cannot be placed`,
              error,
            );
          }
        });
      }
    });
    if (this.entries.get(name) === entry) entry.unfollow = unfollow;
    else unfollow?.();
  }

  private relocate(name: MockupName, entry: Entry): Promise<void> {
    return withSpecLock(this.store.mockupsDir, name, async () => {
      if (this.entries.get(name) !== entry) return;
      const source = await readSpecSource(this.store.mockupsDir, name);
      this.apply(
        entry,
        settled(entry.table, viewOf(source?.spec), this.clock.now()),
      );
    });
  }

  private apply(entry: Entry, table: MockupPresence): void {
    if (table === entry.table) return;
    entry.table = table;
    this.publish(entry);
  }

  private publish(entry: Entry): void {
    for (const [listener, hearer] of entry.hearers) {
      const snapshot = describe(entry.table, hearer.viewer);
      const text = JSON.stringify(snapshot);
      if (text === hearer.sent) continue;
      hearer.sent = text;
      listener(snapshot);
    }
  }
}
