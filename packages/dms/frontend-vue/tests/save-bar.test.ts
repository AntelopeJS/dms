// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type App, createApp, defineComponent, h, nextTick } from "vue";

const Button = defineComponent({
  inheritAttrs: false,
  props: { label: String, disabled: Boolean, type: String },
  setup:
    (props, { attrs }) =>
    () =>
      h(
        "button",
        { ...attrs, type: props.type ?? "button", disabled: props.disabled },
        props.label,
      ),
});

let app: App | undefined;
let host: HTMLDivElement;

async function mount(props: Record<string, unknown>) {
  const { default: SaveBar } = await import(
    "../layers/dms-ui/app/components/save-bar/SaveBar.vue"
  );
  const onCancel = vi.fn();
  app = createApp({
    setup: () => () => h(SaveBar, { form: "invite", onCancel, ...props }),
  });
  app.component("UButton", Button);
  app.mount(host);
  await nextTick();
  return { onCancel };
}

const buttons = () =>
  [...host.querySelectorAll("button")].map((button) => ({
    label: button.textContent,
    disabled: button.disabled,
  }));

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
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

it("shows an empty modal action form's way out and its held submit", async () => {
  const { onCancel } = await mount({
    variant: "band",
    kind: "action",
    dirty: false,
    cancellable: true,
    saveLabel: "Invite",
  });

  expect(host.firstElementChild!.getAttribute("aria-hidden")).toBeNull();
  expect(buttons()).toEqual([
    { label: "dms.button.cancel", disabled: false },
    { label: "Invite", disabled: true },
  ]);
  host.querySelector("button")!.click();
  expect(onCancel).toHaveBeenCalledOnce();
});

it("resets an action form once a value changed, and sends it", async () => {
  await mount({
    variant: "band",
    kind: "action",
    dirty: true,
    cancellable: true,
    saveLabel: "Invite",
  });
  expect(buttons()).toEqual([
    { label: "dms.button.reset", disabled: false },
    { label: "Invite", disabled: false },
  ]);
  expect(host.querySelector("[role=status]")).toBeNull();
});

it("lists a record form's unsaved changes beside Discard and Save", async () => {
  await mount({ dirty: true, changes: ["Name", "Email"] });
  expect(host.querySelector("[role=status]")?.textContent).toContain(
    "dms.save_bar.unsaved · Name, Email",
  );
  expect(buttons().map((button) => button.label)).toEqual([
    "dms.save_bar.discard",
    "dms.save_bar.save",
  ]);
});
