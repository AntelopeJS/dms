import assert from "node:assert/strict";
import test from "node:test";
import {
  applyInviteExtension,
  clearInviteExtensions,
} from "../dist/invite-extensions/internal/registry.js";
import { INVITE_FORM_SLOT_ID } from "../dist/invite-extensions/internal/form-slot.js";
import { ResolveComponentSlots } from "../dist/internal/component-slots.js";

/**
 * @param {unknown} value
 * @returns {value is object}
 */
function isObject(value) {
  return typeof value === "object" && value !== null;
}

/**
 * The params of each watch the invite form slot hands back, read from the
 * tree the page layout resolves.
 *
 * @param {Array<Record<string, unknown>>} watchActions
 * @returns {Promise<unknown[]>}
 */
async function paramsOnInviteForm(watchActions) {
  clearInviteExtensions();
  applyInviteExtension({
    key: "billing",
    component: {
      serialize: async () => ({
        options: {
          fields: [{ id: "costCenter", label: "Cost center", type: {} }],
          watchActions,
        },
      }),
    },
    schema: { parse: (body) => body },
    onAccept() {},
    placement: { side: "end", order: 0 },
  });
  /** @type {unknown} */
  const resolved = await ResolveComponentSlots({
    componentName: "dms-form",
    options: { slotId: INVITE_FORM_SLOT_ID, fields: [{ id: "emails" }] },
  });
  clearInviteExtensions();
  assert.ok(isObject(resolved) && "options" in resolved);
  const { options: form } = resolved;
  assert.ok(isObject(form) && "watchActions" in form);
  const { watchActions: served } = form;
  assert.ok(Array.isArray(served));
  /** @type {unknown[]} */
  const params = [];
  for (const watch of served) {
    assert.ok(isObject(watch) && "params" in watch);
    params.push(watch.params);
  }
  return params;
}

const SET_HIDDEN = {
  component: "$component:self",
  event: "fieldChange",
  functionId: "setFieldHidden",
};

await test("an invite extension's watch keeps its params and prefixes the field it targets", async () => {
  const params = { targetField: "costCenter", setHidden: true };
  const [served] = await paramsOnInviteForm([{ ...SET_HIDDEN, params }]);
  assert.deepEqual(served, {
    targetField: "billing__costCenter",
    setHidden: true,
  });
  assert.deepEqual(
    params,
    { targetField: "costCenter", setHidden: true },
    "the contributed form's own params are not rewritten",
  );
});

await test("a watch whose targetField is not a string keeps it as is", async () => {
  const [number, nothing] = await paramsOnInviteForm([
    { ...SET_HIDDEN, params: { targetField: 7, setHidden: true } },
    { ...SET_HIDDEN, params: { targetField: undefined } },
  ]);
  assert.deepEqual(number, { targetField: 7, setHidden: true });
  assert.deepEqual(nothing, { targetField: undefined });
});

await test("a watch whose params name no targetField keeps them as is", async () => {
  const [served] = await paramsOnInviteForm([
    { ...SET_HIDDEN, params: { value: "x", valueMap: { won: 100 } } },
  ]);
  assert.deepEqual(served, { value: "x", valueMap: { won: 100 } });
});

await test("a watch with no params answers an empty params object", async () => {
  const [served] = await paramsOnInviteForm([{ ...SET_HIDDEN }]);
  assert.deepEqual(served, {});
});

await test("params of a class instance keep their own members only", async () => {
  class Params {
    constructor() {
      this.targetField = "costCenter";
    }
    get inherited() {
      return "not copied";
    }
  }
  const [served] = await paramsOnInviteForm([
    { ...SET_HIDDEN, params: new Params() },
  ]);
  assert.deepEqual(served, { targetField: "billing__costCenter" });
});
