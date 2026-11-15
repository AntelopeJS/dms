import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { fieldSavedMarker } from "../layers/dms-ui/app/entries/composables/form/fieldSaved";
import type { FormData } from "../layers/dms-ui/app/composables/form/types/value";
import { useFormDirty } from "../layers/dms-ui/app/composables/unsaved-changes/useFormDirty";

type FormValues = Parameters<
  typeof fieldSavedMarker
>[0]["dirty"]["baseline"]["value"];

describe("a field the server saved as nothing", () => {
  it("leaves the field out of the values Discard puts back", () => {
    const initialValues = ref<FormData>({ name: "Acme", apiKey: "old" });
    const dirty = useFormDirty<FormValues>(() => ({
      name: "Acme",
    }));
    const markFieldSaved = fieldSavedMarker({
      hasField: (id) => id in initialValues.value,
      initialValues,
      dirty,
      instantSave: { confirmField: vi.fn() },
    });

    markFieldSaved("apiKey", undefined);

    expect(initialValues.value).toEqual({ name: "Acme" });
    expect("apiKey" in initialValues.value).toBe(false);
  });
});
