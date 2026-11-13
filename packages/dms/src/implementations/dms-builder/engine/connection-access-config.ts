import fs from "node:fs/promises";
import { z } from "zod";
import type { ConfigLoader } from "@antelopejs/core";
import { findConfigFile } from "./modules";
import { resolveProjectRoot } from "./project";
import { isString } from "./scalar-guards";

/**
 * What the project lets the builder do on an external connection: write, or only read, with why
 * it may not write.
 */
export type ResolvedAccess =
  | { access: "read-write" }
  | { access: "read"; reason: string };

type LoadedConfig = Awaited<ReturnType<ConfigLoader["load"]>>;
type FileSystem = ConstructorParameters<typeof ConfigLoader>[0];

/** The config as core loads it for an environment, or why it could not be loaded. */
type Resolution =
  | { config: LoadedConfig; environment: string }
  | { failure: string };

const DMS_DATABASE_ID = "dms-database";
const DMS_DATABASE_PACKAGE = "@antelopejs/dms-database";
const LOAD_TIMEOUT_MS = 15_000;

function refuseWrite(): Promise<never> {
  return Promise.reject(
    new Error("the builder reads the project configuration only"),
  );
}

/** The files core's loader reads, through `node:fs`; it never writes while it resolves. */
const READ_ONLY_FILE_SYSTEM: FileSystem = {
  readFile: (file) => fs.readFile(file),
  readFileString: (file, encoding = "utf8") => fs.readFile(file, encoding),
  readdir: (directory) => fs.readdir(directory),
  stat: (file) => fs.stat(file),
  exists: (file) =>
    fs.access(file).then(
      () => true,
      () => false,
    ),
  access: (file) => fs.access(file),
  writeFile: refuseWrite,
  mkdir: refuseWrite,
  rm: refuseWrite,
  copyFile: refuseWrite,
  rename: refuseWrite,
};

let launchEnvironment: string | undefined;
let resolution: Resolution = {
  failure: "it was not resolved before this operation",
};

/**
 * Records the environment core launched the project with, so the access is resolved for it.
 * Until then, core's default environment is used.
 *
 * @param environment `GetRuntimeInfo().env`
 */
export function recordLaunchEnvironment(environment: string | undefined): void {
  launchEnvironment = environment;
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`it took over ${LOAD_TIMEOUT_MS / 1000} s`)),
      LOAD_TIMEOUT_MS,
    );
    timer.unref();
  });
  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}

/**
 * Loads the project configuration with core's own `ConfigLoader`, for the launch environment, so
 * the access checks of the operation that follows read what dms-database receives: the entry,
 * that environment's member of `environments`, `antelope.<id>.json`, then `envOverrides`, in
 * core's order. It runs before every guarded operation, so a change applies without a restart.
 * It never throws: a failure is kept as the reason every connection reads as `"read"`.
 */
export async function resolveConnectionAccess(): Promise<void> {
  try {
    const core = await import("@antelopejs/core");
    const environment = launchEnvironment ?? core.DEFAULT_ENV;
    const config = await withTimeout(
      new core.ConfigLoader(READ_ONLY_FILE_SYSTEM).load(
        resolveProjectRoot(),
        environment,
        findConfigFile(),
      ),
    );
    resolution = { config, environment };
  } catch (error) {
    resolution = {
      failure: error instanceof Error ? error.message : String(error),
    };
  }
}

/** The parts of a loaded module entry the access is read from; other members pass through. */
const ModuleEntrySchema = z
  .object({
    source: z
      .object({ package: z.string().optional() })
      .passthrough()
      .optional(),
    config: z
      .object({
        externalConnections: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const ConnectionSettingSchema = z.object({ access: z.unknown() }).passthrough();

const ModulesSchema = z.record(z.string(), z.unknown());

type ModuleEntry = z.infer<typeof ModuleEntrySchema>;

function isDmsDatabaseEntry(
  id: string,
  entry: ModuleEntry | undefined,
): boolean {
  return (
    id === DMS_DATABASE_ID || entry?.source?.package === DMS_DATABASE_PACKAGE
  );
}

/** What the dms-database entry says about a connection, completing "… for the <env> environment". */
function accessOf(
  id: string,
  entry: ModuleEntry | undefined,
  connection: string,
): ResolvedAccess {
  const where = `\`config.externalConnections.${connection}.access\` of the ${id} module`;
  if (!entry) {
    return { access: "read", reason: `the ${id} module is not a plain object` };
  }
  const connections = entry.config?.externalConnections ?? {};
  if (!Object.hasOwn(connections, connection)) {
    return {
      access: "read",
      reason: `${where} is not set, and "read" is the default,`,
    };
  }
  const setting = ConnectionSettingSchema.safeParse(connections[connection]);
  if (!setting.success) {
    return { access: "read", reason: `${where} is not under a plain object` };
  }
  const { access } = setting.data;
  if (access === "read-write") {
    return { access: "read-write" };
  }
  return {
    access: "read",
    reason: `${where} is ${isString(access) ? JSON.stringify(access) : "not a string"}`,
  };
}

/**
 * The access the last {@link resolveConnectionAccess} gives a connection:
 * `config.externalConnections.<id>.access` of the loaded dms-database module. Anything but
 * `"read-write"` there, a configuration that could not be resolved included, is `"read"`.
 */
export function connectionAccess(connection: string): ResolvedAccess {
  if ("failure" in resolution) {
    return {
      access: "read",
      reason: `the project configuration could not be resolved: ${resolution.failure}`,
    };
  }
  const { config, environment } = resolution;
  const modules = ModulesSchema.safeParse(config.modules);
  const entries = modules.success
    ? Object.entries(modules.data).map(
        ([id, raw]): [string, ModuleEntry | undefined] => {
          const parsed = ModuleEntrySchema.safeParse(raw);
          return [id, parsed.success ? parsed.data : undefined];
        },
      )
    : [];
  const found = entries.find(([id, entry]) => isDmsDatabaseEntry(id, entry));
  if (!found) {
    return {
      access: "read",
      reason: `no dms-database module is loaded for the "${environment}" environment, and "read" is the default`,
    };
  }
  const resolved = accessOf(found[0], found[1], connection);
  return resolved.access === "read-write"
    ? resolved
    : {
        access: "read",
        reason: `${resolved.reason} for the "${environment}" environment`,
      };
}
