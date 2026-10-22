import { type Ref, watch } from "vue";
import {
  type CrossTabEnvironment,
  shareAcrossTabs,
} from "#dms-core/app/build/utils/crossTab";

const RELOAD_EVENT_NAME = "reload";
const REOPEN_DELAY_MS = 2000;
const SHARED_STREAM_NAME_PREFIX = "dms-dev-reload";
const RELOAD_MESSAGE = "reload";

export interface DevReloadStreamOptions {
  endpoint: string;
  onReload: () => void;
}

export interface DevReloadStream {
  close: () => void;
}

interface StreamState {
  options: DevReloadStreamOptions;
  source: EventSource | null;
  reopenTimer: ReturnType<typeof setTimeout> | null;
  isConnectionLost: boolean;
  isClosed: boolean;
}

// The browser fires `error` on every failed retry while the backend is down,
// so only the first one after a working connection is worth a warning.
function handleError(state: StreamState): void {
  if (!state.isConnectionLost) {
    state.isConnectionLost = true;
    console.warn(
      "[dms-dev-reload] SSE connection lost, waiting for backend...",
    );
  }
  // EventSource retries a dropped connection by itself, but gives up for good
  // on an answer that is not an event stream (a 404 while the module reloads,
  // a proxy error page): only then does it need a new source.
  if (state.source?.readyState !== EventSource.CLOSED) return;
  scheduleReopen(state);
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
  const source = new EventSource(state.options.endpoint);
  state.source = source;
  source.addEventListener("open", () => {
    state.isConnectionLost = false;
  });
  source.addEventListener("error", () => handleError(state));
  source.addEventListener(RELOAD_EVENT_NAME, () => state.options.onReload());
}

/**
 * Keeps one `reload` stream open to the backend for as long as the page lives,
 * across backend restarts, and warns once per lost connection.
 */
export function openDevReloadStream(
  options: DevReloadStreamOptions,
): DevReloadStream {
  const state: StreamState = {
    options,
    source: null,
    reopenTimer: null,
    isConnectionLost: false,
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

/**
 * The `reload` stream of every tab of the browser, held by one of them: a
 * stream per tab would take one of the browser's six HTTP/1.1 connections to
 * the dev server each. When the holding tab goes, another one opens it.
 */
export function openSharedDevReloadStream(
  options: DevReloadStreamOptions,
  environment?: CrossTabEnvironment,
): DevReloadStream {
  const leave = shareAcrossTabs(
    `${SHARED_STREAM_NAME_PREFIX}:${options.endpoint}`,
    (emit) =>
      openDevReloadStream({
        endpoint: options.endpoint,
        onReload: () => emit(RELOAD_MESSAGE),
      }).close,
    (message) => {
      if (message === RELOAD_MESSAGE) options.onReload();
    },
    environment,
  );
  return { close: leave };
}

/** The user's realtime connection, as far as the reload signal goes. */
export interface DevReloadCarrier {
  /**
   * The topic the open connection carries the reload signal under, as the
   * backend named it; unset while it carries none.
   */
  devReloadTopic: Ref<string | undefined>;
  subscribe: (topic: string, handler: () => void) => () => void;
}

/**
 * Follows the backend's reloads over the user's realtime connection while it
 * is open and carries them, and over the reload stream the browser's tabs
 * share only while it does not (signed out, reconnecting): a tab adds no
 * long-lived connection of its own to the six HTTP/1.1 allows per host.
 */
export function followDevReload(
  options: DevReloadStreamOptions,
  carrier: DevReloadCarrier,
  environment?: CrossTabEnvironment,
): DevReloadStream {
  let stream: DevReloadStream | undefined;
  let unsubscribe: (() => void) | undefined;
  const stopWatching = watch(
    carrier.devReloadTopic,
    (topic) => {
      unsubscribe?.();
      unsubscribe = undefined;
      if (topic) {
        unsubscribe = carrier.subscribe(topic, () => options.onReload());
        stream?.close();
        stream = undefined;
        return;
      }
      stream ??= openSharedDevReloadStream(options, environment);
    },
    { immediate: true },
  );
  return {
    close: () => {
      stopWatching();
      unsubscribe?.();
      unsubscribe = undefined;
      stream?.close();
      stream = undefined;
    },
  };
}
