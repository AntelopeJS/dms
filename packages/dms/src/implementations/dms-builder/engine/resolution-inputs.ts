import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ts } from "ts-morph";
import { CONFIG_FILES, projectModules } from "./modules";
import { resolveProjectRoot } from "./project";

/**
 * The files a ts-morph project reads once, when it is built, and that decide how it resolves the
 * app's imports: the install state of every `node_modules` a module's imports may reach, the
 * tsconfig with the files it extends, and the project configuration that lists the modules.
 */
export type ResolutionInputs = ReadonlyMap<string, InputState>;

/** One input as last compared: its size and mtime, or `absent`, and a digest of its content. */
interface InputState {
  stat: string;
  readonly digest: string | undefined;
}

/** The files a package manager rewrites on each install: pnpm, npm, yarn and bun. */
const INSTALL_STATE = [
  path.join("node_modules", ".modules.yaml"),
  path.join("node_modules", ".package-lock.json"),
  path.join("node_modules", ".yarn-state.yml"),
  path.join("node_modules", ".yarn-integrity"),
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
];

/** The resolution inputs as they are on disk now. */
export function readResolutionInputs(): ResolutionInputs {
  const projectRoot = resolveProjectRoot();
  const files = new Set<string>(
    CONFIG_FILES.map((name) => path.join(projectRoot, name)),
  );
  const roots = [projectRoot, ...projectModules().map((module) => module.root)];
  for (const root of roots) {
    for (const directory of ancestors(root)) {
      for (const name of INSTALL_STATE) {
        files.add(path.join(directory, name));
      }
    }
  }
  for (const directory of ancestors(projectRoot)) {
    const tsconfig = path.join(directory, "tsconfig.json");
    files.add(tsconfig);
    if (fs.existsSync(tsconfig)) {
      for (const extended of extendedConfigs(tsconfig)) {
        files.add(extended);
      }
      break;
    }
  }
  return new Map(
    [...files].map((file) => [
      file,
      { stat: statOf(file), digest: digestOf(file) },
    ]),
  );
}

/**
 * Whether a resolution input's content has changed since `inputs` were read. A file whose size or
 * mtime moved is read again, and one rewritten with the same content, as a no-op install does,
 * keeps its digest and records the new stat.
 */
export function resolutionInputsChanged(inputs: ResolutionInputs): boolean {
  for (const [file, state] of inputs) {
    const stat = statOf(file);
    if (stat === state.stat) {
      continue;
    }
    if (digestOf(file) !== state.digest) {
      return true;
    }
    state.stat = stat;
  }
  return false;
}

function ancestors(directory: string): string[] {
  const parent = path.dirname(directory);
  return parent === directory ? [directory] : [directory, ...ancestors(parent)];
}

/** The files a tsconfig extends, directly or through another, as parsing it records them. */
function extendedConfigs(tsconfig: string): readonly string[] {
  const source = ts.readJsonConfigFile(tsconfig, (file) =>
    ts.sys.readFile(file),
  );
  ts.parseJsonSourceFileConfigFileContent(
    source,
    ts.sys,
    path.dirname(tsconfig),
  );
  return source.extendedSourceFiles ?? [];
}

function statOf(file: string): string {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  return stat ? `${stat.size}:${stat.mtimeMs}` : "absent";
}

function digestOf(file: string): string | undefined {
  try {
    return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return undefined;
  }
}
