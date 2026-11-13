import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import { z } from "zod";
import { type Json, jsonSchema } from "../../../mockup";
import {
  answer,
  mockupTool,
  NAME,
  run,
  sketch,
  spec,
  useWorkspace,
  writeAnswerSchema,
} from "../../helpers/mockup-mcp";

const DATA = "/pages/0/fixtures/data";

function page(data: JsonValue): JsonValue {
  return {
    version: 1,
    pages: [
      {
        id: "home",
        title: "Home",
        fixtures: { data },
        tree: [sketch("<p>a</p>")],
      },
    ],
  };
}

const dataSchema = z.object({
  pages: z.array(z.object({ fixtures: z.object({ data: jsonSchema }) })),
});

describe("[unit] mockup_patch_spec", () => {
  const workspace = useWorkspace();
  const write = mockupTool("mockup_write_spec");
  const patch = mockupTool("mockup_patch_spec");

  async function patchedData(
    initial: JsonValue,
    ...operations: JsonValue[]
  ): Promise<Json> {
    await write.call({ mockup: NAME, spec: page(initial) });
    const result = await answer(
      patch,
      { mockup: NAME, patch: operations },
      writeAnswerSchema,
    );
    expect(result).to.deep.equal({ ok: true, errors: [] });
    return dataSchema.parse(JSON.parse(await workspace.specBytes())).pages[0]
      .fixtures.data;
  }

  async function refusal(
    initial: JsonValue,
    ...operations: JsonValue[]
  ): Promise<string> {
    await write.call({ mockup: NAME, spec: page(initial) });
    const before = await workspace.specBytes();
    const { text, isError } = await run(patch, {
      mockup: NAME,
      patch: operations,
    });
    expect(isError, text).to.equal(true);
    expect(await workspace.specBytes()).to.equal(before);
    return text;
  }

  describe("operations", () => {
    it("adds an object member and inserts into an array, shifting the tail", async () => {
      expect(
        await patchedData(
          { a: 1, list: ["x", "z"] },
          { op: "add", path: `${DATA}/b`, value: 2 },
          { op: "add", path: `${DATA}/list/1`, value: "y" },
          { op: "add", path: `${DATA}/list/-`, value: "end" },
        ),
      ).to.deep.equal({ a: 1, b: 2, list: ["x", "y", "z", "end"] });
    });

    it("removes an array element, shifting the tail, and an object member", async () => {
      expect(
        await patchedData(
          { a: 1, b: 2, list: [1, 2, 3] },
          { op: "remove", path: `${DATA}/list/0` },
          { op: "remove", path: `${DATA}/a` },
        ),
      ).to.deep.equal({ b: 2, list: [2, 3] });
    });

    it("replaces an existing value and refuses to replace a missing one", async () => {
      expect(
        await patchedData(
          { a: 1, list: [1, 2] },
          { op: "replace", path: `${DATA}/list/1`, value: 9 },
        ),
      ).to.deep.equal({ a: 1, list: [1, 9] });
      expect(
        await refusal(
          { a: 1 },
          { op: "replace", path: `${DATA}/missing`, value: 1 },
        ),
      ).to.contain(`Operation 0 (replace ${DATA}/missing) failed`);
    });

    it("moves a value between containers", async () => {
      expect(
        await patchedData(
          { from: { v: 1 }, list: ["a", "b"] },
          { op: "move", from: `${DATA}/from/v`, path: `${DATA}/list/1` },
        ),
      ).to.deep.equal({ from: {}, list: ["a", 1, "b"] });
    });

    it("refuses to move a value into itself", async () => {
      expect(
        await refusal(
          { a: { b: {} } },
          { op: "move", from: `${DATA}/a`, path: `${DATA}/a/b/c` },
        ),
      ).to.contain("into itself");
    });

    it("copies a value so a later edit of the copy leaves the original alone", async () => {
      expect(
        await patchedData(
          { a: { n: 1 } },
          { op: "copy", from: `${DATA}/a`, path: `${DATA}/b` },
          { op: "replace", path: `${DATA}/b/n`, value: 2 },
        ),
      ).to.deep.equal({ a: { n: 1 }, b: { n: 2 } });
    });

    it("passes a test op that matches and fails one that differs, naming its index", async () => {
      const data = { n: [1, 2] };

      expect(
        await patchedData(data, {
          op: "test",
          path: DATA,
          value: { n: [1, 2] },
        }),
      ).to.deep.equal(data);
      expect(
        await refusal(
          data,
          { op: "add", path: `${DATA}/b`, value: 1 },
          { op: "test", path: `${DATA}/n/1`, value: 3 },
        ),
      ).to.contain(`Operation 1 (test ${DATA}/n/1) failed`);
    });

    it("reads ~1 as / and ~0 as ~ in a pointer token", async () => {
      expect(
        await patchedData({}, { op: "add", path: `${DATA}/a~1b~0c`, value: 1 }),
      ).to.deep.equal({ "a/b~c": 1 });
    });

    it("refuses an array index that is out of range or has a leading zero", async () => {
      const cases: Array<[string, string, JsonValue]> = [
        [
          "replace",
          `${DATA}/list/1`,
          { op: "replace", path: `${DATA}/list/1`, value: 0 },
        ],
        [
          "remove",
          `${DATA}/list/01`,
          { op: "remove", path: `${DATA}/list/01` },
        ],
        [
          "add",
          `${DATA}/list/2`,
          { op: "add", path: `${DATA}/list/2`, value: 0 },
        ],
      ];
      for (const [op, path, operation] of cases) {
        expect(await refusal({ list: [1] }, operation)).to.contain(
          `Operation 0 (${op} ${path}) failed`,
        );
      }
    });

    it("refuses a pointer that runs through a primitive or a missing member", async () => {
      expect(
        await refusal({ a: 1 }, { op: "add", path: `${DATA}/a/b`, value: 1 }),
      ).to.contain("no members");
      expect(
        await refusal({}, { op: "add", path: `${DATA}/nope/b`, value: 1 }),
      ).to.contain('no member "nope"');
    });

    it("refuses to remove the root and replaces it on an empty path", async () => {
      expect(await refusal({}, { op: "remove", path: "" })).to.contain(
        "root cannot be removed",
      );
      await write.call({ mockup: NAME, spec: page({}) });
      const result = await answer(
        patch,
        {
          mockup: NAME,
          patch: [
            { op: "replace", path: "", value: spec(sketch("<p>new</p>")) },
          ],
        },
        writeAnswerSchema,
      );
      expect(result.ok).to.equal(true);
      expect(await workspace.specBytes()).to.contain("<p>new</p>");
    });

    it("adds a __proto__ member as plain data, never touching the prototype", async () => {
      await write.call({ mockup: NAME, spec: page({}) });

      const result = await answer(
        patch,
        {
          mockup: NAME,
          patch: [
            { op: "add", path: `${DATA}/__proto__`, value: { polluted: 1 } },
          ],
        },
        writeAnswerSchema,
      );

      expect(result.ok).to.equal(true);
      expect(await workspace.specBytes()).to.contain(
        '"data": {\n          "__proto__": {\n            "polluted": 1\n          }\n        }',
      );
      expect(Object.hasOwn({}, "polluted")).to.equal(false);
    });
  });

  describe("the written spec", () => {
    const base = spec(sketch("<p>one</p>"), sketch("<p>two</p>"));

    it("applies add, replace, move, copy, remove and test in order, then writes the result", async () => {
      await write.call({ mockup: NAME, spec: base });

      const result = await answer(
        patch,
        {
          mockup: NAME,
          patch: [
            { op: "test", path: "/pages/0/tree/0/options/height", value: 120 },
            {
              op: "replace",
              path: "/pages/0/tree/0/options/html",
              value: "<p>ONE</p>",
            },
            { op: "add", path: "/title", value: "Desk" },
            { op: "copy", from: "/pages/0/tree/1", path: "/pages/0/tree/-" },
            { op: "move", from: "/pages/0/tree/2", path: "/pages/0/tree/0" },
            { op: "remove", path: "/pages/0/tree/2/options/height" },
          ],
        },
        writeAnswerSchema,
      );

      const text = await workspace.specBytes();
      const written = z
        .object({
          title: z.string(),
          pages: z.array(
            z.object({ tree: z.array(z.object({ options: z.unknown() })) }),
          ),
        })
        .parse(JSON.parse(text));
      expect(result).to.deep.equal({ ok: true, errors: [] });
      expect(written.title).to.equal("Desk");
      expect(written.pages[0].tree.map((node) => node.options)).to.deep.equal([
        { html: "<p>two</p>", height: 120 },
        { html: "<p>ONE</p>", height: 120 },
        { html: "<p>two</p>" },
      ]);
      expect(text).to.equal(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
    });

    it("answers an error naming the index of a pointer that leads nowhere", async () => {
      await write.call({ mockup: NAME, spec: base });
      const before = await workspace.specBytes();

      const { text, isError } = await run(patch, {
        mockup: NAME,
        patch: [{ op: "remove", path: "/pages/4/title" }],
      });

      expect(isError).to.equal(true);
      expect(text).to.contain("Operation 0 (remove /pages/4/title) failed");
      expect(await workspace.specBytes()).to.equal(before);
    });

    it("refuses a patch whose result is invalid, at the pointer, leaving the file byte-identical", async () => {
      await write.call({ mockup: NAME, spec: base });
      const before = await workspace.specBytes();

      const result = await answer(
        patch,
        {
          mockup: NAME,
          patch: [
            {
              op: "replace",
              path: "/pages/0/tree/1/options/html",
              value: "<script>x()</script>",
            },
          ],
        },
        writeAnswerSchema,
      );

      expect(result.ok).to.equal(false);
      expect(result.errors.map((error) => error.path)).to.deep.equal([
        "/pages/0/tree/1/options/html",
      ]);
      expect(await workspace.specBytes()).to.equal(before);
    });

    it("refuses a patch that replaces the whole spec with a non-object and writes nothing", async () => {
      await write.call({ mockup: NAME, spec: base });
      const before = await workspace.specBytes();

      const result = await answer(
        patch,
        { mockup: NAME, patch: [{ op: "replace", path: "", value: 5 }] },
        writeAnswerSchema,
      );

      expect(result.ok).to.equal(false);
      expect(result.errors.map((error) => error.path)).to.deep.equal([""]);
      expect(await workspace.specBytes()).to.equal(before);
    });

    it("refuses an operation without its required field and writes nothing", async () => {
      await write.call({ mockup: NAME, spec: base });
      const before = await workspace.specBytes();

      const { text, isError } = await run(patch, {
        mockup: NAME,
        patch: [{ op: "move", path: "/title" }],
      });

      expect(isError).to.equal(true);
      expect(text).to.contain("Invalid patch: 0");
      expect(await workspace.specBytes()).to.equal(before);
    });

    it("answers an error that points to mockup_write_spec when there is no spec", async () => {
      const { text, isError } = await run(patch, {
        mockup: NAME,
        patch: [{ op: "add", path: "/title", value: "x" }],
      });

      expect(isError).to.equal(true);
      expect(text).to.contain("mockup_write_spec");
    });
  });
});
