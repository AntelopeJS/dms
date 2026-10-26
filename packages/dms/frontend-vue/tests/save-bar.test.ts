// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type App,
  createApp,
  type FunctionalComponent,
  h,
  nextTick,
} from "vue";

interface ButtonStubProps {
  label?: string;
  disabled?: boolean;
  type?: string;
}

const Button: FunctionalComponent<ButtonStubProps> = (props, { attrs }) =>
  h(
    "button",
    { ...attrs, type: props.type ?? "button", disabled: props.disabled },
    props.label,
  );
Button.props = { label: String, disabled: Boolean, type: String };
Button.inheritAttrs = false;

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

it("shows a modal action form's way out and its ready submit", async () => {
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
    { label: "Invite", disabled: false },
  ]);
  host.querySelector("button")!.click();
  expect(onCancel).toHaveBeenCalledOnce();
});

it("sends an untouched page action form as it is, its submit alone", async () => {
  await mount({
    variant: "band",
    kind: "action",
    dirty: false,
    saveLabel: "Send",
  });

  expect(host.firstElementChild!.getAttribute("aria-hidden")).toBeNull();
  expect(buttons()).toEqual([{ label: "Send", disabled: false }]);
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

const classesOf = (element: Element | null | undefined) =>
  (element?.className ?? "").split(/\s+/);
const anchor = () => host.firstElementChild!;
const bar = () => anchor().firstElementChild!;

it("takes no space while a clean page form's bar hides", async () => {
  await mount({ variant: "floating", dirty: false });

  expect(anchor().getAttribute("aria-hidden")).toBe("true");
  expect(classesOf(anchor())).toEqual(
    expect.arrayContaining(["sticky", "h-0"]),
  );
  expect(classesOf(bar())).toEqual(
    expect.arrayContaining(["absolute", "invisible"]),
  );
});

it("floats over the form when it shows, making room under the last field", async () => {
  await mount({ variant: "floating", dirty: true, changes: ["Name"] });

  expect(anchor().getAttribute("aria-hidden")).toBeNull();
  expect(classesOf(anchor())).not.toContain("h-0");
  expect(classesOf(anchor())).toContain("h-[calc(var(--dms-save-bar-h)+2rem)]");
  expect(classesOf(bar())).toEqual(
    expect.arrayContaining(["absolute", "h-(--dms-save-bar-h)"]),
  );
  expect(classesOf(bar())).not.toContain("invisible");
});

it("gives the action bar and Unsaved changes the same fixed height", async () => {
  await mount({
    variant: "floating",
    kind: "action",
    dirty: false,
    cancellable: true,
  });
  const actionBar = classesOf(bar());
  expect(buttons().map((button) => button.label)).toContain(
    "dms.button.cancel",
  );
  app?.unmount();

  await mount({ variant: "floating", dirty: true, changes: ["Name"] });
  expect(actionBar).toContain("h-(--dms-save-bar-h)");
  expect(classesOf(bar())).toContain("h-(--dms-save-bar-h)");
});

it("shows no bar on a clean form, Cancel alone would repeat the way out", async () => {
  await mount({ variant: "floating", dirty: false, cancellable: true });

  expect(anchor().getAttribute("aria-hidden")).toBe("true");
});

it("folds a hidden band away, its footer taking no room", async () => {
  await mount({
    variant: "band",
    kind: "record",
    dirty: false,
    cancellable: true,
    closable: true,
  });

  expect(anchor().getAttribute("aria-hidden")).toBe("true");
  expect(classesOf(anchor())).toContain("hidden");
});
