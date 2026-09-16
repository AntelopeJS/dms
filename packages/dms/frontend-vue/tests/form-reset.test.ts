import { describe, expect, it } from "vitest";
import {
  computeResetState,
  snapshotFormState,
} from "../layers/dms-ui/app/composables/form/useForm";

describe("computeResetState", () => {
  it("restores every field to its initial value", () => {
    const state = { title: "edited", count: 5 };
    const initialValues = { title: "original", count: 1 };

    expect(computeResetState(state, initialValues)).toEqual({
      title: "original",
      count: 1,
    });
  });

  it("skips internal watch state keys instead of throwing", () => {
    const state = {
      disabledFields: new Set<string>(),
      hiddenFields: new Set<string>(),
      title: "edited",
    };
    const initialValues = { title: "original" };

    expect(computeResetState(state, initialValues)).toEqual({
      title: "original",
    });
  });

  it("clears fields that have no initial value", () => {
    const state = { title: "typed into a blank form" };

    expect(computeResetState(state, {})).toEqual({ title: undefined });
  });

  it("returns deep clones detached from the initial values", () => {
    const initialValues = { tags: ["a", "b"] };
    const result = computeResetState({ tags: ["c"] }, initialValues);

    expect(result.tags).toEqual(["a", "b"]);
    expect(result.tags).not.toBe(initialValues.tags);
  });
});

describe("snapshotFormState", () => {
  it("captures current values without the internal watch keys", () => {
    const state = {
      disabledFields: new Set<string>(["a"]),
      hiddenFields: new Set<string>(),
      title: "saved",
    };

    expect(snapshotFormState(state)).toEqual({ title: "saved" });
  });

  it("detaches the snapshot from mutable state values", () => {
    const localized = { fr: "Bonjour", en: "Hello" };
    const snapshot = snapshotFormState({ title: localized });

    localized.fr = "Salut";

    expect(snapshot.title).toEqual({ fr: "Bonjour", en: "Hello" });
    expect(snapshot.title).not.toBe(localized);
  });
});
