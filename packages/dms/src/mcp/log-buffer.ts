import logListener, {
  type Log,
} from "@antelopejs/interface-core/logging/listener";
import { z } from "zod";

const BUFFER_CAP = 500;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export interface BufferedLog {
  time: number;
  channel: string;
  levelId: number;
  message: string;
}

export interface LogQuery {
  sinceMs?: number;
  level?: number;
  channel?: string;
  limit?: number;
}

const Text = z.string();
const entries: BufferedLog[] = [];
let isCapturing = false;

function messageOf(log: Log): string {
  return log.args
    .map((arg) => {
      if (arg instanceof Error) return arg.stack ?? arg.message;
      const text = Text.safeParse(arg);
      if (text.success) return text.data;
      try {
        return JSON.stringify(arg) ?? String(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

function capture(log: Log): void {
  entries.push({
    time: log.time,
    channel: log.channel,
    levelId: log.levelId,
    message: messageOf(log),
  });
  if (entries.length > BUFFER_CAP)
    entries.splice(0, entries.length - BUFFER_CAP);
}

/** Keeps the newest log entries of every module from now on. interface-core's EventProxy unregisters the listener when the DMS unloads. */
export function startLogCapture(): void {
  if (isCapturing) return;
  isCapturing = true;
  logListener.register(capture);
}

function matches(entry: BufferedLog, query: LogQuery): boolean {
  if (query.sinceMs !== undefined && entry.time < query.sinceMs) return false;
  if (query.level !== undefined && entry.levelId < query.level) return false;
  return query.channel === undefined || entry.channel === query.channel;
}

/** The captured entries that match, newest first. */
export function queryLogs(query: LogQuery): BufferedLog[] {
  const limit =
    query.limit === undefined || query.limit <= 0
      ? DEFAULT_LIMIT
      : Math.min(Math.floor(query.limit), MAX_LIMIT);
  return entries
    .filter((entry) => matches(entry, query))
    .slice(-limit)
    .reverse();
}
