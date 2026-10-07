// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type App,
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
} from "vue";
import { createI18n } from "vue-i18n";
import ConfirmModal from "../layers/dms-ui/app/components/confirm/ConfirmModal.vue";
import {
  resolveConfirmDialog,
  resolveConfirmText,
} from "../layers/dms-ui/app/build/composables/confirm/confirmDialogTexts";
import type { ConfirmDialogField } from "../layers/dms-core/app/types/confirm-dialog";

vi.mock("reka-ui", async () => {
  const { defineComponent: define, h: render } = await import("vue");
  const Text = define({
    setup:
      (_, { slots }) =>
      () =>
        render("div", slots.default?.()),
  });
  return { DialogTitle: Text, DialogDescription: Text };
});

const i18n = createI18n({
  legacy: false,
  locale: "en",
  messages: {
    en: {
      roles: {
        delete_title: "Delete {name}?",
        in_use: "{count} member holds it | {count} members hold it",
        move_to: "Move them to",
      },
    },
  },
});
const t = i18n.global.t as (
  key: string,
  params: Record<string, unknown>,
  plural?: number,
) => string;

describe("confirmation dialog texts", () => {
  it("translates keys with the dialog's params, pluralized on its count", () => {
    expect(resolveConfirmText("$roles.in_use", { count: 1 }, t)).toBe(
      "1 member holds it",
    );
    expect(resolveConfirmText("$roles.in_use", { count: 3 }, t)).toBe(
      "3 members hold it",
    );
    expect(resolveConfirmText("Remove it?", { count: 3 }, t)).toBe(
      "Remove it?",
    );
  });

  it("interpolates with the row's fields and the dialog's params, fields labels included", () => {
    const options = resolveConfirmDialog(
      {
        title: "$roles.delete_title",
        description: "$roles.in_use",
        params: { count: 2 },
        fields: [
          {
            id: "reassignTo",
            label: "$roles.move_to",
            type: "select",
            component: {
              componentName: "dms-select",
              options: {
                placeholder: "$roles.move_to",
                items: [{ value: "r2", label: "Readers" }],
              },
            },
          },
        ],
      },
      { name: "Editors" },
      t,
    );
    expect(options.title).toBe("Delete Editors?");
    expect(options.description).toBe("2 members hold it");
    expect(options.fields?.[0]?.label).toBe("Move them to");
    // The input's placeholder and item labels read as in a form.
    expect(options.fields?.[0]?.component.options).toMatchObject({
      placeholder: "Move them to",
      items: [{ value: "r2", label: "Readers" }],
    });
  });

  it("fills a literal text's placeholders like a key's, leaving unknown ones as written", () => {
    const options = resolveConfirmDialog(
      {
        title: "Remove {name}?",
        description: "{count} rows go with it, {missing} stays.",
        params: { count: 2 },
        confirmLabel: "Remove {name}",
      },
      { name: "Editors", nested: { name: "x" } },
      t,
    );
    expect(options.title).toBe("Remove Editors?");
    expect(options.description).toBe("2 rows go with it, {missing} stays.");
    expect(options.confirmLabel).toBe("Remove Editors");
    expect(
      resolveConfirmText("{nested} {constructor}", { nested: {} }, t),
    ).toBe("{nested} {constructor}");
  });
});

describe("ConfirmModal fields", () => {
  let app: App | undefined;
  let host: HTMLDivElement;
  const closed = vi.fn();

  const Slots = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h("div", [slots.header?.(), slots.body?.(), slots.footer?.()]),
  });
  const Button = defineComponent({
    props: { label: String },
    emits: ["click"],
    setup:
      (props, { emit }) =>
      () =>
        h("button", { onClick: () => emit("click") }, props.label),
  });
  // A form field: its label, its input, its error under it.
  const FormField = defineComponent({
    props: { label: String, error: String },
    setup:
      (props, { slots }) =>
      () =>
        h("label", [
          h("span", props.label),
          slots.default?.(),
          props.error ? h("em", props.error) : null,
        ]),
  });
  const Input = defineComponent({
    props: { modelValue: String },
    emits: ["update:modelValue"],
    setup:
      (props, { emit }) =>
      () =>
        h("input", {
          value: props.modelValue ?? "",
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
        }),
  });
  const Empty = defineComponent({ setup: () => () => null });

  const reassign: ConfirmDialogField = {
    id: "reassignTo",
    label: "Move them to",
    type: "select",
    required: true,
    component: { componentName: "dms-select" },
  };

  async function flush(): Promise<void> {
    for (let tick = 0; tick < 6; tick++) await nextTick();
  }

  function mount(props: Record<string, unknown>): void {
    app = createApp(ConfirmModal, { onClose: closed, ...props });
    app.config.globalProperties.$t = (key: string) => key;
    app.component("UModal", Slots);
    app.component("UButton", Button);
    app.component("UFormField", FormField);
    for (const name of ["UIcon", "UKbd", "UInput", "I18nT", "UAlert"]) {
      app.component(name, Empty);
    }
    app.component("DmsIconWell", Empty);
    app.mount(host);
  }

  const confirmButton = () =>
    [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "dms.confirm.confirm",
    )!;
  const typeIn = async (value: string) => {
    const input = host.querySelector("input")!;
    input.value = value;
    input.dispatchEvent(new Event("input"));
    await flush();
  };

  beforeEach(() => {
    vi.stubGlobal("ref", ref);
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("useTranslation", () => ({
      processApiMessage: (message: string) => `t(${message})`,
    }));
    vi.stubGlobal("resolveDmsComponent", (name: string) =>
      name === "dms-select" ? Input : undefined,
    );
    host = document.createElement("div");
    document.body.append(host);
    closed.mockReset();
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    host.remove();
    vi.unstubAllGlobals();
  });

  it("draws the fields and confirms with their values", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    mount({ title: "Delete?", fields: [reassign], onConfirm });
    await flush();
    expect(host.textContent).toContain("Move them to");

    await typeIn("role-2");
    confirmButton().click();
    await flush();

    expect(onConfirm).toHaveBeenCalledWith({ reassignTo: "role-2" });
    expect(closed).toHaveBeenCalledWith(true);
  });

  it("flags a required field left empty instead of confirming", async () => {
    const onConfirm = vi.fn();
    mount({ title: "Delete?", fields: [reassign], onConfirm });
    await flush();

    confirmButton().click();
    await flush();

    expect(onConfirm).not.toHaveBeenCalled();
    expect(host.querySelector("em")?.textContent).toBe(
      "dms.field_errors.required",
    );
  });

  it("shows the server's field error under its field, the dialog open", async () => {
    const onConfirm = vi.fn().mockRejectedValue(
      Object.assign(new Error("[POST] 409"), {
        name: "FetchError",
        statusCode: 409,
        data: {
          field: "reassignTo",
          message: "$page.settings.roles.error.invalid_reassign",
        },
      }),
    );
    mount({ title: "Delete?", fields: [reassign], onConfirm });
    await flush();

    await typeIn("role-1");
    confirmButton().click();
    await flush();

    expect(host.querySelector("em")?.textContent).toBe(
      "t($page.settings.roles.error.invalid_reassign)",
    );
    expect(closed).not.toHaveBeenCalled();
  });
});
