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
  type MockupAnnotationStatus,
  type MockupState,
} from "../../utils/mockup";
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
  isConnected: Ref<boolean>;
  /** Whether the last annotation request failed. */
  hasRequestFailed: Ref<boolean>;
  addAnnotation: (draft: MockupAnnotationDraft) => Promise<void>;
  setAnnotationStatus: (
    id: string,
    status: MockupAnnotationStatus,
  ) => Promise<void>;
}

/**
 * Follows a mockup: opens its event stream while the component lives, so each
 * save of the spec lands in `state` and each change of the notes in
 * `annotations`, and sends the viewer's annotation requests.
 */
export function useMockupSession(options: MockupSessionOptions): MockupSession {
  const state = shallowRef<MockupState>();
  const annotations = ref<MockupAnnotation[]>([]);
  const isConnected = ref(false);
  const hasRequestFailed = ref(false);
  const annotationsEndpoint = mockupEndpoint(options.name, "/annotations");
  let stream: MockupStream | undefined;

  async function loadAnnotations(): Promise<void> {
    try {
      const answer = await options.authFetch(annotationsEndpoint);
      annotations.value = parseAnnotations(answer) ?? annotations.value;
    } catch {
      hasRequestFailed.value = true;
    }
  }

  async function sendAnnotation(
    endpoint: string,
    init: { method: "POST" | "PATCH"; body: object },
  ): Promise<void> {
    hasRequestFailed.value = false;
    try {
      const saved = parseAnnotation(await options.authFetch(endpoint, init));
      if (saved) annotations.value = upsertAnnotation(annotations.value, saved);
    } catch {
      hasRequestFailed.value = true;
    }
  }

  onMounted(() => {
    stream = openMockupStream(
      `${options.baseURL}${mockupEndpoint(options.name, "/events")}`,
      {
        onState: (next) => {
          state.value = next;
        },
        onAnnotations: (next) => {
          annotations.value = next;
        },
        onConnection: (connected) => {
          isConnected.value = connected;
        },
      },
    );
    void loadAnnotations();
  });
  onBeforeUnmount(() => stream?.close());

  return {
    state,
    annotations,
    isConnected,
    hasRequestFailed,
    addAnnotation: (draft) =>
      sendAnnotation(annotationsEndpoint, { method: "POST", body: draft }),
    setAnnotationStatus: (id, status) =>
      sendAnnotation(`${annotationsEndpoint}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: { status },
      }),
  };
}
