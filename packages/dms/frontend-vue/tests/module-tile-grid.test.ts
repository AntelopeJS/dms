import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MODULE_TILE_GRID_CLASS } from "../layers/dms-layout/app/build/utils/modules-catalog";

const PAGES = resolve(__dirname, "../layers/dms-layout/app/custom-pages");
const MODULE_VIEWS = ["modules.vue", "modules-store.vue"];

describe("module tile grid", () => {
  it("never asks for a track wider than a phone", () => {
    expect(MODULE_TILE_GRID_CLASS).toContain(
      "repeat(auto-fill,minmax(min(340px,100%),1fr))",
    );
  });

  it.each(MODULE_VIEWS)("is the one grid %s lays its tiles on", (file) => {
    const source = readFileSync(resolve(PAGES, file), "utf8");
    expect(source).toContain(':class="MODULE_TILE_GRID_CLASS"');
    expect(source).not.toMatch(/grid-cols-\[repeat\(auto-fill/);
  });
});
