import type { Project } from "ts-morph";
import { createModulesProject } from "./modules";
import { sourcesChanged, stampSources } from "./project";

/** One parse of the app, as the page and resource indexes read it. */
export interface IndexedProject {
  readonly project: Project;
  readonly stamps: Map<string, number>;
}

let current: IndexedProject | undefined;

/**
 * The parse the page and resource indexes are read from, shared by both. A new one replaces it
 * once a file it read has been written since, or after {@link invalidateIndexedProject}.
 */
export function indexedProject(): IndexedProject {
  if (!current || sourcesChanged(current.stamps)) {
    const project = createModulesProject();
    current = { project, stamps: stampSources(project) };
  }
  return current;
}

export function invalidateIndexedProject(): void {
  current = undefined;
}
