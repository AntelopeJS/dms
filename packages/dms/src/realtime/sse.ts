import type { RequestContext } from "@antelopejs/interface-api";
import { Logging } from "@antelopejs/interface-core/logging";

const SSE_CONTENT_TYPE = "text/event-stream";
const SSE_KEEPALIVE_INTERVAL_MS = 20_000;
const SSE_OK_STATUS = 200;
const KEEPALIVE_FRAME = ": keepalive\n\n";

const HEADERS = {
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
  Connection: "keep-alive",
};

interface SseStreamWriter {
  write(streamPart: string): boolean;
  end(): void;
}

export interface SseStream {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This published sender accepts arbitrary JSON.stringify inputs, not just broker events; deriving from JSON.stringify would widen unknown to any in its declaration.
  send: (eventName: string, data: unknown) => void;
  onClose: (handler: () => void | Promise<void>) => void;
  /** Runs the close handlers, then ends the response. Never rejects. */
  close: () => Promise<void>;
}

const formatFrame = (
  eventName: string,
  data: Parameters<SseStream["send"]>[1],
): string => `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;

const applyHeaders = (ctx: RequestContext): void => {
  for (const [name, value] of Object.entries(HEADERS)) {
    ctx.response.addHeader(name, value);
  }
};

const startKeepalive = (writer: SseStreamWriter): NodeJS.Timeout =>
  setInterval(() => writer.write(KEEPALIVE_FRAME), SSE_KEEPALIVE_INTERVAL_MS);

const runHandlers = async (
  handlers: Array<() => void | Promise<void>>,
): Promise<void> => {
  for (const handler of handlers) {
    try {
      await handler();
    } catch {}
  }
};

export function openSseStream(ctx: RequestContext): SseStream {
  applyHeaders(ctx);
  const writer = ctx.response.getWriteStream(SSE_CONTENT_TYPE, SSE_OK_STATUS);
  const closeHandlers: Array<() => void | Promise<void>> = [];
  let isClosed = false;
  const keepalive = startKeepalive(writer);

  const cleanup = async (): Promise<void> => {
    if (isClosed) return;
    isClosed = true;
    clearInterval(keepalive);
    await runHandlers(closeHandlers);
  };

  ctx.rawRequest.on("close", cleanup);

  return {
    send: (eventName, data) => {
      if (isClosed) return;
      writer.write(formatFrame(eventName, data));
    },
    onClose: (handler) => closeHandlers.push(handler),
    close: async () => {
      try {
        await cleanup();
        writer.end();
      } catch (error) {
        Logging.Warn("Realtime: SSE stream close failed", error);
      }
    },
  };
}
