// @vitest-environment jsdom
/**
 * A KeyValueList's columns follow its own width, not the window's: in a
 * 600px drawer on a wide screen a two-column list stays one column until
 * each column keeps its label and room for a value.
 */
import { createApp, defineComponent, h, type App } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

const i18n = createI18n({ legacy: false, locale: "en", missingWarn: false });

let app: App | undefined;

async function mountList(columns: number): Promise<HTMLElement> {
  const { default: KeyValueList } = await import(
    "../layers/dms-ui/app/components/key-value-list/KeyValueList.vue"
  );
  const root = document.createElement("div");
  app = createApp({
    render: () =>
      h(KeyValueList, { columns, items: [{ label: "Status", value: "Open" }] }),
  });
  app.use(i18n);
  app.component("USkeleton", defineComponent({ render: () => h("span") }));
  app.mount(root);
  return root;
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => i18n.global);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

it.each([
  [2, ["@min-[560px]:grid-cols-2"]],
  [3, ["@min-[560px]:grid-cols-2", "@min-[840px]:grid-cols-3"]],
])("lays %i columns out by the list's own width", async (columns, steps) => {
  const root = await mountList(columns);
  const wrapper = root.firstElementChild as HTMLElement;
  expect(wrapper.classList).toContain("@container");
  const list = wrapper.querySelector("dl")!;
  for (const step of steps) expect(list.classList).toContain(step);
  expect(list.className).not.toMatch(/(^|\s)(sm|md|lg):grid-cols/);
});
