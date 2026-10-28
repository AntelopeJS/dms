import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isUnauthorizedStreamError,
  openSseStream,
} from "../layers/dms-core/app/composables/realtime/useSseStream";
import { runDeduped } from "../layers/dms-core/app/utils/dedupedRefresh";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function streamingResponse(frames: string[]) {
  const encoder = new TextEncoder();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < frames.length) {
        controller.enqueue(encoder.encode(frames[index]!));
        index += 1;
      } else {
        controller.close();
      }
    },
  });
  return { ok: true, status: 200, body };
}

describe("openSseStream", () => {
  it("surfaces the HTTP status on a non-ok response so 401 stays detectable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        body: null,
      })),
    );

    const error = await new Promise<unknown>((resolve) => {
      openSseStream({
        url: "http://api/realtime/user",
        onEvent: () => {},
        onError: resolve,
      });
    });

    expect(error).toHaveProperty("status", 401);
    expect(isUnauthorizedStreamError(error)).toBe(true);
  });

  it("parses SSE frames from the stream body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamingResponse(['event: hello\ndata: {"sessionId":"s1"}\n\n']),
      ),
    );

    const event = await new Promise<{ name: string; data: unknown }>(
      (resolve) => {
        openSseStream({
          url: "http://api/realtime/user",
          onEvent: (name, data) => resolve({ name, data }),
          onError: () => {},
        });
      },
    );

    expect(event.name).toBe("hello");
    expect(event.data).toEqual({ sessionId: "s1" });
  });

  it("reports a network failure without a status (not treated as a 401)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const error = await new Promise<unknown>((resolve) => {
      openSseStream({ url: "http://api", onEvent: () => {}, onError: resolve });
    });

    expect(isUnauthorizedStreamError(error)).toBe(false);
  });
});

describe("isUnauthorizedStreamError", () => {
  it("is true only for an error carrying status 401", () => {
    expect(isUnauthorizedStreamError({ status: 401 })).toBe(true);
    expect(
      isUnauthorizedStreamError(Object.assign(new Error("x"), { status: 401 })),
    ).toBe(true);
    expect(isUnauthorizedStreamError({ status: 500 })).toBe(false);
    expect(isUnauthorizedStreamError(new Error("x"))).toBe(false);
    expect(isUnauthorizedStreamError(undefined)).toBe(false);
    expect(isUnauthorizedStreamError(null)).toBe(false);
  });
});

describe("runDeduped", () => {
  it("coalesces concurrent calls into a single run", async () => {
    const holder = {};
    let runs = 0;
    let release!: (value: boolean) => void;
    const task = () => {
      runs += 1;
      return new Promise<boolean>((resolve) => {
        release = resolve;
      });
    };

    const first = runDeduped(holder, "session", task);
    const second = runDeduped(holder, "session", task);

    expect(runs).toBe(1);
    expect(first).toBe(second);

    release(true);
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it("starts a fresh run once the previous one has settled", async () => {
    const holder = {};
    let runs = 0;
    const task = () => {
      runs += 1;
      return Promise.resolve(true);
    };

    await runDeduped(holder, "session", task);
    await runDeduped(holder, "session", task);

    expect(runs).toBe(2);
  });

  it("clears the slot even when the task rejects", async () => {
    const holder = {};
    await expect(
      runDeduped(holder, "session", () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");

    let reran = false;
    await runDeduped(holder, "session", async () => {
      reran = true;
      return true;
    });
    expect(reran).toBe(true);
  });
});
