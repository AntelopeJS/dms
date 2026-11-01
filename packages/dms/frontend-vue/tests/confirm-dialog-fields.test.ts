/** @vitest-environment jsdom */
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
} from "../layers/dms-ui/app/entries/composables/confirm/confirmDialogTexts";
import type { ConfirmDialogField } from "../layers/dms-core/app/types/confirm-dialog";

import { DialogRoot } from "reka-ui";

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
const t = i18n.global.t;

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

  it("asks to type the text the row fills in, or a translated one", () => {
    const typed = (confirmText: string) =>
      resolveConfirmDialog(
        { title: "Remove {name}?", confirmText },
        { name: "Editors" },
        t,
      ).confirmText;
    expect(typed("{name}")).toBe("Editors");
    expect(typed("$roles.delete_title")).toBe("Delete Editors?");
    expect(typed("DELETE")).toBe("DELETE");
  });
});

describe("ConfirmModal fields", () => {
  const fixture = createConfirmDialogFieldsFixture();
  registerConfirmationFieldTests(fixture);
});

function createConfirmDialogFieldsFixture() {
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
          onInput: (event: Event) => {
            if (event.target instanceof HTMLInputElement)
              emit("update:modelValue", event.target.value);
          },
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

  function mount(
    props: Partial<InstanceType<typeof ConfirmModal>["$props"]>,
  ): void {
    app = createApp({
      render: () =>
        h(DialogRoot, null, () =>
          h(ConfirmModal, { onClose: closed, ...props }),
        ),
    });
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
  return {
    mount,
    reassign,
    flush,
    get host() {
      return host;
    },
    typeIn,
    confirmButton,
    closed,
  };
}

function registerConfirmationFieldTests(
  fixture: ReturnType<typeof createConfirmDialogFieldsFixture>,
) {
  it("draws the fields and confirms with their values", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    fixture.mount({ title: "Delete?", fields: [fixture.reassign], onConfirm });
    await fixture.flush();
    expect(fixture.host.textContent).toContain("Move them to");

    await fixture.typeIn("role-2");
    fixture.confirmButton().click();
    await fixture.flush();

    expect(onConfirm).toHaveBeenCalledWith({ reassignTo: "role-2" });
    expect(fixture.closed).toHaveBeenCalledWith(true);
  });

  it("says what the required mark means under the fields", async () => {
    fixture.mount({ title: "Delete?", fields: [fixture.reassign] });
    await fixture.flush();
    expect(fixture.host.textContent).toContain("dms.form.required_legend");
  });

  it("draws no legend when no field is required", async () => {
    fixture.mount({
      title: "Delete?",
      fields: [{ ...fixture.reassign, required: false }],
    });
    await fixture.flush();
    expect(fixture.host.textContent).not.toContain("dms.form.required_legend");
  });

  it("flags a required field left empty instead of confirming", async () => {
    const onConfirm = vi.fn();
    fixture.mount({ title: "Delete?", fields: [fixture.reassign], onConfirm });
    await fixture.flush();

    fixture.confirmButton().click();
    await fixture.flush();

    expect(onConfirm).not.toHaveBeenCalled();
    expect(fixture.host.querySelector("em")?.textContent).toBe(
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
    fixture.mount({ title: "Delete?", fields: [fixture.reassign], onConfirm });
    await fixture.flush();

    await fixture.typeIn("role-1");
    fixture.confirmButton().click();
    await fixture.flush();

    expect(fixture.host.querySelector("em")?.textContent).toBe(
      "t($page.settings.roles.error.invalid_reassign)",
    );
    expect(fixture.closed).not.toHaveBeenCalled();
  });
}
