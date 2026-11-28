import {
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  type Ref,
  type ShallowRef,
} from "vue";
import {
  mockupEndpoint,
  parseAnnotation,
  parseAnnotations,
  upsertAnnotation,
  type MockupAnnotation,
  type MockupAnnotationDraft,
  type MockupAnnotationPatch,
  type MockupReplyDraft,
  type MockupState,
} from "../../utils/mockup";
import {
  newViewerId,
  NO_PRESENCE,
  type MockupPresence,
} from "../../utils/mockupPresence";
import { openMockupStream, type MockupStream } from "../../utils/mockupStream";

type AuthFetch = ReturnType<typeof useAuthFetch>["$authFetch"];

interface MockupSessionOptions {
  name: string;
  /** Where the backend lives, for the stream: `$authFetch` already knows it. */
  baseURL: string;
  authFetch: AuthFetch;
}

/** One mockup, live: what its spec compiles to and the notes left on it. */
export interface MockupSession {
  /**
   * The last compiled state the stream sent, undefined until the first one.
   * Shallow, so its tree stays plain data `postMessage` can clone.
   */
  state: Readonly<ShallowRef<MockupState | undefined>>;
  annotations: Ref<MockupAnnotation[]>;
  /** The id this browser session goes by on the stream, which its locks and spec writes name. */
  viewer: string;
  /** Who is on the mockup and which blocks they hold. */
  presence: Readonly<ShallowRef<MockupPresence>>;
  isConnected: Ref<boolean>;
  /** Whether the last annotation request failed. */
  hasRequestFailed: Ref<boolean>;
  addAnnotation: (draft: MockupAnnotationDraft) => Promise<void>;
  /** Changes a note's status or text, or moves its pin. */
  updateAnnotation: (id: string, patch: MockupAnnotationPatch) => Promise<void>;
  deleteAnnotation: (id: string) => Promise<void>;
  /** Adds a reply under a note. */
  addReply: (id: string, draft: MockupReplyDraft) => Promise<void>;
  /** Removes a reply from under a note. */
  deleteReply: (id: string, replyId: string) => Promise<void>;
}

/**
 * Follows a mockup: opens its event stream while the component lives, naming
 * this browser session `viewer`, so each save of the spec lands in `state`,
 * each change of the notes in `annotations` and each change of who is on the
 * mockup in `presence`, and sends the viewer's annotation requests.
 */
export function useMockupSession(options: MockupSessionOptions): MockupSession {
  const state = shallowRef<MockupState>();
  const annotations = ref<MockupAnnotation[]>([]);
  const viewer = newViewerId();
  const presence = shallowRef<MockupPresence>(NO_PRESENCE);
  const isConnected = ref(false);
  const hasRequestFailed = ref(false);
  const annotationsEndpoint = mockupEndpoint(options.name, "/annotations");
  let stream: MockupStream | undefined;

  async function loadAnnotations(): Promise<void> {
    try {
      const answer: unknown = await options.authFetch(annotationsEndpoint);
      annotations.value = parseAnnotations(answer) ?? annotations.value;
    } catch {
      hasRequestFailed.value = true;
    }
  }

  async function sendAnnotation(
    endpoint: string,
    init: { method: "POST" | "PATCH" | "DELETE"; body?: object },
  ): Promise<void> {
    hasRequestFailed.value = false;
    try {
      const saved = parseAnnotation(await options.authFetch(endpoint, init));
      if (saved) annotations.value = upsertAnnotation(annotations.value, saved);
    } catch {
      hasRequestFailed.value = true;
    }
  }

  async function deleteAnnotation(id: string): Promise<void> {
    hasRequestFailed.value = false;
    try {
      await options.authFetch(noteEndpoint(id), { method: "DELETE" });
      annotations.value = annotations.value.filter((note) => note.id !== id);
    } catch {
      hasRequestFailed.value = true;
    }
  }

  function noteEndpoint(id: string): string {
    return `${annotationsEndpoint}/${encodeURIComponent(id)}`;
  }

  function repliesEndpoint(id: string, replyId?: string): string {
    const replies = `${noteEndpoint(id)}/replies`;
    return replyId === undefined
      ? replies
      : `${replies}/${encodeURIComponent(replyId)}`;
  }

  onMounted(() => {
    stream = openMockupStream(
      `${options.baseURL}${mockupEndpoint(options.name, "/events")}?viewer=${viewer}`,
      {
        onState: (next) => {
          state.value = next;
        },
        onAnnotations: (next) => {
          annotations.value = next;
        },
        onPresence: (next) => {
          presence.value = next;
        },
        onConnection: (connected) => {
          isConnected.value = connected;
        },
      },
    );
    loadAnnotations().catch(() => undefined);
  });
  onBeforeUnmount(() => stream?.close());

  return {
    state,
    annotations,
    viewer,
    presence,
    isConnected,
    hasRequestFailed,
    addAnnotation: (draft) =>
      sendAnnotation(annotationsEndpoint, { method: "POST", body: draft }),
    updateAnnotation: (id, patch) =>
      sendAnnotation(noteEndpoint(id), { method: "PATCH", body: patch }),
    deleteAnnotation,
    addReply: (id, draft) =>
      sendAnnotation(repliesEndpoint(id), { method: "POST", body: draft }),
    deleteReply: (id, replyId) =>
      sendAnnotation(repliesEndpoint(id, replyId), { method: "DELETE" }),
  };
}
