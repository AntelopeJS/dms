import { expect } from "chai";
import { McpController } from "../../../mcp/route";
import { requestContextFixture } from "../../helpers/request-context";

describe("[unit] mcp route", () => {
  it("refuses a caller that is not on this machine before it reads the credential", async () => {
    const ctx = requestContextFixture(
      new URL("http://localhost/dms/mcp"),
      "Bearer any-token",
    );
    const answer = await new McpController().answer(
      ctx,
      ctx.rawRequest.headers.authorization,
    );
    expect(answer.getStatus()).to.equal(403);
  });

  it("admits a caller on 127.0.1.1 past the machine check, so only its credential decides", async () => {
    const ctx = requestContextFixture(
      new URL("http://127.0.1.1/dms/mcp"),
      "Bearer not-this-start",
    );
    Object.defineProperty(ctx.rawRequest.socket, "remoteAddress", {
      value: "127.0.1.1",
    });
    const answer = await new McpController().answer(
      ctx,
      ctx.rawRequest.headers.authorization,
    );
    expect(answer.getStatus()).to.equal(401);
  });
});
