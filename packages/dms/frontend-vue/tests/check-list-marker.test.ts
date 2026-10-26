/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import CheckList, {
  type CheckListItem,
  type CheckListMarker,
} from "../layers/dms-ui/app/components/check-list/CheckList.vue";

const IconStub = defineComponent({
  props: { name: String },
  setup: (props) => () => h("i", { "data-icon": props.name }),
});

const ITEMS: CheckListItem[] = [
  { label: "Ok", state: "ok" },
  { label: "Failed", state: "error" },
  { label: "Waiting", state: "pending" },
];

let app: App | undefined;
let host: HTMLDivElement;

async function mount(marker: CheckListMarker) {
  app = createApp({ render: () => h(CheckList, { items: ITEMS, marker }) });
  app.component("UIcon", IconStub);
  app.config.globalProperties.$t = (key: string) => key;
  app.mount(host);
  await nextTick();
}

const iconOf = (label: string) =>
  [...host.querySelectorAll("li")]
    .find((item) => item.textContent?.includes(label))
    ?.querySelector("i")?.dataset.icon;

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

describe("DmsCheckList markers", () => {
  it.each<CheckListMarker>(["icon", "plain"])(
    "never draws a pending line with the error icon (%s)",
    async (marker) => {
      await mount(marker);
      expect(iconOf("Waiting")).toBeTruthy();
      expect(iconOf("Waiting")).not.toBe(iconOf("Failed"));
    },
  );
});
