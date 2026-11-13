import { createHash } from "node:crypto";
import type {
  OpResult,
  PageMeta,
  PageStructure,
} from "@antelopejs/interface-dms-builder";
import { buildPageBlocks } from "./block-tree";
import { buildQueryStructures } from "./query-structure";
import type { PageRecord } from "./scan";
import { findPageRecord } from "./source-index";

export function contentVersion(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 16);
}

function toPageMeta(page: PageRecord): PageMeta {
  return {
    ref: page.ref,
    id: page.id,
    displayName: page.displayName,
    icon: page.icon,
    category: page.categoryRef,
    order: page.order,
    description: page.description,
    hidden: page.hidden,
    permission: page.permission,
    live: page.live,
    filepath: page.filepath,
  };
}

export function buildPageStructure(ref: string): OpResult<PageStructure> {
  const page = findPageRecord(ref);
  if (!page) {
    return { ok: false, error: { code: "not_found", ref } };
  }
  const blocks = buildPageBlocks(page);
  const queries = buildQueryStructures(page.classNode);
  const version = contentVersion(page.classNode.getSourceFile().getFullText());
  return {
    ok: true,
    data: { page: toPageMeta(page), blocks, queries, version },
    changes: [],
  };
}
