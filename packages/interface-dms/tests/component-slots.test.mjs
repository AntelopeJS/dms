import assert from "node:assert/strict";
import test from "node:test";
import { Logging } from "@antelopejs/interface-core/logging";
import { Form } from "../dist/base/form.js";
import { DefaultDataTypes } from "../dist/base/data-types/default-types.js";
import { RegisterComponentSlot } from "../dist/component-slots.js";
import { ResolveComponentSlots } from "../dist/internal/component-slots.js";

let slotCount = 0;

/** @typedef {import("../dist/component-slots.js").ComponentSlotResolver} ComponentSlotResolver */
/** @typedef {Parameters<ComponentSlotResolver>[0]} SlotOptions */

/**
 * @param {import("node:test").TestContext} t
 * @param {ComponentSlotResolver} [resolver]
 */
function registerSlot(t, resolver = (options) => options) {
  slotCount += 1;
  const slotId = `test:slot-${slotCount}`;
  /** @type {SlotOptions[]} */
  const calls = [];
  const release = RegisterComponentSlot(slotId, (options) => {
    calls.push(structuredClone(options));
    return resolver(options);
  });
  t.after(release);
  return { slotId, calls };
}

/** @param {string} slotId */
function serializedForm(slotId) {
  return Form({
    slotId,
    fields: [
      {
        id: "name",
        label: "Name",
        type: new DefaultDataTypes.StringType({}),
      },
    ],
  }).serializeSync();
}

/** @type {ComponentSlotResolver} */
const withExtraField = (options) => ({
  ...options,
  fields: [
    ...options.fields,
    ...options.fields.map((field) => ({ ...field, id: "extra" })),
  ],
});

await test("a form's slot resolves to what its resolver returns", async (t) => {
  const { slotId, calls } = registerSlot(t, withExtraField);
  const layout = [serializedForm(slotId)];

  const resolved = await ResolveComponentSlots(layout);

  assert.equal(calls.length, 1);
  assert.deepEqual(
    calls[0].fields.map((field) => field.id),
    ["name"],
  );
  assert.deepEqual(
    resolved[0].options.fields.map((field) => field.id),
    ["name", "extra"],
  );
  assert.equal(resolved[0].options.slotId, slotId);
  assert.deepEqual(
    layout[0].options.fields.map((field) => field.id),
    ["name"],
    "the cached layout is not mutated",
  );
});

await test("a form behind another component's options resolves", async (t) => {
  const { slotId } = registerSlot(t, withExtraField);
  const layout = [
    {
      componentName: "dms-table-view",
      options: { addForm: serializedForm(slotId) },
      children: [],
    },
  ];

  const resolved = await ResolveComponentSlots(layout);

  assert.deepEqual(
    resolved[0].options.addForm.options.fields.map((field) => field.id),
    ["name", "extra"],
  );
});

await test("a slot nested in another one resolves first", async (t) => {
  /** @type {string[]} */
  const order = [];
  const inner = registerSlot(t, (options) => {
    order.push("inner");
    return options;
  });
  const outer = registerSlot(t, (options) => {
    order.push("outer");
    return options;
  });
  const host = serializedForm(outer.slotId);
  host.options.fields[0].component.options.extension = serializedForm(
    inner.slotId,
  );

  await ResolveComponentSlots([host]);

  assert.deepEqual(order, ["inner", "outer"]);
});

await test("a resolver answering its input leaves the options as they are", async (t) => {
  const { slotId, calls } = registerSlot(t);
  const layout = [serializedForm(slotId)];

  const resolved = await ResolveComponentSlots(layout);

  assert.equal(calls.length, 1);
  assert.deepEqual(resolved, layout);
});

await test("a resolver that throws is logged and the form keeps its options", async (t) => {
  const error = t.mock.method(Logging, "Error", () => undefined);
  const { slotId } = registerSlot(t, () => {
    throw new Error("boom");
  });
  const layout = [serializedForm(slotId)];

  const resolved = await ResolveComponentSlots(layout);

  assert.equal(error.mock.callCount(), 1);
  assert.deepEqual(resolved, layout);
});

await test("a layout declaring no registered slot is returned untouched", async (t) => {
  const { calls } = registerSlot(t);
  const layout = [serializedForm("test:not-registered")];

  assert.equal(await ResolveComponentSlots(layout), layout);
  assert.equal(calls.length, 0);
});

await test("a slot id in a component that is not a form is ignored", async (t) => {
  const { slotId, calls } = registerSlot(t, withExtraField);
  const layout = [
    {
      componentName: "DmsCustomWidget",
      options: { slotId, fields: [] },
      children: [],
    },
  ];

  const resolved = await ResolveComponentSlots(layout);

  assert.equal(calls.length, 0);
  assert.deepEqual(resolved, layout);
});

await test("a form without a fields array is skipped", async (t) => {
  const { slotId, calls } = registerSlot(t, withExtraField);
  const layout = [
    { componentName: "dms-form", options: { slotId }, children: [] },
    {
      componentName: "dms-form",
      options: { slotId, fields: "name" },
      children: [],
    },
    {
      componentName: "dms-form",
      options: { slotId, fields: { name: true } },
      children: [],
    },
  ];

  const resolved = await ResolveComponentSlots(layout);

  assert.equal(calls.length, 0);
  assert.deepEqual(resolved, layout);
});

await test("a form whose slot id is not a string is skipped", async (t) => {
  const { calls } = registerSlot(t, withExtraField);
  const layout = [
    {
      componentName: "dms-form",
      options: { slotId: 7, fields: [] },
      children: [],
    },
  ];

  const resolved = await ResolveComponentSlots(layout);

  assert.equal(calls.length, 0);
  assert.deepEqual(resolved, layout);
});

await test("a form's slot resolves on its fields and slot id alone, whatever its watch actions hold", async (t) => {
  const { slotId, calls } = registerSlot(t);
  const layout = [
    {
      componentName: "dms-form",
      options: { slotId, fields: [], watchActions: "not a list" },
      children: [],
    },
  ];

  await ResolveComponentSlots(layout);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].watchActions, "not a list");
});

await test("a form's options without any component around them are skipped", async (t) => {
  const { slotId, calls } = registerSlot(t, withExtraField);
  const layout = [{ slotId, fields: [] }];

  const resolved = await ResolveComponentSlots(layout);

  assert.equal(calls.length, 0);
  assert.deepEqual(resolved, layout);
});

await test("a very wide layout resolves without spreading its children", async (t) => {
  const { slotId, calls } = registerSlot(t);
  const WIDTH = 200_000;
  const layout = Array.from({ length: WIDTH }, () => ({
    componentName: "DmsCustomWidget",
    options: {},
    children: [],
  }));
  layout.push(serializedForm(slotId));

  await ResolveComponentSlots(layout);

  assert.equal(calls.length, 1);
});
