import fs from "node:fs";
import path from "node:path";
import { setBuilderConfig } from "../../../config";
import { projectFile } from "./helpers/project-files";
import { invalidateCatalog } from "../../../implementations/dms-builder/engine/catalog";
import { invalidateInference } from "../../../implementations/dms-builder/engine/catalog-inference";
import { invalidateResourceIndex } from "../../../implementations/dms-builder/engine/resource-index";
import { invalidateSourceIndex } from "../../../implementations/dms-builder/engine/source-index";
import { resetWritableProject } from "../../../implementations/dms-builder/engine/writable";

/**
 * A throwaway app for the engine to rewrite.
 *
 * It lives inside the repository rather than in the system temp directory
 * because the code the engine emits imports `@antelopejs-private/cms` and the
 * Antelope interfaces: only a fixture under this package resolves them, and a
 * fixture whose imports do not resolve fails every operation on `typecheck_failed`
 * rather than on what the test is about. Each process gets its own folder, so
 * the files `mocha --parallel` runs in separate workers never share one app.
 */
const FIXTURE_ROOT = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  `.test-app-${process.pid}`,
);

/**
 * Resolved the way the playground resolves: the DMS interfaces publish their
 * subpaths through `exports` alone, which `moduleResolution: "node"` never reads.
 */
const TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    module: "preserve",
    moduleResolution: "bundler",
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
    preserveSymlinks: true,
    rootDir: "src",
  },
  include: ["src"],
};

/** Where {@link snapshotFixture} keeps its copy of the app. */
const SNAPSHOT_ROOT = `${FIXTURE_ROOT}-snapshot`;

export interface FixtureOptions {
  /** Other local modules of the fixture's project, each under `modules/<id>`. */
  modules?: string[];
  /** Start from the app {@link snapshotFixture} copied instead of an empty one. */
  fromSnapshot?: boolean;
}

/** The project's id for its own module in a fixture that declares others. */
export const PROJECT_MODULE = "app";

function ModuleEntry(id: string, relativePath: string): string {
  return `    ${JSON.stringify(id)}: { source: { type: "local", path: ${JSON.stringify(relativePath)} } },`;
}

/** An `antelope.config.ts` naming the project's own module and each extra one, as a project writes it. */
function ProjectConfig(modules: string[]): string {
  const entries = [
    ModuleEntry(PROJECT_MODULE, "."),
    ...modules.map((id) => ModuleEntry(id, `modules/${id}`)),
  ];
  return `import { defineConfig } from "@antelopejs/interface-core/config";\n\nexport default defineConfig({\n  name: "fixture",\n  modules: {\n${entries.join("\n")}\n  },\n});\n`;
}

function WriteModules(modules: string[]): void {
  if (modules.length === 0) {
    return;
  }
  fs.writeFileSync(
    path.join(FIXTURE_ROOT, "antelope.config.ts"),
    ProjectConfig(modules),
  );
  for (const id of modules) {
    const src = path.join(FIXTURE_ROOT, "modules", id, "src");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "index.ts"), "export {};\n");
  }
}

function WriteEmptyApp(modules: string[]): void {
  fs.mkdirSync(path.join(FIXTURE_ROOT, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(FIXTURE_ROOT, "tsconfig.json"),
    `${JSON.stringify(TSCONFIG, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(FIXTURE_ROOT, "src", "index.ts"), "export {};\n");
  fs.writeFileSync(
    path.join(FIXTURE_ROOT, ".editorconfig"),
    "root = true\n\n[*]\nindent_style = space\nindent_size = 2\n",
  );
  WriteModules(modules);
}

export interface Fixture {
  /** Absolute path of the app root the engine is pointed at. */
  root: string;
  /** Read an emitted file, relative to the app's `src`. */
  read(relativePath: string): string;
  /** Whether an emitted file exists, relative to the app's `src`. */
  exists(relativePath: string): boolean;
  /**
   * Overwrite an emitted file — how a suite stands in for a developer editing
   * generated code by hand.
   */
  write(relativePath: string, content: string): void;
}

/**
 * Point the engine at an empty app. Every cached index is dropped first: the
 * project, the source and resource indexes and the catalog are all resolved once
 * per process, so a suite that skipped this would read the previous test's app.
 */
export function createFixture(options: FixtureOptions = {}): Fixture {
  fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  if (options.fromSnapshot) {
    fs.cpSync(SNAPSHOT_ROOT, FIXTURE_ROOT, { recursive: true });
  } else {
    WriteEmptyApp(options.modules ?? []);
  }

  resetWritableProject();
  invalidateSourceIndex();
  invalidateResourceIndex();
  invalidateCatalog();
  invalidateInference();
  setBuilderConfig({ projectRoot: FIXTURE_ROOT });

  return {
    root: FIXTURE_ROOT,
    read: (relativePath) =>
      projectFile(FIXTURE_ROOT, path.join("src", relativePath)),
    exists: (relativePath) =>
      fs.existsSync(path.join(FIXTURE_ROOT, "src", relativePath)),
    write: (relativePath, content) =>
      fs.writeFileSync(path.join(FIXTURE_ROOT, "src", relativePath), content),
  };
}

/**
 * Copy the app as it stands, so later tests start from it with
 * `createFixture({ fromSnapshot: true })` instead of rebuilding it. The engine
 * keeps nothing but caches outside the app's files, and `createFixture` drops
 * them, so the copy is the whole state. {@link destroyFixture} removes it.
 */
export function snapshotFixture(): void {
  fs.rmSync(SNAPSHOT_ROOT, { recursive: true, force: true });
  fs.cpSync(FIXTURE_ROOT, SNAPSHOT_ROOT, { recursive: true });
}

export function destroyFixture(): void {
  fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  fs.rmSync(SNAPSHOT_ROOT, { recursive: true, force: true });
  resetWritableProject();
  setBuilderConfig({});
}

/**
 * Unwrap a successful result, or fail with the engine's own error. Every
 * operation answers `OpResult`, so a test that forgot to check would otherwise
 * assert against `undefined` and report the wrong thing.
 */
export function expectOk<T>(
  result: { ok: true; data: T } | { ok: false; error: unknown },
  label: string,
): T {
  if (!result.ok) {
    throw new Error(`${label} failed: ${JSON.stringify(result.error)}`);
  }
  return result.data;
}
