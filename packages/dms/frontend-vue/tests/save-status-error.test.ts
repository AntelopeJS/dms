// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import uiEn from "../layers/dms-ui/i18n/locales/ui-en-GB.json";
import SaveStatus from "../layers/dms-ui/app/components/save-bar/SaveStatus.vue";
import InstantSaveBadge from "../layers/dms-ui/app/components/save-bar/InstantSaveBadge.vue";

type Messages = Record<string, unknown>;

const translate = (key: string) =>
  String(
    key
      .split(".")
      .reduce<unknown>((node, part) => (node as Messages)?.[part], uiEn) ?? key,
  );

const ButtonStub = defineComponent({
  props: { label: String },
  emits: ["click"],
  setup:
    (props, { emit }) =>
    () =>
      h("button", { onClick: () => emit("click") }, props.label),
});

let app: App | undefined;
let host: HTMLDivElement;

async function mount(render: () => ReturnType<typeof h>): Promise<void> {
  app = createApp({ render });
  app.component("UIcon", defineComponent({ render: () => h("i") }));
  app.component("UButton", ButtonStub);
  app.mount(host);
  await nextTick();
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ t: translate }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

describe("DmsSaveStatus: a failed save", () => {
  it("says it was not saved and offers a retry", async () => {
    const onRetry = vi.fn();
    await mount(() => h(SaveStatus, { state: "error", onRetry }));

    expect(host.textContent).toContain("Not saved");
    host.querySelector("button")!.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("turns the header pill red, its wording unchanged", async () => {
    await mount(() => h(InstantSaveBadge, { state: "error" }));
    const pill = host.querySelector<HTMLElement>("[data-instant-save-badge]")!;

    expect(pill.textContent?.trim()).toBe("Saved instantly");
    expect(pill.className).toContain("text-error");
  });
});
