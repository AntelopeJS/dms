import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
// Sibling checkouts sit next to the repository, which is two levels above the
// package now that the runtime lives under `packages/`.
const SIBLINGS_ROOT = resolve(PACKAGE_ROOT, "..", "..", "..");
const ADAPTERS = [
  {
    name: "vue",
    root: resolve(
      process.env.DMS_INERTIA_VUE_ROOT ?? join(SIBLINGS_ROOT, "dms-frontend"),
    ),
    runtimeDependency: "@inertiajs/vue3",
    workspaceEnvironment: "DMS_INERTIA_VUE_WORKSPACE",
    templateFiles: [
      "app-runtime.ts",
      "frontend-module.ts",
      "index.html",
      "main.ts",
      "server.mjs",
      "ssr-renderer.ts",
    ],
    moduleFiles: [
      [
        "frontend-vue/dms.frontend.ts",
        "antelopejs__dms-frontend-vue/dms.frontend.ts",
      ],
      [
        "playground/frontend-vue/app/components/SidebarWidgetDemo.vue",
        "playground-frontend/app/components/SidebarWidgetDemo.vue",
      ],
    ],
  },
];
function digest(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function assertSame(left, right, label) {
  if (
    !existsSync(left) ||
    !existsSync(right) ||
    digest(left) !== digest(right)
  ) {
    throw new Error(`${label} drifted: ${left} != ${right}`);
  }
}

function listFiles(root, relativePath = "") {
  return readdirSync(join(root, relativePath), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = join(relativePath, entry.name);
      return entry.isDirectory() ? listFiles(root, path) : [path];
    },
  );
}

function assertSameInventory(left, right, label) {
  const leftFiles = listFiles(left).sort();
  const rightFiles = listFiles(right).sort();
  if (JSON.stringify(leftFiles) !== JSON.stringify(rightFiles)) {
    throw new Error(
      `${label} file inventory drifted: ${JSON.stringify(leftFiles)} != ${JSON.stringify(rightFiles)}`,
    );
  }
  return leftFiles;
}

function hasRuntimeDependency(directory, adapter) {
  const packagePath = join(directory, "package.json");
  if (!existsSync(packagePath)) return false;
  const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
  return Boolean(manifest.dependencies?.[adapter.runtimeDependency]);
}

function validateWorkspace(directory, adapter) {
  const metadataPath = join(directory, ".ajs-dms-meta.json");
  if (!existsSync(metadataPath)) {
    throw new Error(`${directory} is not a generated workspace`);
  }
  if (!hasRuntimeDependency(directory, adapter)) {
    throw new Error(`${directory} is not a ${adapter.name} workspace`);
  }
  return directory;
}

function findWorkspace(adapter) {
  const explicit = process.env[adapter.workspaceEnvironment];
  if (explicit) return validateWorkspace(resolve(explicit), adapter);
  // The loader takes no override for its workspace root; pass the workspace
  // itself through the adapter's environment variable instead.
  const root = join(homedir(), ".antelopejs", "dms-frontend");
  const candidates = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name))
    .filter((directory) => existsSync(join(directory, ".ajs-dms-meta.json")))
    .filter((directory) => hasRuntimeDependency(directory, adapter));
  if (candidates.length !== 1) {
    throw new Error(
      `Found ${candidates.length} ${adapter.name} workspaces; set ${adapter.workspaceEnvironment} to the active workspace`,
    );
  }
  return candidates[0];
}

function checkWorkspace(adapter) {
  const workspace = findWorkspace(adapter);
  const templateRoot = join(adapter.root, "templates", adapter.name);
  const templateServer = join(templateRoot, "server");
  const workspaceServer = join(workspace, "server");
  const serverFiles = assertSameInventory(
    templateServer,
    workspaceServer,
    `${adapter.name} generated server`,
  ).map((file) => join("server", file));
  [...adapter.templateFiles, ...serverFiles].forEach((file) => {
    assertSame(
      join(templateRoot, file),
      join(workspace, file),
      `${adapter.name} template ${file}`,
    );
  });
  adapter.moduleFiles.forEach(([source, generated]) => {
    assertSame(
      join(PACKAGE_ROOT, source),
      join(workspace, "frontend-modules", generated),
      `${adapter.name} module ${basename(source)}`,
    );
  });
  return workspace;
}

const workspaces = Object.fromEntries(
  ADAPTERS.map((adapter) => [adapter.name, checkWorkspace(adapter)]),
);
console.log(
  JSON.stringify(
    {
      workspaces,
    },
    null,
    2,
  ),
);
