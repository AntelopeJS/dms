import fs from "node:fs";
import path from "node:path";
import { ts } from "ts-morph";
import { posixRelative } from "./file-paths";
import { isString } from "./scalar-guards";
import { DEFAULT_COMPILER_OPTIONS, resolveProjectRoot } from "./project";
import { isPlainObject } from "./value";

const INTERFACE_PACKAGE = /^@antelopejs\/interface-/;
/**
 * The interface packages the code the builder writes imports, at the builder's own ranges: a
 * module it scaffolds depends on them, so what it later writes there resolves and builds once the
 * restart that follows has installed them. The project's own range wins for one it declares.
 */
export const BUILDER_CODE_INTERFACES = {
  "@antelopejs/interface-api": ">=0.3.2 <1.0.0",
  "@antelopejs/interface-core": ">=0.4.0 <1.0.0",
  "@antelopejs/interface-data-api": ">=0.6.1 <1.0.0",
  "@antelopejs/interface-database": ">=0.3.0 <1.0.0",
  "@antelopejs/interface-database-decorators": ">=0.2.0 <1.0.0",
  "@antelopejs/interface-dms": ">=0.12.0 <1.0.0",
} satisfies Record<string, string>;
/**
 * The build tooling a module needs, at these ranges when the project does not declare its own.
 * TypeScript always stays at this range: a module compiles `commonjs` with `bundler` resolution,
 * which an older compiler refuses.
 */
const DEFAULT_TOOLING = {
  typescript: "^6.0.3",
  rimraf: "^6.1.3",
  "@types/node": "^24.0.0",
} satisfies Record<string, string>;
/**
 * What a module's build needs whatever the project's tsconfig says: a CommonJS emit from `src`
 * into `dist`, with its incremental state in `dist`, which the build deletes, so no state left
 * outside claims the emit is current once `dist` is gone.
 */
const MODULE_OPTIONS = {
  module: "commonjs",
  moduleResolution: "bundler",
  rootDir: "src",
  outDir: "dist",
  tsBuildInfoFile: "dist/.tsbuildinfo",
};
/**
 * The project's options a module overrides: those that stop or break its emit or write it outside
 * `dist`, and those that name what only the project installs or holds. A module installs `@types/node` alone.
 */
const PROJECT_OPTIONS_OVERRIDDEN = {
  noEmit: false,
  emitDeclarationOnly: false,
  outFile: null,
  declarationDir: null,
  allowImportingTsExtensions: false,
  verbatimModuleSyntax: false,
  types: ["node"],
  typeRoots: null,
  baseUrl: null,
  paths: null,
};
const ENTRY_TEXT =
  "export function construct(): void {}\n\nexport async function start(): Promise<void> {}\n";

/** A module about to be created: its files, by absolute path, and the source its entry names. */
export interface Scaffold {
  id: string;
  root: string;
  entryFile: string;
  entryText: string;
  files: Map<string, string>;
  source: LocalSource;
}

type Versions = Record<string, string> | null | never[];

interface PackageManifest {
  dependencies?: Versions;
  devDependencies?: Versions;
  packageManager?: string | null;
}

class ScaffoldRefusal extends Error {}

function isVersions(value: unknown): value is Versions {
  if (value === null || Array.isArray(value)) {
    return true;
  }
  return isPlainObject(value) && Object.values(value).every(isString);
}

function isPackageManifest(value: unknown): value is PackageManifest {
  return (
    isPlainObject(value) &&
    (value.dependencies === undefined || isVersions(value.dependencies)) &&
    (value.devDependencies === undefined ||
      isVersions(value.devDependencies)) &&
    (value.packageManager === undefined ||
      value.packageManager === null ||
      isString(value.packageManager))
  );
}

/** A JSON file of the project, read as TypeScript reads one: comments and trailing commas allowed. */
function readJson<T>(
  file: string,
  isReadable: (value: unknown) => value is T,
): T | undefined {
  if (!fs.existsSync(file)) {
    return undefined;
  }
  const read = ts.parseConfigFileTextToJson(
    file,
    fs.readFileSync(file, "utf8"),
  );
  if (read.error) {
    throw new ScaffoldRefusal(
      `${path.basename(file)} cannot be read: ${ts.flattenDiagnosticMessageText(read.error.messageText, " ")}`,
    );
  }
  if (!isReadable(read.config)) {
    throw new ScaffoldRefusal(
      `${path.basename(file)} cannot be read: its fields are not of the types the builder reads`,
    );
  }
  return read.config;
}

const PATH_SPEC = /^(?<protocol>file:|link:|(?=\.\.?\/))(?<target>.*)$/s;

/**
 * A path spec relative to `from` (`file:`, `link:` or a bare `./` or `../` path), rewritten to
 * name the same target from `to`. An absolute or home-relative (`~`) spec names it from anywhere.
 */
function rebasedSpec(spec: string, from: string, to: string): string {
  const local = PATH_SPEC.exec(spec)?.groups;
  if (
    local === undefined ||
    local.target === "~" ||
    local.target.startsWith("~/") ||
    path.isAbsolute(local.target)
  ) {
    return spec;
  }
  const target = path
    .relative(to, path.resolve(from, local.target))
    .split(path.sep)
    .join("/");
  return `${local.protocol}${target.startsWith("../") ? "" : "./"}${target}`;
}

function rebasedVersions(
  versions: Versions | undefined,
  from: string,
  to: string,
): Versions | undefined {
  if (versions === undefined || versions === null || Array.isArray(versions)) {
    return versions;
  }
  return Object.fromEntries(
    Object.entries(versions).map(([name, spec]) => [
      name,
      rebasedSpec(spec, from, to),
    ]),
  );
}

/** The project's manifest with its path specs resolving from the module's folder `root`. */
function seenFrom(
  project: PackageManifest,
  projectRoot: string,
  root: string,
): PackageManifest {
  return {
    ...project,
    dependencies: rebasedVersions(project.dependencies, projectRoot, root),
    devDependencies: rebasedVersions(
      project.devDependencies,
      projectRoot,
      root,
    ),
  };
}

function picked(
  versions: Record<string, string> | never[] | undefined,
  keep: (name: string) => boolean,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(versions ?? {}).filter(([name]) => keep(name)),
  );
}

/**
 * The module's manifest: the project's interface dependencies and build tooling, at its ranges,
 * and the record of the connection whose tables it holds, when it holds one's.
 */
function manifestText(
  id: string,
  project: PackageManifest,
  connection: string | undefined,
): string {
  const all = Object.assign({}, project.devDependencies, project.dependencies);
  const tooling = picked(
    all,
    (name) => Object.hasOwn(DEFAULT_TOOLING, name) && name !== "typescript",
  );
  const manifest = {
    name: id,
    version: "0.0.1",
    private: true,
    main: "dist/index.js",
    scripts: { build: "rimraf dist && tsc", typecheck: "tsc --noEmit" },
    dependencies: {
      ...BUILDER_CODE_INTERFACES,
      ...picked(all, (name) => INTERFACE_PACKAGE.test(name)),
    },
    devDependencies: {
      ...DEFAULT_TOOLING,
      ...tooling,
    },
    packageManager: project.packageManager,
    antelopeJs: { baseUrl: "dist" },
    dmsBuilder: connection ? { database: { connection } } : undefined,
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * The module's tsconfig: it extends the project's, so the module compiles as the project does,
 * bases included, less what the module overrides; the builder's defaults when the project has none.
 */
function tsconfigText(
  root: string,
  projectTsconfig: string | undefined,
): string {
  const config =
    projectTsconfig === undefined
      ? { compilerOptions: { ...DEFAULT_COMPILER_OPTIONS, ...MODULE_OPTIONS } }
      : {
          extends: path
            .relative(root, projectTsconfig)
            .split(path.sep)
            .join("/"),
          compilerOptions: { ...PROJECT_OPTIONS_OVERRIDDEN, ...MODULE_OPTIONS },
          files: [],
          exclude: [],
        };
  return `${JSON.stringify({ ...config, include: ["src/**/*.ts"] }, null, 2)}\n`;
}

/**
 * The files of a new local module at `relativePath` under the project, and the source its entry
 * names: watched and rebuilt on change, as the project's own module is. Refused when the path
 * leaves the project or already exists.
 */
export function scaffoldLocalModule(
  id: string,
  relativePath: string,
  connection?: string,
): Scaffold {
  const projectRoot = resolveProjectRoot();
  const root = localModuleRoot(relativePath);
  if (fs.existsSync(root)) {
    throw new ScaffoldRefusal(`module path "${relativePath}" already exists`);
  }
  const project = seenFrom(
    readJson(path.join(projectRoot, "package.json"), isPackageManifest) ?? {},
    projectRoot,
    root,
  );
  const projectTsconfig = path.join(projectRoot, "tsconfig.json");
  return {
    id,
    root,
    entryFile: path.join(root, "src", "index.ts"),
    entryText: ENTRY_TEXT,
    files: new Map([
      [path.join(root, "package.json"), manifestText(id, project, connection)],
      [
        path.join(root, "tsconfig.json"),
        tsconfigText(
          root,
          fs.existsSync(projectTsconfig) ? projectTsconfig : undefined,
        ),
      ],
    ]),
    source: localSource(root),
  };
}

/** The folder of a local module at `relativePath` under the project; refused when it leaves it. */
export function localModuleRoot(relativePath: string): string {
  const projectRoot = resolveProjectRoot();
  const root = path.resolve(projectRoot, relativePath);
  if (!root.startsWith(projectRoot + path.sep)) {
    throw new ScaffoldRefusal(
      `module path "${relativePath}" leaves the project`,
    );
  }
  return root;
}

/** A local module's `source` in `antelope.config.ts`. */
export type LocalSource = {
  type: "local";
  path: string;
  watchDir: string[];
  installCommand: string[];
  reloadCommand: string[];
};

/** The source of a local module's entry: watched and rebuilt on change, as the project's own is. */
export function localSource(root: string): LocalSource {
  return {
    type: "local",
    path: posixRelative(resolveProjectRoot(), root),
    watchDir: ["src"],
    installCommand: ["pnpm install", "pnpm run build"],
    reloadCommand: ["pnpm exec tsc"],
  };
}

/** Refuses a step on a local module folder, with the reason the caller is told. */
export function refuseFolder(message: string): never {
  throw new ScaffoldRefusal(message);
}

export function isScaffoldRefusal(error: unknown): error is ScaffoldRefusal {
  return error instanceof ScaffoldRefusal;
}
