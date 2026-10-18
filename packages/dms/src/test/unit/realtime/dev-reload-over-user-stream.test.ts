import { EventEmitter } from "node:events";
import type { RequestContext } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { expect } from "chai";
import {
  cancelScheduledBroadcast,
  DEV_RELOAD_TOPIC,
  scheduleBroadcast,
  setSlugProvider,
} from "../../../implementations/dms/dev-reload";
import { InMemoryBroker, setRealtimeBroker } from "../../../realtime";
import { RealtimeController } from "../../../routes/realtime";

const USER = { _id: "dev-reload-over-user-stream", email: "u@example.com" };
// Comfortably past the 250 ms broadcast debounce.
const SETTLE_MS = 400;

interface FakeStream {
  ctx: RequestContext;
  frames: string[];
}

const createFakeStream = (): FakeStream => {
  const frames: string[] = [];
  const writer = {
    write: (frame: string) => {
      frames.push(frame);
      return true;
    },
    end: () => {},
  };
  const rawRequest = Object.assign(new EventEmitter(), { headers: {} });
  const ctx = {
    rawRequest,
    response: { addHeader: () => {}, getWriteStream: () => writer },
  } as unknown as RequestContext;
  return { ctx, frames };
};

const openUserStream = async (stream: FakeStream): Promise<void> => {
  await RealtimeController.prototype.userStream.call(
    undefined,
    stream.ctx,
    USER as unknown as User,
  );
};

const dataOf = (stream: FakeStream, event: string): unknown[] =>
  stream.frames
    .filter((frame) => frame.startsWith(`event: ${event}\n`))
    .map((frame) => JSON.parse(frame.split("\ndata: ")[1] ?? "null"));

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

/**
 * Outside production a tab learns of a backend reload through its user
 * stream, the one it keeps open anyway: with a second stream of its own, each
 * tab held two of the six HTTP/1.1 connections a browser allows per host.
 */
describe("[unit] realtime — the user stream carries the dev reload signal", () => {
  beforeEach(() => setRealtimeBroker(new InMemoryBroker()));

  afterEach(() => {
    cancelScheduledBroadcast();
    setSlugProvider(() => []);
    setRealtimeBroker(new InMemoryBroker());
  });

  it("says so in its greeting", async () => {
    const stream = createFakeStream();
    await openUserStream(stream);

    expect(dataOf(stream, "hello")[0]).to.include({ devReload: true });
    stream.ctx.rawRequest.emit("close");
  });

  it("forwards each reload broadcast as a realtime event", async () => {
    const stream = createFakeStream();
    await openUserStream(stream);
    setSlugProvider(() => ["/orders"]);

    scheduleBroadcast();
    await settle();

    expect(dataOf(stream, DEV_RELOAD_TOPIC)).to.have.length(1);
    expect(dataOf(stream, DEV_RELOAD_TOPIC)[0]).to.include({
      topic: DEV_RELOAD_TOPIC,
      type: "resync",
    });
    stream.ctx.rawRequest.emit("close");
  });

  it("stops forwarding once the stream closed", async () => {
    const stream = createFakeStream();
    await openUserStream(stream);
    stream.ctx.rawRequest.emit("close");

    scheduleBroadcast();
    await settle();

    expect(dataOf(stream, DEV_RELOAD_TOPIC)).to.have.length(0);
  });
});
