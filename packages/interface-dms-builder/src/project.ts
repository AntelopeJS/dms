import { InterfaceFunction } from "@antelopejs/interface-core";
import type { OpResult } from "./results";
import type { ConfigObject } from "./values";

/** One `importOverrides` entry: a pin when `id` is absent, a named connection when it is set. */
export interface ImportOverrideInput {
  interface: string;
  /** The module that provides it; omitted for a connection to a standalone interface. */
  source?: string;
  id?: string;
}

/**
 * What a project-config operation writes into one module's entry of `antelope.config.ts`.
 *
 * Secrets never pass through it: `env` maps a config path to the *name* of an environment
 * variable, written into `envOverrides`, and the value stays wherever the environment keeps it.
 */
export interface ModuleEntryInput {
  /** The module's source, as `antelope.config.ts` spells it. */
  source?: ConfigObject;
  /** Plain configuration values; merged key by key into an existing entry. */
  config?: ConfigObject;
  /** Config path under the module's `config`, e.g. `url`, to the variable that supplies it. */
  env?: Record<string, string>;
  /** Added to the module's own; a pin that contradicts an existing one is refused. */
  importOverrides?: ImportOverrideInput[];
  /** Merged into the module's own. */
  exportPriority?: Record<string, number>;
  /**
   * Interfaces the module implements that core must never offer from it, such as the raw-client
   * interface of a database module serving an external database. Added to the module's own.
   */
  disabledExports?: string[];
}

/** Adds a module entry. Refused when the id exists. */
export interface AddModuleStep {
  op: "AddModule";
  id: string;
  entry: ModuleEntryInput;
}

/** Merges into an existing module entry. */
export interface ConfigureModuleStep {
  op: "ConfigureModule";
  id: string;
  entry: ModuleEntryInput;
}

/**
 * Scaffolds a local module at `path` (relative to the project root) and adds its entry: a
 * `package.json` carrying the project's interface dependencies, a `tsconfig.json` with the
 * project's compiler options, and an `src/index.ts`. The entry watches and rebuilds it as the
 * project's own module is. With `connection`, its `dmsBuilder.database` record names that
 * connection: the module holds that connection's tables, and goes with it when it is removed.
 */
export interface CreateLocalModuleStep {
  op: "CreateLocalModule";
  id: string;
  path: string;
  entry?: ModuleEntryInput;
  connection?: string;
}

/**
 * Removes a module entry and the `envOverrides` entries that supply its config. Its files stay.
 * Refused while another module's `importOverrides` names it as a source.
 */
export interface RemoveModuleStep {
  op: "RemoveModule";
  id: string;
}

/** Removes the named connection `id` to `interface` from every module's `importOverrides`. */
export interface RemoveConnectionStep {
  op: "RemoveConnection";
  interface: string;
  id: string;
}

export type ProjectConfigStep =
  | AddModuleStep
  | ConfigureModuleStep
  | CreateLocalModuleStep
  | RemoveModuleStep
  | RemoveConnectionStep;

/** Options for a project-config operation. */
export interface ProjectConfigOpts {
  /** Answer the changes the steps would make, and write nothing. */
  dryRun?: boolean;
}

/** Options for `CreateLocalModule`. */
export interface CreateLocalModuleOpts extends ProjectConfigOpts {
  /** The connection whose tables the module holds, as `CreateLocalModuleStep.connection`. */
  connection?: string;
}

/** The files a project-config operation wrote, or would write. */
export interface ProjectConfigResult {
  files: string[];
}

/**
 * Applies steps to `antelope.config.ts` in order, as one edit: every step is validated before
 * anything is written, and none is written if one is refused. The configuration must be a
 * `defineConfig({ … })` (or plain object) literal with a literal `modules`.
 */
export const ConfigureProject =
  InterfaceFunction<
    (
      steps: ProjectConfigStep[],
      opts?: ProjectConfigOpts,
    ) => Promise<OpResult<ProjectConfigResult>>
  >();

/** One `AddModule` step. */
export const AddModule =
  InterfaceFunction<
    (
      id: string,
      entry: ModuleEntryInput,
      opts?: ProjectConfigOpts,
    ) => Promise<OpResult<ProjectConfigResult>>
  >();

/** One `ConfigureModule` step. */
export const ConfigureModule =
  InterfaceFunction<
    (
      id: string,
      entry: ModuleEntryInput,
      opts?: ProjectConfigOpts,
    ) => Promise<OpResult<ProjectConfigResult>>
  >();

/** One `CreateLocalModule` step; `opts.connection` is the step's `connection`. */
export const CreateLocalModule =
  InterfaceFunction<
    (
      id: string,
      path: string,
      entry?: ModuleEntryInput,
      opts?: CreateLocalModuleOpts,
    ) => Promise<OpResult<ProjectConfigResult>>
  >();
