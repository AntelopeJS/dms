import fs from "node:fs";
import path from "node:path";
import type {
  FileChange,
  OpResult,
  ProjectConfigResult,
  ProjectConfigStep,
} from "@antelopejs/interface-dms-builder";
import {
  type ConnectionWiring,
  connectionWiring,
  isConnectionRefusal,
} from "./database-connection";
import { CATALOG_INTERFACE } from "./interface-ids";
import { invalidConfig, unsupported } from "./ops";
import { StepRefusal } from "./project-config";
import { configureProject } from "./project-config-ops";
import {
  type EnvRemoval,
  variableRemovals,
  writeEnvFiles,
} from "./project-env";
import { DATABASE_SOURCE_INTERFACES } from "./project-config-readers";
import { localModuleRoot } from "./project-scaffold";

/** The steps that take a connection out of the configuration: its connections, its modules. */
function removalSteps(wiring: ConnectionWiring): ProjectConfigStep[] {
  const steps: ProjectConfigStep[] = [
    {
      op: "RemoveConnection",
      interface: CATALOG_INTERFACE,
      id: wiring.connection,
    },
    ...wiring.modules.map((module): ProjectConfigStep => ({
      op: "RemoveModule",
      id: module.id,
    })),
  ];
  if (wiring.ownsDriver) {
    steps.push({ op: "RemoveModule", id: wiring.driver });
  }
  return steps;
}

function folderChanges(wiring: ConnectionWiring): FileChange[] {
  return wiring.modules.map((module) => ({
    path: localModuleRoot(module.path),
    kind: "delete" as const,
    diff: "",
  }));
}

export interface RemoveConnectionOpts {
  dryRun?: boolean;
}

interface SetAside {
  folder: string;
  aside: string;
}

/**
 * Moves each folder beside itself under a hidden name, so a folder that cannot be moved refuses
 * the removal before anything is written, and one already moved can be put back.
 */
function setFoldersAside(folders: FileChange[]): SetAside[] {
  const moved: SetAside[] = [];
  try {
    for (const { path: folder } of folders) {
      if (!fs.existsSync(folder)) {
        continue;
      }
      const aside = path.join(
        path.dirname(folder),
        `.${path.basename(folder)}.removed-${Date.now()}`,
      );
      fs.renameSync(folder, aside);
      moved.push({ folder, aside });
    }
  } catch (error) {
    const reason = `could not move a module folder aside: ${error instanceof Error ? error.message : String(error)}`;
    undoRemoval([], moved, reason);
    throw new StepRefusal(reason);
  }
  return moved;
}

/** Runs every step, even after one throws, then throws the first error. */
function eachOf(steps: (() => void)[]): void {
  const errors: unknown[] = [];
  for (const step of steps) {
    try {
      step();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw errors[0];
  }
}

function putFoldersBack(moved: SetAside[]): void {
  eachOf(
    [...moved].reverse().map(
      ({ folder, aside }) =>
        () =>
          fs.renameSync(aside, folder),
    ),
  );
}

/**
 * Puts `.env`, `.env.example` and the folders back as they were, each on its own. When one cannot
 * be, the error says so after `cause`, why the removal stopped, so neither hides the other.
 */
function undoRemoval(
  env: EnvRemoval[],
  moved: SetAside[],
  cause: string,
): void {
  try {
    putEverythingBack(env, moved);
  } catch (error) {
    throw new Error(
      `${cause}; putting the project back failed too: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function putEverythingBack(env: EnvRemoval[], moved: SetAside[]): void {
  eachOf([
    ...env.map(
      (removal) => () => writeEnvFiles([removal], (entry) => entry.before),
    ),
    () => putFoldersBack(moved),
  ]);
}

/** Deletes the folders set aside; one that cannot be deleted stays hidden, out of the configuration. */
function deleteSetAside(moved: SetAside[]): void {
  for (const { aside } of moved) {
    try {
      fs.rmSync(aside, { recursive: true, force: true, maxRetries: 2 });
    } catch {
      continue;
    }
  }
}

/**
 * Takes a connection out of the project: its catalog connections, its tables modules and their
 * folders and, when it was added for this connection alone, its driver and the variables supplying
 * its configuration in `envOverrides`, `.env` and `.env.example`. Refused while another module still reads through the
 * driver it would remove. Nothing is written when a folder cannot be moved or the configuration
 * refuses. The value of the variable is never answered.
 */
export function removeDatabaseConnection(
  connection: string,
  opts: RemoveConnectionOpts = {},
): OpResult<ProjectConfigResult> {
  let wiring: ConnectionWiring | undefined;
  let folders: FileChange[];
  try {
    wiring = connectionWiring(connection);
    folders = wiring ? folderChanges(wiring) : [];
  } catch (error) {
    if (isConnectionRefusal(error)) {
      return invalidConfig<ProjectConfigResult>(error.message);
    }
    throw error;
  }
  if (!wiring) {
    return unsupported<ProjectConfigResult>(
      `no module of the configuration declares the connection "${connection}"`,
    );
  }
  const steps = removalSteps(wiring);
  const checked = configureProject(
    steps,
    { dryRun: true },
    DATABASE_SOURCE_INTERFACES,
  );
  if (!checked.ok) {
    return checked;
  }
  const env = wiring.ownsDriver ? variableRemovals(wiring.variables) : [];
  if (!opts.dryRun) {
    const done = removeWritten(steps, folders, env);
    if (!done.ok) {
      return done;
    }
  }
  const changes = [
    ...checked.changes,
    ...env.map((removal) => removal.change),
    ...folders,
  ];
  return {
    ok: true,
    data: { files: changes.map((change) => change.path) },
    changes,
  };
}

/**
 * Sets the folders aside and removes the driver's variables from `.env` and `.env.example`, then writes the configuration: when
 * any of it fails, what was done before is put back, so a removal is all or nothing.
 */
function removeWritten(
  steps: ProjectConfigStep[],
  folders: FileChange[],
  env: EnvRemoval[],
): OpResult<ProjectConfigResult> {
  let moved: SetAside[];
  try {
    moved = setFoldersAside(folders);
  } catch (error) {
    if (error instanceof StepRefusal) {
      return invalidConfig<ProjectConfigResult>(error.message);
    }
    throw error;
  }
  let configured: OpResult<ProjectConfigResult>;
  try {
    writeEnvFiles(env, (removal) => removal.after);
    configured = configureProject(steps, {}, DATABASE_SOURCE_INTERFACES);
  } catch (error) {
    undoRemoval(
      env,
      moved,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
  if (!configured.ok) {
    undoRemoval(env, moved, JSON.stringify(configured.error));
    return configured;
  }
  deleteSetAside(moved);
  return configured;
}
