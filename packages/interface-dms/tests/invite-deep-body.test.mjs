import assert from "node:assert/strict";
import test from "node:test";
import { HTTPResult } from "@antelopejs/interface-api";
import {
  RegisterInviteExtension,
  internal,
} from "../dist/invite-extensions/registry.js";
import {
  applyInviteExtension,
  revokeInviteExtension,
  clearInviteExtensions,
} from "../dist/invite-extensions/internal/registry.js";
import { CollectInviteExtensionPayloads } from "../dist/invite-extensions/internal/delivery.js";
import { CollectInviteExtensionEdits } from "../dist/invite-extensions/internal/edit.js";

internal.RegisterInviteExtension.onHandlers(
  applyInviteExtension,
  revokeInviteExtension,
);

const HUGE_DEPTH = 5000;
const BOUND = 32;

/**
 * @param {number} depth
 * @returns {unknown[]}
 */
function nestedArrays(depth) {
  /** @type {unknown[]} */
  let nested = [];
  for (let level = 1; level < depth; level += 1) nested = [nested];
  return nested;
}

function registerBilling() {
  clearInviteExtensions();
  RegisterInviteExtension({
    key: "billing",
    component: {},
    schema: {
      parse: (input) => input,
      safeParse: (data) => ({ success: true, data }),
    },
    onAccept() {},
  });
}

/** @param {() => unknown} run */
function failureOf(run) {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

/** @param {unknown} failure */
function assertBadRequest(failure) {
  assert.ok(failure instanceof HTTPResult, `got ${String(failure)}`);
  assert.equal(failure.status, 400);
  assert.match(
    String(failure.body),
    new RegExp(`more than ${BOUND} levels deep`),
  );
}

const flows = [
  {
    flow: "payloads",
    collect: CollectInviteExtensionPayloads,
    empty: { billing: {} },
  },
  {
    flow: "edits",
    collect: CollectInviteExtensionEdits,
    empty: {},
  },
];

for (const { flow, collect, empty } of flows) {
  await test(`${flow}: an unrelated field ${HUGE_DEPTH} arrays deep in a valid JSON body answers 400, not a RangeError`, () => {
    registerBilling();
    /** @type {unknown} */
    const body = JSON.parse(
      `{"billing__note":"x","unrelated":${"[".repeat(HUGE_DEPTH)}${"]".repeat(HUGE_DEPTH)}}`,
    );

    assertBadRequest(failureOf(() => collect(body)));
  });

  await test(`${flow}: a registered extension's field ${HUGE_DEPTH} arrays deep answers 400`, () => {
    registerBilling();

    assertBadRequest(
      failureOf(() => collect({ billing__note: nestedArrays(HUGE_DEPTH) })),
    );
  });

  await test(`${flow}: a cyclic body answers 400`, () => {
    registerBilling();
    /** @type {unknown[]} */
    const cycle = [];
    cycle.push(cycle);

    assertBadRequest(
      failureOf(() => collect({ billing__note: "x", unrelated: cycle })),
    );
  });

  await test(`${flow}: the body counts as the first level: ${BOUND - 1} nested arrays pass and ${BOUND} are refused`, () => {
    registerBilling();
    const allowed = nestedArrays(BOUND - 1);

    assert.deepEqual(collect({ billing__note: allowed }), {
      billing: { note: allowed },
    });
    assertBadRequest(
      failureOf(() => collect({ billing__note: nestedArrays(BOUND) })),
    );
  });

  await test(`${flow}: a body holding a value that is not JSON is read as having no fields`, () => {
    registerBilling();

    assert.deepEqual(collect({ billing__note: new Date() }), empty);
    assert.deepEqual(
      collect({ billing__note: "x", unrelated: new Date() }),
      empty,
    );
  });
}
