import { expect } from "chai";
import { z } from "zod";
import { helloConnectionId, parseFrameData } from "../../helpers/sse-frames";

const Topic = z.object({ topic: z.string() });

describe("[unit] realtime — SSE frame decoding", () => {
  it("reads the connection id of the hello frame", () => {
    const frames = [
      `event: ping\ndata: {"connectionId":"other"}\n\n`,
      `event: hello\ndata: {"connectionId":"abc","ts":1}\n\n`,
    ];
    expect(helloConnectionId(frames)).to.equal("abc");
  });

  it("refuses a stream without a hello frame", () => {
    expect(() => helloConnectionId([`event: ping\ndata: {}\n\n`])).to.throw(
      /no hello frame/,
    );
  });

  it("refuses a hello frame whose connection id is no string", () => {
    expect(() =>
      helloConnectionId([`event: hello\ndata: {"connectionId":7}\n\n`]),
    ).to.throw(/does not match its schema/);
  });

  it("refuses a frame without a data line instead of defaulting its data", () => {
    expect(() => parseFrameData(Topic, "event: session\n\n")).to.throw(
      /no data line/,
    );
  });

  it("refuses data of another shape", () => {
    expect(() =>
      parseFrameData(Topic, `event: session\ndata: {"topic":3}\n\n`),
    ).to.throw(/does not match its schema/);
  });

  it("returns the data it parsed", () => {
    expect(
      parseFrameData(Topic, `event: session\ndata: {"topic":"orders"}\n\n`),
    ).to.deep.equal({ topic: "orders" });
  });
});
