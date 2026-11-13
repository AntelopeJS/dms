import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Node, Project } from "ts-morph";
import type {
  FileChange,
  OpResult,
  ProjectConfigResult,
  ProjectConfigStep,
} from "@antelopejs/interface-dms-builder";
import {
  assignedName,
  envValue,
  VARIABLE_NAME,
  withEnvLine,
  withoutEnvLine,
} from "./env-lines";
import { configObject, findConfigFile, propertyNamed } from "./modules";
import { invalidConfig } from "./ops";
import { configureProject } from "./project-config-ops";

const ENV_FILE = ".env";
const ENV_OVERRIDES = "envOverrides";
const ENV_EXAMPLE = ".env.example";
const UNQUOTABLE = /["\n\r]/;

/** A variable the builder may not write, and why. */
export class EnvRefusal extends Error {}

function refuse(message: string): never {
  throw new EnvRefusal(message);
}

/** The variables `envOverrides` maps, the only ones the builder writes. */
function overriddenVariables(configPath: string): Set<string> {
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile(
    configPath,
    fs.readFileSync(configPath, "utf8"),
  );
  const root = configObject(file);
  const overrides = root && propertyNamed(root, ENV_OVERRIDES);
  if (!Node.isObjectLiteralExpression(overrides)) {
    return new Set();
  }
  return new Set(
    overrides
      .getProperties()
      .filter(Node.isPropertyAssignment)
      .map((property) => property.getName().replace(/^["']|["']$/g, "")),
  );
}

const GIT_IGNORED = 0;
const GIT_NOT_IGNORED = 1;
const GIT_DIRECTORY = ".git";

function insideRepository(directory: string): boolean {
  let current = path.resolve(directory);
  while (!fs.existsSync(path.join(current, GIT_DIRECTORY))) {
    const parent = path.dirname(current);
    if (parent === current) {
      return false;
    }
    current = parent;
  }
  return true;
}

/**
 * Why the builder cannot write `file`, when git might commit it: nothing outside a repository, and
 * inside one only a file git answers it ignores. A git that fails or is missing refuses too.
 */
function commitRisk(directory: string, file: string): string | undefined {
  if (!insideRepository(directory)) {
    return undefined;
  }
  const checked = spawnSync("git", ["check-ignore", "-q", file], {
    cwd: directory,
  });
  if (checked.status === GIT_IGNORED) {
    return undefined;
  }
  return checked.status === GIT_NOT_IGNORED
    ? `${file} is not ignored by git, so the builder does not write to it`
    : `git could not say whether ${file} is ignored, so the builder does not write to it`;
}

/** Where the project's `.env` sits: beside its configuration. */
export function projectEnvFile(): string | undefined {
  const configPath = findConfigFile();
  return configPath && path.join(path.dirname(configPath), ENV_FILE);
}

/**
 * A variable's value in the project's `.env`, for the builder's own use: a caller answers what it
 * reads from it, never the value itself.
 */
export function projectVariable(name: string): string | undefined {
  const file = projectEnvFile();
  if (!VARIABLE_NAME.test(name) || !file || !fs.existsSync(file)) {
    return undefined;
  }
  return envValue(fs.readFileSync(file, "utf8"), name);
}

/** A file of the project's `.env` family with lines taken out: what it held, and holds after. */
export interface EnvRemoval {
  change: FileChange;
  before: string;
  after: string;
}

/** The unified hunks taking out the lines that assign `names`, each showing the name and never the value. */
function removalHunks(text: string, names: Set<string>): string {
  const hunks: string[] = [];
  text.split("\n").forEach((line, index) => {
    const name = assignedName(line);
    if (name !== undefined && names.has(name)) {
      hunks.push(
        `@@ -${index + 1},1 +${index - hunks.length},0 @@\n-${name}=…`,
      );
    }
  });
  return hunks.join("\n");
}

/**
 * The lines assigning `names` taken out of the project's `.env` and `.env.example`, for each that
 * has one. A change shows the names taken out, never their values.
 */
export function variableRemovals(names: string[]): EnvRemoval[] {
  const envFile = projectEnvFile();
  if (!envFile) {
    return [];
  }
  const files = [envFile, path.join(path.dirname(envFile), ENV_EXAMPLE)];
  return files
    .filter((file) => fs.existsSync(file))
    .flatMap((file) => {
      const before = fs.readFileSync(file, "utf8");
      const removed = names.filter(
        (name) =>
          VARIABLE_NAME.test(name) && envValue(before, name) !== undefined,
      );
      if (removed.length === 0) {
        return [];
      }
      const after = removed.reduce(withoutEnvLine, before);
      const diff = removalHunks(before, new Set(removed));
      return [{ change: { path: file, kind: "modify", diff }, before, after }];
    });
}

/** Writes each file as `pick` gives it, `.env` readable by its owner only. */
export function writeEnvFiles(
  removals: EnvRemoval[],
  pick: (removal: EnvRemoval) => string,
): void {
  for (const removal of removals) {
    const mode =
      path.basename(removal.change.path) === ENV_FILE ? 0o600 : undefined;
    fs.writeFileSync(removal.change.path, pick(removal), { mode });
  }
}

/**
 * Sets a variable `envOverrides` maps in the project's `.env`, for development. It refuses when the
 * project is in a git repository that does not ignore `.env`, so a value written here never
 * reaches a commit. The value is never answered. `mapped` names the variables
 * `envOverrides` will map, for a batch about to be written; by default, those it maps now.
 */
export function setProjectVariable(
  name: string,
  value: string,
  mapped?: Set<string>,
): string {
  const configPath =
    findConfigFile() ?? refuse("the project has no configuration");
  if (!VARIABLE_NAME.test(name)) {
    refuse(`${name} is not a variable name`);
  }
  if (!(mapped ?? overriddenVariables(configPath)).has(name)) {
    refuse(`${name} is not in the configuration's envOverrides`);
  }
  if (value === "" || UNQUOTABLE.test(value)) {
    refuse(`the value of ${name} is empty, or holds a quote or a line break`);
  }
  const directory = path.dirname(configPath);
  const risk = commitRisk(directory, ENV_FILE);
  if (risk) {
    refuse(risk);
  }
  const file = path.join(directory, ENV_FILE);
  const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  fs.writeFileSync(file, withEnvLine(before, name, `${name}="${value}"`), {
    mode: 0o600,
  });
  return file;
}

/** A variable's development value, sent with the batch that maps it. */
export interface ProjectVariable {
  name: string;
  value: string;
}

function stepVariables(steps: ProjectConfigStep[]): Set<string> {
  return new Set(
    steps.flatMap((step) =>
      "entry" in step ? Object.values(step.entry?.env ?? {}) : [],
    ),
  );
}

/** What the project's `.env` holds, or nothing when there is none. */
export function envFileText(): string | undefined {
  const file = projectEnvFile();
  return file && fs.existsSync(file)
    ? fs.readFileSync(file, "utf8")
    : undefined;
}

/** Puts the project's `.env` back as `before` held it, or removes it when there was none. */
export function restoreProjectEnv(before: string | undefined): void {
  const file = projectEnvFile();
  if (!file) {
    return;
  }
  if (before === undefined) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.writeFileSync(file, before, { mode: 0o600 });
}

/**
 * Writes a batch and the development values of variables it maps: `.env` first, after a dry run
 * accepted the batch, so the configuration never names a variable whose value failed to be
 * written. When `.env` refuses one, nothing else is written either, and when the batch fails after
 * it, or throws, `.env` goes back to what it held, or goes when there was none.
 */
export function configureProjectWithVariables(
  steps: ProjectConfigStep[],
  variables: ProjectVariable[],
): OpResult<ProjectConfigResult> {
  const checked = configureProject(steps, { dryRun: true });
  if (!checked.ok) {
    return checked;
  }
  const before = envFileText();
  const mapped = stepVariables(steps);
  try {
    for (const variable of variables) {
      setProjectVariable(variable.name, variable.value, mapped);
    }
  } catch (error) {
    restoreProjectEnv(before);
    if (error instanceof EnvRefusal) {
      return invalidConfig<ProjectConfigResult>(error.message);
    }
    throw error;
  }
  let configured: OpResult<ProjectConfigResult>;
  try {
    configured = configureProject(steps);
  } catch (error) {
    restoreProjectEnv(before);
    throw error;
  }
  if (!configured.ok) {
    restoreProjectEnv(before);
  }
  return configured;
}
