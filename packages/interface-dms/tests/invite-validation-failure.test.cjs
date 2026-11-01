const assert = require("node:assert/strict");
const test = require("node:test");
const { HTTPResult } = require("@antelopejs/interface-api");
const {
  RegisterInviteExtension,
  internal,
} = require("../dist/invite-extensions/registry");
const {
  applyInviteExtension,
  revokeInviteExtension,
  clearInviteExtensions,
} = require("../dist/invite-extensions/internal/registry");
const {
  CollectInviteExtensionPayloads,
} = require("../dist/invite-extensions/internal/delivery");
const {
  CollectInviteExtensionEdits,
} = require("../dist/invite-extensions/internal/edit");

internal.RegisterInviteExtension.onHandlers(
  applyInviteExtension,
  revokeInviteExtension,
);

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
    test(`${flow}: ${label} thrown by an extension schema is reported as a 400 carrying that failure, not a TypeError from reading .issues first`, () => {
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
