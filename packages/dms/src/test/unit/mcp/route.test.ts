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
});
