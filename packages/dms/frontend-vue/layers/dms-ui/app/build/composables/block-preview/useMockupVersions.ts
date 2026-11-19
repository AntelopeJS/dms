import { ref, shallowRef, watch, type Ref, type ShallowRef } from "vue";
import type { MockupState } from "../../utils/mockup";
import {
  headKey,
  mockupHistoryEndpoint,
  parseRestore,
  parseVersion,
  parseVersionList,
  type MockupVersion,
  type MockupVersionListEntry,
} from "../../utils/mockupVersions";

type AuthFetch = ReturnType<typeof useAuthFetch>["$authFetch"];

interface MockupVersionsOptions {
  name: string;
  authFetch: AuthFetch;
  /** The state the stream last sent: each one may mean a new version. */
  live: Readonly<ShallowRef<MockupState | undefined>>;
  /** Called when a restore landed, with the version it restored. */
  onRestored: (seq: number) => void;
  /** Called when a restore was refused, with the reason, or failed. */
  onRestoreFailed: (reason: { message: string } | { error: unknown }) => void;
}

/** A mockup's version history, and the read-only preview of one of its versions. */
export interface MockupVersions {
  isOpen: Ref<boolean>;
  versions: Readonly<Ref<MockupVersionListEntry[]>>;
  isLoading: Readonly<Ref<boolean>>;
  hasFailed: Readonly<Ref<boolean>>;
  /** The version the canvas shows instead of the current spec; undefined when it shows the current one. */
  previewing: Readonly<ShallowRef<MockupVersion | undefined>>;
  /** Whether the spec changed while a version was previewed. */
  hasNewer: Readonly<Ref<boolean>>;
  isRestoring: Readonly<Ref<boolean>>;
  toggle: () => void;
  close: () => void;
  /** Shows version `seq` read-only in the canvas. */
  preview: (seq: number) => Promise<void>;
  backToCurrent: () => void;
  /** Writes the previewed version as the current spec. */
  restore: () => Promise<void>;
}

/**
 * Loads the history of a mockup while its panel is open and reloads it when
 * the spec changes. A preview keeps its version until it is left: a change
 * of the spec meanwhile only sets `hasNewer`.
 */
export function useMockupVersions(
  options: MockupVersionsOptions,
): MockupVersions {
  const isOpen = ref(false);
  const versions = ref<MockupVersionListEntry[]>([]);
  const isLoading = ref(false);
  const hasFailed = ref(false);
  const previewing = shallowRef<MockupVersion>();
  const hasNewer = ref(false);
  const isRestoring = ref(false);
  let previewedHead: string | undefined;
  let requested = 0;

  async function load(): Promise<void> {
    isLoading.value = true;
    try {
      const answer: unknown = await options.authFetch(
        mockupHistoryEndpoint(options.name),
      );
      const list = parseVersionList(answer);
      hasFailed.value = !list;
      if (list) versions.value = list;
    } catch {
      hasFailed.value = true;
    } finally {
      isLoading.value = false;
    }
    if (previewing.value && headKey(versions.value) !== previewedHead) {
      hasNewer.value = true;
    }
  }

  function backToCurrent(): void {
    requested += 1;
    previewing.value = undefined;
    hasNewer.value = false;
  }

  function close(): void {
    isOpen.value = false;
    backToCurrent();
  }

  async function preview(seq: number): Promise<void> {
    const ticket = ++requested;
    try {
      const answer: unknown = await options.authFetch(
        mockupHistoryEndpoint(options.name, `/${seq}`),
      );
      const version = parseVersion(answer);
      if (!version || ticket !== requested) return;
      if (!previewing.value) {
        previewedHead = headKey(versions.value);
        hasNewer.value = false;
      }
      previewing.value = version;
    } catch {
      if (ticket === requested) hasFailed.value = true;
    }
  }

  async function restore(): Promise<void> {
    const version = previewing.value;
    if (!version || isRestoring.value) return;
    isRestoring.value = true;
    try {
      const answer = parseRestore(
        await options.authFetch(
          mockupHistoryEndpoint(options.name, `/${version.seq}/restore`),
          { method: "POST" },
        ),
      );
      if (answer?.ok) {
        backToCurrent();
        options.onRestored(version.seq);
        await load();
      } else {
        options.onRestoreFailed(
          answer
            ? { message: answer.message }
            : { error: new Error("The restore answered nothing readable") },
        );
      }
    } catch (error) {
      options.onRestoreFailed({ error });
    } finally {
      isRestoring.value = false;
    }
  }

  function toggle(): void {
    if (isOpen.value) {
      close();
      return;
    }
    isOpen.value = true;
    load().catch(() => undefined);
  }

  watch(options.live, () => {
    if (isOpen.value) load().catch(() => undefined);
  });

  return {
    isOpen,
    versions,
    isLoading,
    hasFailed,
    previewing,
    hasNewer,
    isRestoring,
    toggle,
    close,
    preview,
    backToCurrent,
    restore,
  };
}
