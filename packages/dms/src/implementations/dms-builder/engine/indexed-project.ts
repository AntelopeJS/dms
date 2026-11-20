import type { Project } from "ts-morph";
import { createModulesProject } from "./modules";
import { sourcesChanged, stampSources } from "./project";
import {
  readResolutionInputs,
  type ResolutionInputs,
  resolutionInputsChanged,
} from "./resolution-inputs";
import { refreshFromDisk } from "./writable";

/** One parse of the app, as the page and resource indexes read it. */
export interface IndexedProject {
  readonly project: Project;
  readonly stamps: Map<string, number>;
  readonly inputs: ResolutionInputs;
}

let current: IndexedProject | undefined;
let written = false;

/**
 * The parse the page and resource indexes are read from, shared by both. Once a file it read has
 * been written since, or after {@link markSourcesWritten}, its project is refreshed from the disk
 * into a new value: the files whose text changed are parsed again, and every other file,
 * declarations included, is kept. {@link invalidateIndexedProject} drops it, and so does a
 * change to its {@link ResolutionInputs}: the next call builds one from the configured root.
 */
export function indexedProject(): IndexedProject {
  if (!current || resolutionInputsChanged(current.inputs)) {
    const inputs = readResolutionInputs();
    current = stamped(createModulesProject(), inputs);
  } else if (written || sourcesChanged(current.stamps)) {
    refreshFromDisk(current.project);
    current = stamped(current.project, current.inputs);
  }
  written = false;
  return current;
}

function stamped(project: Project, inputs: ResolutionInputs): IndexedProject {
  return { project, stamps: stampSources(project), inputs };
}

/** Make the next {@link indexedProject} read the disk again, after the engine wrote to it. */
export function markSourcesWritten(): void {
  written = true;
}

export function invalidateIndexedProject(): void {
  current = undefined;
}
