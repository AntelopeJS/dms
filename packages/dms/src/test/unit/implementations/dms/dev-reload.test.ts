import { PassThrough } from "node:stream";
import { expect } from "chai";
import {
  cancelScheduledBroadcast,
  DevReloadController,
  scheduleBroadcast,
  setSlugProvider,
} from "../../../../implementations/dms/dev-reload";

// Comfortably past the 250 ms broadcast debounce.
const SETTLE_MS = 400;

function connect(): PassThrough {
  const stream = new PassThrough();
  new DevReloadController().reload(stream);
  return stream;
}

function read(stream: PassThrough): string {
  return String(stream.read() ?? "");
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}

describe("[unit] implementations/dms/dev-reload", () => {
  let stream: PassThrough;

  beforeEach(() => {
    stream = connect();
    // Drop the hello frame the connection writes.
    read(stream);
  });

  afterEach(() => {
    cancelScheduledBroadcast();
    setSlugProvider(() => []);
    stream.end();
  });

  it("tells clients to resync when the registry holds pages", async () => {
    setSlugProvider(() => ["/form/form-simple"]);

    scheduleBroadcast();
    await settle();

    expect(read(stream)).to.equal('event: reload\ndata: {"type":"resync"}\n\n');
  });

  it("still notifies when a reload left the registry empty", async () => {
    // The silent case is the one that stranded the client: it kept showing a
    // 404 with no reason to look again, so even the next good reload passed
    // unnoticed. Say something, and it re-probes.
    setSlugProvider(() => []);

    scheduleBroadcast();
    await settle();

    expect(read(stream)).to.equal('event: reload\ndata: {"type":"error"}\n\n');
  });

  it("recovers on the next reload that fills the registry", async () => {
    setSlugProvider(() => []);
    scheduleBroadcast();
    await settle();
    expect(read(stream)).to.equal('event: reload\ndata: {"type":"error"}\n\n');

    setSlugProvider(() => ["/form/form-simple"]);
    scheduleBroadcast();
    await settle();

    expect(read(stream)).to.equal('event: reload\ndata: {"type":"resync"}\n\n');
  });

  it("drops a broadcast cancelled before it fires", async () => {
    setSlugProvider(() => ["/form/form-simple"]);

    scheduleBroadcast();
    cancelScheduledBroadcast();
    await settle();

    expect(read(stream)).to.equal("");
  });
});
