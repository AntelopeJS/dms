import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import {
  changedFormKeys,
  isEmptyFormValue,
  sameFormValue,
  snapshotFormValue,
} from "../layers/dms-ui/app/composables/unsaved-changes/formValue";
import { useFormDirty } from "../layers/dms-ui/app/composables/unsaved-changes/useFormDirty";
import {
  confirmLeave,
  hasUnsavedChanges,
  isLeavingVisit,
  registerUnsavedChanges,
  resetUnsavedChanges,
} from "../layers/dms-ui/app/composables/unsaved-changes/registry";

describe("sameFormValue", () => {
  it("compares nested objects and lists by value", () => {
    expect(
      sameFormValue(
        { street: "Rue Haute", tags: ["a", "b"], geo: { lat: 1 } },
        { geo: { lat: 1 }, tags: ["a", "b"], street: "Rue Haute" },
      ),
    ).toBe(true);
    expect(sameFormValue({ tags: ["a", "b"] }, { tags: ["b", "a"] })).toBe(
      false,
    );
    expect(sameFormValue({ geo: { lat: 1 } }, { geo: { lat: 2 } })).toBe(false);
  });

  it("compares dates by their time", () => {
    expect(sameFormValue(new Date("2026-01-01"), new Date("2026-01-01"))).toBe(
      true,
    );
    expect(sameFormValue(new Date("2026-01-01"), "2026-01-01")).toBe(false);
  });

  it("treats every empty value as the same", () => {
    for (const empty of [undefined, null, "", [], false, { a: "", b: null }]) {
      expect(isEmptyFormValue(empty)).toBe(true);
      expect(sameFormValue(empty, undefined)).toBe(true);
    }
    expect(sameFormValue(0, undefined)).toBe(false);
    expect(sameFormValue({ enabled: true }, { enabled: false })).toBe(false);
  });

  it("lists the keys that changed", () => {
    expect(
      changedFormKeys({ a: "x", b: [1], c: "" }, { a: "x", b: [2], c: null }),
    ).toEqual(["b"]);
  });

  it("snapshots detached copies, files kept as they are", () => {
    const file = new Blob(["x"]);
    const value = { list: [{ a: 1 }], file };
    const copy = snapshotFormValue(value);
    value.list[0]!.a = 2;
    expect(copy.list[0]!.a).toBe(1);
    expect(copy.file).toBe(file);
  });
});

describe("useFormDirty", () => {
  it("is dirty while a value differs and clean once restored", async () => {
    const state = ref({ name: "Ada", tags: ["x"] });
    const { dirty } = useFormDirty(() => state.value);
    expect(dirty.value).toBe(false);

    state.value.tags.push("y");
    await nextTick();
    expect(dirty.value).toBe(true);

    state.value.tags.pop();
    await nextTick();
    expect(dirty.value).toBe(false);
  });

  it("starts over from the saved values after markClean", async () => {
    const state = ref({ name: "Ada" });
    const { dirty, markClean } = useFormDirty(() => state.value);
    state.value.name = "Grace";
    await nextTick();
    expect(dirty.value).toBe(true);

    markClean();
    expect(dirty.value).toBe(false);
    state.value.name = "Ada";
    await nextTick();
    expect(dirty.value).toBe(true);
  });

  it("compares with the caller's initial values when given", () => {
    const saved = ref("Ada");
    const name = ref("Ada");
    const { dirty } = useFormDirty(() => name.value, {
      initial: () => saved.value,
    });
    name.value = "Grace";
    expect(dirty.value).toBe(true);
    saved.value = "Grace";
    expect(dirty.value).toBe(false);
  });
});

describe("leave guard", () => {
  afterEach(() => resetUnsavedChanges());

  it("leaves without asking when nothing is dirty", async () => {
    const prompt = vi.fn(async () => true);
    registerUnsavedChanges({ isDirty: () => false }, prompt);
    expect(await confirmLeave()).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
  });

  it("asks when dirty and keeps the form on Keep editing", async () => {
    const prompt = vi.fn(async () => false);
    registerUnsavedChanges({ isDirty: () => true }, prompt);
    expect(await confirmLeave()).toBe(false);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("asks once for concurrent leaves and never again once discarded", async () => {
    let answer!: (value: boolean) => void;
    const prompt = vi.fn(
      () => new Promise<boolean>((resolve) => (answer = resolve)),
    );
    registerUnsavedChanges(
      { isDirty: () => true, containerId: "drawer-1" },
      prompt,
    );
    registerUnsavedChanges({ isDirty: () => true }, prompt);

    // A drawer closing while the page navigates: one dialog for both.
    const closing = confirmLeave({ containerId: "drawer-1" });
    const navigating = confirmLeave();
    answer(true);
    expect(await closing).toBe(true);
    expect(await navigating).toBe(true);
    expect(prompt).toHaveBeenCalledTimes(1);

    // Released: the drawer closing after the navigation asks nothing more.
    expect(await confirmLeave({ containerId: "drawer-1" })).toBe(true);
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("only asks for the forms of the scope left", async () => {
    const prompt = vi.fn(async () => true);
    const panel = { contains: (element: unknown) => element === inside };
    const inside = {} as Element;
    registerUnsavedChanges(
      { isDirty: () => true, containerId: "modal-1" },
      prompt,
    );
    registerUnsavedChanges(
      { isDirty: () => true, element: () => inside },
      prompt,
    );
    expect(await confirmLeave({ containerId: "modal-2" })).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
    expect(await confirmLeave({ within: panel as unknown as Element })).toBe(
      true,
    );
    expect(prompt).toHaveBeenCalledTimes(1);
    // The modal's form was outside the panel: still guarded.
    expect(hasUnsavedChanges({ containerId: "modal-1" })).toBe(true);
  });

  it("guards page visits to another path only", () => {
    const url = (path: string) => new URL(path, "http://dms.test");
    expect(isLeavingVisit({ url: url("/b"), method: "get" }, "/a")).toBe(true);
    expect(isLeavingVisit({ url: url("/a?tab=2"), method: "get" }, "/a")).toBe(
      false,
    );
    expect(isLeavingVisit({ url: url("/b"), prefetch: true }, "/a")).toBe(
      false,
    );
    expect(isLeavingVisit({ url: url("/b"), method: "post" }, "/a")).toBe(
      false,
    );
    expect(isLeavingVisit(undefined, "/a")).toBe(false);
  });
});
