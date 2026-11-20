import type { JsonValue } from "../../../../dms-core/app/types/json";
import { isString } from "../../../../dms-core/app/utils/type-check";
import { isJsonValue } from "./json";
import {
  MOCKUP_ANNOTATIONS_EVENT,
  MOCKUP_STATE_EVENT,
  parseAnnotations,
  parseMockupState,
  type MockupAnnotation,
  type MockupState,
} from "./mockup";
import {
  MOCKUP_PRESENCE_EVENT,
  parseMockupPresence,
  type MockupPresence,
} from "./mockupPresence";

const REOPEN_DELAY_MS = 2000;

export interface MockupStreamHandlers {
  onState: (state: MockupState) => void;
  onAnnotations: (annotations: MockupAnnotation[]) => void;
  /** Who is on the mockup and which blocks they hold, on connect and after each change. */
  onPresence: (presence: MockupPresence) => void;
  /** Whether the stream is open: false from the first error until it reopens. */
  onConnection: (isConnected: boolean) => void;
}

export interface MockupStream {
  close: () => void;
}

interface StreamState {
  endpoint: string;
  handlers: MockupStreamHandlers;
  source: EventSource | null;
  reopenTimer: ReturnType<typeof setTimeout> | null;
  isClosed: boolean;
}

function readJson(event: Event): JsonValue | undefined {
  if (!(event instanceof MessageEvent) || !isString(event.data)) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(event.data);
    return isJsonValue(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function scheduleReopen(state: StreamState): void {
  if (state.reopenTimer || state.isClosed) return;
  state.reopenTimer = setTimeout(() => {
    state.reopenTimer = null;
    open(state);
  }, REOPEN_DELAY_MS);
}

function open(state: StreamState): void {
  if (state.isClosed) return;
  state.source?.close();
  const source = new EventSource(state.endpoint);
  state.source = source;
  source.addEventListener("open", () => state.handlers.onConnection(true));
  source.addEventListener("error", () => {
    state.handlers.onConnection(false);
    if (source.readyState === EventSource.CLOSED) scheduleReopen(state);
  });
  source.addEventListener(MOCKUP_STATE_EVENT, (event) => {
    const mockup = parseMockupState(readJson(event));
    if (mockup) state.handlers.onState(mockup);
  });
  source.addEventListener(MOCKUP_ANNOTATIONS_EVENT, (event) => {
    const annotations = parseAnnotations(readJson(event));
    if (annotations) state.handlers.onAnnotations(annotations);
  });
  source.addEventListener(MOCKUP_PRESENCE_EVENT, (event) => {
    const presence = parseMockupPresence(readJson(event));
    if (presence) state.handlers.onPresence(presence);
  });
}

/**
 * Keeps one stream open to a mockup's `/events` endpoint: its compiled state
 * on connect and after each save of the spec, its annotations after each
 * change of the notes or of the spec, which moves the notes' blocks, and who
 * is on it and which blocks they hold after each change of either. The
 * browser reconnects a dropped connection by itself; this reopens
 * one the server closed (a restart), and ignores events that are not valid.
 */
export function openMockupStream(
  endpoint: string,
  handlers: MockupStreamHandlers,
): MockupStream {
  const state: StreamState = {
    endpoint,
    handlers,
    source: null,
    reopenTimer: null,
    isClosed: false,
  };
  open(state);
  return {
    close: () => {
      state.isClosed = true;
      if (state.reopenTimer) clearTimeout(state.reopenTimer);
      state.reopenTimer = null;
      state.source?.close();
    },
  };
}
