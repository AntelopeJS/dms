import type { Project } from "ts-morph";
import { createModulesProject } from "./modules";
import { sourcesChanged, stampSources } from "./project";
import { refreshFromDisk } from "./writable";

/** One parse of the app, as the page and resource indexes read it. */
export interface IndexedProject {
  readonly project: Project;
  readonly stamps: Map<string, number>;
}

let current: IndexedProject | undefined;
let written = false;

/**
 * The parse the page and resource indexes are read from, shared by both. Once a file it read has
 * been written since, or after {@link markSourcesWritten}, its project is refreshed from the disk
 * into a new value: the files whose text changed are parsed again, and every other file,
 * declarations included, is kept. {@link invalidateIndexedProject} drops it, and the next call
 * builds one from the configured root.
 */
export function indexedProject(): IndexedProject {
  if (!current) {
    current = stamped(createModulesProject());
  } else if (written || sourcesChanged(current.stamps)) {
    refreshFromDisk(current.project);
    current = stamped(current.project);
  }
  written = false;
  return current;
}

function stamped(project: Project): IndexedProject {
  return { project, stamps: stampSources(project) };
}

/** Make the next {@link indexedProject} read the disk again, after the engine wrote to it. */
export function markSourcesWritten(): void {
  written = true;
}

export function invalidateIndexedProject(): void {
  current = undefined;
}
