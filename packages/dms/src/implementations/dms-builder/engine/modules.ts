import fs from "node:fs";
import path from "node:path";
import {
  Node,
  type ObjectLiteralExpression,
  Project,
  type SourceFile,
} from "ts-morph";
import { createProject, resolveProjectRoot } from "./project";

const CONFIG_FILES = ["antelope.config.ts", "antelope.config.mts"];
const MODULE_ENTRY = path.join("src", "index.ts");
const LOCAL_SOURCE = "local";

/** One local module of the project the builder may write into. */
export interface ModuleRoot {
  /** The module's id in the project configuration; empty for an unconfigured project. */
  id: string;
  /** Absolute path of the module's root, where its `package.json` and `src/` sit. */
  root: string;
  /** Whether this is the project's own module, the default target of every operation. */
  isProject: boolean;
}

/** The project configuration file, when the project has one. */
export function findConfigFile(): string | undefined {
  const root = resolveProjectRoot();
  return CONFIG_FILES.map((name) => path.join(root, name)).find((candidate) =>
    fs.existsSync(candidate),
  );
}

/** The configuration's top-level object: `defineConfig({ … })` or a bare `{ … }`, exported by default. */
export function configObject(
  file: SourceFile,
): ObjectLiteralExpression | undefined {
  const exported = file.getExportAssignment(
    (assignment) => !assignment.isExportEquals(),
  );
  const expression = exported?.getExpression();
  if (Node.isObjectLiteralExpression(expression)) {
    return expression;
  }
  if (Node.isCallExpression(expression)) {
    const [argument] = expression.getArguments();
    return Node.isObjectLiteralExpression(argument) ? argument : undefined;
  }
  return undefined;
}

/** A property of an object literal, by its name as written: identifier or string literal. */
export function propertyNamed(
  object: ObjectLiteralExpression,
  name: string,
): Node | undefined {
  for (const property of object.getProperties()) {
    if (!Node.isPropertyAssignment(property)) {
      continue;
    }
    if (propertyKey(property.getNameNode()) === name) {
      return property.getInitializer();
    }
  }
  return undefined;
}

export function propertyKey(node: Node): string {
  if (
    Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
  ) {
    return node.getLiteralValue();
  }
  return node.getText();
}

function stringProperty(
  object: ObjectLiteralExpression,
  name: string,
): string | undefined {
  const value = propertyNamed(object, name);
  return Node.isStringLiteral(value) ||
    Node.isNoSubstitutionTemplateLiteral(value)
    ? value.getLiteralValue()
    : undefined;
}

/** A module entry's local root, when its source is a literal local path. */
function localRoot(
  entry: Node | undefined,
  projectRoot: string,
): string | undefined {
  if (!Node.isObjectLiteralExpression(entry)) {
    return undefined;
  }
  const source = propertyNamed(entry, "source");
  if (!Node.isObjectLiteralExpression(source)) {
    return undefined;
  }
  if (stringProperty(source, "type") !== LOCAL_SOURCE) {
    return undefined;
  }
  const relative = stringProperty(source, "path");
  return relative === undefined
    ? undefined
    : path.resolve(projectRoot, relative);
}

function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + path.sep);
}

/**
 * The project's local modules the builder may write into: each configured with a literal local
 * path inside the project's folder and an `src/index.ts`. Modules from packages, and local modules
 * elsewhere on disk, are not the project's sources and are never edited.
 */
export function projectModules(): ModuleRoot[] {
  const projectRoot = resolveProjectRoot();
  const configPath = findConfigFile();
  const stamp = configPath ? fs.statSync(configPath).mtimeMs : 0;
  const key = `${projectRoot}\0${configPath ?? ""}\0${stamp}`;
  if (cached?.key !== key) {
    cached = { key, modules: readModules(projectRoot, configPath) };
  }
  return cached.modules;
}

interface CachedModules {
  key: string;
  modules: ModuleRoot[];
}

let cached: CachedModules | undefined;

function readModules(
  projectRoot: string,
  configPath: string | undefined,
): ModuleRoot[] {
  const fallback: ModuleRoot[] = [
    { id: "", root: projectRoot, isProject: true },
  ];
  if (!configPath) {
    return fallback;
  }
  const file = new Project({
    useInMemoryFileSystem: false,
  }).addSourceFileAtPath(configPath);
  const config = configObject(file);
  const object = config && propertyNamed(config, "modules");
  if (!Node.isObjectLiteralExpression(object)) {
    return fallback;
  }
  const roots: ModuleRoot[] = [];
  for (const property of object.getProperties()) {
    if (!Node.isPropertyAssignment(property)) {
      continue;
    }
    const root = localRoot(property.getInitializer(), projectRoot);
    if (
      !root ||
      !isInside(projectRoot, root) ||
      !fs.existsSync(path.join(root, MODULE_ENTRY))
    ) {
      continue;
    }
    roots.push({
      id: propertyKey(property.getNameNode()),
      root,
      isProject: root === projectRoot,
    });
  }
  return roots.some((root) => root.isProject) ? roots : [...fallback, ...roots];
}

/** The ids of every module the configuration lists, whatever their source. */
export function configuredModuleIds(): string[] {
  const configPath = findConfigFile();
  if (!configPath) {
    return [];
  }
  const file = new Project().addSourceFileAtPath(configPath);
  const config = configObject(file);
  const object = config && propertyNamed(config, "modules");
  if (!Node.isObjectLiteralExpression(object)) {
    return [];
  }
  return object
    .getProperties()
    .filter(Node.isPropertyAssignment)
    .map((property) => propertyKey(property.getNameNode()));
}

/** The module an operation targets: the one named, or the project's own. */
export function targetModule(id?: string): ModuleRoot | undefined {
  const modules = projectModules();
  return id === undefined
    ? modules.find((module) => module.isProject)
    : modules.find((module) => module.id === id);
}

/** The module a source file belongs to: the innermost module root that contains it. */
export function moduleOfFile(filepath: string): ModuleRoot | undefined {
  return projectModules()
    .filter((module) => isInside(module.root, filepath))
    .sort((left, right) => right.root.length - left.root.length)[0];
}

/**
 * The project's sources and every other module's, in one ts-morph project: each file resolves its
 * imports from its own module's `node_modules`, and one typecheck covers every module an operation
 * touched. The project's `rootDir` names its own `src` and the other modules lie outside it; the
 * builder never emits, so the shared project checks types without one.
 */
export function createModulesProject(): Project {
  const project = createProject(resolveProjectRoot());
  const others = projectModules().filter((module) => !module.isProject);
  if (others.length === 0) {
    return project;
  }
  project.compilerOptions.set({ rootDir: undefined });
  for (const module of others) {
    project.addSourceFilesAtPaths(path.join(module.root, "src", "**", "*.ts"));
  }
  return project;
}

/**
 * Why an operation cannot target `module` with what it names, if it cannot: an unknown module, or
 * a declaration that lives in another module's sources. A module loads only its own sources, so a
 * page or resource importing another module's file would typecheck here and fail at startup.
 */
export function moduleMismatch(
  module: string | undefined,
  declaredIn: string | undefined,
  what: string,
): string | undefined {
  if (module === undefined) {
    return undefined;
  }
  const target = targetModule(module);
  if (!target) {
    const known = projectModules().map(
      (candidate) => candidate.id || "(project)",
    );
    return `unknown module "${module}"; the project's modules are ${known.join(", ")}`;
  }
  if (!declaredIn?.endsWith(".ts")) {
    return undefined;
  }
  const owner = moduleOfFile(declaredIn);
  return owner && owner.root !== target.root
    ? `${what} lives in module "${owner.id}", not "${module}"; a module can only use its own declarations`
    : undefined;
}
