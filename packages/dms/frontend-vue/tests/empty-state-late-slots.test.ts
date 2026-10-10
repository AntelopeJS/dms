// @vitest-environment jsdom
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmptyState from "../layers/dms-ui/app/components/empty-state/EmptyState.vue";

vi.mock("../layers/dms-ui/app/components/icon-well/IconWell.vue", () => ({
  default: { render: () => null },
}));

let app: App | undefined;

function mountWithLateSlots() {
  const shown = ref(false);
  app = createApp({
    render: () =>
      h(
        EmptyState,
        { title: "No tables" },
        shown.value
          ? {
              default: () => "Create one to start.",
              actions: () => h("a", { href: "/new" }, "New table"),
            }
          : {},
      ),
  });
  app.component("UButton", defineComponent({ setup: () => () => h("button") }));
  const container = document.createElement("div");
  app.mount(container);
  return { container, shown };
}

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe("empty state slots", () => {
  it("shows an actions slot the parent adds after the first render", async () => {
    const { container, shown } = mountWithLateSlots();
    expect(container.querySelector("a")).toBeNull();

    shown.value = true;
    await nextTick();
    expect(container.querySelector("a")?.textContent).toBe("New table");
    expect(container.textContent).toContain("Create one to start.");

    shown.value = false;
    await nextTick();
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).not.toContain("Create one to start.");
  });
});
