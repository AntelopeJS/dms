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
    const refusal = gate.hold(DELETE_PAGE, { pageRef: "/orders" });
    expect(refusal?.isError).to.equal(true);
    expect(refusal?.content[0]?.text).to.include(DELETE_PAGE);
    expect(refusal?.content[0]?.text).to.include('"pageRef":"/orders"');
  });

  it("runs the same call repeated within the window, once", () => {
    gate.hold(DELETE_PAGE, { pageRef: "/orders" });
    clock = REPEAT_CONFIRMATION_WINDOW_MS;
    expect(gate.hold(DELETE_PAGE, { pageRef: "/orders" })).to.equal(undefined);
    expect(gate.hold(DELETE_PAGE, { pageRef: "/orders" })?.isError).to.equal(
      true,
    );
  });

  it("takes the same arguments in another key order as the same call", () => {
    gate.hold("builder_map_resources", { module: "erp", connection: "erp" });
    expect(
      gate.hold("builder_map_resources", { connection: "erp", module: "erp" }),
    ).to.equal(undefined);
  });

  it("refuses again a repeat whose previewed pages changed", () => {
    gate.hold("builder_map_resources", { pagesToRemove: ["/a"] });
    expect(
      gate.hold("builder_map_resources", { pagesToRemove: ["/a", "/b"] })
        ?.isError,
    ).to.equal(true);
  });

  it("refuses a repeat that comes after the window", () => {
    gate.hold(DELETE_PAGE, { pageRef: "/orders" });
    clock = REPEAT_CONFIRMATION_WINDOW_MS + 1;
    expect(gate.hold(DELETE_PAGE, { pageRef: "/orders" })?.isError).to.equal(
      true,
    );
  });

  it("keeps the same arguments of two tools apart", () => {
    gate.hold(DELETE_PAGE, { ref: "/orders" });
    expect(
      gate.hold("builder_delete_category", { ref: "/orders" })?.isError,
    ).to.equal(true);
  });

  it("holds a builder deletion called through MCP before it reaches the builder", async () => {
    const reply = await answerMcpMessage(
      { access: "full", tools: MCP_TOOLS },
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: DELETE_PAGE,
          arguments: { pageRef: `/gate-test-${Date.now()}` },
        },
      },
    );
    const { result } = CallAnswerSchema.parse(reply);
    expect(result.isError).to.equal(true);
    expect(result.content[0]?.text).to.match(
      /^builder_delete_page was not run: no one has confirmed it yet\./,
    );
  });
});
