import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import { z } from "zod";
import { answerMcpMessage } from "../../../mcp/protocol";
import { type McpTool } from "../../../mcp/tool";
import { MCP_TOOLS } from "../../../mcp/tools";
import {
  createAnnotation,
  MAX_JSON_DEPTH,
  mockupNameSchema,
  parseSpec,
  updateAnnotation,
} from "../../../mockup";
import {
  answer,
  listing,
  mockupTool,
  NAME,
  run,
  sketch,
  spec,
  useWorkspace,
  writeAnswerSchema,
} from "../../helpers/mockup-mcp";

const MOCKUP = mockupNameSchema.parse(NAME);
const MISSING = `${NAME}-missing`;

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

describe("[unit] mockup MCP tools", () => {
  const workspace = useWorkspace();
  const annotations = mockupTool("mockup_annotations");
  const resolve = mockupTool("mockup_resolve_annotation");
  const write = mockupTool("mockup_write_spec");
  const patch = mockupTool("mockup_patch_spec");

  const specPath = () => join(workspace.mockups(), NAME, "spec.json");
  const annotationsPath = () =>
    join(workspace.mockups(), NAME, "annotations.json");

  describe("mockup_annotations", () => {
    it("filters by status and by page, and by both together", async () => {
      const dir = workspace.mockups();
      await mkdir(join(dir, NAME), { recursive: true });
      const first = await createAnnotation(
        MOCKUP,
        { page: "home", path: "/pages/0", text: "one" },
        dir,
      );
      const second = await createAnnotation(
        MOCKUP,
        { page: "home", path: "/pages/0", text: "two" },
        dir,
      );
      await createAnnotation(
        MOCKUP,
        { page: "other", path: "/pages/1", text: "three" },
        dir,
      );
      await updateAnnotation(
        MOCKUP,
        second?.id ?? "",
        { status: "resolved" },
        dir,
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
      const { text, isError } = await run(annotations, { mockup: MISSING });

      expect(isError).to.equal(true);
      expect(text).to.contain(`Mockup "${MISSING}" does not exist`);
    });
  });

  describe("mockup_resolve_annotation", () => {
    async function seed(): Promise<string> {
      await write.call({ mockup: NAME, spec: spec(sketch("<p>a</p>")) });
      const created = await createAnnotation(
        MOCKUP,
        { page: "home", path: "/pages/0/tree/0", text: "tighten" },
        workspace.mockups(),
      );
      await createAnnotation(
        MOCKUP,
        { page: "home", path: "/pages/0", text: "keep open" },
        workspace.mockups(),
      );
      return created?.id ?? "";
    }

    it("sets resolved and resolvedAt, writes only annotations.json, and leaves the others open", async () => {
      const id = await seed();
      const specBefore = await workspace.specBytes();
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
      expect(await workspace.specBytes()).to.equal(specBefore);
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
        mockup: MISSING,
        id: "x",
      });

      expect(isError).to.equal(true);
      expect(text).to.contain(`Mockup "${MISSING}" does not exist`);
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
      const text = await workspace.specBytes();

      expect(result).to.deep.equal({ ok: true, errors: [] });
      expect(text).to.equal(`${JSON.stringify(valid, null, 2)}\n`);
      expect(parseSpec(text)).to.have.property("ok", true);
      expect(await readdir(join(workspace.mockups(), NAME))).to.deep.equal([
        "spec.json",
      ]);
    });

    it("refuses an invalid spec at exact pointers and leaves the old file byte-identical", async () => {
      await write.call({ mockup: NAME, spec: spec(sketch("<p>old</p>")) });
      const before = await workspace.specBytes();

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
      expect(await workspace.specBytes()).to.equal(before);
      expect(await readdir(join(workspace.mockups(), NAME))).to.deep.equal([
        "spec.json",
      ]);
    });

    it("refuses a broken envelope at its pointer and creates no file for a new mockup", async () => {
      const result = await answer(
        write,
        { mockup: NAME, spec: { version: 2, pages: [] } },
        writeAnswerSchema,
      );

      expect(result.ok).to.equal(false);
      expect(result.errors.map((error) => error.path)).to.include("/version");
      await stat(join(workspace.mockups(), NAME)).then(
        () => expect.fail("the refused write created the mockup directory"),
        (error: unknown) =>
          expect(z.object({ code: z.string() }).parse(error).code).to.equal(
            "ENOENT",
          ),
      );
    });

    it("refuses a duplicate sibling id at the second sibling, leaving the old file byte-identical", async () => {
      await write.call({ mockup: NAME, spec: spec(sketch("<p>old</p>")) });
      const before = await workspace.specBytes();
      const card = { type: "KpiCard", options: { title: "Revenue" } };

      const result = await answer(
        write,
        {
          mockup: NAME,
          spec: spec({
            type: "VStack",
            children: [
              { ...card, id: "kpi" },
              { ...card, id: "kpi" },
            ],
          }),
        },
        writeAnswerSchema,
      );

      expect(result.ok).to.equal(false);
      expect(result.errors.map((error) => error.path)).to.deep.equal([
        "/pages/0/tree/0/children/1/id",
      ]);
      expect(await workspace.specBytes()).to.equal(before);
    });

    it("refuses a spec nested past the depth limit, leaving the old file byte-identical", async () => {
      await write.call({ mockup: NAME, spec: spec(sketch("<p>old</p>")) });
      const before = await workspace.specBytes();
      let node: JsonValue = { type: "KpiCard", options: { title: "leaf" } };
      for (let level = 0; level < MAX_JSON_DEPTH; level += 1) {
        node = { type: "VStack", children: [node] };
      }

      const result = await answer(
        write,
        { mockup: NAME, spec: spec(node) },
        writeAnswerSchema,
      );

      expect(result).to.deep.equal({
        ok: false,
        errors: [
          {
            path: "",
            message: `the spec nests deeper than ${MAX_JSON_DEPTH} levels`,
          },
        ],
      });
      expect(await workspace.specBytes()).to.equal(before);
    });

    it("refuses a spec that is not a JSON object", async () => {
      const { isError } = await run(write, { mockup: NAME, spec: [1, 2] });

      expect(isError).to.equal(true);
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

      const rootBefore = await listing(workspace.root());
      const mockupsBefore = await listing(workspace.mockups());

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

      expect(await listing(workspace.root())).to.have.members(rootBefore);
      expect(await listing(workspace.mockups())).to.have.members(mockupsBefore);
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
