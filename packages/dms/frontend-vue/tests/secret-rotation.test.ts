/** @vitest-environment jsdom */
import { computed, createApp, h, inject, nextTick, ref, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fieldSavedMarker } from "../layers/dms-ui/app/build/composables/form/fieldSaved";
import { useInstantForm } from "../layers/dms-ui/app/build/composables/form/useInstantForm";
import type { FormField } from "../layers/dms-ui/app/composables/form/types/field";
import { FORM_FIELD_SAVED_KEY } from "../layers/dms-ui/app/composables/form/types/field-saved";
import type { FormData } from "../layers/dms-ui/app/composables/form/types/value";
import { computeResetState } from "../layers/dms-ui/app/composables/form/useForm";
import { useFormDirty } from "../layers/dms-ui/app/composables/unsaved-changes/useFormDirty";

const OLD_KEY = "sk_live_old0000619e";
const NEW_KEY = "sk_live_new00004b2d";

describe("a field the server saved on its own", () => {
  function form() {
    const state = ref<Record<string, unknown>>({
      name: "Acme",
      apiKey: OLD_KEY,
    });
    const initialValues = ref<FormData>({ name: "Acme", apiKey: OLD_KEY });
    const dirty = useFormDirty(() => ({ ...state.value }));
    const instantSave = { confirmField: vi.fn() };
    const markFieldSaved = fieldSavedMarker({
      hasField: (id) => id in initialValues.value,
      initialValues,
      dirty,
      instantSave,
    });
    return { state, initialValues, dirty, instantSave, markFieldSaved };
  }

  it("is not a change left to save", () => {
    const { state, dirty, markFieldSaved } = form();
    state.value.apiKey = NEW_KEY;
    expect(dirty.dirty.value).toBe(true);
    markFieldSaved("apiKey", NEW_KEY);
    expect(dirty.dirty.value).toBe(false);
  });

  it("keeps the other fields' changes", () => {
    const { state, dirty, markFieldSaved } = form();
    state.value.name = "Acme Corp";
    state.value.apiKey = NEW_KEY;
    markFieldSaved("apiKey", NEW_KEY);
    expect(dirty.dirty.value).toBe(true);
    expect(dirty.baseline.value.name).toBe("Acme");
  });

  it("is what Discard puts back", () => {
    const { state, initialValues, markFieldSaved, instantSave } = form();
    state.value.apiKey = NEW_KEY;
    markFieldSaved("apiKey", NEW_KEY);
    expect(computeResetState(state.value, initialValues.value).apiKey).toBe(
      NEW_KEY,
    );
    expect(instantSave.confirmField).toHaveBeenCalledWith("apiKey", NEW_KEY);
  });

  it("leaves a control the form does not hold alone", () => {
    const { initialValues, markFieldSaved, instantSave } = form();
    markFieldSaved("rows.0.apiKey", NEW_KEY);
    expect(initialValues.value).toEqual({ name: "Acme", apiKey: OLD_KEY });
    expect(instantSave.confirmField).not.toHaveBeenCalled();
  });
});

describe("an instant form told a field was saved", () => {
  it("does not save that value again", async () => {
    vi.useFakeTimers();
    const state = ref<Record<string, unknown>>({ apiKey: OLD_KEY });
    const fields = computed(
      () => [{ id: "apiKey", type: "secret" }] as unknown as FormField[],
    );
    const submit = vi.fn(async () => {});
    const instant = useInstantForm({
      state,
      fields,
      isTouched: () => true,
      isFieldValid: async () => true,
      submit,
      onRefused: vi.fn(),
    });
    instant.start();
    state.value.apiKey = NEW_KEY;
    instant.confirmField("apiKey", NEW_KEY);
    await nextTick();
    await vi.runAllTimersAsync();
    expect(submit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("DmsInputSecret", () => {
  let app: App | undefined;

  const ButtonStub = (props: { label?: string; onClick?: () => void }) =>
    h("button", { onClick: props.onClick }, props.label);
  const InputStub = (props: { modelValue?: string }) =>
    h("input", { value: props.modelValue });

  beforeEach(() => {
    vi.stubGlobal("ref", ref);
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("inject", inject);
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
    vi.stubGlobal("useOverlay", () => ({
      create: (
        _component: unknown,
        { props }: { props: { onConfirm: () => Promise<void> } },
      ) => ({
        open: async () => {
          await props.onConfirm();
          return true;
        },
      }),
    }));
    vi.stubGlobal("useAuthFetch", () => ({
      $authFetch: vi.fn(async () => ({ value: NEW_KEY })),
    }));
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    vi.unstubAllGlobals();
  });

  it("marks the rotated secret saved in its form", async () => {
    const { default: InputSecret } = await import(
      "../layers/dms-ui/app/components/form/components/InputSecret.vue"
    );
    const value = ref<string>(OLD_KEY);
    const markFieldSaved = vi.fn();
    app = createApp({
      render: () =>
        h(InputSecret, {
          id: "apiKey",
          rotateUrl: "/api/keys/rotate",
          modelValue: value.value,
          "onUpdate:modelValue": (next: string) => {
            value.value = next;
          },
        }),
    });
    app.provide(FORM_FIELD_SAVED_KEY, markFieldSaved);
    app.component("UInput", InputStub);
    app.component("UButton", ButtonStub);
    const host = document.createElement("div");
    app.mount(host);

    const rotate = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "dms.form.secret.rotate",
    );
    rotate!.click();
    for (let tick = 0; tick < 3; tick++) await nextTick();

    expect(value.value).toBe(NEW_KEY);
    expect(markFieldSaved).toHaveBeenCalledWith("apiKey", NEW_KEY);
  });
});
