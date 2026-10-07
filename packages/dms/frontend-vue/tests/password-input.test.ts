// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type App,
  createApp,
  type FunctionalComponent,
  h,
  nextTick,
  ref,
} from "vue";

interface InputStubProps {
  modelValue?: string;
  icon?: string;
  color?: string;
}

const Input: FunctionalComponent<InputStubProps> = (props, { attrs, slots }) =>
  h("div", [
    h("input", {
      ...attrs,
      value: props.modelValue,
      "data-icon": props.icon,
      "data-color": props.color,
    }),
    slots.trailing?.(),
  ]);
Input.props = ["modelValue", "icon", "color"];
Input.inheritAttrs = false;

interface ButtonStubProps {
  label?: string;
  icon?: string;
}

const Button: FunctionalComponent<ButtonStubProps> = (props, { attrs }) =>
  h(
    "button",
    { type: "button", ...attrs, "data-icon": props.icon },
    props.label,
  );
Button.props = ["label", "icon"];
Button.inheritAttrs = false;

let app: App | undefined;
let host: HTMLDivElement;

async function mount(props: Record<string, unknown> = {}) {
  const { default: PasswordInput } = await import(
    "../layers/dms-ui/app/build/components/form/PasswordInput.vue"
  );
  const visible = ref(false);
  app = createApp({
    setup: () => () =>
      h(PasswordInput, {
        id: "secret",
        visible: visible.value,
        "onUpdate:visible": (value: boolean) => {
          visible.value = value;
        },
        ...props,
      }),
  });
  app.component("UInput", Input);
  app.component("UButton", Button);
  app.mount(host);
  await nextTick();
  return visible;
}

const input = () => host.querySelector("input")!;
const toggle = () => host.querySelector("button")!;

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

it("hides the value until the eye shows it, and says which it does", async () => {
  const visible = await mount();
  expect(input().type).toBe("password");
  expect(toggle().getAttribute("aria-label")).toBe(
    "dms.form.input.show_password",
  );
  expect(toggle().getAttribute("aria-controls")).toBe("secret");
  expect(toggle().dataset.icon).toBe("i-ph-eye");

  toggle().click();
  await nextTick();

  expect(visible.value).toBe(true);
  expect(input().type).toBe("text");
  expect(toggle().getAttribute("aria-pressed")).toBe("true");
  expect(toggle().getAttribute("aria-label")).toBe(
    "dms.form.input.hide_password",
  );
  expect(toggle().dataset.icon).toBe("i-ph-eye-slash");
});

it("writes Show / Hide on the toggle of a new password, with the lock icon", async () => {
  await mount({ labelledToggle: true, hasLockIcon: true });
  expect(toggle().textContent).toBe("dms.form.input.show");
  expect(input().dataset.icon).toBe("i-ph-lock-simple");
});

it("keeps the caller's colour unless the value is invalid", async () => {
  await mount({ color: "primary" });
  expect(input().dataset.color).toBe("primary");
  expect(input().getAttribute("aria-invalid")).toBeNull();
  app?.unmount();

  await mount({ color: "primary", invalid: true });
  expect(input().dataset.color).toBe("error");
  expect(input().getAttribute("aria-invalid")).toBe("true");
});
