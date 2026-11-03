import { beforeAll, describe, expect, it, vi } from "vitest";
import { registerFormFunctions } from "../layers/dms-ui/app/build/composables/form/registerFormFunctions";

const FUNCTIONS = {
  SET_FIELD_DISABLED: "disabled",
  SET_FIELD_HIDDEN: "hidden",
  SET_FIELD_REQUIRED: "required",
  SET_FIELD_VALUE: "value",
};

type Handler = (
  action: { component: string; event: string; functionId: string; params?: object },
  eventData: { data?: unknown },
  state: { value: Record<string, unknown> },
) => void;

const handlers = new Map<string, Handler>();

function run(
  id: string,
  params: object | undefined,
  data: unknown = { fieldId: "stage", value: "won" },
  state: Record<string, unknown> = {},
) {
  const box = { value: state };
  handlers.get(id)!(
    { component: "c", event: "e", functionId: id, params },
    { data },
    box,
  );
  return box.value;
}

describe("form watch functions", () => {
  beforeAll(() => {
    vi.stubGlobal("FormFunctions", FUNCTIONS);
    vi.stubGlobal("useDefinedFunctions", () => ({
      registerFunction: (id: string, fn: Handler) => handlers.set(id, fn),
    }));
    registerFormFunctions();
  });

  it("adds the target to the set its flag turns on, and removes it when off", () => {
    const on = run("hidden", { targetField: "a", setHidden: true });
    expect(on.hiddenFields).toEqual(new Set(["a"]));
    const off = run("hidden", { targetField: "a", setHidden: false }, {}, on);
    expect(off.hiddenFields).toEqual(new Set());
    expect(
      run("disabled", { targetField: "b", setDisabled: true }).disabledFields,
    ).toEqual(new Set(["b"]));
    expect(
      run("required", { targetField: "c", setRequired: true }).requiredFields,
    ).toEqual(new Set(["c"]));
  });

  it("keeps the other targets of the set", () => {
    const first = run("hidden", { targetField: "a", setHidden: true });
    const both = run("hidden", { targetField: "b", setHidden: true }, {}, first);
    expect(both.hiddenFields).toEqual(new Set(["a", "b"]));
  });

  it("writes the map entry the changed field names, into the target", () => {
    const state = run("value", {
      targetField: "probability",
      valueMap: { won: 100, lost: 0 },
    });
    expect(state).toEqual({ probability: 100 });
  });

  it("writes a copy of a fixed value, and clears the target for an undefined one", () => {
    const fixed = { nested: [1] };
    const written = run("value", { targetField: "x", value: fixed });
    expect(written.x).toEqual(fixed);
    expect(written.x).not.toBe(fixed);
    expect(
      run("value", { targetField: "x", value: undefined }, undefined, { x: 1 }),
    ).toEqual({ x: undefined });
  });

  it("writes nothing for a value the map has no entry for, or on the initial event", () => {
    expect(
      run("value", { targetField: "p", valueMap: { lost: 0 } }, { value: "won" }),
    ).toEqual({});
    expect(
      run("value", { targetField: "p", value: 1 }, { value: "won", initial: true }),
    ).toEqual({});
  });
});
