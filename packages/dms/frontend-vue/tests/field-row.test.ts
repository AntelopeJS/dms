// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type App,
  createApp,
  h,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
} from "vue";
import {
  FORM_LAYOUT_CLASSES,
  SECTION_LAYOUT_CLASSES,
} from "../layers/dms-ui/app/build/composables/form/formLayout";

const FORM_COLUMNS = "@min-[560px]:grid-cols-[minmax(0,240px)_minmax(0,1fr)]";

let app: App | undefined;
let host: HTMLDivElement;

async function mount(
  props: Record<string, unknown>,
  slots: Record<string, () => unknown> = {},
) {
  const { default: FieldRow } = await import(
    "../layers/dms-ui/app/components/field-row/FieldRow.vue"
  );
  app = createApp({ setup: () => () => h(FieldRow, props, slots) });
  app.mount(host);
  await nextTick();
}

const body = () => host.firstElementChild!.firstElementChild as HTMLElement;

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("onUnmounted", onUnmounted);
  vi.stubGlobal("useDefinedFunctions", () => ({
    getFunction: () => undefined,
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
  }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

describe("FieldRow", () => {
  it("names its control with a label, and keeps the details out of it", async () => {
    await mount(
      { label: "Email", labelFor: "email", layout: "form" },
      { default: () => h("input", { id: "email" }), details: () => "Saved" },
    );
    const label = host.querySelector("label")!;
    expect(label.htmlFor).toBe("email");
    expect(label.textContent).toBe("Email");
    expect(label.parentElement!.textContent).toContain("Saved");
    expect(body().className).toContain(FORM_COLUMNS);
  });

  it("pads itself and draws its hairline, with the card's inset", async () => {
    await mount({ label: "Name" });
    expect(host.querySelector("label")).toBeNull();
    expect(host.firstElementChild!.className).toContain("border-t");
    expect(body().className).toContain("px-[18px]");
    expect(body().className).toContain("py-4");
  });

  it("leaves the spacing to the list of a stacked form", async () => {
    await mount({
      label: "Name",
      layout: "stack",
      inset: false,
      spacing: "list",
    });
    expect(host.firstElementChild!.className).not.toContain("border-t");
    expect(body().className).not.toContain("px-[18px]");
    expect(body().className).not.toContain("py-4");
  });
});

describe("form rows", () => {
  it("draw a card's and a section's rows as FieldRow's form rows", () => {
    expect(FORM_LAYOUT_CLASSES.horizontal.row.layout).toBe("form");
    expect(SECTION_LAYOUT_CLASSES.row.layout).toBe("form");
    expect(SECTION_LAYOUT_CLASSES.row.inset).toBe(true);
    expect(FORM_LAYOUT_CLASSES.vertical.row).toEqual({
      layout: "stack",
      inset: false,
      spacing: "list",
    });
  });
});
