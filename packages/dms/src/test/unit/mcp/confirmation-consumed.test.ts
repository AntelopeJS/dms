import { randomUUID } from "node:crypto";
import { ImplementInterface } from "@antelopejs/interface-core";
import * as Builder from "@antelopejs/interface-dms-builder";
import type {
  MapResourcesPreview,
  MapResourcesResult,
  OpResult,
  ProjectConfigResult,
} from "@antelopejs/interface-dms-builder";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import { z } from "zod";
import * as implementation from "../../../implementations/dms-builder";
import {
  CONFIRMATION_CONSUMED_CODE,
  CONFIRMATION_REQUIRED_CODE,
} from "../../../mcp/confirmation-gate";
import { answerMcpMessage } from "../../../mcp/protocol";
import { MCP_TOOLS } from "../../../mcp/tools";

const MAP = "builder_map_resources";
const CONFIGURE = "builder_configure_project";
const MAP_ARGS = { module: "erp-tables", connection: "erp", resources: [] };
const CONFIGURE_ARGS = {
  steps: [{ op: "ConfigureModule", id: "consumed-test", entry: {} }],
};
const NOT_FOUND = {
  ok: false,
  error: { code: "not_found", ref: "erp" },
} as const;

const CallAnswerSchema = z.object({
  result: z.object({
    content: z.array(z.object({ text: z.string() })),
    isError: z.boolean().optional(),
  }),
});
const CodeBlockSchema = z.object({ code: z.string() });

/** What the faked builder answers; each test sets the step it makes fail. */
interface Scenario {
  preview: OpResult<MapResourcesPreview>;
  map: () => Promise<OpResult<MapResourcesResult>>;
  dryRun: () => Promise<OpResult<ProjectConfigResult>>;
  configure: () => Promise<OpResult<ProjectConfigResult>>;
}

function succeeded<T>(data: T): OpResult<T> {
  return { ok: true, data, changes: [] };
}

function defaultScenario(): Scenario {
  return {
    preview: succeeded({ pagesToRemove: ["/erp/countries"] }),
    map: async () => succeeded({ resources: [], leftOut: [] }),
    dryRun: async () => succeeded({ files: ["antelope.config.ts"] }),
    configure: async () => succeeded({ files: ["antelope.config.ts"] }),
  };
}

function codeOf(content: readonly { text: string }[]) {
  const last = content.at(-1)?.text ?? "";
  try {
    return CodeBlockSchema.safeParse(JSON.parse(last)).data?.code;
  } catch {
    return undefined;
  }
}

async function call(sessionId: string, name: string, args: JsonValue) {
  const reply = await answerMcpMessage(
    { access: "full", tools: MCP_TOOLS },
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    },
    sessionId,
  );
  return CallAnswerSchema.parse(reply).result;
}

describe("[unit] a held MCP tool marks a failure after the confirmation gate", () => {
  let scenario = defaultScenario();
  let session = "";

  before(() => {
    const faked = {
      PreviewMapResources: async () => scenario.preview,
      MapResources: async () => scenario.map(),
      ConfigureProject: async (
        _steps: Builder.ProjectConfigStep[],
        opts?: Builder.ProjectConfigOpts,
      ) => (opts?.dryRun === true ? scenario.dryRun() : scenario.configure()),
    };
    ImplementInterface(Builder, {
      ...implementation,
      ...faked,
      Operations: { ...implementation.Operations, ...faked },
    });
  });

  after(() => {
    ImplementInterface(Builder, implementation);
  });

  beforeEach(() => {
    scenario = defaultScenario();
    session = `consumed-${randomUUID()}`;
  });

  async function confirmed(name: string, args: JsonValue) {
    const held = await call(session, name, args);
    expect(codeOf(held.content)).to.equal(CONFIRMATION_REQUIRED_CODE);
    return call(session, name, args);
  }

  it("ends a confirmed builder_map_resources that fails to write with a confirmation_consumed block, after the builder's error", async () => {
    scenario.map = async () => NOT_FOUND;
    const result = await confirmed(MAP, MAP_ARGS);
    expect(result.isError).to.equal(true);
    expect(result.content[0]?.text).to.equal(JSON.stringify(NOT_FOUND));
    expect(result.content).to.have.length(2);
    expect(codeOf(result.content)).to.equal(CONFIRMATION_CONSUMED_CODE);
  });

  it("ends a confirmed builder_map_resources that throws with a confirmation_consumed block, after the failure the server reports", async () => {
    scenario.map = async () => {
      throw new Error("disk full");
    };
    const result = await confirmed(MAP, MAP_ARGS);
    expect(result.isError).to.equal(true);
    expect(result.content[0]?.text).to.equal(
      "builder_map_resources failed: disk full",
    );
    expect(result.content).to.have.length(2);
    expect(codeOf(result.content)).to.equal(CONFIRMATION_CONSUMED_CODE);
  });

  it("answers a builder_map_resources preview failure with no code block, and keeps no hold for it", async () => {
    scenario.preview = NOT_FOUND;
    const result = await call(session, MAP, MAP_ARGS);
    expect(result.isError).to.equal(true);
    expect(result.content.map(({ text }) => text)).to.deep.equal([
      JSON.stringify(NOT_FOUND),
    ]);
    scenario.preview = defaultScenario().preview;
    const next = await call(session, MAP, MAP_ARGS);
    expect(codeOf(next.content)).to.equal(CONFIRMATION_REQUIRED_CODE);
  });

  it("answers a confirmed builder_map_resources that writes with the builder's answer alone", async () => {
    const result = await confirmed(MAP, MAP_ARGS);
    expect(result.isError).to.equal(undefined);
    expect(result.content).to.have.length(1);
  });

  it("ends a confirmed builder_configure_project that fails to write with a confirmation_consumed block, after the builder's error", async () => {
    scenario.configure = async () => NOT_FOUND;
    const result = await confirmed(CONFIGURE, CONFIGURE_ARGS);
    expect(result.isError).to.equal(true);
    expect(result.content[0]?.text).to.equal(JSON.stringify(NOT_FOUND));
    expect(result.content).to.have.length(2);
    expect(codeOf(result.content)).to.equal(CONFIRMATION_CONSUMED_CODE);
  });

  it("answers a builder_configure_project dry-run failure with no code block, and keeps no hold for it", async () => {
    scenario.dryRun = async () => NOT_FOUND;
    const result = await call(session, CONFIGURE, CONFIGURE_ARGS);
    expect(result.isError).to.equal(true);
    expect(result.content.map(({ text }) => text)).to.deep.equal([
      JSON.stringify(NOT_FOUND),
    ]);
    scenario.dryRun = defaultScenario().dryRun;
    const next = await call(session, CONFIGURE, CONFIGURE_ARGS);
    expect(codeOf(next.content)).to.equal(CONFIRMATION_REQUIRED_CODE);
  });

  it("answers a builder_configure_project dry run that throws with the server's failure alone, since no hold was spent", async () => {
    scenario.dryRun = async () => {
      throw new Error("config unreadable");
    };
    const result = await call(session, CONFIGURE, CONFIGURE_ARGS);
    expect(result.isError).to.equal(true);
    expect(result.content.map(({ text }) => text)).to.deep.equal([
      "builder_configure_project failed: config unreadable",
    ]);
  });

  it("answers a confirmed builder_configure_project that writes with the builder's answer alone", async () => {
    const result = await confirmed(CONFIGURE, CONFIGURE_ARGS);
    expect(result.isError).to.equal(undefined);
    expect(result.content).to.have.length(1);
  });
});
