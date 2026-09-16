import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openSseStream,
  type SseCloseReason,
  type SseStreamOptions,
} from "../layers/dms-core/app/composables/realtime/useSseStream";

const STREAM_URL = "https://api.example.test/events";
const encoder = new TextEncoder();

afterEach(() => vi.unstubAllGlobals());

function respond(chunks: Uint8Array[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
  );
}

function read(
  options: Partial<SseStreamOptions> = {},
): Promise<SseCloseReason> {
  return new Promise((resolve) => {
    openSseStream({
      url: STREAM_URL,
      onEvent: vi.fn(),
      ...options,
      onClose: resolve,
    });
  });
}

describe("SSE transport lifecycle", () => {
  it("opens before frames, preserves ids and reports EOF after releasing the reader", async () => {
    const response = respond([
      encoder.encode('id: cursor-1\nevent: log\ndata: {"line":"ready"}\n\n'),
    ]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const calls: unknown[] = [];
    expect(
      await read({
        onOpen: () => calls.push("open"),
        onEvent: (...args) => calls.push(args),
      }),
    ).toBe("eof");
    expect(calls).toEqual(["open", ["log", { line: "ready" }, "cursor-1"]]);
    expect(response.body?.locked).toBe(false);
  });

  it("decodes fragmented UTF-8 and CRLF and preserves text whitespace and empty ids", async () => {
    const bytes = encoder.encode(
      ": ping\r\n\r\nid: old\r\nid: c1\r\nevent: log\r\ndata:  été  \r\ndata: next\r\n\r\ndata:\r\nid:\r\n\r\ndata: true\r\n\r\n",
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          respond(Array.from(bytes, (byte) => Uint8Array.of(byte))),
        ),
    );
    const onEvent = vi.fn();
    expect(await read({ onEvent })).toBe("eof");
    expect(onEvent.mock.calls).toEqual([
      ["log", " été  \nnext", "c1"],
      ["message", "", ""],
      ["message", true, null],
    ]);
  });

  it("ignores id-only frames, invalid ids and an unfinished frame at EOF", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          respond([
            encoder.encode(
              "id: alone\n\nid: valid\nid: bad\0id\nevent:\ndata: 1\n\ndata: unfinished",
            ),
          ]),
        ),
    );
    const onEvent = vi.fn();
    expect(await read({ onEvent })).toBe("eof");
    expect(onEvent.mock.calls).toEqual([["message", 1, "valid"]]);
  });

  it("reports an empty accepted response as open then EOF", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond([])));
    const onOpen = vi.fn();
    const onError = vi.fn();
    expect(await read({ onOpen, onError })).toBe("eof");
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports HTTP rejection as error without opening", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    const onOpen = vi.fn();
    const onError = vi.fn();
    expect(await read({ onOpen, onError })).toBe("error");
    expect(onOpen).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ status: 401 }),
    );
  });

  it("does not dispatch a throwing consumer twice or reinterpret its JSON", async () => {
    const response = respond([encoder.encode("data: {}\n\ndata: 2\n\n")]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const error = new Error("consumer failed");
    const onEvent = vi.fn(() => {
      throw error;
    });
    const onError = vi.fn();
    expect(await read({ onEvent, onError })).toBe("error");
    expect(onEvent).toHaveBeenCalledExactlyOnceWith("message", {}, null);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(response.body?.locked).toBe(false);
  });

  it("reports a read failure before the error close notification", async () => {
    const error = new Error("connection reset");
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(error);
        },
      }),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const calls: unknown[] = [];
    await new Promise<void>((resolve) => {
      openSseStream({
        url: STREAM_URL,
        onEvent: vi.fn(),
        onOpen: () => calls.push("open"),
        onError: (value) => calls.push(value),
        onClose: (reason) => {
          calls.push(reason);
          resolve();
        },
      });
    });
    expect(calls).toEqual(["open", error, "error"]);
    expect(response.body?.locked).toBe(false);
  });

  it("can close synchronously from onOpen without delivering a frame", async () => {
    const response = respond([encoder.encode("data: 1\n\n")]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const onEvent = vi.fn();
    const reason = await new Promise<SseCloseReason>((resolve) => {
      const handle = openSseStream({
        url: STREAM_URL,
        onEvent,
        onOpen: () => handle.close(),
        onClose: resolve,
      });
    });
    expect(reason).toBe("aborted");
    expect(onEvent).not.toHaveBeenCalled();
    expect(response.body?.locked).toBe(false);
  });

  it("stops buffered events after close and notifies cancellation only once", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(respond([encoder.encode("data: 1\n\ndata: 2\n\n")])),
    );
    const onError = vi.fn();
    const onEvent = vi.fn();
    const onClose = vi.fn();
    const reason = await new Promise<SseCloseReason>((resolve) => {
      const handle = openSseStream({
        url: STREAM_URL,
        onError,
        onEvent: (...args) => {
          onEvent(...args);
          handle.close();
          handle.close();
        },
        onClose: (value) => {
          onClose(value);
          resolve(value);
        },
      });
    });
    expect(reason).toBe("aborted");
    expect(onEvent).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("cancels a pending read and releases its lock", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const reason = await new Promise<SseCloseReason>((resolve) => {
      const handle = openSseStream({
        url: STREAM_URL,
        onEvent: vi.fn(),
        onClose: resolve,
        onOpen: () => queueMicrotask(() => handle.close()),
      });
    });
    expect(reason).toBe("aborted");
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });

  it("suppresses opening and frames when closed before fetch resolves", async () => {
    const response = respond([encoder.encode("data: 1\n\n")]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const onOpen = vi.fn();
    const onEvent = vi.fn();
    const reason = await new Promise<SseCloseReason>((resolve) => {
      const handle = openSseStream({
        url: STREAM_URL,
        onOpen,
        onEvent,
        onClose: resolve,
      });
      handle.close();
    });
    expect(reason).toBe("aborted");
    expect(onOpen).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("lets the caller resume after EOF using fresh auth and Last-Event-ID", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond([encoder.encode("id: c1\ndata: 1\n\n")]))
      .mockResolvedValueOnce(respond([encoder.encode("id: c2\ndata: 2\n\n")]));
    vi.stubGlobal("fetch", fetchMock);
    let cursor: string | null = null;
    let token = "first";
    const options: Partial<SseStreamOptions> = {
      headers: () => ({
        Authorization: `Bearer ${token}`,
        ...(cursor ? { "Last-Event-ID": cursor } : {}),
      }),
      onEvent: (_name, _data, id) => {
        if (id !== null) cursor = id;
      },
    };
    expect(await read(options)).toBe("eof");
    expect(fetchMock).toHaveBeenCalledOnce();
    token = "renewed";
    expect(await read(options)).toBe("eof");
    expect(fetchMock.mock.calls[1]?.[1].headers).toEqual({
      Authorization: "Bearer renewed",
      "Last-Event-ID": "c1",
    });
    expect(cursor).toBe("c2");
  });
});
