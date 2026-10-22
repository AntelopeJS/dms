// @vitest-environment jsdom
/**
 * `isHydratingComponent()` is true from the setup to the first render of a
 * component the browser takes over from the server, and false in a fresh
 * mount, on a re-render after mount, and outside a component.
 */
import {
  createApp,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  ref,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";
import { isHydratingComponent } from "../layers/dms-core/app/composables/hydration/isHydratingComponent";

const tick = ref(0);

function probe(readings: string[]) {
  return defineComponent({
    setup() {
      readings.push(`setup:${isHydratingComponent()}`);
      return () => {
        readings.push(`render${tick.value}:${isHydratingComponent()}`);
        return h("p", String(tick.value));
      };
    },
  });
}

describe("isHydratingComponent", () => {
  it("is true while a component hydrates the server's HTML, then false", async () => {
    tick.value = 0;
    const serverReadings: string[] = [];
    const html = await renderToString(createSSRApp(probe(serverReadings)));
    expect(serverReadings).toEqual(["setup:false", "render0:false"]);

    const root = document.createElement("div");
    root.innerHTML = html;
    const readings: string[] = [];
    createSSRApp(probe(readings)).mount(root);
    tick.value = 1;
    await nextTick();
    expect(readings).toEqual(["setup:true", "render0:true", "render1:false"]);
  });

  it("is false in a fresh client mount and outside a component", () => {
    tick.value = 0;
    const readings: string[] = [];
    createApp(probe(readings)).mount(document.createElement("div"));
    expect(readings).toEqual(["setup:false", "render0:false"]);
    expect(isHydratingComponent()).toBe(false);
  });
});
