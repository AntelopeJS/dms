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

  it("spans both form columns with its control when it has no label", async () => {
    await mount({ layout: "form" }, { default: () => h("input") });
    expect(body().children).toHaveLength(1);
    expect(body().firstElementChild!.className).toContain("col-span-full");
  });

  it("keeps a labelled control in the form's control column", async () => {
    await mount(
      { label: "Name", layout: "form" },
      { default: () => h("input") },
    );
    expect(body().lastElementChild!.className).not.toContain("col-span-full");
  });

  it("pads a dense row less, its label closer above a stacked control", async () => {
    await mount({ label: "Name", layout: "form", spacing: "dense" });
    expect(host.firstElementChild!.className).toContain("border-t");
    expect(body().className).toContain("py-3");
    expect(body().className).toContain("gap-y-1.5");
    expect(body().className).not.toContain("py-4");
    expect(body().className).not.toContain("gap-y-2");
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
  it("hands a stacked row's height down to a filling control", async () => {
    await mount(
      { label: "data", layout: "stack", fill: true },
      { default: () => h("div", { "data-code": "" }) },
    );
    const root = host.firstElementChild as HTMLElement;
    const control = host.querySelector("[data-code]")!.parentElement!;
    for (const part of [root, body(), control]) {
      expect(part.className.split(/\s+/)).toEqual(
        expect.arrayContaining(["flex", "flex-1", "flex-col"]),
      );
    }
    expect(body().className.split(/\s+/)).not.toContain("grid");
  });

  it("keeps a row that does not stack as it is", async () => {
    await mount({ label: "data", layout: "form", fill: true });
    expect(host.firstElementChild!.className).not.toContain("flex-1");
  });
});
