// @vitest-environment jsdom
/**
 * A KeyValueList's columns follow its own width, not the window's: in a
 * 600px drawer on a wide screen a two-column list stays one column until
 * each column keeps its label and room for a value.
 *
 * @packageDocumentation
 */
import { createApp, defineComponent, h, type App } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";
import type { KeyValueItem } from "../layers/dms-ui/app/components/key-value-list/KeyValueList.vue";
import { defined } from "./helpers/defined";

const i18n = createI18n({ legacy: false, locale: "en", missingWarn: false });

let app: App | undefined;

async function mountList(
  columns: number,
  items: KeyValueItem[] = [{ label: "Status", value: "Open" }],
): Promise<HTMLElement> {
  const { default: KeyValueList } = await import(
    "../layers/dms-ui/app/components/key-value-list/KeyValueList.vue"
  );
  const root = document.createElement("div");
  app = createApp({
    render: () => h(KeyValueList, { columns, items }),
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
  const wrapper = defined(root.firstElementChild);
  expect(wrapper.classList).toContain("@container");
  const list = defined(wrapper.querySelector("dl"));
  for (const step of steps) expect(list.classList).toContain(step);
  expect(list.className).not.toMatch(/(^|\s)(sm|md|lg):grid-cols/);
});

it.each([
  ["first", [true, false, false], [true, false, false]],
  ["second", [false, true, false], [true, false, false]],
  ["none", [false, false, false], [true, true, false]],
])(
  "rules off every row under the first line (%s full width)",
  async (_, full, ruleless) => {
    const root = await mountList(
      2,
      full.map((fullWidth, index) => ({ label: `Field ${index}`, fullWidth })),
    );
    const rows = [...root.querySelectorAll("dl > div")];
    expect(rows.map((row) => row.className.includes("border-t-0"))).toEqual(
      ruleless,
    );
    expect(rows.map((row) => row.classList.contains("col-span-full"))).toEqual(
      full,
    );
  },
);
