import fs from "node:fs";
import path from "node:path";
import { ts } from "ts-morph";
import { projectModules } from "./modules";
import { resolveProjectRoot } from "./project";

/**
 * The files a ts-morph project reads once, when it is built, and that decide how it resolves the
 * app's imports: the install state of every `node_modules` a module's imports may reach, and the
 * tsconfig with the files it extends. Each maps to its size and mtime, or to `absent`.
 */
export type ResolutionInputs = ReadonlyMap<string, string>;

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
  const files = new Set<string>();
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
  return new Map([...files].map((file) => [file, fileStamp(file)]));
}

/** Whether a resolution input has changed on disk since `inputs` were read. */
export function resolutionInputsChanged(inputs: ResolutionInputs): boolean {
  for (const [file, stamp] of inputs) {
    if (fileStamp(file) !== stamp) {
      return true;
    }
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

function fileStamp(file: string): string {
  try {
    const stat = fs.statSync(file);
    return `${stat.size}:${stat.mtimeMs}`;
  } catch {
    return "absent";
  }
}
