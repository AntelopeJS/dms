import {
  computed,
  onBeforeUnmount,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import type { JsonValue } from "../../../../../dms-core/app/types/json";
import { isString } from "../../../../../dms-core/app/utils/type-check";
import { fetchStatus } from "../../utils/fetchStatus";
import { isObjectValue } from "../../utils/json";
import { mockupEndpoint } from "../../utils/mockup";
import {
  blockerOf,
  holdersOf,
  type MockupLock,
  type MockupPresence,
} from "../../utils/mockupPresence";
import {
  nodeAt,
  pointerOfId,
  type MockupSpecDocument,
} from "../../utils/mockupSpec";
import type { MockupOwnEdit } from "./useMockupSpec";

type AuthFetch = ReturnType<typeof useAuthFetch>["$authFetch"];

/** How soon an edit renews the lock again: well inside the 2 minutes the backend lets a lock idle. */
export const MOCKUP_LOCK_RENEW_MS = 15_000;

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

interface MockupLocksOptions {
  name: string;
  authFetch: AuthFetch;
  /** This session's id on the stream. */
  viewer: string;
  presence: Readonly<Ref<MockupPresence>>;
  isConnected: Readonly<Ref<boolean>>;
  /** The last change this session made to its own spec: only its own edits keep the lock alive. */
  ownEdit: Readonly<Ref<MockupOwnEdit | undefined>>;
  /** The pointer of the selected block. */
  selection: Readonly<Ref<string | undefined>>;
  /** Whether an edit is not written yet: a lock changes hands once it is. */
  isPending: Readonly<Ref<boolean>>;
  /** The spec the editor shows: it is the file's once no edit is pending, which is when the selection is read in it. */
  spec: Readonly<Ref<MockupSpecDocument | undefined>>;
  /** The digest of the file the spec shown was read from, once no edit is pending: a take names it, so a write that landed since cannot move its pointer to another block. */
  digest: Readonly<Ref<string | undefined>>;
  /**
   * Set to the id of the block this session holds, which the backend answers
   * when it grants the lock, and to undefined while it holds none. This is the
   * only writer: the spec editor finds the block by the id wherever it moves.
   */
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

/** The id of the block a granted lock names; undefined when the answer names none. */
function lockedId(answer: JsonValue | undefined): string | undefined {
  return isObjectValue(answer) && isString(answer.id) ? answer.id : undefined;
}

/** Asks for the lock on the block at `pointer` in the file of the digest the editor holds; the id the backend answers, undefined when it refuses. */
async function requestLock(
  options: MockupLocksOptions,
  endpoint: string,
  pointer: string,
): Promise<string | undefined> {
  return lockedId(
    await options
      .authFetch<JsonValue>(endpoint, {
        method: "PUT",
        body: {
          viewer: options.viewer,
          path: pointer,
          digest: options.digest.value,
        },
      })
      .catch(() => undefined),
  );
}

/** Where the block `id` is in `spec` and what it holds, as one text; undefined when no block or several carry the id. */
function blockIn(spec: MockupSpecDocument, id: string): string | undefined {
  const pointer = pointerOfId(spec, id);
  const node = pointer === undefined ? undefined : nodeAt(spec, pointer);
  return node && JSON.stringify([pointer, node]);
}

/** Whether the HTTP status of a failed renewal says the backend holds no lock for the viewer: it ran out, or the viewer has no stream open. */
function isLockGone(status: number | undefined): boolean {
  return status === HTTP_NOT_FOUND || status === HTTP_FORBIDDEN;
}

/** Whether `edit` changed the block `id`, or moved it. */
function changesBlock(edit: MockupOwnEdit, id: string): boolean {
  return blockIn(edit.previous, id) !== blockIn(edit.next, id);
}

/** Whether the block `id` is at `pointer` in `spec`: the held block went there with an edit, or an outside change, that moved it. */
function isAt(
  spec: MockupSpecDocument | undefined,
  id: string | undefined,
  pointer: string | undefined,
): boolean {
  return (
    !!spec &&
    id !== undefined &&
    pointer !== undefined &&
    pointerOfId(spec, id) === pointer
  );
}

/**
 * Holds the lock of the block selected in the editor, so that no other viewer
 * edits it meanwhile. The lock is taken when a block is selected that no one
 * else holds, kept while the viewer edits it, renewed by the viewer's own edits
 * of that block, an undo or a redo included, at most once every
 * {@link MOCKUP_LOCK_RENEW_MS}, never by a change another viewer wrote, and
 * freed once the viewer selects another block or none, after the last edit is
 * written. Every request runs one after the other. A renewal names no block,
 * as the backend knows where it moved the lock to, and the block is known by
 * the id the backend answered when it granted the lock: a block that moves
 * stays the held one. A take names the digest of the file it read the block's
 * pointer in, and the backend refuses it once the file changed: it is taken
 * again when the editor has read the new file, at the pointer the selection
 * then has. It is taken again when the stream reopens, the backend
 * having freed it with the stream, or when a renewal finds it gone, and freed
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
  let heldBlockPointer: string | undefined;
  let isRunning = false;
  let isDue = false;
  let isRenewDue = false;

  function lose(): void {
    options.held.value = undefined;
    heldBlockPointer = undefined;
  }

  async function take(pointer: string): Promise<void> {
    lose();
    const id = await requestLock(options, endpoint, pointer);
    if (id === undefined) return;
    options.held.value = id;
    heldBlockPointer = pointer;
    lastTaken = Date.now();
  }

  async function free(): Promise<void> {
    lose();
    await options
      .authFetch(`${endpoint}?viewer=${encodeURIComponent(options.viewer)}`, {
        method: "DELETE",
      })
      .catch(() => undefined);
  }

  async function renew(): Promise<void> {
    isRenewDue = false;
    if (
      options.held.value === undefined ||
      Date.now() - lastTaken < MOCKUP_LOCK_RENEW_MS
    ) {
      return;
    }
    try {
      await options.authFetch(endpoint, {
        method: "PUT",
        body: { viewer: options.viewer },
      });
      lastTaken = Date.now();
    } catch (error) {
      if (isLockGone(fetchStatus(error))) lose();
    }
  }

  async function step(): Promise<void> {
    if (!options.isConnected.value) {
      lose();
      return;
    }
    if (isRenewDue) await renew();
    if (options.isPending.value) return;
    const wanted = blocker.value ? undefined : options.selection.value;
    if (wanted === heldBlockPointer) return;
    if (isAt(options.spec.value, options.held.value, wanted)) {
      heldBlockPointer = wanted;
      return;
    }
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
      options.digest,
    ],
    sync,
  );
  watch(
    options.ownEdit,
    (edit) => {
      const id = options.held.value;
      if (!edit || id === undefined || !changesBlock(edit, id)) return;
      isRenewDue = true;
      sync();
    },
    { flush: "sync" },
  );
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
