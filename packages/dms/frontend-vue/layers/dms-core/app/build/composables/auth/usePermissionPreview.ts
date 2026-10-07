import {
  buildPreviewUrl,
  isPreviewEntryLocked,
  isStalePreviewSession,
  parsePreviewSession,
  PERMISSION_PREVIEW_ENDPOINT,
  PERMISSION_PREVIEW_QUERY_KEY,
  PERMISSION_PREVIEW_STORAGE_PREFIX,
  PERMISSION_PREVIEW_TAB_KEY,
  type PermissionPreviewBlock,
  type PermissionPreviewResult,
  type PermissionPreviewSession,
  type PreviewEntryState,
  resolveActivePreviewBlock,
  resolvePreviewEntryState,
} from "../../utils/permission-preview";

/** What the roles editor hands over when it opens a preview. */
export type PermissionPreviewInput = Omit<
  PermissionPreviewSession,
  "id" | "updatedAt"
>;

const CLOSE_FALLBACK_DELAY_MS = 150;

function storageKey(id: string): string {
  return `${PERMISSION_PREVIEW_STORAGE_PREFIX}${id}`;
}

function readStorage(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode, quota): the preview tab finds nothing */
  }
}

function removeStorage(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    /* noop */
  }
}

function removeSessions(isRemoved: (key: string) => boolean): void {
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (!key?.startsWith(PERMISSION_PREVIEW_STORAGE_PREFIX)) continue;
      if (isRemoved(key)) removeStorage(localStorage, key);
    }
  } catch {
    /* noop */
  }
}

// Sessions left behind by tabs closed without "Exit preview".
function pruneStaleSessions(now: number): void {
  removeSessions((key) => {
    const session = parsePreviewSession(readStorage(localStorage, key));
    return !session || isStalePreviewSession(session, now);
  });
}

function newPreviewId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

// Only the latest preview request may land: the route and the edits both move.
let refreshGeneration = 0;

function usePreviewState() {
  return {
    session: useDmsState<PermissionPreviewSession | null>(
      "dms-permission-preview-session",
      () => null,
    ),
    result: useDmsState<PermissionPreviewResult | null>(
      "dms-permission-preview-result",
      () => null,
    ),
    loading: useDmsState<boolean>(
      "dms-permission-preview-loading",
      () => false,
    ),
    failed: useDmsState<boolean>("dms-permission-preview-failed", () => false),
  };
}

/**
 * "Preview as role": the roles editor opens a tab that browses the real
 * dashboard as a role would see it — its unsaved edits included. The server
 * says what the role would lose on the menu and on the current page; the tab
 * veils those blocks instead of removing them.
 *
 * The session's permissions never change: the tab keeps the viewer's own
 * access, and the preview only ever annotates what the viewer is served. An
 * action taken in the tab runs with those real rights, as anywhere else.
 */
export function usePermissionPreview() {
  const state = usePreviewState();
  const isActive = computed(() => state.session.value !== null);
  const hiddenEntries = computed(
    () => new Set(state.result.value?.hiddenEntries ?? []),
  );
  const partialEntries = computed(
    () => new Set(state.result.value?.partialEntries ?? []),
  );
  const hiddenHeaderActions = computed(
    () => new Set(state.result.value?.hiddenHeaderActions ?? []),
  );
  const hiddenQuickActions = computed(
    () => new Set(state.result.value?.hiddenQuickActions ?? []),
  );

  function blockFor(
    layoutPath: string | undefined,
  ): PermissionPreviewBlock | undefined {
    return resolveActivePreviewBlock(
      isActive.value,
      state.result.value,
      layoutPath,
    );
  }

  function isEntryHidden(fullId: string | undefined): boolean {
    return isPreviewEntryLocked(isActive.value, hiddenEntries.value, fullId);
  }

  /**
   * How a menu entry, settings item or overview card is drawn: `hidden` when
   * the role could not open it, `partial` when it opens it without some of
   * its blocks, actions or entries. Always `null` outside a preview.
   */
  function entryState(fullId: string | undefined): PreviewEntryState | null {
    return resolvePreviewEntryState(
      isActive.value,
      hiddenEntries.value,
      partialEntries.value,
      fullId,
    );
  }

  /** Whether a header action of the current page is drawn locked. */
  function isHeaderActionHidden(id: string | undefined): boolean {
    return isPreviewEntryLocked(isActive.value, hiddenHeaderActions.value, id);
  }

  /** Whether a quick action (`category:id`) is drawn locked. */
  function isQuickActionHidden(key: string | undefined): boolean {
    return isPreviewEntryLocked(isActive.value, hiddenQuickActions.value, key);
  }

  function share(id: string, input: PermissionPreviewInput): void {
    const session: PermissionPreviewSession = {
      ...input,
      id,
      updatedAt: Date.now(),
    };
    writeStorage(localStorage, storageKey(id), JSON.stringify(session));
  }

  /** Open a preview tab on `path`; returns the id to keep it in sync. */
  function start(input: PermissionPreviewInput, path: string): string {
    pruneStaleSessions(Date.now());
    const id = newPreviewId();
    share(id, input);
    window.open(buildPreviewUrl(path, id), "_blank");
    return id;
  }

  /** Push the editor's latest edits to an open preview tab. */
  function update(id: string, input: PermissionPreviewInput): void {
    if (readStorage(localStorage, storageKey(id)) === null) return;
    share(id, input);
  }

  function readSession(id: string): PermissionPreviewSession | null {
    const session = parsePreviewSession(
      readStorage(localStorage, storageKey(id)),
    );
    return session && session.id === id ? session : null;
  }

  function takeIdFromLocation(): string | null {
    const url = new URL(window.location.href);
    const id = url.searchParams.get(PERMISSION_PREVIEW_QUERY_KEY);
    if (!id) return null;
    url.searchParams.delete(PERMISSION_PREVIEW_QUERY_KEY);
    window.history.replaceState(window.history.state, "", url.href);
    return id;
  }

  /**
   * Turn this tab into a preview when it was opened as one (or reloaded while
   * being one). Returns whether it did.
   */
  function activate(): boolean {
    const id =
      takeIdFromLocation() ??
      readStorage(sessionStorage, PERMISSION_PREVIEW_TAB_KEY);
    if (!id) return false;
    const session = readSession(id);
    if (!session) {
      removeStorage(sessionStorage, PERMISSION_PREVIEW_TAB_KEY);
      return false;
    }
    writeStorage(sessionStorage, PERMISSION_PREVIEW_TAB_KEY, id);
    state.session.value = session;
    window.addEventListener("storage", (event) => {
      if (event.key !== storageKey(id) || !state.session.value) return;
      const next = parsePreviewSession(event.newValue);
      if (next) state.session.value = next;
    });
    return true;
  }

  /** Ask the server what the role changes on the menu and on `path`. */
  async function refresh(path: string): Promise<void> {
    const session = state.session.value;
    if (!session) return;
    const current = ++refreshGeneration;
    state.loading.value = true;
    try {
      const { $authFetch } = useAuthFetch();
      const result = await $authFetch<PermissionPreviewResult>(
        PERMISSION_PREVIEW_ENDPOINT,
        { method: "POST", body: { permissions: session.permissions, path } },
      );
      if (current !== refreshGeneration) return;
      state.result.value = result;
      state.failed.value = false;
    } catch {
      if (current !== refreshGeneration) return;
      state.failed.value = true;
    } finally {
      if (current === refreshGeneration) state.loading.value = false;
    }
  }

  /** Leave the preview: close the tab it opened, or go back to the editor. */
  function exit(): void {
    const session = state.session.value;
    state.session.value = null;
    state.result.value = null;
    removeStorage(sessionStorage, PERMISSION_PREVIEW_TAB_KEY);
    if (!session) return;
    removeStorage(localStorage, storageKey(session.id));
    window.close();
    // Still open: the tab was not opened by the editor (a reload in a new
    // window, a copied URL), so it cannot close itself.
    setTimeout(() => {
      void navigateDms(session.returnTo);
    }, CLOSE_FALLBACK_DELAY_MS);
  }

  /**
   * Forget every preview this browser holds, on sign-out: the next account to
   * sign in here must not find the previous one's role and drafts.
   */
  function purge(): void {
    state.session.value = null;
    state.result.value = null;
    removeStorage(sessionStorage, PERMISSION_PREVIEW_TAB_KEY);
    removeSessions(() => true);
  }

  return {
    session: state.session,
    result: state.result,
    loading: state.loading,
    failed: state.failed,
    isActive,
    blockFor,
    isEntryHidden,
    entryState,
    isHeaderActionHidden,
    isQuickActionHidden,
    start,
    update,
    activate,
    refresh,
    exit,
    purge,
  };
}
