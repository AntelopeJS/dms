import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";
import { findConfigFile } from "./modules";
import { resolveProjectRoot } from "./project";
import { isString } from "./scalar-guards";

/**
 * Why a connection may not be written: its access says so (`configured`), the configuration could
 * not be loaded (`unresolved`), or `@antelopejs/core`, which loads it, is missing (`core-missing`).
 */
export type ReadOnlyCause = "configured" | "unresolved" | "core-missing";

/**
 * What the project lets the builder do on an external connection: write, or only read, with why
 * it may not write.
 */
export type ResolvedAccess =
  | { access: "read-write" }
  | { access: "read"; cause: ReadOnlyCause; reason: string };

const ResolutionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("loaded"),
    environment: z.string(),
    modules: z.record(z.string(), z.unknown()),
  }),
  z.object({ kind: z.literal("core-missing") }),
  z.object({ kind: z.literal("failed"), detail: z.string() }),
]);

/** The project configuration as core loads it for an operation, or why it could not. */
type Resolution = z.infer<typeof ResolutionSchema>;

const DMS_DATABASE_ID = "dms-database";
const DMS_DATABASE_PACKAGE = "@antelopejs/dms-database";
const CORE_PACKAGE = "@antelopejs/core";
const LOAD_TIMEOUT_MS = 15_000;

type CoreModule = typeof import("@antelopejs/core");
type FileSystem = ConstructorParameters<CoreModule["ConfigLoader"]>[0];

/** What the builder reads from a thrown value. */
const ThrownSchema = z
  .object({ message: z.string(), code: z.string().optional() })
  .catch({ message: "an error with no message" });

type Thrown = z.infer<typeof ThrownSchema>;

function thrown(error: unknown): Thrown {
  return ThrownSchema.parse(error);
}

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

/**
 * Records the environment core launched the project with, so the access is resolved for it.
 * Until then, core's default environment is used.
 *
 * @param environment `GetRuntimeInfo().env`
 */
export function recordLaunchEnvironment(environment: string | undefined): void {
  launchEnvironment = environment;
}

/** Puts `process.env` back as it was: core's loader reads the project's `.env` into it. */
function restoreEnv(before: NodeJS.ProcessEnv): void {
  for (const name of Object.keys(process.env)) {
    if (!Object.hasOwn(before, name)) {
      delete process.env[name];
    }
  }
  for (const [name, value] of Object.entries(before)) {
    if (process.env[name] !== value) {
      process.env[name] = value;
    }
  }
}

type ConfigLoad = InstanceType<CoreModule["ConfigLoader"]>["load"];
type ConfigLoading = ReturnType<ConfigLoad>;
type VariableReader = Parameters<ConfigLoad>[3];

/** Which configuration to load: the launch environment's, or the base entries alone. */
interface LoadTarget {
  environment: string;
  variables?: VariableReader;
}

/**
 * An environment name no project declares, so core merges no member of `environments` over the
 * base; with a reader that supplies no variable, no `envOverrides` either.
 */
const BASE_ENVIRONMENT = "\u0000dms-builder-base";
const BASE: LoadTarget = {
  environment: BASE_ENVIRONMENT,
  variables: () => undefined,
};

/** Calls core's loader, putting `process.env` back before anything else runs. */
function startLoad(
  core: CoreModule,
  { environment, variables }: LoadTarget,
  before: NodeJS.ProcessEnv,
): ConfigLoading {
  try {
    return new core.ConfigLoader(READ_ONLY_FILE_SYSTEM).load(
      resolveProjectRoot(),
      environment,
      findConfigFile(),
      variables,
    );
  } finally {
    restoreEnv(before);
  }
}

/** The names the project's `.env`, beside its configuration, defines. */
function projectEnvNames(): Set<string> {
  const configPath = findConfigFile();
  if (configPath === undefined) {
    return new Set();
  }
  try {
    const text = readFileSync(
      path.join(path.dirname(configPath), ".env"),
      "utf8",
    );
    return new Set(Object.keys(parseEnv(text)));
  } catch {
    return new Set();
  }
}

/** Removes the project's `.env` variables a load added; another variable set meanwhile stays. */
function dropAdded(before: NodeJS.ProcessEnv): void {
  for (const name of projectEnvNames()) {
    if (!Object.hasOwn(before, name)) {
      delete process.env[name];
    }
  }
}

/**
 * Loads the configuration and leaves `process.env` as it was. Core reads the project's `.env`
 * synchronously, before the loader's first `await`, so it is put back before any other code runs.
 * A configuration may also load a `.env` itself (`process.loadEnvFile`, which the builder writes
 * when it maps a variable) while it is evaluated, later: once the load settles, the variables it
 * added are removed too. `loadEnvFile` never overwrites a variable already set, so no other is
 * changed.
 */
function loadLeavingEnv(core: CoreModule, target: LoadTarget): ConfigLoading {
  const before = { ...process.env };
  return startLoad(core, target, before).finally(() => dropAdded(before));
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

/** Loads the project configuration with core's own `ConfigLoader`, or says why it could not. */
async function loadResolution(base: boolean): Promise<Resolution> {
  let core: CoreModule;
  try {
    core = await import("@antelopejs/core");
  } catch (error) {
    const { code, message } = thrown(error);
    return code === "MODULE_NOT_FOUND" && message.includes(`'${CORE_PACKAGE}'`)
      ? { kind: "core-missing" }
      : { kind: "failed", detail: message };
  }
  try {
    const target = base
      ? BASE
      : { environment: launchEnvironment ?? core.DEFAULT_ENV };
    const environment = base ? "base" : target.environment;
    const config = await withTimeout(loadLeavingEnv(core, target));
    const modules = ResolutionSchema.safeParse({
      kind: "loaded",
      environment,
      modules: config.modules ?? {},
    });
    return modules.success
      ? modules.data
      : { kind: "failed", detail: "its modules are not plain objects" };
  } catch (error) {
    return { kind: "failed", detail: thrown(error).message };
  }
}

const operationAccess = new AsyncLocalStorage<Resolution>();

/**
 * Runs an operation with the project configuration core loads for the launch environment, so
 * its access checks read what dms-database receives: the entry, that environment's member of
 * `environments`, `antelope.<id>.json`, then `envOverrides`, in core's order. Each operation
 * loads its own and reads only its own, so a change applies without a restart and concurrent
 * operations never see each other's.
 */
export async function withConnectionAccess<T>(
  work: () => T | Promise<T>,
): Promise<T> {
  const resolution = await loadResolution(false);
  return operationAccess.run(resolution, work);
}

/**
 * Runs `work` with the configuration's base entries alone: core loads it for an environment no
 * project declares and with no variable, so neither `environments` nor `envOverrides` applies.
 * A step that writes an entry's base `config` compares against this, since every environment
 * reads what it writes.
 */
export async function withBaseConnectionAccess<T>(
  work: () => T | Promise<T>,
): Promise<T> {
  const resolution = await loadResolution(true);
  return operationAccess.run(resolution, work);
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

type ModuleEntry = z.infer<typeof ModuleEntrySchema>;

function isDmsDatabaseEntry(
  id: string,
  entry: ModuleEntry | undefined,
): boolean {
  return (
    id === DMS_DATABASE_ID || entry?.source?.package === DMS_DATABASE_PACKAGE
  );
}

function configured(reason: string): ResolvedAccess {
  return { access: "read", cause: "configured", reason };
}

/** What the dms-database entry says about a connection, completing "… for the <env> environment". */
function accessOf(
  id: string,
  entry: ModuleEntry | undefined,
  connection: string,
): ResolvedAccess {
  const where = `\`config.externalConnections.${connection}.access\` of the ${id} module`;
  if (!entry) {
    return configured(`the ${id} module is not a plain object`);
  }
  const connections = entry.config?.externalConnections ?? {};
  if (!Object.hasOwn(connections, connection)) {
    return configured(`${where} is not set, and "read" is the default,`);
  }
  const setting = ConnectionSettingSchema.safeParse(connections[connection]);
  if (!setting.success) {
    return configured(`${where} is not under a plain object`);
  }
  const { access } = setting.data;
  if (access === "read-write") {
    return { access: "read-write" };
  }
  return configured(
    `${where} is ${isString(access) ? JSON.stringify(access) : "not a string"}`,
  );
}

function loadedAccess(
  modules: Extract<Resolution, { kind: "loaded" }>["modules"],
  environment: string,
  connection: string,
): ResolvedAccess {
  const found = Object.entries(modules)
    .map(([id, raw]): [string, ModuleEntry | undefined] => {
      const parsed = ModuleEntrySchema.safeParse(raw);
      return [id, parsed.success ? parsed.data : undefined];
    })
    .find(([id, entry]) => isDmsDatabaseEntry(id, entry));
  if (!found) {
    return configured(
      `no dms-database module is loaded for the "${environment}" environment, and "read" is the default`,
    );
  }
  const resolved = accessOf(found[0], found[1], connection);
  return resolved.access === "read-write"
    ? resolved
    : configured(`${resolved.reason} for the "${environment}" environment`);
}

/**
 * The access the running operation's configuration gives a connection:
 * `config.externalConnections.<id>.access` of the loaded dms-database module. Anything but
 * `"read-write"` there, a configuration that could not be loaded included, is `"read"`.
 */
export function connectionAccess(connection: string): ResolvedAccess {
  const resolution = operationAccess.getStore();
  if (!resolution) {
    return {
      access: "read",
      cause: "unresolved",
      reason: "the configuration was not loaded for this operation",
    };
  }
  switch (resolution.kind) {
    case "loaded":
      return loadedAccess(
        resolution.modules,
        resolution.environment,
        connection,
      );
    case "core-missing":
      return {
        access: "read",
        cause: "core-missing",
        reason:
          "the builder cannot load @antelopejs/core, which resolves the project configuration",
      };
    case "failed":
      return {
        access: "read",
        cause: "unresolved",
        reason: `the project configuration could not be loaded: ${resolution.detail}`,
      };
  }
}
