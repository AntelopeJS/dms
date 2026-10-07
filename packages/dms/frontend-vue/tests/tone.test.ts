// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import IconWell from "../layers/dms-ui/app/components/icon-well/IconWell.vue";
import {
  DMS_TONE_WELL,
  isDmsTone,
} from "../layers/dms-ui/app/build/utils/tone";

const FORMER_TONE = /tone"?\s*[=:][^\n]*["']accent["']/i;

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("Tone", () => {
  it("knows the semantic tones only", () => {
    expect(isDmsTone("success")).toBe(true);
    expect(isDmsTone("accent")).toBe(false);
    expect(isDmsTone("violet")).toBe(false);
  });

  it("draws an icon well in primary by default", async () => {
    const html = await renderToString(
      createSSRApp(IconWell, { icon: "i-ph-star" }),
    );
    for (const name of DMS_TONE_WELL.primary.split(" ")) {
      expect(html).toContain(name);
    }
  });

  it("is never passed as accent by a DMS component", () => {
    const offenders = walk(join(process.cwd(), "layers"))
      .filter((path) => path.endsWith(".vue"))
      .filter((path) => FORMER_TONE.test(readFileSync(path, "utf8")))
      .map((path) => relative(process.cwd(), path));
    expect(offenders).toEqual([]);
  });
});
