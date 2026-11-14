import type { PageSummary } from "@antelopejs/interface-dms-builder";
import { Logging } from "@antelopejs/interface-core/logging";
import { z } from "zod";
import { type LivePages, resolvePageRef } from "./live-page";

/** What the mockup list reads of the builder: the pages and each page's version. */
export type PageReader = Pick<LivePages, "listPages" | "pageStructure">;

/** Where a built page stands against the live page it was built into. */
export interface BuiltPageSync {
  /** The spec page linked to the live page, when one is. */
  pageId?: string;
  /** Whether the live page's version is no longer the one the linked spec page records. */
  changed: boolean;
}

const linkedPageSchema = z.object({
  id: z.string(),
  livePage: z.object({ ref: z.string(), version: z.string() }),
});

/** One listing's reads of the builder, each made once however many mockups ask. */
export class BuilderReads {
  private pageList: Promise<readonly PageSummary[]> | undefined;
  private readonly versions = new Map<string, Promise<string | undefined>>();

  constructor(private readonly reader: PageReader) {}

  /** The project's pages, or none when the builder cannot list them. */
  pages(): Promise<readonly PageSummary[]> {
    this.pageList ??= this.reader.listPages().catch((error: unknown) => {
      Logging.Warn(
        "[DMS] mockup list: the project's pages cannot be read",
        error,
      );
      return [];
    });
    return this.pageList;
  }

  /** The current version of page `ref`, or undefined when the builder cannot read it. */
  version(ref: string): Promise<string | undefined> {
    let read = this.versions.get(ref);
    if (!read) {
      read = this.reader.pageStructure(ref).then(
        (result) => (result.ok ? result.data.version : undefined),
        () => undefined,
      );
      this.versions.set(ref, read);
    }
    return read;
  }
}

/**
 * Where the page a mockup built at `path` stands: changed when the spec page
 * linked to it records a version the page no longer has. A page no spec page
 * is linked to, or that the builder cannot read, never reads as changed.
 */
export async function builtPageSync(
  path: string,
  specPages: readonly unknown[],
  reads: BuilderReads | undefined,
): Promise<BuiltPageSync> {
  if (!reads) return { changed: false };
  const ref = resolvePageRef(path, await reads.pages());
  if (ref === undefined) return { changed: false };
  const linked = specPages
    .map((page) => linkedPageSchema.safeParse(page))
    .find((page) => page.success && page.data.livePage.ref === ref);
  if (!linked?.success) return { changed: false };
  const current = await reads.version(ref);
  return {
    pageId: linked.data.id,
    changed: current !== undefined && current !== linked.data.livePage.version,
  };
}
