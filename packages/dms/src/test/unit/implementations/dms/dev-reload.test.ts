import { PassThrough } from "node:stream";
import { expect } from "chai";
import {
  cancelScheduledBroadcast,
  closeDevReloadStreams,
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

function ended(stream: PassThrough): Promise<void> {
  return new Promise((resolve) => {
    stream.once("end", resolve);
    stream.resume();
  });
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

  describe("closeDevReloadStreams", () => {
    it("ends every open stream", async () => {
      const other = connect();

      closeDevReloadStreams();

      // Resolving at all is the assertion: a stream left open never ends.
      await Promise.all([ended(stream), ended(other)]);
      expect(stream.writableEnded).to.equal(true);
      expect(other.writableEnded).to.equal(true);
    });

    it("drops the broadcast scheduled before the streams closed", async () => {
      setSlugProvider(() => ["/form/form-simple"]);
      scheduleBroadcast();

      closeDevReloadStreams();
      await settle();

      expect(read(stream)).to.equal("");
    });

    it("keeps no ended stream to write to", async () => {
      closeDevReloadStreams();
      const errors: Error[] = [];
      stream.on("error", (error: Error) => errors.push(error));

      setSlugProvider(() => ["/form/form-simple"]);
      scheduleBroadcast();
      await settle();

      expect(errors).to.deep.equal([]);
    });

    it("serves the streams that connect once the module is back", async () => {
      closeDevReloadStreams();
      const reconnected = connect();
      read(reconnected);

      setSlugProvider(() => ["/form/form-simple"]);
      scheduleBroadcast();
      await settle();

      expect(read(reconnected)).to.equal(
        'event: reload\ndata: {"type":"resync"}\n\n',
      );
      reconnected.end();
    });
  });
});
