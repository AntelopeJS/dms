/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import IconWell from "../layers/dms-ui/app/components/icon-well/IconWell.vue";
import {
  DMS_TONE_WELL,
  isDmsTone,
} from "../layers/dms-ui/app/build/utils/tone";

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
});
