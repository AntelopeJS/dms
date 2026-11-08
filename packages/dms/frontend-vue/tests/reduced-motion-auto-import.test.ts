/**
 * A frontend module honors the device's reduce-motion setting in JavaScript
 * by calling `isReducedMotionActive()` without an import: the DMS's
 * `dms.frontend.build.ts` must publish it through the loader's auto-import
 * scan, which skips every `app/build/` folder.
 */
import { resolve } from "node:path";
import { autoImportDirectories } from "@antelopejs/dms-frontend/templates/vue/frontend-build-loader.ts";
import { scanDirExports } from "unimport";
import { afterEach, expect, it, vi } from "vitest";
import setup from "../dms.frontend.build";

afterEach(() => {
  vi.unstubAllGlobals();
});

function htmlClasses(...classes: string[]) {
  vi.stubGlobal("document", {
    documentElement: {
      classList: { contains: (name: string) => classes.includes(name) },
    },
  });
}

async function autoImported(name: string) {
  const directories = autoImportDirectories(
    [{ id: "dms", root: resolve(__dirname, "..") }],
    [{ id: "dms", setup }],
    (message) => {
      throw new Error(message);
    },
  );
  const exports = await scanDirExports(directories);
  return exports.find((entry) => (entry.as ?? entry.name) === name);
}

it("auto-imports isReducedMotionActive for modules", async () => {
  expect(await autoImported("useAccessibilityPreferences")).toBeDefined();
  const entry = await autoImported("isReducedMotionActive");

  expect(entry?.from).toMatch(/\/layers\/dms-ui\/app\/utils\//);
  const helper: unknown = (await import(entry?.from ?? ""))[
    "isReducedMotionActive"
  ];
  if (typeof helper !== "function") throw new Error("not a function");
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  htmlClasses();
  expect(helper()).toBe(false);
  htmlClasses("dms-reduce-motion");
  expect(helper()).toBe(true);
});
