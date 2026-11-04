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

/** @param {unknown} thrown */
function rejectedWith(thrown) {
  clearInviteExtensions();
  RegisterInviteExtension({
    key: "billing",
    component: {},
    schema: {
      parse() {
        throw thrown;
      },
      safeParse() {
        return { success: false, error: thrown };
      },
    },
    onAccept() {},
  });
}

/**
 * @param {(body: object) => unknown} collect
 * @param {object} body
 */
function failureOf(collect, body) {
  try {
    collect(body);
  } catch (error) {
    return error;
  }
  return undefined;
}

const submissions = [
  { flow: "payloads", collect: CollectInviteExtensionPayloads, body: {} },
  {
    flow: "edits",
    collect: CollectInviteExtensionEdits,
    body: { billing__costCenter: "" },
  },
];

const thrownValues = [
  { label: "null", thrown: null, expected: "null" },
  { label: "undefined", thrown: undefined, expected: "undefined" },
  {
    label: "a string",
    thrown: "cost center is required",
    expected: "cost center is required",
  },
  {
    label: "a plain Error",
    thrown: new Error("schema exploded"),
    expected: "Error: schema exploded",
  },
  {
    label: "a Zod-like error with issues",
    thrown: {
      issues: [
        { path: ["costCenter"], message: "Required" },
        { path: [], message: "Schema-wide failure" },
      ],
    },
    expected: JSON.stringify({
      issues: [
        { path: ["billing__costCenter"], message: "Required" },
        { path: [], message: "Schema-wide failure" },
      ],
    }),
  },
];

for (const { flow, collect, body } of submissions) {
  for (const { label, thrown, expected } of thrownValues) {
    await test(`${flow}: ${label} thrown by an extension schema is reported as a 400 carrying that failure, not a TypeError from reading .issues first`, () => {
      rejectedWith(thrown);
      const failure = failureOf(collect, body);

      assert.ok(
        failure instanceof HTTPResult,
        `expected an HTTPResult, got ${String(failure)}`,
      );
      assert.equal(failure.status, 400);
      assert.equal(failure.body, expected);
    });
  }
}
