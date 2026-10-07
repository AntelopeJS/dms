// @vitest-environment jsdom
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  type App,
  type Component,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DmsRecordCard from "../layers/dms-ui/app/components/record-card/RecordCard.vue";

let app: App | undefined;

function mount(component: Component, props: Record<string, unknown>) {
  app = createApp(defineComponent({ setup: () => () => h(component, props) }));
  app.component(
    "UButton",
    defineComponent({
      props: { label: String },
      emits: ["click"],
      setup:
        (props, { emit }) =>
        () =>
          h("button", { onClick: () => emit("click") }, props.label),
    }),
  );
  app.component("UIcon", defineComponent({ render: () => h("i") }));
  const container = document.createElement("div");
  app.mount(container);
  return container;
}

beforeEach(() => {
  vi.stubGlobal("computed", computed);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

describe("DmsRecordCard", () => {
  it("draws the record and opens it, its buttons acting without opening it", async () => {
    const onOpen = vi.fn();
    const onEdit = vi.fn();
    const container = mount(DmsRecordCard as Component, {
      title: "Saved views",
      subtitle: "@antelopejs/dms",
      badge: { label: "Tables" },
      tags: ["Tables"],
      meta: "42 votes",
      actions: [{ label: "Edit", onClick: onEdit }],
      interactive: true,
      onOpen,
    });
    const text = container.textContent ?? "";
    expect(text).toContain("Saved views");
    expect(text).toContain("@antelopejs/dms");
    expect(text).toContain("42 votes");
    expect(container.querySelector("article")?.getAttribute("tabindex")).toBe(
      "0",
    );

    container.querySelector("button")!.click();
    await nextTick();
    expect(onOpen).not.toHaveBeenCalled();
    container.querySelector("article")!.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
