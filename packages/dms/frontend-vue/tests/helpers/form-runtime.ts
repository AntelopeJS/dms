import { afterEach, beforeEach, expect, vi } from "vitest";
import * as Vue from "vue";
import { createI18n } from "vue-i18n";
import { DialogRoot } from "reka-ui";
import { useForm } from "../../layers/dms-ui/app/composables/form/useForm";
import { useWatch } from "../../layers/dms-core/app/composables/watch/useWatch";
import { HttpMethod } from "../../layers/dms-core/app/types/http";
import { Color } from "../../layers/dms-core/app/types/color";
import type { FormProps } from "../../layers/dms-ui/app/composables/form/types/props";
import en from "../../layers/dms-ui/i18n/locales/ui-en-GB.json";
import fr from "../../layers/dms-ui/i18n/locales/ui-fr-FR.json";

export const i18n = createI18n({
  legacy: false,
  locale: "en",
  messages: { en, fr },
});
export const t = (key: string) => i18n.global.t(key);
export const router = { back: vi.fn(), push: vi.fn() };
export const openPrompt = vi.fn(async () => false);
export let host: HTMLDivElement;
let app: Vue.App | undefined;

const Slot = Vue.defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      Vue.h("div", slots.default?.()),
});
const Input = Vue.defineComponent({
  props: ["modelValue", "disabled"],
  emits: ["update:modelValue"],
  setup:
    (props, { emit }) =>
    () =>
      Vue.h("input", {
        value: props.modelValue,
        disabled: props.disabled,
        onInput: (event: Event) => {
          if (event.target instanceof HTMLInputElement)
            emit("update:modelValue", event.target.value);
        },
      }),
});
const FormBoundary = Vue.defineComponent({
  emits: ["error"],
  setup(_, { expose, slots, emit }) {
    const errors = Vue.ref<Array<{ name: string }>>([]);
    const clear = () => {
      errors.value = [];
    };
    expose({ getErrors: () => errors.value, clear, errors });
    return () =>
      Vue.h("form", [
        slots.default?.(),
        Vue.h(
          "button",
          {
            type: "button",
            onClick: () => {
              errors.value = [{ name: "name" }];
              emit("error", { errors: errors.value });
            },
          },
          "Reject submit",
        ),
        Vue.h("button", { type: "button", onClick: clear }, "Fix errors"),
      ]);
  },
});
const Button = Vue.defineComponent({
  props: ["label", "disabled", "type"],
  setup:
    (props, { attrs }) =>
    () =>
      Vue.h(
        "button",
        {
          ...attrs,
          type: props.type ?? "button",
          disabled: props.disabled,
        },
        props.label,
      ),
});
const Alert = Vue.defineComponent({
  props: ["role", "title"],
  setup:
    (props, { slots }) =>
    () =>
      Vue.h("section", { role: props.role }, [
        props.title,
        slots.description?.(),
      ]),
});

export function unmountForm() {
  app?.unmount();
  app = undefined;
}

export async function mountForm(
  props: Partial<FormProps> = {},
  close?: () => Promise<void>,
  setupApp?: (app: Vue.App) => void,
) {
  const { default: Form } = await import(
    "../../layers/dms-ui/app/components/form/Form.vue"
  );
  const options: FormProps = {
    componentId: "form",
    pageId: "page",
    saveMode: "footer",
    submitUrl: "/api/save",
    fields: [
      {
        id: "name",
        label: "Name",
        component: { componentName: "Text" },
        defaultValue: "Ada",
      },
    ],
    ...props,
  };
  let content = () =>
    Vue.h(Vue.Suspense, null, { default: () => Vue.h(Form, options) });
  if (close) {
    const { useLeaveGuard } = await import(
      "../../layers/dms-core/app/composables/leave-guard/useLeaveGuard"
    );
    vi.stubGlobal("useLeaveGuard", useLeaveGuard);
    const { useModal } = await import(
      "../../layers/dms-ui/app/composables/containers/useModal"
    );
    vi.stubGlobal("useOverlay", () => ({
      create(
        component: Vue.Component,
        config: { props: Record<string, unknown> },
      ) {
        return {
          open: () => {
            content = () =>
              Vue.h(DialogRoot, null, () =>
                Vue.h(component, { ...config.props, onClose: close }),
              );
            return new Promise(() => {});
          },
        };
      },
    }));
    useModal().open({
      title: "Edit person",
      component: Form,
      componentOptions: options,
    });
    vi.stubGlobal("useOverlay", () => ({
      create: () => ({ open: openPrompt }),
    }));
  }
  app = Vue.createApp({ render: () => content() });
  registerFormComponents(app);
  app.component(
    "UModal",
    Vue.defineComponent({
      props: ["open"],
      setup:
        (props, { slots }) =>
        () =>
          props.open ? Vue.h("div", [slots.header?.(), slots.body?.()]) : null,
    }),
  );
  setupApp?.(app);
  app.mount(host);
  await vi.waitFor(() => expect(host.querySelector("form")).not.toBeNull());
  await Vue.nextTick();
}

export function registerFormComponents(app: Vue.App) {
  app.config.globalProperties.$t = t;
  for (const name of [
    "DmsCard",
    "DmsSection",
    "UFormField",
    "UIcon",
    "DmsLocalizedField",
    "DmsStatusPill",
    "DmsAutoLink",
  ])
    app.component(name, Slot);
  app.component("UForm", FormBoundary);
  app.component("UButton", Button);
  app.component("UAlert", Alert);
  app.component(
    "DmsDisplay",
    Vue.defineComponent({
      props: ["modelValue"],
      setup: (props) => () => Vue.h("span", String(props.modelValue ?? "")),
    }),
  );
}

export async function typeName() {
  const input = host.querySelector("input")!;
  input.value = "Grace";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await Vue.nextTick();
}

export function button(label: string) {
  const found = [...host.querySelectorAll("button")].find(
    (entry) => entry.textContent === label,
  );
  expect(found, `button ${label}`).toBeDefined();
  return found!;
}

beforeEach(() => {
  i18n.global.locale.value = "en";
  host = document.createElement("div");
  document.body.append(host);
  window.history.replaceState({}, "", "/edit");
  vi.stubEnv("SSR", false);
  const globals = {
    ...Vue,
    useForm,
    useWatch,
    HttpMethod,
    Color,
    CSS: { escape: String },
    CONTENT_LANGUAGE_HEADER: "Content-Language",
    isString: (value: unknown) => typeof value === "string",
    useToast: () => ({ add: vi.fn() }),
    useAuthFetch: () => ({ $authFetch: vi.fn() }),
    useDataTypes: () => ({ getDataType: () => undefined }),
    useTranslation: () => ({
      processI18n: (text: string) => text,
      processApiMessage: String,
    }),
    useI18n: () => ({ t, locale: i18n.global.locale, locales: Vue.ref([]) }),
    useDmsRoute: () => ({ path: "/edit", query: {}, params: {} }),
    useDmsRouter: () => router,
    useDefinedFunctions: () => ({ getFunction: () => undefined }),
    useComponentEvent: () => ({ sendComponentEvent: vi.fn() }),
    useEventedAction: () => ({ execute: vi.fn() }),
    resolveDmsComponent: () => Input,
    useOverlay: () => ({ create: () => ({ open: openPrompt }) }),
    useDmsUserSession: () => ({ user: Vue.ref(null) }),
    useUserRealtime: () => ({
      sessionId: Vue.ref(null),
      pageId: Vue.ref(null),
    }),
    useRealtimeTopic: vi.fn(),
  };
  for (const [name, value] of Object.entries(globals))
    vi.stubGlobal(name, value);
});

afterEach(() => {
  unmountForm();
  host.remove();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
