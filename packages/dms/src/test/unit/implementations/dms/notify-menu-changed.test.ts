import { expect } from "chai";
import { NotifyMenuChanged } from "../../../../implementations/dms/page";
import {
  buildMenuTopic,
  getRealtimeBroker,
  MENU_BROADCAST_TOPIC,
  MENU_CHANGED_EVENT_TYPE,
  type RealtimeEvent,
} from "../../../../realtime";

const TENANT_ID = "notify-tenant";
const OTHER_TENANT_ID = "notify-other-tenant";
const LATE_TIMER_TENANT_ID = "notify-late-timer-tenant";

function collectEvents(topic: string): {
  events: RealtimeEvent[];
  stop: () => void;
} {
  const events: RealtimeEvent[] = [];
  const stop = getRealtimeBroker().subscribe(topic, (event) => {
    events.push(event);
  });
  return { events, stop };
}

const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

const MENU_WINDOW_MARGIN_MS = 400;
const waitForEvent = async (events: unknown[]): Promise<void> => {
  const deadline = Date.now() + MENU_WINDOW_MARGIN_MS;
  while (events.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await flush();
};

const MENU_WINDOW_OVERRUN_MS = 300;
const holdEventLoop = (durationMs: number): void => {
  const until = Date.now() + durationMs;
  // oxfmt-ignore
  while (Date.now() < until) {
  }
};

describe("[unit] implementations/dms/page — NotifyMenuChanged", () => {
  it("invalidates the menu of the tenant it names", async () => {
    const tenant = collectEvents(buildMenuTopic(TENANT_ID));
    const otherTenant = collectEvents(buildMenuTopic(OTHER_TENANT_ID));

    NotifyMenuChanged(TENANT_ID);
    await flush();
    tenant.stop();
    otherTenant.stop();

    expect(tenant.events.map((event) => event.type)).to.deep.equal([
      MENU_CHANGED_EVENT_TYPE,
    ]);
    expect(otherTenant.events).to.deep.equal([]);
  });

  it("invalidates every session when it names no tenant", async () => {
    const broadcast = collectEvents(MENU_BROADCAST_TOPIC);

    NotifyMenuChanged();
    await waitForEvent(broadcast.events);
    broadcast.stop();

    expect(broadcast.events.map((event) => event.type)).to.deep.equal([
      MENU_CHANGED_EVENT_TYPE,
    ]);
  });

  it("publishes a burst once more on its trailing edge, even when the timer fires late", async () => {
    const tenant = collectEvents(buildMenuTopic(LATE_TIMER_TENANT_ID));

    NotifyMenuChanged(LATE_TIMER_TENANT_ID);
    NotifyMenuChanged(LATE_TIMER_TENANT_ID);
    holdEventLoop(MENU_WINDOW_OVERRUN_MS);
    NotifyMenuChanged(LATE_TIMER_TENANT_ID);
    await flush();
    await new Promise((resolve) => setTimeout(resolve, MENU_WINDOW_MARGIN_MS));
    tenant.stop();

    expect(tenant.events.map((event) => event.type)).to.deep.equal([
      MENU_CHANGED_EVENT_TYPE,
      MENU_CHANGED_EVENT_TYPE,
    ]);
  });
});
