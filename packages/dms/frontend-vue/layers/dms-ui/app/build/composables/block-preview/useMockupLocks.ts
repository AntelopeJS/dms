import {
  computed,
  onBeforeUnmount,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import { mockupEndpoint } from "../../utils/mockup";
import {
  blockerOf,
  holdersOf,
  type MockupLock,
  type MockupPresence,
} from "../../utils/mockupPresence";
import type { MockupSpecDocument } from "../../utils/mockupSpec";

type AuthFetch = ReturnType<typeof useAuthFetch>["$authFetch"];

/** How soon an edit renews the lock again: well inside the 2 minutes the backend lets a lock idle. */
export const MOCKUP_LOCK_RENEW_MS = 15_000;

interface MockupLocksOptions {
  name: string;
  authFetch: AuthFetch;
  /** This session's id on the stream. */
  viewer: string;
  presence: Readonly<Ref<MockupPresence>>;
  isConnected: Readonly<Ref<boolean>>;
  /** The spec as the editor holds it: each change of it is an edit, or someone else's. */
  spec: Readonly<Ref<MockupSpecDocument | undefined>>;
  /** The pointer of the selected block. */
  selection: Readonly<Ref<string | undefined>>;
  /** Whether an edit is not written yet: a lock changes hands once it is. */
  isPending: Readonly<Ref<boolean>>;
  /** Set to the pointer of the block this session holds, and to undefined while it holds none. */
  held: Ref<string | undefined>;
}

/** What the editing panels read of the locks. */
export interface MockupLocks {
  /** The lock of another viewer that keeps the selected block from being edited. */
  blocker: ComputedRef<MockupLock | undefined>;
  /** The name of whoever holds each block other than this session's, by pointer. */
  holders: ComputedRef<ReadonlyMap<string, string>>;
  /** Whether another viewer holds the block at `pointer`, one it sits in or one inside it. */
  isHeld: (pointer: string) => boolean;
}

function ignoreRejection(task: Promise<void>): void {
  task.catch(() => undefined);
}

/**
 * Holds the lock of the block selected in the editor, so that no other viewer
 * edits it meanwhile. The lock is taken when a block is selected that no one
 * else holds, kept while the viewer edits it, renewed by the edits at most
 * once every {@link MOCKUP_LOCK_RENEW_MS}, and freed once the viewer selects
 * another block or none, after the last edit is written. It is taken again when
 * the stream reopens, the backend having freed it with the stream, and freed
 * when the editor closes. A block someone else holds is never locked: it shows
 * as the `blocker` of the selection.
 */
export function useMockupLocks(options: MockupLocksOptions): MockupLocks {
  const endpoint = mockupEndpoint(options.name, "/locks");
  const blocker = computed(() =>
    options.selection.value
      ? blockerOf(options.presence.value, options.selection.value)
      : undefined,
  );
  const holders = computed(() => holdersOf(options.presence.value));
  let lastTaken = 0;
  let isRunning = false;
  let isDue = false;

  async function take(pointer: string): Promise<void> {
    try {
      await options.authFetch(endpoint, {
        method: "PUT",
        body: { viewer: options.viewer, path: pointer },
      });
      options.held.value = pointer;
      lastTaken = Date.now();
    } catch {
      options.held.value = undefined;
    }
  }

  async function free(): Promise<void> {
    options.held.value = undefined;
    await options
      .authFetch(`${endpoint}?viewer=${encodeURIComponent(options.viewer)}`, {
        method: "DELETE",
      })
      .catch(() => undefined);
  }

  async function step(): Promise<void> {
    if (!options.isConnected.value) {
      options.held.value = undefined;
      return;
    }
    if (options.isPending.value) return;
    const wanted = blocker.value ? undefined : options.selection.value;
    if (wanted === options.held.value) return;
    if (wanted === undefined) await free();
    else await take(wanted);
  }

  async function run(): Promise<void> {
    isRunning = true;
    try {
      do {
        isDue = false;
        await step();
      } while (isDue);
    } finally {
      isRunning = false;
    }
  }

  function sync(): void {
    if (isRunning) isDue = true;
    else ignoreRejection(run());
  }

  watch(
    [
      options.selection,
      options.isPending,
      options.isConnected,
      () => blocker.value !== undefined,
    ],
    sync,
  );
  watch(options.spec, () => {
    const pointer = options.held.value;
    if (
      pointer !== undefined &&
      Date.now() - lastTaken >= MOCKUP_LOCK_RENEW_MS
    ) {
      ignoreRejection(take(pointer));
    }
  });
  onBeforeUnmount(() => {
    if (options.held.value !== undefined) ignoreRejection(free());
  });

  return {
    blocker,
    holders,
    isHeld: (pointer) =>
      blockerOf(options.presence.value, pointer) !== undefined,
  };
}
