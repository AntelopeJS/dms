import { mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import { z } from "zod";
import { answerMcpMessage } from "../../../mcp/protocol";
import { type McpTool } from "../../../mcp/tool";
import { MCP_TOOLS } from "../../../mcp/tools";
import { mockupAnnotationsTool } from "../../../mcp/tools/mockup-annotations";
import { mockupPatchSpecTool } from "../../../mcp/tools/mockup-patch-spec";
import { mockupResolveAnnotationTool } from "../../../mcp/tools/mockup-resolve-annotation";
import { mockupWriteSpecTool } from "../../../mcp/tools/mockup-write-spec";
import {
  createAnnotation,
  updateAnnotation,
} from "../../../mockup/annotations";
import { parseSpec } from "../../../mockup/compile";
import { mockupNameSchema } from "../../../mockup/model";

const NAME = "desk";
const MOCKUP = mockupNameSchema.parse(NAME);

function sketch(html: string): JsonValue {
  return { type: "sketch", options: { html, height: 120 } };
}

function spec(...tree: JsonValue[]): JsonValue {
  return { version: 1, pages: [{ id: "home", title: "Home", tree }] };
}

const textSchema = z.object({
  content: z.array(z.object({ text: z.string() })).min(1),
  isError: z.boolean().optional(),
});
const writeAnswerSchema = z.object({
  ok: z.boolean(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })),
});
const annotationsAnswerSchema = z.object({
  annotations: z.array(
    z.object({
      id: z.string(),
      page: z.string(),
      text: z.string(),
      status: z.string(),
      resolvedAt: z.string().optional(),
    }),
  ),
});

const writtenSchema = z.object({
  version: z.literal(1),
  title: z.string(),
  pages: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      tree: z.array(
        z.object({
          type: z.string(),
          options: z.object({
            html: z.string(),
            height: z.number().optional(),
          }),
        }),
      ),
    }),
  ),
});

async function run(tool: McpTool, args: JsonValue) {
  const { content, isError } = textSchema.parse(await tool.call(args));
  return { text: content[0].text, isError: isError === true };
}

async function answer<Answer>(
  tool: McpTool,
  args: JsonValue,
  schema: z.ZodType<Answer, z.ZodTypeDef, unknown>,
): Promise<Answer> {
  const { text, isError } = await run(tool, args);
  expect(isError, text).to.equal(false);
  return schema.parse(JSON.parse(text));
}

describe("[unit] mockup MCP tools", () => {
  let root: string;
  let annotations: McpTool;
  let resolve: McpTool;
  let write: McpTool;
  let patch: McpTool;

  const specPath = () => join(root, NAME, "spec.json");
  const annotationsPath = () => join(root, NAME, "annotations.json");
  const specBytes = () => readFile(specPath(), "utf8");

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mockup-mcp-"));
    const directory = () => root;
    annotations = mockupAnnotationsTool(directory);
    resolve = mockupResolveAnnotationTool(directory);
    write = mockupWriteSpecTool(directory);
    patch = mockupPatchSpecTool(directory);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe("mockup_annotations", () => {
    it("filters by status and by page, and by both together", async () => {
      await mkdir(join(root, NAME));
      const first = await createAnnotation(
        MOCKUP,
        { page: "home", path: "/pages/0", text: "one" },
        root,
      );
      const second = await createAnnotation(
        MOCKUP,
        { page: "home", path: "/pages/0", text: "two" },
        root,
      );
      await createAnnotation(
        MOCKUP,
        { page: "other", path: "/pages/1", text: "three" },
        root,
      );
      await updateAnnotation(
        MOCKUP,
        second?.id ?? "",
        { status: "resolved" },
        root,
      );
      const texts = async (args: JsonValue) =>
        (
          await answer(annotations, args, annotationsAnswerSchema)
        ).annotations.map((annotation) => annotation.text);

      expect(await texts({ mockup: NAME })).to.deep.equal([
        "one",
        "two",
        "three",
      ]);
      expect(await texts({ mockup: NAME, status: "open" })).to.deep.equal([
        "one",
        "three",
      ]);
      expect(await texts({ mockup: NAME, status: "resolved" })).to.deep.equal([
        "two",
      ]);
      expect(await texts({ mockup: NAME, page: "home" })).to.deep.equal([
        "one",
        "two",
      ]);
      expect(
        await texts({ mockup: NAME, status: "open", page: "home" }),
      ).to.deep.equal(["one"]);
      expect(first?.status).to.equal("open");
    });

    it("answers an error that says the mockup does not exist", async () => {
      const { text, isError } = await run(annotations, { mockup: "ghost" });

      expect(isError).to.equal(true);
      expect(text).to.contain('Mockup "ghost" does not exist');
    });
  });

  describe("mockup_resolve_annotation", () => {
    async function seed(): Promise<string> {
      await mkdir(join(root, NAME));
      await write.call({ mockup: NAME, spec: spec(sketch("<p>a</p>")) });
      const created = await createAnnotation(
        MOCKUP,
        { page: "home", path: "/pages/0/tree/0", text: "tighten" },
        root,
      );
      await createAnnotation(
        MOCKUP,
        { page: "home", path: "/pages/0", text: "keep open" },
        root,
      );
      return created?.id ?? "";
    }

    it("sets resolved and resolvedAt, writes only annotations.json, and leaves the others open", async () => {
      const id = await seed();
      const specBefore = await specBytes();
      const specStat = await stat(specPath());

      const resolved = await answer(
        resolve,
        { mockup: NAME, id },
        z.object({
          id: z.string(),
          status: z.string(),
          resolvedAt: z.string(),
        }),
      );
      const { annotations: all } = annotationsAnswerSchema.parse(
        JSON.parse(await readFile(annotationsPath(), "utf8")),
      );

      expect(resolved).to.include({ id, status: "resolved" });
      expect(all.map((annotation) => annotation.status)).to.deep.equal([
        "resolved",
        "open",
      ]);
      expect(all[0].resolvedAt).to.equal(resolved.resolvedAt);
      expect(await specBytes()).to.equal(specBefore);
      expect((await stat(specPath())).mtimeMs).to.equal(specStat.mtimeMs);
    });

    it("answers an error for an unknown id and leaves annotations.json as it was", async () => {
      await seed();
      const before = await readFile(annotationsPath(), "utf8");

      const { text, isError } = await run(resolve, {
        mockup: NAME,
        id: "nope",
      });

      expect(isError).to.equal(true);
      expect(text).to.contain('no annotation "nope"');
      expect(await readFile(annotationsPath(), "utf8")).to.equal(before);
    });

    it("answers an error that says the mockup does not exist", async () => {
      const { text, isError } = await run(resolve, {
        mockup: "ghost",
        id: "x",
      });

      expect(isError).to.equal(true);
      expect(text).to.contain('Mockup "ghost" does not exist');
    });
  });

  describe("mockup_write_spec", () => {
    it("creates the mockup and writes the spec pretty-printed with a trailing newline", async () => {
      const valid = spec(sketch("<p>hello</p>"));

      const result = await answer(
        write,
        { mockup: NAME, spec: valid },
        writeAnswerSchema,
      );
      const text = await specBytes();

      expect(result).to.deep.equal({ ok: true, errors: [] });
      expect(text).to.equal(`${JSON.stringify(valid, null, 2)}\n`);
      expect(parseSpec(text)).to.have.property("ok", true);
      expect(await readdir(join(root, NAME))).to.deep.equal(["spec.json"]);
    });

    it("refuses an invalid spec at exact pointers and leaves the old file byte-identical", async () => {
      await write.call({ mockup: NAME, spec: spec(sketch("<p>old</p>")) });
      const before = await specBytes();

      const result = await answer(
        write,
        {
          mockup: NAME,
          spec: spec(sketch("<p>ok</p><script>alert(1)</script>"), {
            type: "NoSuchBlock",
            options: {},
          }),
        },
        writeAnswerSchema,
      );

      expect(result.ok).to.equal(false);
      expect(result.errors.map((error) => error.path)).to.deep.equal([
        "/pages/0/tree/0/options/html",
        "/pages/0/tree/1/type",
      ]);
      expect(result.errors[1].message).to.equal(
        'no block type is registered as "NoSuchBlock"',
      );
      expect(await specBytes()).to.equal(before);
      expect(await readdir(join(root, NAME))).to.deep.equal(["spec.json"]);
    });

    it("refuses a broken envelope at its pointer and creates no file for a new mockup", async () => {
      const result = await answer(
        write,
        { mockup: NAME, spec: { version: 2, pages: [] } },
        writeAnswerSchema,
      );

      expect(result.ok).to.equal(false);
      expect(result.errors.map((error) => error.path)).to.include("/version");
      await stat(join(root, NAME)).then(
        () => expect.fail("the refused write created the mockup directory"),
        (error: unknown) =>
          expect(z.object({ code: z.string() }).parse(error).code).to.equal(
            "ENOENT",
          ),
      );
    });

    it("refuses a spec that is not a JSON object", async () => {
      const { isError } = await run(write, { mockup: NAME, spec: [1, 2] });

      expect(isError).to.equal(true);
    });
  });

  describe("mockup_patch_spec", () => {
    const base = spec(sketch("<p>one</p>"), sketch("<p>two</p>"));

    async function seed(): Promise<string> {
      await write.call({ mockup: NAME, spec: base });
      return specBytes();
    }

    it("applies add, replace, move, copy, remove and test in order, then writes the result", async () => {
      await seed();

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

      const text = await specBytes();
      const reparsed: unknown = JSON.parse(text);
      const written = writtenSchema.parse(reparsed);
      expect(result).to.deep.equal({ ok: true, errors: [] });
      expect(written.title).to.equal("Desk");
      expect(written.pages[0].tree.map((node) => node.options)).to.deep.equal([
        { html: "<p>two</p>", height: 120 },
        { html: "<p>ONE</p>", height: 120 },
        { html: "<p>two</p>" },
      ]);
      expect(text).to.equal(`${JSON.stringify(reparsed, null, 2)}\n`);
    });

    it("answers an error naming the index of a failed test op and writes nothing", async () => {
      const before = await seed();

      const { text, isError } = await run(patch, {
        mockup: NAME,
        patch: [
          { op: "replace", path: "/pages/0/title", value: "Changed" },
          { op: "test", path: "/pages/0/title", value: "Home" },
        ],
      });

      expect(isError).to.equal(true);
      expect(text).to.contain("Operation 1 (test /pages/0/title) failed");
      expect(await specBytes()).to.equal(before);
    });

    it("answers an error naming the index of a pointer that leads nowhere", async () => {
      const before = await seed();

      const { text, isError } = await run(patch, {
        mockup: NAME,
        patch: [{ op: "remove", path: "/pages/4/title" }],
      });

      expect(isError).to.equal(true);
      expect(text).to.contain("Operation 0 (remove /pages/4/title) failed");
      expect(await specBytes()).to.equal(before);
    });

    it("refuses a patch whose result is invalid, at the pointer, leaving the file byte-identical", async () => {
      const before = await seed();

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
      expect(await specBytes()).to.equal(before);
    });

    it("refuses a patch that replaces the whole spec with a non-object and writes nothing", async () => {
      const before = await seed();

      const result = await answer(
        patch,
        { mockup: NAME, patch: [{ op: "replace", path: "", value: 5 }] },
        writeAnswerSchema,
      );

      expect(result.ok).to.equal(false);
      expect(result.errors.map((error) => error.path)).to.deep.equal([""]);
      expect(await specBytes()).to.equal(before);
    });

    it("refuses an operation without its required field and writes nothing", async () => {
      const before = await seed();

      const { text, isError } = await run(patch, {
        mockup: NAME,
        patch: [{ op: "move", path: "/title" }],
      });

      expect(isError).to.equal(true);
      expect(text).to.contain("Invalid patch: 0");
      expect(await specBytes()).to.equal(before);
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

  describe("names", () => {
    const TRAVERSALS = [
      "../escape",
      "a/b",
      "..",
      ".",
      "schema",
      "",
      "Desk",
      "a\\b",
    ];

    it("refuses every traversal or malformed name in every tool, touching nothing outside mockups/<name>/", async () => {
      const tools: Array<[McpTool, JsonValue]> = [
        [annotations, {}],
        [resolve, { id: "x" }],
        [write, { spec: spec(sketch("<p>a</p>")) }],
        [patch, { patch: [{ op: "add", path: "/title", value: "x" }] }],
      ];
      const parent = join(root, "..");
      const before = await readdir(parent);

      for (const [tool, args] of tools) {
        for (const mockup of TRAVERSALS) {
          const { text, isError } = await run(tool, {
            ...z.record(z.unknown()).parse(args),
            mockup,
          });
          expect(isError, `${tool.name} ${JSON.stringify(mockup)}`).to.equal(
            true,
          );
          expect(text).to.contain("is not a valid mockup name");
        }
      }

      expect(await readdir(root)).to.deep.equal([]);
      expect(await readdir(parent)).to.have.members(before);
    });
  });

  describe("Safe mode", () => {
    it("lists all four tools, because none changes the project past what the builder edits", async () => {
      const listed = z
        .object({
          result: z.object({
            tools: z.array(z.object({ name: z.string() })),
          }),
        })
        .parse(
          await answerMcpMessage(
            { access: "safe", tools: MCP_TOOLS },
            { jsonrpc: "2.0", id: 1, method: "tools/list" },
          ),
        );

      expect(listed.result.tools.map((tool) => tool.name)).to.include.members([
        "mockup_annotations",
        "mockup_resolve_annotation",
        "mockup_write_spec",
        "mockup_patch_spec",
      ]);
    });

    it("keeps the effects the descriptions promise: annotations read, the rest builder", () => {
      const effects = Object.fromEntries(
        MCP_TOOLS.filter((tool) => tool.name.startsWith("mockup_")).map(
          (tool) => [tool.name, tool.effect],
        ),
      );

      expect(effects).to.deep.equal({
        mockup_annotations: "read",
        mockup_resolve_annotation: "builder",
        mockup_write_spec: "builder",
        mockup_patch_spec: "builder",
      });
    });
  });
});
