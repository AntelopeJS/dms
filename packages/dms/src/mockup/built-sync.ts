import { stat } from "node:fs/promises";
import type { PageSummary } from "@antelopejs/interface-dms-builder";
import { Logging } from "@antelopejs/interface-core/logging";
import { type LivePages, resolvePageRef } from "./live-page";

/** Reads the project's pages once for every built mockup of a listing. */
export type PageLister = Pick<LivePages, "listPages">;

/** The pages of the project, or none when the builder cannot list them. */
export async function readPageList(
  pages: PageLister,
): Promise<readonly PageSummary[]> {
  try {
    return await pages.listPages();
  } catch (error) {
    Logging.Warn(
      "[DMS] mockup list: the project's pages cannot be read",
      error,
    );
    return [];
  }
}

/**
 * Whether the page a built mockup made at `path` was written after `builtAt`:
 * its source file changed since the build. A page the builder no longer
 * lists, or whose file cannot be read, does not count as changed.
 */
export async function changedSinceBuild(
  path: string,
  builtAt: string,
  pages: readonly PageSummary[],
): Promise<boolean> {
  const ref = resolvePageRef(path, pages);
  const page = pages.find((entry) => entry.ref === ref);
  if (!page) return false;
  try {
    const { mtimeMs } = await stat(page.filepath);
    return mtimeMs > Date.parse(builtAt);
  } catch {
    return false;
  }
}
