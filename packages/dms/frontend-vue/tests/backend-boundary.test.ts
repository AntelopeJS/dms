import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, type Plugin } from "vite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { backendBoundary } from "../build/backend-boundary";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dms-boundary-"));
  mkdirSync(join(root, "backend/src"), { recursive: true });
  mkdirSync(join(root, "backend/dist"), { recursive: true });
  mkdirSync(join(root, "frontend"), { recursive: true });
  writeFileSync(
    join(root, "backend/package.json"),
    JSON.stringify({ name: "@antelopejs/dms" }),
  );
  writeFileSync(join(root, "backend/src/api.ts"), "export const api = 1;\n");
  writeFileSync(join(root, "backend/dist/api.ts"), "export const api = 2;\n");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function bundle(entry: string, extra: Plugin[] = []) {
  writeFileSync(join(root, "frontend/entry.ts"), entry);
  return build({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [backendBoundary(), ...extra],
    build: {
      write: false,
      lib: { entry: join(root, "frontend/entry.ts"), formats: ["es"] },
    },
  });
}

it("fails on an import of the backend source and names both files", async () => {
  const failing = bundle(
    'import { api } from "../backend/src/api";\nexport default api;\n',
  );
  await expect(failing).rejects.toThrow(join(root, "frontend/entry.ts"));
  await expect(failing).rejects.toThrow(join(root, "backend/src/api.ts"));
});

it("accepts another file of the backend package", async () => {
  await expect(
    bundle('import { api } from "../backend/dist/api";\nexport default api;\n'),
  ).resolves.toBeDefined();
});

it("ignores a virtual module", async () => {
  const virtual: Plugin = {
    name: "virtual-fixture",
    resolveId: (source) => (source === "virtual:fixture" ? "\0fixture" : null),
    load: (id) => (id === "\0fixture" ? "export default 1;" : null),
  };
  await expect(
    bundle('import one from "virtual:fixture";\nexport default one;\n', [
      virtual,
    ]),
  ).resolves.toBeDefined();
});
