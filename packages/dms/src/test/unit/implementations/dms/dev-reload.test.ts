import { PassThrough } from "node:stream";
import { expect } from "chai";
import {
  getRegisteredRoutes,
  UnregisterRoute,
} from "@antelopejs/interface-api";
import {
  cancelScheduledBroadcast,
  closeDevReloadStreams,
  registerDevReloadRoute,
  scheduleBroadcast,
  setSlugProvider,
} from "../../../../store/frontend";
import { createClient } from "../../../helpers/http";

const SETTLE_MS = 400;

function connect(): PassThrough {
  const stream = new PassThrough();
  new (registerDevReloadRoute())().reload(stream);
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

const DEV_ROUTE = "/dms/dev/reload";

function devRoutes() {
  return getRegisteredRoutes().filter((route) => route.location === DEV_ROUTE);
}

describe("[unit] dev reload route outside development", () => {
  it("is not mounted until development mounts it", async () => {
    expect(devRoutes()).to.deep.equal([]);
    expect((await createClient().get(DEV_ROUTE)).status).to.equal(404);
  });
});

describe("[unit] implementations/dms/dev-reload", () => {
  after(() => {
    devRoutes().forEach((route) => UnregisterRoute(Number(route.id)));
  });

  let stream: PassThrough;

  beforeEach(() => {
    stream = connect();

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
