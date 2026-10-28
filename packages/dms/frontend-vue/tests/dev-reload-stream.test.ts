import { nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  followDevReload,
  openDevReloadStream,
  openSharedDevReloadStream,
} from "../layers/dms-layout/app/entries/utils/dev-reload-stream";
import { createFakeBrowser } from "./fixtures/fakeBrowser";

const ENDPOINT = "http://backend.test/dms/dev/reload";
const DEV_RELOAD_TOPIC = "dms:dev-reload";

const REOPEN_WAIT_MS = 5000;

type Listener = () => void;

/**
 * Stands in for the browser's EventSource: the tests play the browser's part by
 * firing its events, including the state it reaches before each one.
 */
class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  readyState = FakeEventSource.CONNECTING;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }

  emit(type: string, readyState = this.readyState): void {
    this.readyState = readyState;
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  /** The backend went away; the browser keeps retrying on its own. */
  drop(): void {
    this.emit("error", FakeEventSource.CONNECTING);
  }

  /** The backend answered with something other than an event stream. */
  refuse(): void {
    this.emit("error", FakeEventSource.CLOSED);
  }
}

function latestSource(): FakeEventSource {
  const source = FakeEventSource.instances.at(-1);
  if (!source) throw new Error("No EventSource was opened");
  return source;
}

describe("dev reload stream", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", FakeEventSource);
    FakeEventSource.instances = [];
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("forwards reload events", () => {
    const onReload = vi.fn();
    openDevReloadStream({ endpoint: ENDPOINT, onReload });

    latestSource().emit("open", FakeEventSource.OPEN);
    latestSource().emit("reload");

    expect(latestSource().url).toBe(ENDPOINT);
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("warns once while the browser retries a lost backend", () => {
    openDevReloadStream({ endpoint: ENDPOINT, onReload: vi.fn() });
    const source = latestSource();
    source.emit("open", FakeEventSource.OPEN);

    source.drop();
    source.drop();
    source.drop();

    expect(warn).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(REOPEN_WAIT_MS);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("warns again for the next loss once the stream is back", () => {
    openDevReloadStream({ endpoint: ENDPOINT, onReload: vi.fn() });
    const source = latestSource();
    source.emit("open", FakeEventSource.OPEN);

    source.drop();
    source.emit("open", FakeEventSource.OPEN);
    source.drop();

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("reopens a source the browser gave up on", () => {
    const onReload = vi.fn();
    openDevReloadStream({ endpoint: ENDPOINT, onReload });
    latestSource().refuse();

    vi.advanceTimersByTime(REOPEN_WAIT_MS);
    const reopened = latestSource();
    reopened.emit("open", FakeEventSource.OPEN);
    reopened.emit("reload");

    expect(FakeEventSource.instances).toHaveLength(2);
    expect(onReload).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("stays closed once closed", () => {
    const stream = openDevReloadStream({
      endpoint: ENDPOINT,
      onReload: vi.fn(),
    });
    latestSource().refuse();

    stream.close();
    vi.advanceTimersByTime(REOPEN_WAIT_MS);

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(latestSource().readyState).toBe(FakeEventSource.CLOSED);
  });
});

/**
 * A signed-in tab hears of backend reloads through its user realtime stream:
 * a reload stream of its own as well made two long-lived connections per tab,
 * and three tabs then filled the six a browser allows per HTTP/1.1 host.
 */
describe("dev reload over the user's realtime stream", () => {
  const NO_SHARING = {};
  const carrier = () => {
    const handlers = new Map<string, () => void>();
    return {
      devReloadTopic: ref<string | undefined>(undefined),
      handlers,
      subscribe: (topic: string, handler: () => void) => {
        handlers.set(topic, handler);
        return () => handlers.delete(topic);
      },
    };
  };

  beforeEach(() => {
    vi.stubGlobal("EventSource", FakeEventSource);
    FakeEventSource.instances = [];
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens no stream of its own while the user stream carries the signal", async () => {
    const realtime = carrier();
    realtime.devReloadTopic.value = DEV_RELOAD_TOPIC;
    const onReload = vi.fn();
    followDevReload({ endpoint: ENDPOINT, onReload }, realtime, NO_SHARING);

    expect(FakeEventSource.instances).toHaveLength(0);
    realtime.handlers.get(DEV_RELOAD_TOPIC)?.();
    expect(onReload).toHaveBeenCalledOnce();
    await nextTick();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("holds its own stream only while no user stream carries it", async () => {
    const realtime = carrier();
    const onReload = vi.fn();
    const follow = followDevReload(
      { endpoint: ENDPOINT, onReload },
      realtime,
      NO_SHARING,
    );

    expect(FakeEventSource.instances).toHaveLength(1);
    latestSource().emit("reload");
    expect(onReload).toHaveBeenCalledOnce();

    realtime.devReloadTopic.value = DEV_RELOAD_TOPIC;
    await nextTick();
    expect(latestSource().readyState).toBe(FakeEventSource.CLOSED);
    expect([...realtime.handlers.keys()]).toEqual([DEV_RELOAD_TOPIC]);

    realtime.devReloadTopic.value = undefined;
    await nextTick();
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(realtime.handlers.size).toBe(0);
    expect(latestSource().readyState).toBe(FakeEventSource.CONNECTING);

    follow.close();
    expect(latestSource().readyState).toBe(FakeEventSource.CLOSED);
    expect(realtime.handlers.size).toBe(0);
  });
});

describe("shared dev reload stream", () => {
  const flush = () => vi.advanceTimersByTimeAsync(0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", FakeEventSource);
    FakeEventSource.instances = [];
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens one source for every tab and relays its reloads to each", async () => {
    const browser = createFakeBrowser();
    const reloads = [vi.fn(), vi.fn(), vi.fn()];
    for (const onReload of reloads) {
      openSharedDevReloadStream(
        { endpoint: ENDPOINT, onReload },
        browser.openTab().environment,
      );
    }
    await flush();

    expect(FakeEventSource.instances).toHaveLength(1);
    latestSource().emit("reload");
    await flush();

    for (const onReload of reloads) expect(onReload).toHaveBeenCalledOnce();
  });

  it("shares the fallback of signed-out tabs, and leaves it once carried", async () => {
    const browser = createFakeBrowser();
    const carriers = [
      ref<string | undefined>(undefined),
      ref<string | undefined>(undefined),
    ];
    for (const devReloadTopic of carriers) {
      followDevReload(
        { endpoint: ENDPOINT, onReload: vi.fn() },
        { devReloadTopic, subscribe: () => () => {} },
        browser.openTab().environment,
      );
    }
    await flush();
    expect(FakeEventSource.instances).toHaveLength(1);

    for (const devReloadTopic of carriers) {
      devReloadTopic.value = DEV_RELOAD_TOPIC;
    }
    await flush();
    expect(latestSource().readyState).toBe(FakeEventSource.CLOSED);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("reopens the source in another tab when the holding tab goes", async () => {
    const browser = createFakeBrowser();
    const leaderTab = browser.openTab();
    const leader = openSharedDevReloadStream(
      { endpoint: ENDPOINT, onReload: vi.fn() },
      leaderTab.environment,
    );
    const onReload = vi.fn();
    openSharedDevReloadStream(
      { endpoint: ENDPOINT, onReload },
      browser.openTab().environment,
    );
    await flush();
    const first = latestSource();

    leaderTab.cut();
    leader.close();
    await flush();

    expect(first.readyState).toBe(FakeEventSource.CLOSED);
    expect(FakeEventSource.instances).toHaveLength(2);
    latestSource().emit("reload");
    await flush();
    expect(onReload).toHaveBeenCalledOnce();
  });
});
