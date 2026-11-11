import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import { applyPatch, type PatchOperation } from "../../../mcp/tools/json-patch";

function apply(
  document: JsonValue,
  ...operations: PatchOperation[]
): JsonValue {
  const result = applyPatch(document, operations);
  if (!result.ok)
    throw new Error(`operation ${result.index}: ${result.message}`);
  return result.document;
}

function failure(document: JsonValue, ...operations: PatchOperation[]) {
  const result = applyPatch(document, operations);
  if (result.ok) throw new Error("the patch was expected to fail");
  return result;
}

describe("[unit] JSON Patch (RFC 6902)", () => {
  it("adds an object member and inserts into an array, shifting the tail", () => {
    const document = { a: 1, list: ["x", "z"] };

    expect(
      apply(
        document,
        { op: "add", path: "/b", value: 2 },
        { op: "add", path: "/list/1", value: "y" },
        { op: "add", path: "/list/-", value: "end" },
      ),
    ).to.deep.equal({ a: 1, b: 2, list: ["x", "y", "z", "end"] });
  });

  it("removes an array element, shifting the tail, and an object member", () => {
    expect(
      apply(
        { a: 1, b: 2, list: [1, 2, 3] },
        { op: "remove", path: "/list/0" },
        { op: "remove", path: "/a" },
      ),
    ).to.deep.equal({ b: 2, list: [2, 3] });
  });

  it("replaces an existing value and refuses to replace a missing one", () => {
    expect(
      apply(
        { a: 1, list: [1, 2] },
        { op: "replace", path: "/list/1", value: 9 },
      ),
    ).to.deep.equal({ a: 1, list: [1, 9] });
    expect(
      failure({ a: 1 }, { op: "replace", path: "/missing", value: 1 }).index,
    ).to.equal(0);
  });

  it("moves a value between containers", () => {
    expect(
      apply(
        { from: { v: 1 }, list: ["a", "b"] },
        { op: "move", from: "/from/v", path: "/list/1" },
      ),
    ).to.deep.equal({ from: {}, list: ["a", 1, "b"] });
  });

  it("refuses to move a value into itself", () => {
    expect(
      failure({ a: { b: {} } }, { op: "move", from: "/a", path: "/a/b/c" })
        .message,
    ).to.contain("into itself");
  });

  it("copies a value so a later edit of the copy leaves the original alone", () => {
    expect(
      apply(
        { a: { n: 1 } },
        { op: "copy", from: "/a", path: "/b" },
        { op: "replace", path: "/b/n", value: 2 },
      ),
    ).to.deep.equal({ a: { n: 1 }, b: { n: 2 } });
  });

  it("passes a test op that matches and fails one that differs, naming its index", () => {
    const document = { a: { n: [1, 2] } };

    expect(
      apply(document, { op: "test", path: "/a", value: { n: [1, 2] } }),
    ).to.deep.equal(document);
    const result = failure(
      document,
      { op: "add", path: "/b", value: 1 },
      { op: "test", path: "/a/n/1", value: 3 },
    );
    expect(result.index).to.equal(1);
  });

  it("reads ~1 as / and ~0 as ~ in a pointer token", () => {
    expect(apply({}, { op: "add", path: "/a~1b~0c", value: 1 })).to.deep.equal({
      "a/b~c": 1,
    });
  });

  it("refuses an array index that is out of range or has a leading zero", () => {
    expect(
      failure([1], { op: "replace", path: "/1", value: 0 }).index,
    ).to.equal(0);
    expect(failure([1, 2], { op: "remove", path: "/01" }).index).to.equal(0);
    expect(failure([1], { op: "add", path: "/2", value: 0 }).index).to.equal(0);
  });

  it("refuses a pointer that runs through a primitive or a missing member", () => {
    expect(
      failure({ a: 1 }, { op: "add", path: "/a/b", value: 1 }).index,
    ).to.equal(0);
    expect(
      failure({}, { op: "add", path: "/a/b", value: 1 }).message,
    ).to.contain('no member "a"');
  });

  it("refuses to remove the root and replaces it on an empty path", () => {
    expect(failure({}, { op: "remove", path: "" }).index).to.equal(0);
    expect(
      apply({ a: 1 }, { op: "replace", path: "", value: { b: 2 } }),
    ).to.deep.equal({
      b: 2,
    });
  });

  it("leaves the input document untouched", () => {
    const document = { list: [1, 2] };
    apply(document, { op: "add", path: "/list/-", value: 3 });

    expect(document).to.deep.equal({ list: [1, 2] });
  });

  it("adds a __proto__ member as plain data, never touching the prototype", () => {
    const patched = apply(
      {},
      { op: "add", path: "/__proto__", value: { polluted: 1 } },
    );

    expect(JSON.stringify(patched)).to.equal('{"__proto__":{"polluted":1}}');
  });
});
