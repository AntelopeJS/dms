// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type App, createApp, h, nextTick } from "vue";

const ITEMS = [
  { value: "all", label: "All", count: 12 },
  { value: "data", label: "Data", count: 4 },
  { value: "mail", label: "Mail" },
];

let app: App | undefined;
let host: HTMLDivElement;

async function mount(props: Record<string, unknown>) {
  const { default: ChipGroup } = await import(
    "../layers/dms-ui/app/build/components/form/ChipGroup.vue"
  );
  const onPick = vi.fn();
  app = createApp({
    setup: () => () =>
      h(ChipGroup, { items: ITEMS, label: "Category", onPick, ...props }),
  });
  app.component("UIcon", () => h("i", { "data-check": "" }));
  app.mount(host);
  await nextTick();
  return { onPick };
}

const chip = (value: string) =>
  host.querySelector<HTMLButtonElement>(`button[data-value="${value}"]`)!;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
});

it("reads a single pick as radios, with each chip's count", async () => {
  const { onPick } = await mount({ selected: ["data"] });
  expect(host.firstElementChild!.getAttribute("role")).toBe("radiogroup");
  expect(chip("data").getAttribute("role")).toBe("radio");
  expect(chip("data").getAttribute("aria-checked")).toBe("true");
  expect(chip("all").getAttribute("aria-checked")).toBe("false");
  expect(chip("all").textContent).toContain("12");
  expect(host.querySelector("[data-check]")).toBeNull();

  chip("mail").click();
  expect(onPick).toHaveBeenCalledWith("mail");
});

it("reads several picks as toggles, checking the picked ones", async () => {
  await mount({ selected: ["all", "mail"], multiple: true });
  expect(host.firstElementChild!.getAttribute("role")).toBe("group");
  expect(chip("all").getAttribute("aria-pressed")).toBe("true");
  expect(chip("data").getAttribute("aria-pressed")).toBe("false");
  expect(host.querySelectorAll("[data-check]")).toHaveLength(2);
});

it("rings the chips not picked when invalid, and holds them when disabled", async () => {
  await mount({ selected: ["all"], invalid: true, disabled: true });
  expect(chip("data").className).toContain("border-error");
  expect(chip("all").className).not.toContain("border-error");
  expect(chip("data").disabled).toBe(true);
});
