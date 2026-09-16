import { HTTP_UNAUTHORIZED } from "../../utils/http-status";

/** Receives decoded data and the frame's id (null if absent, empty if reset). */
export type SseEventHandler = (
  eventName: string,
  data: unknown,
  id: string | null,
) => void;

/** Transport termination, independent of application-level terminal events. */
export type SseCloseReason = "eof" | "error" | "aborted";

/** Options for a single connection; retry and session policy belong to the caller. */
export interface SseStreamOptions {
  url: string;
  headers?: () => Record<string, string>;
  onEvent: SseEventHandler;
  onOpen?: () => void;
  onError?: (error: unknown) => void;
  /** Called once after cleanup; errors call onError first. Retry on only one callback. */
  onClose?: (reason: SseCloseReason) => void;
}

/** Owns a single request, never an automatic reconnection. */
export interface SseStreamHandle {
  /** Stops delivery immediately. Repeated calls are harmless. */
  close(): void;
}

interface StreamError extends Error {
  status?: number;
}

interface ParsedFrame {
  eventName: string;
  data: string;
  id: string | null;
}

const DEFAULT_EVENT_NAME = "message";
const SSE_FRAME_SEPARATOR = /\r?\n\r?\n/;
const SSE_LINE_SEPARATOR = /\r?\n/;
const FIELD_SEPARATOR = ":";
const FIELD_SEPARATOR_LENGTH = FIELD_SEPARATOR.length;
const OPTIONAL_SPACE_LENGTH = " ".length;

function parseFrame(frame: string): ParsedFrame | null {
  const fields = new Map<string, string>();
  const dataLines: string[] = [];
  for (const line of frame.split(SSE_LINE_SEPARATOR)) {
    const boundary = line.indexOf(FIELD_SEPARATOR);
    const name = boundary === -1 ? line : line.slice(0, boundary);
    const raw =
      boundary === -1 ? "" : line.slice(boundary + FIELD_SEPARATOR_LENGTH);
    const value = raw.startsWith(" ") ? raw.slice(OPTIONAL_SPACE_LENGTH) : raw;
    if (name === "id" && value.includes("\0")) continue;
    fields.set(name, value);
    if (name === "data") dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  return {
    eventName: fields.get("event") || DEFAULT_EVENT_NAME,
    data: dataLines.join("\n"),
    id: fields.get("id") ?? null,
  };
}

function decodeData(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function dispatchFrames(
  buffer: string,
  options: SseStreamOptions,
  signal: AbortSignal,
): string {
  const frames = buffer.split(SSE_FRAME_SEPARATOR);
  const rest = frames.pop() ?? "";
  for (const frame of frames) {
    if (signal.aborted) break;
    const parsed = parseFrame(frame);
    if (parsed)
      options.onEvent(parsed.eventName, decodeData(parsed.data), parsed.id);
  }
  return rest;
}

async function readStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  options: SseStreamOptions,
  signal: AbortSignal,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (!signal.aborted) {
      const chunk = await reader.read();
      if (chunk.done) return;
      buffer += decoder.decode(chunk.value, { stream: true });
      buffer = dispatchFrames(buffer, options, signal);
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function connect(
  options: SseStreamOptions,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(options.url, {
    method: "GET",
    headers: options.headers?.() ?? {},
    signal,
    credentials: "include",
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    const error: StreamError = new Error(
      `SSE request failed: ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }
  if (signal.aborted) {
    await response.body.cancel();
    return;
  }
  try {
    options.onOpen?.();
  } catch (error) {
    await response.body.cancel();
    throw error;
  }
  await readStream(response.body.getReader(), options, signal);
}

/** Whether a stream error carries HTTP 401 and may need session recovery. */
export function isUnauthorizedStreamError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as StreamError).status === HTTP_UNAUTHORIZED
  );
}

/** Opens one SSE request. EOF is not business completion; no retry is implicit. */
export function openSseStream(options: SseStreamOptions): SseStreamHandle {
  const controller = new AbortController();
  void (async () => {
    let reason: SseCloseReason = "eof";
    try {
      await connect(options, controller.signal);
      if (controller.signal.aborted) reason = "aborted";
    } catch (error) {
      reason = controller.signal.aborted ? "aborted" : "error";
      if (reason === "error") options.onError?.(error);
    } finally {
      options.onClose?.(reason);
    }
  })();
  return { close: () => controller.abort() };
}
