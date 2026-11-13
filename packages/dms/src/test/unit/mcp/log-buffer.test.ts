import { Logging } from "@antelopejs/interface-core/logging";
import { expect } from "chai";
import { queryLogs, startLogCapture } from "../../../mcp/log-buffer";

describe("[unit] mcp log buffer", () => {
  it("answers the captured entries newest first, cut at the limit asked", () => {
    startLogCapture();
    const channel = `mcp-log-test-${Date.now()}`;
    const log = new Logging.Channel(channel);
    log.Error("first");
    log.Error("second", { step: 2 });
    log.Error("third");
    const messages = (limit?: number) =>
      queryLogs({ channel, limit }).map(({ message }) => message);
    expect(messages()).to.deep.equal(["third", 'second {"step":2}', "first"]);
    expect(messages(2)).to.deep.equal(["third", 'second {"step":2}']);
    expect(messages(0)).to.have.lengthOf(3);
  });
});
