// @vitest-environment jsdom
/**
 * What a `Form` offers a custom field through `useEnclosingForm`: submitting
 * the form as its save button does, a validator that can stop a submit and
 * leaves with its component, and focusing a field by id. A page opened on a
 * field's anchor focuses that field.
 */
import { createApp, defineComponent, h } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FORM_HANDLE_KEY,
  type FormHandle,
  linkedFieldId,
} from "../layers/dms-ui/app/build/composables/form/enclosingForm";
import {
  type EnclosingForm,
  useEnclosingForm,
} from "../layers/dms-ui/app/composables/form/useEnclosingForm";
import type { FormValidator } from "../layers/dms-ui/app/composables/form/types/validation";

const FIELD_IDS = ["retentionDays", "requestLogMaxBodyKb"];
const mounted: Array<{ unmount: () => void }> = [];

afterEach(() => mounted.splice(0).forEach((app) => app.unmount()));

interface FakeForm {
  handle: FormHandle;
  validators: Set<FormValidator>;
}

function fakeForm(): FakeForm {
  const validators = new Set<FormValidator>();
  return {
    validators,
    handle: {
      submit: vi.fn(async () => {}),
      registerValidator: (validator) => {
        validators.add(validator);
        return () => validators.delete(validator);
      },
      revealField: vi.fn(async () => {}),
    },
  };
}

function mountField(
  handle: FormHandle | null,
  setup: (form: EnclosingForm | null) => void,
) {
  const app = createApp(
    defineComponent({
      setup() {
        setup(useEnclosingForm());
        return () => h("div");
      },
    }),
  );
  if (handle) app.provide(FORM_HANDLE_KEY, handle);
  app.mount(document.createElement("div"));
  mounted.push(app);
  return app;
}

describe("useEnclosingForm", () => {
  it("is null outside a Form", () => {
    let form: EnclosingForm | null | undefined;
    mountField(null, (enclosing) => (form = enclosing));
    expect(form).toBeNull();
  });

  it("submits the form and focuses a field through the form", async () => {
    const { handle } = fakeForm();
    let form: EnclosingForm | null = null;
    mountField(handle, (enclosing) => (form = enclosing));

    await form!.submit();
    await form!.focusField("retentionDays");

    expect(handle.submit).toHaveBeenCalledOnce();
    expect(handle.revealField).toHaveBeenCalledWith("retentionDays");
  });

  it("adds a validator that leaves with its component", () => {
    const { handle, validators } = fakeForm();
    const validator = () => false;
    const app = mountField(handle, (form) => form?.addValidator(validator));

    expect([...validators]).toEqual([validator]);

    app.unmount();
    mounted.splice(mounted.indexOf(app), 1);
    expect(validators.size).toBe(0);
  });

  it("removes a validator on request", () => {
    const { handle, validators } = fakeForm();
    let remove: (() => void) | undefined;
    mountField(handle, (form) => (remove = form?.addValidator(() => true)));

    remove?.();
    expect(validators.size).toBe(0);
  });
});

describe("a field's anchor", () => {
  it("names a field of the form by its id", () => {
    expect(linkedFieldId("#retentionDays", FIELD_IDS)).toBe("retentionDays");
    expect(
      linkedFieldId("#request%4CogMaxBodyKb", ["requestLogMaxBodyKb"]),
    ).toBe("requestLogMaxBodyKb");
  });

  it("names nothing for another anchor, none, or a broken one", () => {
    expect(linkedFieldId("#dms-form-settings-section-logs", FIELD_IDS)).toBe(
      undefined,
    );
    expect(linkedFieldId("", FIELD_IDS)).toBe(undefined);
    expect(linkedFieldId("#%E0%A4%A", FIELD_IDS)).toBe(undefined);
  });
});
