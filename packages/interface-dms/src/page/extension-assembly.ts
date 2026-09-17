import { Logging } from "@antelopejs/interface-core/logging";
import type { ChildSerialized, ComponentInfoSerialized } from "../component";
import type { PageExtensionComponent } from "./types";

export interface PageExtensionEntry extends PageExtensionComponent {
  extensionName: string;
  declarationIndex: number;
  /** Unset while the component is being processed, or if processing failed. */
  serialized?: ComponentInfoSerialized;
}

interface PlacementGroups {
  before: Map<string, PageExtensionEntry[]>;
  after: Map<string, PageExtensionEntry[]>;
  end: PageExtensionEntry[];
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// Placement is anchor-relative first; the comparator only breaks ties inside a
// single anchor group (or the appended tail). Every criterion after `order` is
// intrinsic to the declaration — never the order the modules were started in —
// so the same set of extensions always assembles the same page. Comparison is
// codepoint-wise rather than locale-aware for the same reason. `key` closes the
// total order: keys are unique on a page, a collision being a registration
// error.
function compareExtensionEntries(
  a: PageExtensionEntry,
  b: PageExtensionEntry,
): number {
  return (
    a.order - b.order ||
    compareText(a.extensionName, b.extensionName) ||
    a.declarationIndex - b.declarationIndex ||
    compareText(a.key, b.key)
  );
}

function pushGrouped(
  groups: Map<string, PageExtensionEntry[]>,
  key: string,
  entry: PageExtensionEntry,
): void {
  const existing = groups.get(key) ?? [];
  existing.push(entry);
  groups.set(key, existing);
}

function groupExtensionEntries(
  entries: PageExtensionEntry[],
  ownKeys: Set<string>,
): PlacementGroups {
  const groups: PlacementGroups = {
    before: new Map(),
    after: new Map(),
    end: [],
  };
  for (const entry of [...entries].sort(compareExtensionEntries)) {
    const anchorPath = entry.anchorPath;
    const anchorKey = anchorPath?.[0];
    if (entry.side === "end" || anchorKey === undefined) {
      groups.end.push(entry);
      continue;
    }
    if ((anchorPath?.length ?? 0) > 1) continue;
    if (!ownKeys.has(anchorKey)) {
      Logging.Warn(
        `[dms] page extension component "${entry.key}" anchors on "${anchorKey}", which the target page no longer declares. Appending it at the end.`,
      );
      groups.end.push(entry);
      continue;
    }
    pushGrouped(
      entry.side === "before" ? groups.before : groups.after,
      anchorKey,
      entry,
    );
  }
  return groups;
}

function samePath(
  left: readonly string[] | undefined,
  right: readonly string[],
): boolean {
  return (
    left?.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

function nestedEntriesAt(
  entries: PageExtensionEntry[],
  path: readonly string[],
  side: "before" | "after",
): PageExtensionEntry[] {
  return entries
    .filter((entry) => entry.side === side && samePath(entry.anchorPath, path))
    .sort(compareExtensionEntries);
}

function extensionChildren(entries: PageExtensionEntry[]): ChildSerialized[] {
  const children: ChildSerialized[] = [];
  for (const entry of entries) {
    if (!entry.serialized) continue;
    children.push({ id: entry.key, component: entry.serialized });
  }
  return children;
}

function assembleNestedComponent(
  component: ComponentInfoSerialized,
  path: readonly string[],
  entries: PageExtensionEntry[],
): ComponentInfoSerialized {
  const children = component.children ?? [];
  if (children.length === 0) return component;
  const assembled: ChildSerialized[] = [];
  for (const child of children) {
    const childPath = [...path, child.id];
    assembled.push(
      ...extensionChildren(nestedEntriesAt(entries, childPath, "before")),
    );
    assembled.push({
      ...child,
      component: assembleNestedComponent(child.component, childPath, entries),
    });
    assembled.push(
      ...extensionChildren(nestedEntriesAt(entries, childPath, "after")),
    );
  }
  return { ...component, children: assembled };
}

export function assembleLayoutComponents(
  own: Record<string, ComponentInfoSerialized>,
  entries: PageExtensionEntry[],
): Record<string, ComponentInfoSerialized> {
  if (entries.length === 0) {
    return { ...own };
  }

  const ownKeys = Object.keys(own);
  const groups = groupExtensionEntries(entries, new Set(ownKeys));
  const assembled: Record<string, ComponentInfoSerialized> = {};
  const appendGroup = (group?: PageExtensionEntry[]): void => {
    for (const entry of group ?? []) {
      if (entry.serialized) {
        assembled[entry.key] = entry.serialized;
      }
    }
  };

  for (const key of ownKeys) {
    appendGroup(groups.before.get(key));
    assembled[key] = assembleNestedComponent(own[key], [key], entries);
    appendGroup(groups.after.get(key));
  }
  appendGroup(groups.end);

  return assembled;
}
