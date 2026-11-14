import { type FSWatcher, watch } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { Logging } from "@antelopejs/interface-core/logging";
import type { PageSummary } from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { listAnnotations, type MockupAnnotation } from "./annotations";
import { BUILDER_PAGES } from "./live-page";
import { changedSinceBuild, type PageLister, readPageList } from "./built-sync";
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
  MockupSource,
  MockupState,
} from "./model";
import {
  mockupBuiltSchema,
  mockupSourceSchema,
  parseMockupName,
} from "./model";

/** How long a burst of writes to one file is waited out before it is read. */
const WATCH_DEBOUNCE_MS = 40;

/** What a subscriber to one mockup receives. */
export type MockupEvent =
  | { event: "state"; data: MockupState }
  | { event: "annotations"; data: { annotations: MockupAnnotation[] } };

export type MockupListener = (event: MockupEvent) => void;

type EventReader = (name: MockupName) => Promise<MockupEvent>;

/** What `GET /api/mockup` lists of every mockup, drafts and built ones alike. */
interface MockupSummaryBase {
  name: MockupName;
  title?: string;
  pages: number;
  /** The annotations still open. */
  openComments: number;
  source?: MockupSource;
  /** When `spec.json` last changed, ISO 8601. */
  updatedAt: string;
}

/** One mockup as `GET /api/mockup` lists it. */
export type MockupSummary = MockupSummaryBase &
  (
    | { status: "draft" }
    | {
        status: "built";
        builtAt: string;
        /**
         * Each page's dashboard path, titled by the path when it has no
         * title, and whether its source file changed after the build.
         */
        builtPages: Array<{ path: string; title: string; changed: boolean }>;
      }
  );

/** The last read of a spec: what was good, and what is wrong now. */
interface Entry {
  revision: number;
  title?: string;
  pages: MockupPageState[];
  fixtures: Map<string, JsonObject>;
  issues: MockupIssue[];
}

/** A watched mockup: its subscribers, its directory's watcher, and its reads waiting out a burst. */
interface Watch {
  listeners: Set<MockupListener>;
  timers: Map<string, NodeJS.Timeout>;
  watcher?: FSWatcher;
}

const summarySchema = z
  .object({
    title: z.string().optional().catch(undefined),
    pages: z.array(z.unknown()).catch([]),
    source: mockupSourceSchema.optional().catch(undefined),
    built: mockupBuiltSchema.optional().catch(undefined),
  })
  .catch({ pages: [] });

type SummaryFields = z.infer<typeof summarySchema>;

/** What a spec's text reads cleanly of its summary: nothing when it is not JSON. */
function readSummaryFields(text: string): SummaryFields {
  try {
    return summarySchema.parse(JSON.parse(text));
  } catch {
    return summarySchema.parse(undefined);
  }
}

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
 * subscriber once the writes settle. While anyone subscribes, `mockupsDir`'s
 * own entries are watched too, so a mockup directory deleted and made again
 * is watched again; a sibling directory is never read.
 */
export class MockupStore {
  private readonly entries = new Map<MockupName, Entry>();
  private readonly watches = new Map<MockupName, Watch>();
  private watcher: FSWatcher | undefined;

  constructor(
    readonly mockupsDir: string,
    private readonly livePages: PageLister = BUILDER_PAGES,
  ) {}

  /**
   * Every mockup whose directory holds a spec, the one changed last first
   * and by name among those changed at the same time.
   */
  async list(): Promise<MockupSummary[]> {
    let names: string[];
    try {
      names = await readdir(this.mockupsDir);
    } catch (error) {
      if (parseFsError(error).code === MISSING_FILE) return [];
      throw error;
    }
    let projectPages: Promise<readonly PageSummary[]> | undefined;
    const pages = () => (projectPages ??= readPageList(this.livePages));
    const summaries = await Promise.all(
      names.map(async (raw) => {
        const name = parseMockupName(raw);
        return name ? this.summary(name, pages) : undefined;
      }),
    );
    return summaries
      .flatMap((summary) => summary ?? [])
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.name.localeCompare(right.name),
      );
  }

  /**
   * The summary of a mockup, read as much as it reads cleanly: a spec that is
   * not JSON, or a `source` or `built` that is invalid, lists with what is left.
   */
  private async summary(
    name: MockupName,
    projectPages: () => Promise<readonly PageSummary[]>,
  ): Promise<MockupSummary | undefined> {
    const file = await this.specFile(name);
    if (!file) return undefined;
    const { title, pages, source, built } = readSummaryFields(file.text);
    const base: MockupSummaryBase = {
      name,
      pages: pages.length,
      openComments: await this.openComments(name),
      updatedAt: file.updatedAt,
    };
    if (title !== undefined) base.title = title;
    if (source !== undefined) base.source = source;
    if (!built) return { ...base, status: "draft" };
    const pagesNow = await projectPages();
    return {
      ...base,
      status: "built",
      builtAt: built.at,
      builtPages: await Promise.all(
        built.pages.map(async (page) => ({
          path: page.path,
          title: page.title?.trim() || page.path,
          changed: await changedSinceBuild(page.path, built.at, pagesNow),
        })),
      ),
    };
  }

  /** The annotations of `name` that are open; a file that cannot be read counts none. */
  private async openComments(name: MockupName): Promise<number> {
    try {
      const annotations = await listAnnotations(name, this.mockupsDir);
      return (
        annotations?.filter((annotation) => annotation.status === "open")
          .length ?? 0
      );
    } catch (error) {
      Logging.Warn(`[DMS] mockup "${name}": annotations cannot be read`, error);
      return 0;
    }
  }

  /** The text of a spec and when it changed, or undefined when the spec does not exist. */
  private async specFile(
    name: MockupName,
  ): Promise<{ text: string; updatedAt: string } | undefined> {
    const text = await this.readSpec(name);
    if (text === undefined) return undefined;
    try {
      const { mtime } = await stat(
        join(mockupDirectory(this.mockupsDir, name), SPEC_FILE),
      );
      return { text, updatedAt: mtime.toISOString() };
    } catch (error) {
      if (parseFsError(error).code === MISSING_FILE) return undefined;
      throw error;
    }
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

  /** Whether a watcher runs: true while anyone is subscribed. */
  isWatching(): boolean {
    return this.watcher !== undefined;
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

  /**
   * What each watched file sends its subscribers once it changed. A spec
   * change moves where a note's block is, so it sends the annotations too.
   */
  private readonly fileEvents = new Map<string, readonly EventReader[]>([
    [
      SPEC_FILE,
      [(name) => this.specEvent(name), (name) => this.annotationsEvent(name)],
    ],
    [ANNOTATIONS_FILE, [(name) => this.annotationsEvent(name)]],
  ]);

  private startWatch(name: MockupName): Watch {
    this.watcher ??= this.watchDirectory(this.mockupsDir, (filename) =>
      this.directoryChanged(filename),
    );
    const watched: Watch = { listeners: new Set(), timers: new Map() };
    this.watches.set(name, watched);
    this.armMockup(name, watched);
    return watched;
  }

  /**
   * Watches one directory, its own entries only: a sibling mockup it cannot
   * read never stops another from being followed. Undefined when it cannot
   * be watched now; the mockups directory watch arms it again later.
   */
  private watchDirectory(
    directory: string,
    onChange: (filename: string | null) => void,
  ): FSWatcher | undefined {
    try {
      const watcher = watch(directory, (_event, filename) =>
        onChange(filename),
      );
      watcher.on("error", (error) => {
        Logging.Warn(`[DMS] ${directory} is no longer watched:`, error);
        watcher.close();
      });
      return watcher;
    } catch (error) {
      Logging.Warn(`[DMS] ${directory} cannot be watched:`, error);
      return undefined;
    }
  }

  /** Watches a mockup's own directory again: after it was deleted and made anew. */
  private armMockup(name: MockupName, watched: Watch): void {
    watched.watcher?.close();
    watched.watcher = this.watchDirectory(
      mockupDirectory(this.mockupsDir, name),
      (filename) => this.changed(name, filename),
    );
  }

  /** An entry of the mockups directory changed: a mockup directory came or went. */
  private directoryChanged(filename: string | null): void {
    const name = filename === null ? undefined : parseMockupName(filename);
    const names = name
      ? [name]
      : filename === null
        ? [...this.watches.keys()]
        : [];
    for (const changed of names) {
      const watched = this.watches.get(changed);
      if (!watched) continue;
      this.armMockup(changed, watched);
      this.changed(changed, null);
    }
  }

  private changed(name: MockupName, filename: string | null): void {
    const watched = this.watches.get(name);
    if (!watched) return;
    const files = filename === null ? [...this.fileEvents.keys()] : [filename];
    for (const file of files) {
      const reads = this.fileEvents.get(file);
      if (!reads) continue;
      clearTimeout(watched.timers.get(file));
      watched.timers.set(
        file,
        setTimeout(() => void this.flush(name, file, reads), WATCH_DEBOUNCE_MS),
      );
    }
  }

  private async flush(
    name: MockupName,
    file: string,
    reads: readonly EventReader[],
  ): Promise<void> {
    this.watches.get(name)?.timers.delete(file);
    for (const read of reads) {
      try {
        const event = await read(name);
        for (const listener of this.watches.get(name)?.listeners ?? []) {
          listener(event);
        }
      } catch (error) {
        Logging.Warn(
          `[DMS] mockup "${name}": ${file} could not be read`,
          error,
        );
      }
    }
  }

  private stopWatch(name: MockupName): void {
    const watched = this.watches.get(name);
    if (!watched) return;
    this.watches.delete(name);
    for (const timer of watched.timers.values()) clearTimeout(timer);
    watched.watcher?.close();
    if (this.watches.size) return;
    this.watcher?.close();
    this.watcher = undefined;
  }
}
