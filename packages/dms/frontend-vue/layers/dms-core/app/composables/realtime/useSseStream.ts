import { HTTP_UNAUTHORIZED } from "../../utils/http-status";
import { isObject } from "../../utils/type-check";
import { isJsonValue } from "../../build/utils/json";
import type { JsonValue } from "../../types/json";

/**
 * Receives the frame's data, parsed as JSON or kept as its text when it is not
 * JSON, and the frame's id (null if absent, empty if reset).
 */
export type SseEventHandler = (
  eventName: string,
  data: JsonValue,
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
  onError?: (error: Parameters<typeof isUnauthorizedStreamError>[0]) => void;
  /** Called once after cleanup; errors call onError first. Retry on only one callback. */
  onClose?: (reason: SseCloseReason) => void;
}

/** Owns a single request, never an automatic reconnection. */
export interface SseStreamHandle {
  /** Stops delivery immediately. Repeated calls are harmless. */
  close(): void;
}

/** The server refused the stream request. */
export class SseRequestError extends Error {
  constructor(
    readonly status: number,
    /** Delay the server asked for with `Retry-After`, in milliseconds. */
    readonly retryAfterMs: number | undefined,
  ) {
    super(`SSE request failed: ${status}`);
  }
}

const MS_PER_SECOND = 1000;
const RETRY_AFTER_SECONDS = /^\d+$/;

/** Reads a `Retry-After` value, delta-seconds or HTTP-date, as milliseconds. */
export function parseRetryAfterMs(
  value: string | null,
  now: number = Date.now(),
): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (RETRY_AFTER_SECONDS.test(trimmed)) {
    return Number(trimmed) * MS_PER_SECOND;
  }
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
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

function decodeData(data: string): Parameters<SseEventHandler>[1] {
  try {
    const parsed: unknown = JSON.parse(data);
    return isJsonValue(parsed) ? parsed : data;
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
    throw new SseRequestError(
      response.status,
      parseRetryAfterMs(response.headers.get("Retry-After")),
    );
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

/** A stream error that carries HTTP 401. */
interface UnauthorizedStreamError {
  status: typeof HTTP_UNAUTHORIZED;
}

/** Whether a stream error carries HTTP 401 and may need session recovery. */
export function isUnauthorizedStreamError(
  error: unknown,
): error is UnauthorizedStreamError {
  return (
    isObject(error) && error !== null && error.status === HTTP_UNAUTHORIZED
  );
}

/** Opens one SSE request. EOF is not business completion; no retry is implicit. */
export function openSseStream(options: SseStreamOptions): SseStreamHandle {
  const controller = new AbortController();
  void connect(options, controller.signal).then(
    () => options.onClose?.(controller.signal.aborted ? "aborted" : "eof"),
    (error: unknown) => {
      const reason = controller.signal.aborted ? "aborted" : "error";
      try {
        if (reason === "error") options.onError?.(error);
      } finally {
        options.onClose?.(reason);
      }
    },
  );
  return { close: () => controller.abort() };
}
