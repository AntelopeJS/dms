import type { RealtimeMessage } from "@antelopejs/interface-dms/realtime";
import { expect } from "chai";
import {
  internal,
  PublishMessage,
} from "../../../../implementations/dms/realtime";
import { InMemoryBroker, setRealtimeBroker } from "../../../../realtime";

const TOPIC = "subscribe-message:topic";
const OTHER_TOPIC = "subscribe-message:other-topic";
const MESSAGE_TYPE = "something-happened";

// The broker hands events to its subscribers on the next tick at the latest.
const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

function collectMessages(id: string, topic: string): RealtimeMessage[] {
  const messages: RealtimeMessage[] = [];
  internal.SubscribeMessage.register(id, topic, (message) => {
    messages.push(message);
  });
  return messages;
}

describe("[unit] implementations/dms/realtime — SubscribeMessage", () => {
  it("delivers messages published on the subscribed topic, and only those", async () => {
    const onTopic = collectMessages("sub-on-topic", TOPIC);
    const offTopic = collectMessages("sub-off-topic", OTHER_TOPIC);

    await PublishMessage(TOPIC, MESSAGE_TYPE, { payload: { key: "value" } });
    await flush();
    internal.SubscribeMessage.unregister("sub-on-topic");
    internal.SubscribeMessage.unregister("sub-off-topic");

    expect(onTopic.map((message) => message.type)).to.deep.equal([
      MESSAGE_TYPE,
    ]);
    expect(onTopic[0].payload).to.deep.equal({ key: "value" });
    expect(offTopic).to.deep.equal([]);
  });

  it("stops delivering once unregistered, and re-unregistering is a no-op", async () => {
    const received = collectMessages("sub-stop", TOPIC);

    await PublishMessage(TOPIC, MESSAGE_TYPE);
    await flush();
    internal.SubscribeMessage.unregister("sub-stop");

    await PublishMessage(TOPIC, MESSAGE_TYPE);
    await flush();
    internal.SubscribeMessage.unregister("sub-stop");

    expect(received).to.have.length(1);
  });

  // `configureRealtime()` installs a fresh broker at start() and closes the
  // previous one. A subscription bound to the broker of the moment — the case
  // of a consumer module subscribing from its construct(), before the DMS
  // started — would go silently dead there.
  it("keeps delivering after the broker is swapped", async () => {
    const received = collectMessages("sub-swap", TOPIC);
    const initialBroker = new InMemoryBroker();

    setRealtimeBroker(initialBroker);
    await PublishMessage(TOPIC, MESSAGE_TYPE);
    await flush();

    setRealtimeBroker(new InMemoryBroker());
    await initialBroker.close();
    await PublishMessage(TOPIC, MESSAGE_TYPE);
    await flush();

    internal.SubscribeMessage.unregister("sub-swap");
    await PublishMessage(TOPIC, MESSAGE_TYPE);
    await flush();

    expect(received).to.have.length(2);
  });

  it("isolates a throwing subscriber from the publisher and the other subscribers", async () => {
    internal.SubscribeMessage.register("sub-throws", TOPIC, () => {
      throw new Error("subscriber blew up");
    });
    const received = collectMessages("sub-after-throw", TOPIC);

    await PublishMessage(TOPIC, MESSAGE_TYPE);
    await flush();
    internal.SubscribeMessage.unregister("sub-throws");
    internal.SubscribeMessage.unregister("sub-after-throw");

    expect(received).to.have.length(1);
  });
});
