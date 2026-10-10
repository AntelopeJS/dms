// @vitest-environment jsdom
import { createApp, defineComponent, h, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MonoCell from "../layers/dms-ui/app/build/components/table/MonoCell.vue";

const ButtonStub = defineComponent({
  setup: () => () => h("button"),
});

let app: App | undefined;

function mountCell(copy: boolean) {
  app = createApp({
    render: () => h(MonoCell, { value: "a-very-long-identifier", copy }),
  });
  app.component("UButton", ButtonStub);
  const container = document.createElement("div");
  app.mount(container);
  return container.firstElementChild as HTMLElement;
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useToast", () => ({ add: () => undefined }));
  vi.stubGlobal("Color", { success: "success" });
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

describe("mono cell", () => {
  it("holds its root to the cell's width so a long value can truncate", () => {
    const root = mountCell(true);
    expect(root.classList).toContain("flex");
    expect(root.classList).not.toContain("inline-flex");
    expect(root.classList).toContain("max-w-full");
    expect(root.classList).toContain("min-w-0");
    const value = root.querySelector("span");
    expect(value?.classList).toContain("truncate");
    expect(value?.getAttribute("title")).toBe("a-very-long-identifier");
  });

  it("keeps the copy button at its size beside the value", () => {
    const root = mountCell(true);
    expect(root.querySelector("button")?.classList).toContain("shrink-0");
  });
});
