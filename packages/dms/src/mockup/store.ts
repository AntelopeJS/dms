import { type FSWatcher, watch } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Logging } from "@antelopejs/interface-core/logging";
import { z } from "zod";
import { listAnnotations, type MockupAnnotation } from "./annotations";
import { compileSpec, parseSpec } from "./compile";
import {
  ANNOTATIONS_FILE,
  MISSING_FILE,
  parseFsError,
  mockupDirectory,
  SPEC_FILE,
} from "./files";
import type {
  Json,
  JsonObject,
  MockupIssue,
  MockupName,
  MockupPageState,
  MockupState,
} from "./model";
import { parseMockupName } from "./model";

/** How long a burst of writes to one file is waited out before it is read. */
export const WATCH_DEBOUNCE_MS = 40;

/** What a subscriber to one mockup receives. */
export type MockupEvent =
  | { event: "state"; data: MockupState }
  | { event: "annotations"; data: { annotations: MockupAnnotation[] } };

export type MockupListener = (event: MockupEvent) => void;

/** One mockup as `GET /api/mockup` lists it. */
export interface MockupSummary {
  name: MockupName;
  title?: string;
  pages: number;
}

/** The last read of a spec: what was good, and what is wrong now. */
interface Entry {
  revision: number;
  title?: string;
  pages: MockupPageState[];
  fixtures: Map<string, JsonObject>;
  issues: MockupIssue[];
}

interface Watch {
  watcher: FSWatcher;
  listeners: Set<MockupListener>;
  timers: Map<string, NodeJS.Timeout>;
}

const summarySchema = z.object({
  title: z.string().optional().catch(undefined),
  pages: z.array(z.unknown()).catch([]),
});

const MISSING_SPEC: MockupIssue = {
  path: "",
  message: `${SPEC_FILE} is missing`,
};

/** The last good pages of `previous`, listing what is wrong now. */
function lastGood(
  previous: Entry | undefined,
  revision: number,
  issues: MockupIssue[],
): Entry {
  return {
    revision,
    title: previous?.title,
    pages: previous?.pages ?? [],
    fixtures: previous?.fixtures ?? new Map<string, JsonObject>(),
    issues,
  };
}

/**
 * The mockups of `mockupsDir`, compiled on read. A mockup someone subscribes
 * to is watched: a change of its spec or annotations reaches every
 * subscriber once the writes settle.
 */
export class MockupStore {
  private readonly entries = new Map<MockupName, Entry>();
  private readonly watches = new Map<MockupName, Watch>();

  constructor(readonly mockupsDir: string) {}

  /** Every mockup whose directory holds a spec. */
  async list(): Promise<MockupSummary[]> {
    let names: string[];
    try {
      names = await readdir(this.mockupsDir);
    } catch (error) {
      if (parseFsError(error).code === MISSING_FILE) return [];
      throw error;
    }
    const summaries = await Promise.all(
      names.sort().map(async (raw) => {
        const name = parseMockupName(raw);
        return name ? this.summary(name) : undefined;
      }),
    );
    return summaries.flatMap((summary) => summary ?? []);
  }

  private async summary(name: MockupName): Promise<MockupSummary | undefined> {
    const text = await this.readSpec(name);
    if (text === undefined) return undefined;
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { name, pages: 0 };
    }
    const parsed = summarySchema.safeParse(raw);
    const { title, pages } = parsed.success
      ? parsed.data
      : { title: undefined, pages: [] };
    return title === undefined
      ? { name, pages: pages.length }
      : { name, title, pages: pages.length };
  }

  /** The mockup now, or undefined when its spec does not exist. */
  async state(name: MockupName): Promise<MockupState | undefined> {
    const entry = await this.current(name);
    return entry && this.toState(name, entry);
  }

  /** A fixture of one page, or undefined when there is none. */
  async fixture(
    name: MockupName,
    pageId: string,
    key: string,
  ): Promise<Json | undefined> {
    const fixtures = (await this.current(name))?.fixtures.get(pageId);
    return fixtures && Object.hasOwn(fixtures, key) ? fixtures[key] : undefined;
  }

  /**
   * Sends `listener` the current state, then every change, until the
   * returned function is called. Undefined when the spec does not exist.
   */
  async subscribe(
    name: MockupName,
    listener: MockupListener,
  ): Promise<(() => void) | undefined> {
    const entry = await this.current(name);
    if (!entry) return undefined;
    const watched = this.watches.get(name) ?? this.startWatch(name);
    watched.listeners.add(listener);
    listener({ event: "state", data: this.toState(name, entry) });
    return () => {
      watched.listeners.delete(listener);
      if (!watched.listeners.size) this.stopWatch(name);
    };
  }

  /** Stops every watcher and pending read. Subscribing again restarts one. */
  close(): void {
    for (const name of this.watches.keys()) this.stopWatch(name);
  }

  private async current(name: MockupName): Promise<Entry | undefined> {
    const cached = this.entries.get(name);
    if (cached && this.watches.has(name)) return cached;
    return this.load(name);
  }

  private async readSpec(name: MockupName): Promise<string | undefined> {
    try {
      return await readFile(
        join(mockupDirectory(this.mockupsDir, name), SPEC_FILE),
        "utf8",
      );
    } catch (error) {
      if (parseFsError(error).code === MISSING_FILE) return undefined;
      throw error;
    }
  }

  /**
   * Reads and compiles the spec. Unreadable JSON or a broken envelope keeps
   * the last good pages and lists why.
   */
  private async load(name: MockupName): Promise<Entry | undefined> {
    const text = await this.readSpec(name);
    if (text === undefined) return undefined;
    const previous = this.entries.get(name);
    const revision = (previous?.revision ?? 0) + 1;
    const read = parseSpec(text);
    const entry: Entry = read.ok
      ? { revision, ...compileSpec(name, read.spec) }
      : lastGood(previous, revision, read.issues);
    this.entries.set(name, entry);
    return entry;
  }

  private toState(name: MockupName, entry: Entry): MockupState {
    const state: MockupState = {
      name,
      revision: entry.revision,
      pages: entry.pages,
      issues: entry.issues,
    };
    if (entry.title !== undefined) state.title = entry.title;
    return state;
  }

  private async specEvent(name: MockupName): Promise<MockupEvent> {
    const entry = await this.load(name);
    if (entry) return { event: "state", data: this.toState(name, entry) };
    const previous = this.entries.get(name);
    const missing = lastGood(previous, previous?.revision ?? 0, [MISSING_SPEC]);
    return { event: "state", data: this.toState(name, missing) };
  }

  private async annotationsEvent(name: MockupName): Promise<MockupEvent> {
    const annotations = await listAnnotations(name, this.mockupsDir);
    return { event: "annotations", data: { annotations: annotations ?? [] } };
  }

  /** What each watched file sends its subscribers once it changed. */
  private readonly fileEvents = new Map<
    string,
    (name: MockupName) => Promise<MockupEvent>
  >([
    [SPEC_FILE, (name) => this.specEvent(name)],
    [ANNOTATIONS_FILE, (name) => this.annotationsEvent(name)],
  ]);

  private startWatch(name: MockupName): Watch {
    const watcher = watch(
      mockupDirectory(this.mockupsDir, name),
      (_event, filename) => this.changed(name, filename),
    );
    const watched: Watch = { watcher, listeners: new Set(), timers: new Map() };
    watcher.on("error", (error) => {
      Logging.Warn(`[DMS] mockup "${name}" is no longer watched:`, error);
      this.stopWatch(name);
    });
    this.watches.set(name, watched);
    return watched;
  }

  private changed(name: MockupName, filename: string | null): void {
    const watched = this.watches.get(name);
    if (!watched) return;
    const files = filename === null ? [...this.fileEvents.keys()] : [filename];
    for (const file of files) {
      const read = this.fileEvents.get(file);
      if (!read) continue;
      clearTimeout(watched.timers.get(file));
      watched.timers.set(
        file,
        setTimeout(() => void this.flush(name, file, read), WATCH_DEBOUNCE_MS),
      );
    }
  }

  private async flush(
    name: MockupName,
    file: string,
    read: (name: MockupName) => Promise<MockupEvent>,
  ): Promise<void> {
    this.watches.get(name)?.timers.delete(file);
    try {
      const event = await read(name);
      for (const listener of this.watches.get(name)?.listeners ?? []) {
        listener(event);
      }
    } catch (error) {
      Logging.Warn(`[DMS] mockup "${name}": ${file} could not be read`, error);
    }
  }

  private stopWatch(name: MockupName): void {
    const watched = this.watches.get(name);
    if (!watched) return;
    this.watches.delete(name);
    for (const timer of watched.timers.values()) clearTimeout(timer);
    watched.watcher.close();
  }
}
