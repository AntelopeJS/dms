import { randomUUID } from "node:crypto";
import { expect } from "chai";
import { z } from "zod";
import {
  createRepeatConfirmationGate,
  REPEAT_CONFIRMATION_WINDOW_MS,
  type RepeatConfirmationGate,
} from "../../../mcp/confirmation-gate";
import { answerMcpMessage } from "../../../mcp/protocol";
import { MCP_TOOLS } from "../../../mcp/tools";

const DELETE_PAGE = "builder_delete_page";
const SESSION_A = "session-a";
const SESSION_B = "session-b";
const CallAnswerSchema = z.object({
  result: z.object({
    content: z.array(z.object({ text: z.string() })),
    isError: z.boolean().optional(),
  }),
});

describe("[unit] mcp repeat-confirmation gate", () => {
  let clock: number;
  let gate: RepeatConfirmationGate;

  beforeEach(() => {
    clock = 0;
    gate = createRepeatConfirmationGate(() => clock);
  });

  it("refuses a call the first time, with what it would run", () => {
    const refusal = gate.hold(SESSION_A, DELETE_PAGE, { pageRef: "/orders" });
    expect(refusal?.isError).to.equal(true);
    expect(refusal?.content[0]?.text).to.include(DELETE_PAGE);
    expect(refusal?.content[0]?.text).to.include('"pageRef":"/orders"');
  });

  it("runs the same call repeated within the window, once", () => {
    gate.hold(SESSION_A, DELETE_PAGE, { pageRef: "/orders" });
    clock = REPEAT_CONFIRMATION_WINDOW_MS;
    expect(gate.hold(SESSION_A, DELETE_PAGE, { pageRef: "/orders" })).to.equal(
      undefined,
    );
    expect(
      gate.hold(SESSION_A, DELETE_PAGE, { pageRef: "/orders" })?.isError,
    ).to.equal(true);
  });

  it("takes the same arguments in another key order as the same call", () => {
    gate.hold(SESSION_A, "builder_map_resources", {
      module: "erp",
      connection: "erp",
    });
    expect(
      gate.hold(SESSION_A, "builder_map_resources", {
        connection: "erp",
        module: "erp",
      }),
    ).to.equal(undefined);
  });

  it("refuses again a repeat whose previewed pages changed", () => {
    gate.hold(SESSION_A, "builder_map_resources", { pagesToRemove: ["/a"] });
    expect(
      gate.hold(SESSION_A, "builder_map_resources", {
        pagesToRemove: ["/a", "/b"],
      })?.isError,
    ).to.equal(true);
  });

  it("refuses a repeat that comes after the window", () => {
    gate.hold(SESSION_A, DELETE_PAGE, { pageRef: "/orders" });
    clock = REPEAT_CONFIRMATION_WINDOW_MS + 1;
    expect(
      gate.hold(SESSION_A, DELETE_PAGE, { pageRef: "/orders" })?.isError,
    ).to.equal(true);
  });

  it("keeps the same arguments of two tools apart", () => {
    gate.hold(SESSION_A, DELETE_PAGE, { ref: "/orders" });
    expect(
      gate.hold(SESSION_A, "builder_delete_category", { ref: "/orders" })
        ?.isError,
    ).to.equal(true);
  });

  it("refuses another session's identical call, so one client's refusal never lets another run unasked", () => {
    gate.hold(SESSION_A, DELETE_PAGE, { pageRef: "/orders" });
    expect(
      gate.hold(SESSION_B, DELETE_PAGE, { pageRef: "/orders" })?.isError,
    ).to.equal(true);
  });

  it("keeps each session's hold, so both sessions confirm their own repeat", () => {
    gate.hold(SESSION_A, DELETE_PAGE, { pageRef: "/orders" });
    gate.hold(SESSION_B, DELETE_PAGE, { pageRef: "/orders" });
    expect(gate.hold(SESSION_B, DELETE_PAGE, { pageRef: "/orders" })).to.equal(
      undefined,
    );
    expect(gate.hold(SESSION_A, DELETE_PAGE, { pageRef: "/orders" })).to.equal(
      undefined,
    );
  });

  it("never runs a call that names no session, however often it repeats", () => {
    gate.hold(undefined, DELETE_PAGE, { pageRef: "/orders" });
    const repeat = gate.hold(undefined, DELETE_PAGE, { pageRef: "/orders" });
    expect(repeat?.isError).to.equal(true);
    expect(repeat?.content[0]?.text).to.include("sent no session");
  });

  async function deleteThroughMcp(
    sessionId: string | undefined,
    pageRef: string,
  ) {
    const reply = await answerMcpMessage(
      { access: "full", tools: MCP_TOOLS },
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: DELETE_PAGE, arguments: { pageRef } },
      },
      sessionId,
    );
    return CallAnswerSchema.parse(reply).result;
  }

  it("holds a builder deletion called through MCP before it reaches the builder", async () => {
    const result = await deleteThroughMcp(
      SESSION_A,
      `/gate-test-${randomUUID()}`,
    );
    expect(result.isError).to.equal(true);
    expect(result.content[0]?.text).to.match(
      /^builder_delete_page was not run: no one has confirmed it yet\./,
    );
  });

  it("holds the same deletion again for a second MCP session, so the session reaches the gate", async () => {
    const pageRef = `/gate-test-${randomUUID()}`;
    await deleteThroughMcp(SESSION_A, pageRef);
    const result = await deleteThroughMcp(SESSION_B, pageRef);
    expect(result.isError).to.equal(true);
    expect(result.content[0]?.text).to.match(
      /^builder_delete_page was not run: no one has confirmed it yet\./,
    );
  });
});
