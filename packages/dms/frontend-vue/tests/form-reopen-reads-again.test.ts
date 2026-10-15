// @vitest-environment jsdom
/**
 * A form in a drawer or a modal reads its row again each time it opens: its
 * load outlives the drawer until the next navigation, and a reopening would
 * otherwise show the values of the previous opening, stale if the row changed
 * since. The renderer's `refreshOnMount` does it, through its real async data
 * cache, where `Form.vue` used to force the load back to `idle` once mounted.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApp, defineComponent, h, nextTick, ref, Suspense } from "vue";
import { describe, expect, it } from "vitest";
import { trackFormRecordLoad } from "../layers/dms-ui/app/build/composables/form/formRecordLoad";

const engine = await import("#dms/frontend-module");

const settle = () => new Promise((done) => setTimeout(done, 10));

describe("a form opened again in a drawer", () => {
  it("reads its row again and opens on the new values, once per opening", async () => {
    const runtime = engine.createDmsFrontendRuntime();
    const row = { email: "first@example.com" };
    const requests: string[] = [];
    const shown: string[] = [];
    // The record load of `Form.vue`: its key, its awaited call, its option.
    const DrawerForm = defineComponent({
      async setup() {
        const state = ref<Record<string, unknown>>({});
        const formLoad = await engine.useDmsAsyncData(
          "form-invites-settings.workspace.invites",
          async () => {
            requests.push("GET /api/tables/admin-invites/get?id=1");
            return { values: { ...row }, initial: {} };
          },
          { refreshOnMount: true },
        );
        trackFormRecordLoad(formLoad, (payload) => {
          Object.assign(state.value, payload.values);
        });
        shown.push(String(state.value.email));
        return () => h("form");
      },
    });
    const open = ref(true);
    const app = createApp({
      render: () =>
        h(Suspense, null, {
          default: () => h("div", open.value ? [h(DrawerForm)] : []),
        }),
    });
    engine.provideDmsFrontendRuntime(app, runtime);
    app.mount(document.createElement("div"));
    await settle();

    row.email = "edited@example.com";
    open.value = false;
    await nextTick();
    open.value = true;
    await settle();

    expect(requests).toHaveLength(2);
    expect(shown).toEqual(["first@example.com", "edited@example.com"]);
    app.unmount();
  });

  it("is what Form.vue asks for, instead of resetting the load's status", () => {
    const form = readFileSync(
      resolve(__dirname, "../layers/dms-ui/app/components/form/Form.vue"),
      "utf8",
    );
    const load = form.slice(form.indexOf("const formLoad"));
    expect(load.slice(0, load.indexOf(");\n") + 3)).toMatch(
      /refreshOnMount: true/,
    );
    expect(form).not.toMatch(/formLoad\.status\.value\s*=/);
  });
});
