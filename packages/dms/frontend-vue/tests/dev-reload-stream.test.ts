import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDevReloadStream } from "../layers/dms-layout/app/build/utils/dev-reload-stream";

const ENDPOINT = "http://backend.test/dms/dev/reload";
// Comfortably past the delay before a source the browser gave up on is reopened.
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
    // The browser owns these retries: no second source competes with it.
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
