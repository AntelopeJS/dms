import assert from "node:assert/strict";
import test from "node:test";
import {
  applyInviteExtension,
  clearInviteExtensions,
} from "../dist/invite-extensions/internal/registry.js";
import { INVITE_FORM_SLOT_ID } from "../dist/invite-extensions/internal/form-slot.js";
import { slotResolvers } from "../dist/internal/component-slots.js";

/** @param {Array<Record<string, unknown>>} watchActions */
async function watchesOnInviteForm(watchActions) {
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
  const resolver = slotResolvers.get(INVITE_FORM_SLOT_ID);
  assert.ok(resolver, "the invite form slot has a resolver");
  const resolved = await resolver({
    slotId: INVITE_FORM_SLOT_ID,
    fields: [{ id: "emails" }],
  });
  clearInviteExtensions();
  return resolved.watchActions;
}

const SET_HIDDEN = {
  component: "$component:self",
  event: "fieldChange",
  functionId: "setFieldHidden",
};

await test("an invite extension's watch keeps its params and prefixes the field it targets", async () => {
  const params = { targetField: "costCenter", setHidden: true };
  const [watch] = await watchesOnInviteForm([{ ...SET_HIDDEN, params }]);
  assert.deepEqual(watch.params, {
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
  const [number, nothing] = await watchesOnInviteForm([
    { ...SET_HIDDEN, params: { targetField: 7, setHidden: true } },
    { ...SET_HIDDEN, params: { targetField: undefined } },
  ]);
  assert.deepEqual(number.params, { targetField: 7, setHidden: true });
  assert.deepEqual(nothing.params, { targetField: undefined });
});

await test("a watch whose params name no targetField keeps them as is", async () => {
  const [watch] = await watchesOnInviteForm([
    { ...SET_HIDDEN, params: { value: "x", valueMap: { won: 100 } } },
  ]);
  assert.deepEqual(watch.params, { value: "x", valueMap: { won: 100 } });
});

await test("a watch with no params answers an empty params object", async () => {
  const [watch] = await watchesOnInviteForm([{ ...SET_HIDDEN }]);
  assert.deepEqual(watch.params, {});
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
  const [watch] = await watchesOnInviteForm([
    { ...SET_HIDDEN, params: new Params() },
  ]);
  assert.deepEqual(watch.params, { targetField: "billing__costCenter" });
});
