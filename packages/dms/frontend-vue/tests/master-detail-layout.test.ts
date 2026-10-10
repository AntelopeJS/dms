// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest";
import { type App, createApp, h, nextTick } from "vue";

const ITEMS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];
// The former `lg` viewport breakpoint, now read off the component's own width.
const SIDE_BY_SIDE_COLUMNS = "@5xl:grid-cols-[380px_minmax(0,1fr)]";
const VIEWPORT_VARIANT = /(?:^|\s)(?:sm|md|lg|xl|2xl):/;

let app: App | undefined;
let host: HTMLDivElement;

async function mount() {
  const { default: MasterDetail } = await import(
    "../layers/dms-ui/app/components/master-detail/MasterDetail.vue"
  );
  app = createApp({
    setup: () => () =>
      h(
        MasterDetail,
        { items: ITEMS, modelValue: "a" },
        { default: () => h("p", "detail") },
      ),
  });
  app.component("UIcon", () => h("i"));
  app.mount(host);
  await nextTick();
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
});

it("lays the panes out from its own width, not the viewport's", async () => {
  await mount();
  const container = host.firstElementChild as HTMLElement;
  const grid = container.firstElementChild as HTMLElement;
  expect(container.classList).toContain("@container");
  expect(grid.classList).toContain("grid-cols-1");
  expect(grid.classList).toContain(SIDE_BY_SIDE_COLUMNS);
  for (const element of host.querySelectorAll("*")) {
    expect(element.getAttribute("class") ?? "").not.toMatch(VIEWPORT_VARIANT);
  }
});
