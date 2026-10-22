// @vitest-environment jsdom
/**
 * A repeater lays its rows out as columns, and in a container narrower than
 * 480px stacks each row's fields, each under its own label: the classes and
 * the column templates that do it, since jsdom applies no container query.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type App,
  computed,
  createApp,
  defineComponent,
  h,
  inject,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from "vue";
import { useFormField } from "@nuxt/ui/composables/useFormField";

vi.mock("../layers/dms-ui/app/composables/resolveDmsComponent", () => ({
  resolveDmsComponent: () => undefined,
}));

const STACKED_BREAKPOINT = "@max-[30rem]";

const COLUMNS = [
  {
    id: "product",
    label: "Product",
    component: { componentName: "UInput" },
  },
  {
    id: "quantity",
    label: "Quantity",
    type: "number",
    component: { componentName: "UInput" },
  },
  {
    id: "optional",
    label: "Optional",
    type: "boolean",
    component: { componentName: "UInput" },
  },
];

let app: App | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("inject", inject);
  vi.stubGlobal("onBeforeUnmount", onBeforeUnmount);
  vi.stubGlobal("useFormField", useFormField);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

async function mountRepeater(props: Record<string, unknown> = {}) {
  const { default: Repeater } = await import(
    "../layers/dms-ui/app/components/form/components/Repeater.vue"
  );
  app = createApp({
    render: () =>
      h(Repeater, {
        columns: COLUMNS,
        modelValue: [
          { product: "Panel", quantity: 251 },
          { product: "Inverter", quantity: 2 },
        ],
        ...props,
      }),
  });
  app.component("UInput", defineComponent({ setup: () => () => h("input") }));
  app.component("UButton", { render: () => h("button") });
  app.component("UIcon", { render: () => null });
  app.mount(host);
  await nextTick();
  return host.querySelector<HTMLElement>("[role=group]")!;
}

function rowsOf(group: HTMLElement): HTMLElement[] {
  return [...group.children].filter((child): child is HTMLElement =>
    (child as HTMLElement).className.includes("--dms-repeater-columns"),
  ) as HTMLElement[];
}

it("is the size container its rows follow", async () => {
  const group = await mountRepeater();

  expect(group.className).toContain("@container");
});

it("gives a row its columns side by side, and one stacked column", async () => {
  const group = await mountRepeater({ sortable: true });
  const [, firstRow] = rowsOf(group);

  expect(firstRow!.style.getPropertyValue("--dms-repeater-columns")).toBe(
    "20px minmax(0,1fr) minmax(0,1fr) 20px 28px",
  );
  expect(
    firstRow!.style.getPropertyValue("--dms-repeater-stacked-columns"),
  ).toBe("20px minmax(0,1fr) 28px");
  expect(firstRow!.className).toContain(
    `${STACKED_BREAKPOINT}:grid-cols-(--dms-repeater-stacked-columns)`,
  );
});

it("hides the column heads and labels each field once stacked", async () => {
  const group = await mountRepeater();
  const [heads, ...rows] = rowsOf(group);

  expect(heads!.getAttribute("aria-hidden")).toBe("true");
  expect(heads!.className).toContain(`${STACKED_BREAKPOINT}:hidden`);
  expect(rows).toHaveLength(2);

  const labels = [...rows[0]!.querySelectorAll("span")].map((label) => ({
    text: label.textContent?.trim(),
    className: label.className,
  }));
  expect(labels.map((label) => label.text)).toEqual([
    "Product",
    "Quantity",
    "Optional",
  ]);
  for (const label of labels) {
    expect(label.className).toContain("hidden");
    expect(label.className).toContain(`${STACKED_BREAKPOINT}:block`);
  }
});

it("keeps every cell a column of the row while side by side", async () => {
  const group = await mountRepeater();
  const [, firstRow] = rowsOf(group);
  const cells = firstRow!.querySelector("input")!.parentElement!.parentElement!;

  expect(cells.className.split(" ")).toContain("contents");
  expect(cells.className).toContain(`${STACKED_BREAKPOINT}:grid`);
  expect(cells.children).toHaveLength(COLUMNS.length);
});
