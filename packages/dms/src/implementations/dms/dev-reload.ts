import type { PassThrough } from "node:stream";
import { Controller, Get, WriteStream } from "@antelopejs/interface-api";

const BROADCAST_DEBOUNCE_MS = 250;
const SSE_CONTENT_TYPE = "text/event-stream";
const SSE_RECONNECT_HINT_MS = 500;
const SSE_HELLO_PAYLOAD = `retry: ${SSE_RECONNECT_HINT_MS}\n: connected\n\n`;
const PRODUCTION_ENV = "production";

type SlugProvider = () => string[];

const clients = new Set<PassThrough>();
let broadcastTimer: NodeJS.Timeout | null = null;
let slugProvider: SlugProvider = () => [];

const isProduction = () => process.env.NODE_ENV === PRODUCTION_ENV;

export function setSlugProvider(provider: SlugProvider): void {
  slugProvider = provider;
}

// A single "resync" signal. The client decides what changed (content vs
// added/removed/moved page) by diffing the freshly-fetched site layout against
// what it already had — the backend cannot tell reliably because a dev reload
// re-registers every page, churning the slug set.
//
// `error` carries the one thing the client cannot work out by fetching: the
// reload finished with nothing registered, so the layout it is about to ask
// for is empty rather than merely different. Both go out under the same event
// name — the client's job either way is to re-probe until its route comes
// back, and the payload only decides what it logs.
function formatSseMessage(type: "resync" | "error"): string {
  return `event: reload\ndata: {"type":"${type}"}\n\n`;
}

function writeToClient(stream: PassThrough, payload: string): void {
  try {
    stream.write(payload);
  } catch {
    clients.delete(stream);
  }
}

function runBroadcast(): void {
  broadcastTimer = null;
  if (clients.size === 0) return;
  // An empty registry used to swallow the broadcast, on the grounds that
  // clients would refetch a partial site layout. They would not: the client
  // polls, commits a layout only once it serves the route it is waiting for,
  // and gives up on its own deadline. Silence is what actually hurt — a reload
  // that ended with nothing registered left the page showing a 404 with no
  // reason to ever look again, so even the NEXT good reload went unnoticed.
  const payload = formatSseMessage(
    slugProvider().length === 0 ? "error" : "resync",
  );
  for (const stream of clients) {
    writeToClient(stream, payload);
  }
}

export function scheduleBroadcast(): void {
  if (isProduction()) return;
  if (broadcastTimer) clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(runBroadcast, BROADCAST_DEBOUNCE_MS);
}

/** Drops a debounced broadcast that would otherwise fire after teardown. */
export function cancelScheduledBroadcast(): void {
  if (!broadcastTimer) return;
  clearTimeout(broadcastTimer);
  broadcastTimer = null;
}

function registerClient(stream: PassThrough): void {
  clients.add(stream);
  writeToClient(stream, SSE_HELLO_PAYLOAD);
}

function removeClient(stream: PassThrough): void {
  clients.delete(stream);
}

export class DevReloadController extends Controller("/dms/dev") {
  @Get()
  reload(@WriteStream(SSE_CONTENT_TYPE) out: PassThrough) {
    if (isProduction()) {
      out.end();
      return;
    }
    registerClient(out);
    out.on("close", () => removeClient(out));
    out.on("error", () => removeClient(out));
  }
}
